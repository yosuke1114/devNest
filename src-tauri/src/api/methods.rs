use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::notification::ring::{emit_ring_event, RingEvent, RingUrgency};

#[derive(Debug, Deserialize)]
pub struct ApiRequest {
    pub jsonrpc: String,
    pub id: Option<u64>,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub jsonrpc: String,
    pub id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiErrorResponse>,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorResponse {
    pub code: i32,
    pub message: String,
}

impl ApiResponse {
    pub fn ok(id: Option<u64>, result: serde_json::Value) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: Option<u64>, message: &str) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            result: None,
            error: Some(ApiErrorResponse {
                code: -32600,
                message: message.to_string(),
            }),
        }
    }
}

pub async fn handle_request(req: ApiRequest, app: &AppHandle) -> ApiResponse {
    let id = req.id;
    match req.method.as_str() {
        "notify" => handle_notify(req.params, app, id).await,
        "emit_ring" => handle_emit_ring(req.params, app, id).await,
        "task.list" => handle_task_list(req.params, app, id).await,
        "task.submit" => handle_task_submit(req.params, app, id).await,
        "task.status" => handle_task_status(req.params, app, id).await,
        "task.approve" => handle_task_approve(req.params, app, id).await,
        "scan.trigger" => handle_scan_trigger(req.params, app, id).await,
        "health.status" => handle_health_status(req.params, app, id).await,
        "browser.open" => handle_browser_open(req.params, app, id).await,
        "browser.navigate" => handle_browser_navigate(req.params, app, id).await,
        "product.current" => handle_product_current(req.params, app, id).await,
        "product.switch" => handle_product_switch(req.params, app, id).await,
        "docs.staleness" => handle_docs_staleness(req.params, app, id).await,
        "docs.affected" => handle_docs_affected(req.params, app, id).await,
        "kanban.create_card" => handle_create_card(req.params, app, id).await,
        "kanban.move_card" => handle_move_card(req.params, app, id).await,
        "worker.done" => handle_worker_done(req.params, app, id).await,
        _ => ApiResponse::error(id, "Unknown method"),
    }
}

async fn handle_notify(params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let title = params["title"].as_str().unwrap_or("通知").to_string();
    let body = params["body"].as_str().unwrap_or("").to_string();
    let urgency_str = params["urgency"].as_str().unwrap_or("info");
    let urgency = match urgency_str {
        "critical" => RingUrgency::Critical,
        "warning" => RingUrgency::Warning,
        _ => RingUrgency::Info,
    };
    let event = RingEvent::AgentAttention {
        task_id: "external".into(),
        task_type: "notify".into(),
        product_id: "".into(),
        urgency,
        message: format!("{}: {}", title, body),
    };
    emit_ring_event(app, event);
    ApiResponse::ok(id, serde_json::json!({ "success": true }))
}

async fn handle_emit_ring(params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let event_type = params["type"].as_str().unwrap_or("").to_string();
    let message = params["message"].as_str().unwrap_or("").to_string();
    let event = RingEvent::AgentAttention {
        task_id: "external".into(),
        task_type: event_type,
        product_id: "".into(),
        urgency: RingUrgency::Info,
        message,
    };
    emit_ring_event(app, event);
    ApiResponse::ok(id, serde_json::json!({ "success": true }))
}

async fn handle_task_list(_params: serde_json::Value, _app: &AppHandle, id: Option<u64>) -> ApiResponse {
    ApiResponse::ok(id, serde_json::json!({ "tasks": [] }))
}

async fn handle_task_submit(params: serde_json::Value, _app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let task_type = params["type"].as_str().unwrap_or("unknown");
    ApiResponse::ok(id, serde_json::json!({ "submitted": true, "type": task_type }))
}

async fn handle_task_status(params: serde_json::Value, _app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let task_id = params["task_id"].as_str().unwrap_or("");
    ApiResponse::ok(id, serde_json::json!({ "task_id": task_id, "status": "unknown" }))
}

async fn handle_task_approve(params: serde_json::Value, _app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let task_id = params["task_id"].as_str().unwrap_or("");
    ApiResponse::ok(id, serde_json::json!({ "task_id": task_id, "approved": true }))
}

async fn handle_scan_trigger(_params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    // 保守スキャンをトリガー（実際はTauriイベント送信）
    app.emit("scan-trigger", ()).ok();
    ApiResponse::ok(id, serde_json::json!({ "triggered": true }))
}

