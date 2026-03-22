use std::path::Path;
use tauri::State;

use crate::doc_mapping::index::build_index;
use crate::state::AppState;
use crate::swarm::{
    ai_resolver::{AiConflictResolver, AiResolution},
    approval_gate::{self, GateDecision, PendingSpawn, SharedPendingSpawns},
    resource_monitor::{get_resource_usage, ResourceUsage},
    conflict_resolver::{self, commit_conflict_resolution, parse_conflict_blocks, ConflictBlock, ConflictResolution},
    orchestrator::OrchestratorRun,
    result_aggregator::AggregatedResult,
    settings::SwarmSettings,
    subtask::{detect_circular_deps, detect_file_conflicts, SplitTaskRequest, SplitTaskResult, SubTask},
    task_splitter::TaskSplitter,
    wave::{Wave, WaveGateResult},
    wave_gate::WaveGate,
    wave_orchestrator::{SharedWaveOrchestrator, WaveOrchestratorSnapshot, WaveOrchestratorStatus},
    worker::{SpawnRequest, WorkerConfig, WorkerInfo, WorkerStatus},
    SharedOrchestrator,
    SharedWorkerManager,
};
use crate::policy::engine::PolicyEngine;
use tauri::Emitter;

#[tauri::command]
pub async fn spawn_worker(
    config: WorkerConfig,
    manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;
    mgr.spawn_worker(config, app)
}

#[tauri::command]
pub async fn kill_worker(
    worker_id: String,
    manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;
    mgr.kill_worker(&worker_id, app)
}

#[tauri::command]
pub async fn write_to_worker(
    worker_id: String,
    data: Vec<u8>,
    manager: State<'_, SharedWorkerManager>,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;
    mgr.write_to_worker(&worker_id, &data)
}

#[tauri::command]
pub async fn resize_worker(
    worker_id: String,
    cols: u16,
    rows: u16,
    manager: State<'_, SharedWorkerManager>,
) -> Result<(), String> {
    let mut mgr = manager.lock().map_err(|e| e.to_string())?;
    mgr.resize_worker(&worker_id, cols, rows)
}

#[tauri::command]
pub async fn list_workers(
    manager: State<'_, SharedWorkerManager>,
) -> Result<Vec<WorkerInfo>, String> {
    let mgr = manager.lock().map_err(|e| e.to_string())?;
    Ok(mgr.list_workers())
}

/// ユーザープロンプトから SubTask リストを生成する（Claude API 呼び出し）
/// doc-mapping インデックスが存在する場合は設計書コンテキストを注入する
#[tauri::command]
pub async fn split_task(
    request: SplitTaskRequest,
    state: State<'_, AppState>,
) -> Result<SplitTaskResult, String> {
    let api_key = load_anthropic_key(&state).await?;
    let splitter = TaskSplitter::new(&api_key);

    // doc-mapping インデックスを試行ロード（利用可能な場合のみ使用）
    let project_path = Path::new(&request.project_path);
    let docs_dir = project_path.join("docs");
    let doc_index = if docs_dir.exists() {
        build_index(&docs_dir, project_path).ok()
    } else {
        None
    };

    let tasks = if let Some(ref index) = doc_index {
        splitter
            .split_with_docs(&request.prompt, &request.project_path, &request.context_files, index)
            .await
    } else {
        splitter
            .split(&request.prompt, &request.project_path, &request.context_files)
            .await
    }
    .map_err(|e| e.to_string())?;

    let conflict_warnings = detect_file_conflicts(&tasks);
    let cycle_error = detect_circular_deps(&tasks).err();

    Ok(SplitTaskResult {
        tasks,
        conflict_warnings,
        cycle_error,
    })
}

/// 承認ゲート経由の spawn 処理に必要な参照をまとめた構造体
struct SpawnContext<'a> {
    settings: &'a SwarmSettings,
    project_path: &'a str,
    orchestrator: &'a SharedOrchestrator,
    manager: &'a SharedWorkerManager,
    pending_spawns: &'a SharedPendingSpawns,
    state: &'a AppState,
    app: &'a tauri::AppHandle,
}

