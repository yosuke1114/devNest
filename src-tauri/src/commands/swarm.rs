use tauri::State;

use crate::swarm::{worker::WorkerConfig, worker::WorkerInfo, SharedWorkerManager};

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
