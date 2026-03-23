use tauri::{AppHandle, Emitter, Manager, State};
use crate::error::{AppError, Result};
use crate::models::approval::{ApprovalDecision, ApprovalRequest};
use crate::state::AppState;
use crate::swarm::{SharedOrchestrator, SharedWorkerManager};
use crate::swarm::approval_gate::SharedPendingSpawns;

/// ApprovalRequest を sqlx::Row から構築するヘルパー
fn row_to_request(row: &sqlx::sqlite::SqliteRow) -> ApprovalRequest {
    use sqlx::Row;
    ApprovalRequest {
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
    }
}

/// 承認待ちリクエスト一覧を取得する
#[tauri::command]
pub async fn approval_list(
    state: State<'_, AppState>,
) -> Result<Vec<ApprovalRequest>> {
    let rows = sqlx::query(
        "SELECT id, request_id, worker_id, tool_name, tool_input,
                risk_level, status, decision_reason, created_at, decided_at
         FROM approval_requests
         WHERE status = 'pending'
         ORDER BY created_at DESC
         LIMIT 100",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(rows.iter().map(row_to_request).collect())
}

/// すべての承認リクエスト（履歴含む）を取得する
#[tauri::command]
pub async fn approval_history(
    state: State<'_, AppState>,
) -> Result<Vec<ApprovalRequest>> {
    let rows = sqlx::query(
        "SELECT id, request_id, worker_id, tool_name, tool_input,
                risk_level, status, decision_reason, created_at, decided_at
         FROM approval_requests
         ORDER BY created_at DESC
         LIMIT 200",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(rows.iter().map(row_to_request).collect())
}

/// 承認リクエストを作成する（Swarm worker / MCP ツール実行時に呼ばれる）
#[tauri::command]
pub async fn approval_create(
    request_id: String,
    worker_id: Option<String>,
    tool_name: String,
    tool_input: String,
    risk_level: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<ApprovalRequest> {
    sqlx::query(
        "INSERT INTO approval_requests (request_id, worker_id, tool_name, tool_input, risk_level)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&request_id)
    .bind(&worker_id)
    .bind(&tool_name)
    .bind(&tool_input)
    .bind(&risk_level)
    .execute(&state.db)
    .await?;

    let row = sqlx::query(
        "SELECT id, request_id, worker_id, tool_name, tool_input,
                risk_level, status, decision_reason, created_at, decided_at
         FROM approval_requests WHERE request_id = ?",
    )
    .bind(&request_id)
    .fetch_one(&state.db)
    .await?;

    let req = row_to_request(&row);

    // フロントエンドに通知
    let _ = app.emit("approval-request-pending", &req);

    Ok(req)
}

/// 承認/拒否の判定を送信する
///
/// 承認された場合、PendingSpawns に該当する SpawnRequest があればワーカーを起動する。
/// 拒否された場合、Orchestrator のタスクを Skipped に更新する。
#[tauri::command]
pub async fn approval_decide(
    decision: ApprovalDecision,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<()> {
    let status = if decision.approved { "approved" } else { "rejected" };

    let result = sqlx::query(
        "UPDATE approval_requests
         SET status = ?, decision_reason = ?, decided_at = datetime('now')
         WHERE request_id = ? AND status = 'pending'",
    )
    .bind(status)
    .bind(&decision.reason)
    .bind(&decision.request_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "承認リクエスト {} が見つからないか、既に処理済みです",
            decision.request_id
        )));
    }

    // 承認チャネルに結果を送信（レガシー互換）
    {
        let mut channels = state.approval_channels.lock().unwrap();
        if let Some(tx) = channels.get(&decision.request_id) {
            let _ = tx.send(decision.approved);
        }
        // チャネルをクリーンアップ
        channels.remove(&decision.request_id);
    }

    // PendingSpawns からワーカー起動リクエストを取得して処理
    let pending_spawn = {
        if let Some(ps_state) = app.try_state::<SharedPendingSpawns>() {
            let mut ps = ps_state.lock().unwrap();
            ps.take(&decision.request_id)
        } else {
            None
        }
    };

    if let Some(pending) = pending_spawn {
        if decision.approved {
            // 承認 → ワーカーを起動
            let task_id = pending.spawn_request.task_id;
            let spawn_result = if let Some(mgr_state) = app.try_state::<SharedWorkerManager>() {
                let mut mgr = mgr_state.lock().map_err(|e| {
                    AppError::Internal(format!("WorkerManager lock failed: {}", e))
                })?;
                mgr.spawn_worker(pending.spawn_request.worker_config.into(), app.clone())
                    .map_err(|e| AppError::Internal(format!("spawn_worker failed: {}", e)))
            } else {
                Err(AppError::Internal("WorkerManager not available".into()))
            };

            match spawn_result {
                Ok(new_worker_id) => {
                    if let Some(orch_state) = app.try_state::<SharedOrchestrator>() {
                        let mut orch = orch_state.lock().map_err(|e| {
                            AppError::Internal(format!("Orchestrator lock failed: {}", e))
                        })?;
                        orch.assign_worker_id(task_id, new_worker_id);
                        // 最新ステートを emit
                        if let Some(run) = &orch.current_run {
                            let _ = app.emit("orchestrator-status-changed", run);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[ApprovalDecide] Worker spawn failed: {}", e);
                    // 起動失敗時はタスクをエラーに
                    if let Some(orch_state) = app.try_state::<SharedOrchestrator>() {
                        let mut orch = orch_state.lock().map_err(|e| {
                            AppError::Internal(format!("Orchestrator lock failed: {}", e))
                        })?;
                        orch.reject_task(task_id);
                        if let Some(run) = &orch.current_run {
                            let _ = app.emit("orchestrator-status-changed", run);
                        }
                    }
                }
            }
        } else {
            // 拒否 → タスクをスキップ
            let task_id = pending.spawn_request.task_id;
            if let Some(orch_state) = app.try_state::<SharedOrchestrator>() {
                let mut orch = orch_state.lock().map_err(|e| {
                    AppError::Internal(format!("Orchestrator lock failed: {}", e))
                })?;
                orch.reject_task(task_id);
                if let Some(run) = &orch.current_run {
                    let _ = app.emit("orchestrator-status-changed", run);
                }
            }
        }
    }

    // フロントエンドに通知
    let _ = app.emit("approval-decided", &decision);

    Ok(())
}

/// 期限切れリクエストをクリーンアップする（5分超過で expired に）
#[tauri::command]
pub async fn approval_cleanup(
    state: State<'_, AppState>,
) -> Result<u64> {
    let result = sqlx::query(
        "UPDATE approval_requests
         SET status = 'expired', decided_at = datetime('now')
         WHERE status = 'pending'
           AND datetime(created_at, '+5 minutes') < datetime('now')",
    )
    .execute(&state.db)
    .await?;
    Ok(result.rows_affected())
}

/// 承認待ちの件数を取得する
#[tauri::command]
pub async fn approval_pending_count(
    state: State<'_, AppState>,
) -> Result<i64> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM approval_requests WHERE status = 'pending'",
    )
    .fetch_one(&state.db)
    .await?;
    Ok(row.0)
}