/// SpawnRequest を承認ゲート経由で処理する共通ヘルパー。
/// ポリシーに基づき即座にワーカーを起動するか、承認待ちにする。
fn process_spawn_requests(
    spawn_requests: Vec<SpawnRequest>,
    ctx: &SpawnContext<'_>,
) -> Result<(), String> {
    let policy_engine = PolicyEngine::new(Path::new(ctx.project_path));

    for req in spawn_requests {
        let tool_policy = policy_engine.check("swarm_worker");
        let decision = approval_gate::evaluate(&req.worker_config.task, ctx.settings, tool_policy);

        match decision {
            GateDecision::SpawnImmediately => {
                let new_id = {
                    let mut mgr = ctx.manager.lock().map_err(|e| e.to_string())?;
                    mgr.spawn_worker(req.worker_config.into(), ctx.app.clone())
                        .map_err(|e| e.to_string())?
                };
                let mut orch = ctx.orchestrator.lock().map_err(|e| e.to_string())?;
                orch.assign_worker_id(req.task_id, new_id);
            }
            GateDecision::RequiresApproval { risk_level } => {
                let request_id = uuid::Uuid::new_v4().to_string();

                // Orchestrator のタスクを承認待ちに
                {
                    let mut orch = ctx.orchestrator.lock().map_err(|e| e.to_string())?;
                    orch.set_awaiting_approval(req.task_id);
                }

                // PendingSpawns に保存
                {
                    let mut ps = ctx.pending_spawns.lock().map_err(|e| e.to_string())?;
                    ps.insert(request_id.clone(), PendingSpawn {
                        request_id: request_id.clone(),
                        spawn_request: req.clone(),
                        risk_level: risk_level.clone(),
                    });
                }

                // 承認チャネルを登録
                {
                    let (tx, _rx) = tokio::sync::watch::channel(false);
                    let mut channels = ctx.state.approval_channels.lock().unwrap();
                    channels.insert(request_id.clone(), tx);
                }

                // DB に承認リクエストを作成
                let risk_str = match risk_level {
                    crate::policy::rules::RiskLevel::Low => "low",
                    crate::policy::rules::RiskLevel::Medium => "medium",
                    crate::policy::rules::RiskLevel::High => "high",
                    crate::policy::rules::RiskLevel::Critical => "critical",
                };
                let tool_input = serde_json::json!({
                    "taskId": req.task_id,
                    "title": req.worker_config.task.title,
                    "role": req.worker_config.task.role.as_str(),
                    "files": req.worker_config.task.files,
                    "isRetry": req.is_retry,
                }).to_string();

                let db = ctx.state.db.clone();
                let rid = request_id.clone();
                let app_clone = ctx.app.clone();
                // 非同期で DB 挿入 + フロントエンド通知
                tauri::async_runtime::spawn(async move {
                    if let Ok(()) = sqlx::query(
                        "INSERT INTO approval_requests (request_id, worker_id, tool_name, tool_input, risk_level)
                         VALUES (?, ?, ?, ?, ?)",
                    )
                    .bind(&rid)
                    .bind::<Option<String>>(None)
                    .bind("swarm_worker_spawn")
                    .bind(&tool_input)
                    .bind(risk_str)
                    .execute(&db)
                    .await
                    .map(|_| ())
                    {
                        let row = sqlx::query(
                            "SELECT id, request_id, worker_id, tool_name, tool_input,
                                    risk_level, status, decision_reason, created_at, decided_at
                             FROM approval_requests WHERE request_id = ?",
                        )
                        .bind(&rid)
                        .fetch_one(&db)
                        .await;
                        if let Ok(row) = row {
                            use sqlx::Row;
                            let req = crate::models::approval::ApprovalRequest {
                                id: row.get("id"),
                                request_id: row.get("request_id"),
                                worker_id: row.get("worker_id"),
                                tool_name: row.get("tool_name"),
                                tool_input: row.get("tool_input"),
                                risk_level: row.get("risk_level"),
                                status: row.get("status"),
                                decision_reason: row.get("decision_reason"),
                                created_at: row.get("created_at"),
                                decided_at: row.get("decided_at"),
                            };
                            let _ = app_clone.emit("approval-request-pending", &req);
                        }
                    }
                });
            }
            GateDecision::Denied => {
                let mut orch = ctx.orchestrator.lock().map_err(|e| e.to_string())?;
                orch.reject_task(req.task_id);
                eprintln!(
                    "[ApprovalGate] Task {} denied by policy",
                    req.task_id
                );
            }
        }
    }
    Ok(())
}