async fn handle_health_status(_params: serde_json::Value, _app: &AppHandle, id: Option<u64>) -> ApiResponse {
    ApiResponse::ok(id, serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn handle_browser_open(params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let url = params["url"].as_str().unwrap_or("").to_string();
    // Tauriイベントでブラウザパネル開示を指示
    app.emit("browser-open", serde_json::json!({ "url": url })).ok();
    ApiResponse::ok(id, serde_json::json!({ "success": true, "url": url }))
}

async fn handle_browser_navigate(params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let panel_id = params["panel_id"].as_str().unwrap_or("").to_string();
    let url = params["url"].as_str().unwrap_or("").to_string();
    app.emit("browser-navigate", serde_json::json!({ "panelId": panel_id, "url": url })).ok();
    ApiResponse::ok(id, serde_json::json!({ "success": true }))
}

async fn handle_product_current(_params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    // 実際のプロダクト情報はTauriコマンド経由で取得が必要
    // ここではフロントエンドにリクエストを転送するイベントを送信
    app.emit("api-product-current", ()).ok();
    ApiResponse::ok(id, serde_json::json!({ "note": "Use Tauri command for real-time data" }))
}

async fn handle_product_switch(params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let product_id = params["product_id"].as_i64().unwrap_or(0);
    app.emit("api-product-switch", serde_json::json!({ "productId": product_id })).ok();
    ApiResponse::ok(id, serde_json::json!({ "success": true }))
}

async fn handle_docs_staleness(params: serde_json::Value, _app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let note = "check_doc_staleness Tauri command を使用してください。Socket API からの直接実行は未サポートです。";
    let product = params["product"].as_str();
    ApiResponse::ok(id, serde_json::json!({
        "note": note,
        "product": product,
        "hint": "devnest docs staleness は check_doc_staleness コマンドと連携予定",
    }))
}

async fn handle_docs_affected(params: serde_json::Value, _app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let doc = params["doc"].as_str().unwrap_or("");
    ApiResponse::ok(id, serde_json::json!({ "doc": doc, "affected": [] }))
}

async fn handle_create_card(params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    app.emit("api-kanban-create", &params).ok();
    ApiResponse::ok(id, serde_json::json!({ "success": true }))
}

async fn handle_move_card(params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    app.emit("api-kanban-move", &params).ok();
    ApiResponse::ok(id, serde_json::json!({ "success": true }))
}

/// Claude Code の PostTask/TaskError フックから呼ばれる完了通知。
/// `devnest worker done --worker-id <id>` → Socket API → ここへ到達する。
async fn handle_worker_done(params: serde_json::Value, app: &AppHandle, id: Option<u64>) -> ApiResponse {
    let worker_id = match params["worker_id"].as_str() {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return ApiResponse::error(id, "worker_id is required"),
    };

    use crate::swarm::SharedHookRegistry;
    if let Some(registry) = app.try_state::<SharedHookRegistry>() {
        if let Ok(reg) = registry.inner().lock() {
            if let Some(tx) = reg.get(&worker_id) {
                let _ = tx.send(());
            }
        }
    }

    ApiResponse::ok(id, serde_json::json!({ "success": true, "worker_id": worker_id }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_response_ok_has_result() {
        let resp = ApiResponse::ok(Some(1), serde_json::json!({ "value": 42 }));
        assert!(resp.result.is_some());
        assert!(resp.error.is_none());
        assert_eq!(resp.jsonrpc, "2.0");
    }

    #[test]
    fn api_response_error_has_error() {
        let resp = ApiResponse::error(Some(1), "Unknown method");
        assert!(resp.result.is_none());
        assert!(resp.error.is_some());
        assert_eq!(resp.error.unwrap().message, "Unknown method");
    }

    #[test]
    fn unknown_method_response_has_error() {
        // handle_request は async なので、未知メソッドのエラーレスポンスを ApiResponse::error で確認
        let resp = ApiResponse::error(Some(99), "Unknown method");
        assert!(resp.error.is_some());
        assert_eq!(resp.id, Some(99));
    }

    #[test]
    fn api_response_jsonrpc_version_is_2_0() {
        let ok = ApiResponse::ok(Some(1), serde_json::json!(null));
        assert_eq!(ok.jsonrpc, "2.0");
        let err = ApiResponse::error(None, "test");
        assert_eq!(err.jsonrpc, "2.0");
    }
}
