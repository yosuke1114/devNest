use tauri::State;

use crate::swarm::settings::SwarmSettings;
use crate::swarm::subtask::SubTask;
use crate::swarm::wave::Wave;
use crate::swarm::wave_orchestrator::{
    SharedWaveOrchestrator, WaveOrchestratorSnapshot, WaveOrchestratorStatus,
};
use crate::swarm::worker::WorkerStatus;

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

    // ワーカー起動（実際のワーカー起動は別途 WorkerManager で行う）
    // ここでは SpawnRequest をイベントで通知
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

/// ワーカーの状態を更新する
#[tauri::command]
pub async fn swarm_wave_worker_update(
    worker_id: String,
    status: String,
    wave_orch: State<'_, SharedWaveOrchestrator>,
    app: tauri::AppHandle,
) -> Result<WaveOrchestratorSnapshot, String> {
    use tauri::Emitter;

    let worker_status = match status.as_str() {
        "done" => WorkerStatus::Done,
        "error" => WorkerStatus::Error,
        "running" => WorkerStatus::Running,
        _ => return Err(format!("不明なステータス: {}", status)),
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
            &serde_json::json!({
                "waveNumber": snapshot.current_wave,
            }),
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

/// ワーカーID をタスクに紐付ける
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

/// Gate チェックを実行し、結果に応じて次 Wave を開始する
#[tauri::command]
pub async fn swarm_wave_run_gate(
    wave_orch: State<'_, SharedWaveOrchestrator>,
    app: tauri::AppHandle,
) -> Result<WaveOrchestratorSnapshot, String> {
    use tauri::Emitter;

    // Gate 実行: ロックを保持したまま await しないよう分離
    let (project_path, base_branch, branches) = {
        let wo = wave_orch.lock().map_err(|e| e.to_string())?;
        if wo.status != crate::swarm::wave_orchestrator::WaveOrchestratorStatus::Gating {
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

    let gate = crate::swarm::wave_gate::WaveGate::new(&project_path, &base_branch);
    let gate_result = gate.execute(&branches).await;

    // Gate 結果を適用して次 Wave の SpawnRequest を取得
    let (spawns, snapshot) = {
        let mut wo = wave_orch.lock().map_err(|e| e.to_string())?;
        let spawns = wo.apply_gate_result(gate_result.clone());
        let snapshot = wo.snapshot();
        (spawns, snapshot)
    };

    // Gate 結果をイベント通知
    let _ = app.emit(
        "swarm-wave-gate-result",
        &serde_json::json!({
            "overall": format!("{:?}", gate_result.overall),
            "waveNumber": snapshot.current_wave,
        }),
    );

    // 次 Wave のワーカー起動通知
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

/// 実行をキャンセルする
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

// ===== ハイブリッドコマンド: Orchestrator の Wave メソッドに直接アクセス =====

/// Orchestrator の Wave 構造を直接取得する
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
    gate_result: crate::swarm::wave::WaveGateResult,
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