/// SubTask リストを Worker に割り当てて並列実行を開始する
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn orchestrator_start(
    tasks: Vec<SubTask>,
    settings: SwarmSettings,
    project_path: String,
    orchestrator: State<'_, SharedOrchestrator>,
    manager: State<'_, SharedWorkerManager>,
    pending_spawns: State<'_, SharedPendingSpawns>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<OrchestratorRun, String> {
    let (saved_settings, saved_project_path, spawn_requests) = {
        let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
        // 前回の Run が終了済みなら自動クリアして再実行可能にする
        if let Some(prev) = &orch.current_run {
            use crate::swarm::worker::RunStatus;
            match prev.status {
                RunStatus::Done | RunStatus::PartialDone | RunStatus::Cancelled => {
                    orch.clear_run();
                }
                RunStatus::Running => {
                    return Err("既に実行中の Swarm があります。完了またはキャンセル後に再実行してください。".into());
                }
            }
        }
        let (_run, spawns) = orch.start_run(tasks, settings.clone(), project_path.clone())?;
        (settings, project_path, spawns)
    };

    // 承認ゲート経由でワーカーを起動
    let ctx = SpawnContext {
        settings: &saved_settings,
        project_path: &saved_project_path,
        orchestrator: &orchestrator,
        manager: &manager,
        pending_spawns: &pending_spawns,
        state: &state,
        app: &app,
    };
    process_spawn_requests(spawn_requests, &ctx)?;

    // 最新ステートを取得して返す
    let updated_run = {
        let orch = orchestrator.lock().map_err(|e| e.to_string())?;
        orch.current_run.clone().ok_or_else(|| "No active run".to_string())?
    };
    let _ = app.emit("orchestrator-status-changed", &updated_run);
    Ok(updated_run)
}

/// Orchestrator の現在のステータスを返す
#[tauri::command]
pub async fn orchestrator_get_status(
    orchestrator: State<'_, SharedOrchestrator>,
) -> Result<Option<OrchestratorRun>, String> {
    let orch = orchestrator.lock().map_err(|e| e.to_string())?;
    Ok(orch.current_run.clone())
}

/// Worker のステータス変化を Orchestrator に通知する（Case A リトライ + 依存チェーン解放）
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn orchestrator_notify_worker_done(
    worker_id: String,
    status: WorkerStatus,
    orchestrator: State<'_, SharedOrchestrator>,
    manager: State<'_, SharedWorkerManager>,
    pending_spawns: State<'_, SharedPendingSpawns>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let (spawn_requests, settings, project_path) = {
        let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
        let spawns = orch.update_worker_status(&worker_id, status);
        let (settings, project_path) = orch.current_run.as_ref()
            .map(|r| (r.settings.clone(), r.project_path.clone()))
            .unwrap_or_else(|| (SwarmSettings::default(), String::new()));
        (spawns, settings, project_path)
    };

    // 承認ゲート経由でワーカーを起動
    let ctx = SpawnContext {
        settings: &settings,
        project_path: &project_path,
        orchestrator: &orchestrator,
        manager: &manager,
        pending_spawns: &pending_spawns,
        state: &state,
        app: &app,
    };
    process_spawn_requests(spawn_requests, &ctx)?;

    // 最新ステートを emit する
    let orch = orchestrator.lock().map_err(|e| e.to_string())?;
    if let Some(run) = &orch.current_run {
        let _ = app.emit("orchestrator-status-changed", run);
    }

    Ok(())
}

