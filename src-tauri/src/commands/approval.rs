use tauri::{AppHandle, Emitter, State};
use crate::error::{AppError, Result};
use crate::models::approval::{ApprovalDecision, ApprovalRequest};
use crate::state::AppState;

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

    // 承認チャネルに結果を送信（ワーカーが待機中の場合）
    {
        let channels = state.approval_channels.lock().unwrap();
        if let Some(tx) = channels.get(&decision.request_id) {
            let _ = tx.send(decision.approved);
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
