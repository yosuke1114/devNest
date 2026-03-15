use tauri::State;

use crate::state::AppState;
use crate::swarm::{
    subtask::{detect_file_conflicts, SplitTaskRequest, SplitTaskResult},
    task_splitter::TaskSplitter,
    worker::WorkerConfig,
    worker::WorkerInfo,
    SharedWorkerManager,
};

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

    Ok(SplitTaskResult {
        tasks,
        conflict_warnings,
    })
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