/// 集約結果を取得する
#[tauri::command]
pub async fn orchestrator_get_result(
    orchestrator: State<'_, SharedOrchestrator>,
) -> Result<Option<AggregatedResult>, String> {
    use crate::swarm::result_aggregator::ResultAggregator;
    let orch = orchestrator.lock().map_err(|e| e.to_string())?;
    let run = match orch.current_run.as_ref() {
        Some(r) => r,
        None => return Ok(None),
    };
    // 完了ブランチをタプル形式に変換（succeeded = true）
    let branches = orch.completed_branches();
    let assignments: Vec<(&str, &str, bool)> = branches
        .iter()
        .map(|b| ("", b.as_str(), true))
        .collect();
    let result = ResultAggregator::aggregate(
        std::path::Path::new(&run.project_path),
        &run.base_branch,
        &assignments,
    );
    Ok(Some(result))
}

/// コンフリクトブロックを Claude API に渡して AI 解決案を生成する（F-12-06）
#[tauri::command]
pub async fn orchestrator_ai_resolve_conflict(
    file_path: String,
    start_line: u32,
    state: State<'_, AppState>,
) -> Result<AiResolution, String> {
    let api_key = load_anthropic_key(&state).await?;

    // ConflictBlock を取得
    let path = std::path::Path::new(&file_path);
    let blocks = parse_conflict_blocks(path);
    let block = blocks
        .iter()
        .find(|b| b.start_line == start_line)
        .ok_or_else(|| format!("コンフリクトブロック (行 {}) が見つかりません", start_line))?;

    let resolver = AiConflictResolver::new(&api_key);
    resolver
        .resolve(&file_path, &block.ours, &block.theirs, &block.context_before)
        .await
        .map_err(|e| e.to_string())
}

/// 指定ファイルのコンフリクトブロックを取得する
#[tauri::command]
pub async fn orchestrator_get_conflicts(
    file_path: String,
) -> Result<Vec<ConflictBlock>, String> {
    let path = std::path::Path::new(&file_path);
    Ok(parse_conflict_blocks(path))
}

/// コンフリクトブロックを解決する
#[tauri::command]
pub async fn orchestrator_resolve_conflict(
    file_path: String,
    start_line: u32,
    resolution: ConflictResolution,
) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    conflict_resolver::resolve_conflict_block(path, start_line, resolution)
}

/// コンフリクト解決後にコミットする
#[tauri::command]
pub async fn orchestrator_commit_resolution(
    project_path: String,
    files: Vec<String>,
    message: Option<String>,
) -> Result<(), String> {
    let repo = std::path::Path::new(&project_path);
    let msg = message.as_deref().unwrap_or("fix: Swarm コンフリクト解決");
    commit_conflict_resolution(repo, &files, msg)
}

/// 全 Worker のブランチをベースブランチにマージする
#[tauri::command]
pub async fn orchestrator_merge_all(
    orchestrator: State<'_, SharedOrchestrator>,
    app: tauri::AppHandle,
) -> Result<Vec<crate::swarm::git_branch::MergeOutcome>, String> {
    use tauri::Emitter;
    let (project_path, base_branch, branches) = {
        let orch = orchestrator.lock().map_err(|e| e.to_string())?;
        let run = orch.current_run.as_ref().ok_or("No active run")?;
        (run.project_path.clone(), run.base_branch.clone(), orch.completed_branches())
    };
    let mut outcomes = Vec::new();
    for branch in &branches {
        let outcome = crate::swarm::git_branch::merge_worker_branch(
            std::path::Path::new(&project_path),
            branch,
            &base_branch,
        );
        outcomes.push(outcome);
    }
    let _ = app.emit("orchestrator-merge-complete", &branches);
    Ok(outcomes)
}

/// 実行中の Orchestrator をキャンセルする
#[tauri::command]
pub async fn orchestrator_cancel(
    orchestrator: State<'_, SharedOrchestrator>,
    _manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Emitter;
    let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
    orch.cancel();
    let _ = app.emit("orchestrator-cancelled", &serde_json::json!({}));
    Ok(())
}

