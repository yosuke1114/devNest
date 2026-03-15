use tauri::State;

use crate::state::AppState;
use crate::swarm::{
    ai_resolver::{AiConflictResolver, AiResolution},
    resource_monitor::{get_resource_usage, ResourceUsage},
    conflict_resolver::{self, commit_conflict_resolution, parse_conflict_blocks, ConflictBlock, ConflictResolution},
    orchestrator::{OrchestratorRun, SwarmSettings},
    result_aggregator::AggregatedResult,
    subtask::{detect_circular_deps, detect_file_conflicts, SplitTaskRequest, SplitTaskResult, SubTask},
    task_splitter::TaskSplitter,
    worker::WorkerConfig,
    worker::WorkerInfo,
    worker::WorkerStatus,
    SharedOrchestrator,
    SharedWorkerManager,
};
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
#[tauri::command]
pub async fn split_task(
    request: SplitTaskRequest,
    state: State<'_, AppState>,
) -> Result<SplitTaskResult, String> {
    let api_key = load_anthropic_key(&state).await?;
    let splitter = TaskSplitter::new(&api_key);
    let tasks = splitter
        .split(&request.prompt, &request.project_path, &request.context_files)
        .await
        .map_err(|e| e.to_string())?;

    let conflict_warnings = detect_file_conflicts(&tasks);
    let cycle_error = detect_circular_deps(&tasks).err();

    Ok(SplitTaskResult {
        tasks,
        conflict_warnings,
        cycle_error,
    })
}

/// SubTask リストを Worker に割り当てて並列実行を開始する
#[tauri::command]
pub async fn orchestrator_start(
    tasks: Vec<SubTask>,
    settings: SwarmSettings,
    project_path: String,
    orchestrator: State<'_, SharedOrchestrator>,
    manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<OrchestratorRun, String> {
    let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
    let worker_manager = manager.inner().clone();
    orch.start_run(tasks, settings, project_path, worker_manager, app)
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
#[tauri::command]
pub async fn orchestrator_notify_worker_done(
    worker_id: String,
    status: WorkerStatus,
    orchestrator: State<'_, SharedOrchestrator>,
    manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let spawn_requests = {
        let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
        orch.update_worker_status(&worker_id, status, &app)
    };

    // SpawnRequest ごとに Worker を起動
    for req in spawn_requests {
        let new_id = {
            let mut mgr = manager.lock().map_err(|e| e.to_string())?;
            mgr.spawn_worker(req.worker_config, app.clone())?
        };

        // Orchestrator の worker_id を更新
        {
            let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
            orch.update_worker_id_for_task(req.task_id, new_id.clone());
            // イベント発行
            if let Some(run) = &orch.current_run {
                let _ = app.emit("orchestrator-status-changed", run);
            }
        }
    }

    Ok(())
}

/// 集約結果を取得する
#[tauri::command]
pub async fn orchestrator_get_result(
    orchestrator: State<'_, SharedOrchestrator>,
) -> Result<Option<AggregatedResult>, String> {
    let orch = orchestrator.lock().map_err(|e| e.to_string())?;
    Ok(orch.get_aggregated_result())
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
    let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
    Ok(orch.merge_all(&app))
}

/// 実行中の Orchestrator をキャンセルする
#[tauri::command]
pub async fn orchestrator_cancel(
    orchestrator: State<'_, SharedOrchestrator>,
    manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
    orch.cancel(manager.inner(), &app);
    Ok(())
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