/// Wave Gate を実行する（Wave 完了時にフロントエンドから自動呼び出し）
#[tauri::command]
pub async fn orchestrator_run_wave_gate(
    wave_orch: State<'_, SharedWaveOrchestrator>,
    app: tauri::AppHandle,
) -> Result<WaveGateResult, String> {
    use tauri::Emitter;

    // Gate 実行: ロックを保持したまま await しないよう分離
    let (project_path, base_branch, branches) = {
        let wo = wave_orch.lock().map_err(|e| e.to_string())?;
        if wo.status != WaveOrchestratorStatus::Gating {
            return Err("Gate 実行可能な状態ではありません".into());
        }
        let current_wave = wo
            .orchestrator
            .current_run
            .as_ref()
            .and_then(|r| r.current_wave)
            .unwrap_or(1);
        let branches = wo.orchestrator.completed_branches_for_wave(current_wave);
        (wo.project_path.clone(), wo.settings.base_branch.clone(), branches)
    };

    let gate_config = crate::swarm::wave_gate::GateConfig::load(Path::new(&project_path));
    let gate = WaveGate::with_config(&project_path, &base_branch, gate_config);
    let result = gate.execute(&branches).await;

    // Gate 結果を適用して次 Wave の SpawnRequest を取得
    let (spawns, _snapshot) = {
        let mut wo = wave_orch.lock().map_err(|e| e.to_string())?;
        let spawns = wo.apply_gate_result(result.clone());
        let snapshot = wo.snapshot();
        (spawns, snapshot)
    };

    let _ = app.emit(
        "swarm-wave-gate-result",
        &serde_json::json!({ "overall": format!("{:?}", result.overall) }),
    );

    if !spawns.is_empty() {
        let _ = app.emit(
            "swarm-spawn-workers",
            &serde_json::json!({ "count": spawns.len() }),
        );
    }

    Ok(result)
}

/// Wave 構造を取得する（UI 表示用）
#[tauri::command]
pub async fn orchestrator_get_waves(
    wave_orch: State<'_, SharedWaveOrchestrator>,
) -> Result<Option<Vec<Wave>>, String> {
    let wo = wave_orch.lock().map_err(|e| e.to_string())?;
    Ok(wo
        .orchestrator()
        .current_run
        .as_ref()
        .and_then(|r| r.waves.clone()))
}

/// CPU・メモリ使用率を返す (F-12-17, F-12-19)
#[tauri::command]
pub async fn get_system_resources() -> Result<ResourceUsage, String> {
    tokio::task::spawn_blocking(get_resource_usage)
        .await
        .map_err(|e| e.to_string())
}

async fn load_anthropic_key(state: &State<'_, AppState>) -> Result<String, String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = 'anthropic.api_key'")
            .fetch_optional(&state.db)
            .await
            .map_err(|e| e.to_string())?;

    let key = row
        .map(|(v,)| v.trim_matches('"').to_string())
        .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
        .unwrap_or_default();

    if key.is_empty() {
        return Err(
            "Anthropic API キーが設定されていません。Settings で API キーを設定してください。"
                .to_string(),
        );
    }
    Ok(key)
}

// ===== Wave モードコマンド（WaveOrchestrator ベース） =====

/// Wave モードでタスク実行を開始する
#[tauri::command]
pub async fn swarm_wave_start(
    tasks: Vec<SubTask>,
    settings: SwarmSettings,
    project_path: String,
    wave_orch: State<'_, SharedWaveOrchestrator>,
    app: tauri::AppHandle,
) -> Result<WaveOrchestratorSnapshot, String> {
    use tauri::Emitter;

    let spawns = {
        let mut wo = wave_orch.lock().map_err(|e| e.to_string())?;
        *wo = crate::swarm::wave_orchestrator::WaveOrchestrator::new(tasks, settings, project_path);
        wo.start()?
    };

    let _ = app.emit(
        "swarm-spawn-workers",
        &serde_json::json!({
            "count": spawns.len(),
            "taskIds": spawns.iter().map(|s| s.task_id).collect::<Vec<_>>(),
        }),
    );

    let wo = wave_orch.lock().map_err(|e| e.to_string())?;
    Ok(wo.snapshot())
}

/// ワーカーの状態を更新する（WaveOrchestrator）
#[tauri::command]
pub async fn swarm_wave_worker_update(
    worker_id: String,
    status: String,
    wave_orch: State<'_, SharedWaveOrchestrator>,
    app: tauri::AppHandle,
) -> Result<WaveOrchestratorSnapshot, String> {
    use tauri::Emitter;

    let worker_status = match status.as_str() {
        "done"    => crate::swarm::worker::WorkerStatus::Done,
        "error"   => crate::swarm::worker::WorkerStatus::Error,
        "running" => crate::swarm::worker::WorkerStatus::Running,
        _         => return Err(format!("不明なステータス: {}", status)),
    };

    let (result, snapshot) = {
        let mut wo = wave_orch.lock().map_err(|e| e.to_string())?;
        let result = wo.update_worker_status(&worker_id, worker_status);
        let snapshot = wo.snapshot();
        (result, snapshot)
    };

    if result.wave_gate_ready {
        let _ = app.emit(
            "swarm-wave-gate-ready",
            &serde_json::json!({ "waveNumber": snapshot.current_wave }),
        );
    }

    if !result.new_spawns.is_empty() {
        let _ = app.emit(
            "swarm-spawn-workers",
            &serde_json::json!({
                "count": result.new_spawns.len(),
                "taskIds": result.new_spawns.iter().map(|s| s.task_id).collect::<Vec<_>>(),
            }),
        );
    }

    Ok(snapshot)
}

/// ワーカーID をタスクに紐付ける（WaveOrchestrator）
#[tauri::command]
pub async fn swarm_wave_assign_worker(
    task_id: u32,
    worker_id: String,
    wave_orch: State<'_, SharedWaveOrchestrator>,
) -> Result<(), String> {
    let mut wo = wave_orch.lock().map_err(|e| e.to_string())?;
    wo.assign_worker_id(task_id, worker_id);
    Ok(())
}

/// Gate チェックを実行し、結果に応じて次 Wave を開始する（WaveOrchestrator）
#[tauri::command]
pub async fn swarm_wave_run_gate(
    wave_orch: State<'_, SharedWaveOrchestrator>,
    app: tauri::AppHandle,
) -> Result<WaveOrchestratorSnapshot, String> {
    use tauri::Emitter;

    let (project_path, base_branch, branches) = {
        let wo = wave_orch.lock().map_err(|e| e.to_string())?;
        if wo.status != WaveOrchestratorStatus::Gating {
            return Err("Gate 実行可能な状態ではありません".into());
        }
        let current_wave = wo
            .orchestrator
            .current_run
            .as_ref()
            .and_then(|r| r.current_wave)
            .unwrap_or(1);
        let branches = wo.orchestrator.completed_branches_for_wave(current_wave);
        (wo.project_path.clone(), wo.settings.base_branch.clone(), branches)
    };

    let gate = WaveGate::new(&project_path, &base_branch);
    let gate_result = gate.execute(&branches).await;

    let (spawns, snapshot) = {
        let mut wo = wave_orch.lock().map_err(|e| e.to_string())?;
        let spawns = wo.apply_gate_result(gate_result.clone());
        let snapshot = wo.snapshot();
        (spawns, snapshot)
    };

    let _ = app.emit(
        "swarm-wave-gate-result",
        &serde_json::json!({
            "overall": format!("{:?}", gate_result.overall),
            "waveNumber": snapshot.current_wave,
        }),
    );

    if !spawns.is_empty() {
        let _ = app.emit(
            "swarm-spawn-workers",
            &serde_json::json!({
                "count": spawns.len(),
                "taskIds": spawns.iter().map(|s| s.task_id).collect::<Vec<_>>(),
            }),
        );
    }

    Ok(snapshot)
}

/// 現在の Wave 状態を取得する
#[tauri::command]
pub async fn swarm_wave_get_status(
    wave_orch: State<'_, SharedWaveOrchestrator>,
) -> Result<WaveOrchestratorSnapshot, String> {
    let wo = wave_orch.lock().map_err(|e| e.to_string())?;
    Ok(wo.snapshot())
}

/// Wave 一覧を取得する
#[tauri::command]
pub async fn swarm_wave_list(
    wave_orch: State<'_, SharedWaveOrchestrator>,
) -> Result<Vec<Wave>, String> {
    let wo = wave_orch.lock().map_err(|e| e.to_string())?;
    Ok(wo.snapshot().waves)
}

/// 実行をキャンセルする（WaveOrchestrator）
#[tauri::command]
pub async fn swarm_wave_cancel(
    wave_orch: State<'_, SharedWaveOrchestrator>,
    app: tauri::AppHandle,
) -> Result<WaveOrchestratorSnapshot, String> {
    use tauri::Emitter;

    let snapshot = {
        let mut wo = wave_orch.lock().map_err(|e| e.to_string())?;
        wo.cancel();
        wo.snapshot()
    };

    let _ = app.emit("swarm-wave-cancelled", &serde_json::json!({}));
    Ok(snapshot)
}

/// Orchestrator の現在 Wave 完了状態を取得する
#[tauri::command]
pub async fn orchestrator_wave_status(
    wave_orch: State<'_, SharedWaveOrchestrator>,
) -> Result<serde_json::Value, String> {
    let wo = wave_orch.lock().map_err(|e| e.to_string())?;
    let orch = wo.orchestrator();
    let run = orch.current_run.as_ref();

    Ok(serde_json::json!({
        "isWaveMode": orch.is_wave_mode(),
        "isCurrentWaveComplete": orch.is_current_wave_complete(),
        "isAllTerminal": orch.is_all_terminal(),
        "currentWave": run.and_then(|r| r.current_wave),
        "totalWaves": run.and_then(|r| r.waves.as_ref()).map(|w| w.len()),
        "completed": run.map(|r| r.completed),
        "failed": run.map(|r| r.failed),
        "total": run.map(|r| r.total),
    }))
}

/// Orchestrator の advance_wave を直接呼び出す（Gate 結果を外部から渡す場合）
#[tauri::command]
pub async fn orchestrator_advance_wave(
    gate_result: WaveGateResult,
    wave_orch: State<'_, SharedWaveOrchestrator>,
    app: tauri::AppHandle,
) -> Result<WaveOrchestratorSnapshot, String> {
    use tauri::Emitter;

    let (spawns, snapshot) = {
        let mut wo = wave_orch.lock().map_err(|e| e.to_string())?;
        let spawns = wo.apply_gate_result(gate_result.clone());
        let snapshot = wo.snapshot();
        (spawns, snapshot)
    };

    let _ = app.emit(
        "swarm-wave-gate-result",
        &serde_json::json!({
            "overall": format!("{:?}", gate_result.overall),
            "waveNumber": snapshot.current_wave,
        }),
    );

    if !spawns.is_empty() {
        let _ = app.emit(
            "swarm-spawn-workers",
            &serde_json::json!({
                "count": spawns.len(),
                "taskIds": spawns.iter().map(|s| s.task_id).collect::<Vec<_>>(),
            }),
        );
    }

    Ok(snapshot)
}

// ─── Swarm 履歴コマンド ──────────────────────────────────────

use crate::swarm::history::{SwarmRunRecord, save as history_save, list as history_list, delete as history_delete};

#[tauri::command]
pub async fn swarm_history_save(
    run: OrchestratorRun,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    history_save(&state.db, &run)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn swarm_history_list(
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<SwarmRunRecord>, String> {
    history_list(&state.db, limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn swarm_history_delete(
    run_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    history_delete(&state.db, &run_id)
        .await
        .map_err(|e| e.to_string())
}
