use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::broadcast;
use tower_http::services::{ServeDir, ServeFile};
use tauri::AppHandle;

use super::{
    message::{ClientMessage, ServerMessage, SubTask, SwarmPhase},
    swarm_controller::SwarmController,
    task_splitter::split_task,
};

// ────────────────────────────────────────
//  State
// ────────────────────────────────────────
pub struct WsState {
    pub broadcast_tx: broadcast::Sender<ServerMessage>,
    pub swarm: Arc<tokio::sync::Mutex<Option<SwarmController>>>,
    pub app_handle: AppHandle,
}

// ────────────────────────────────────────
//  サーバー起動
// ────────────────────────────────────────
pub async fn start(state: Arc<WsState>, bind_addr: String) {
    let dist_path = std::env::var("MOBILE_DIST_PATH")
        .unwrap_or_else(|_| "./packages/mobile/dist".to_string());

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .nest_service(
            "/",
            ServeDir::new(&dist_path)
                .fallback(ServeFile::new(format!("{}/index.html", dist_path))),
        )
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .expect(&format!("WSサーバー起動失敗: {}", bind_addr));

    tracing::info!("Mobile server  : http://{}", bind_addr);
    tracing::info!("WebSocket      : ws://{}/ws", bind_addr);
    axum::serve(listener, app).await.unwrap();
}

// ────────────────────────────────────────
//  接続ハンドラー（クエリパラメータ認証）
// ────────────────────────────────────────
async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<WsState>>,
) -> impl IntoResponse {
    let expected = std::env::var("WS_SECRET").unwrap_or_default();
    let provided = params.get("token").map(String::as_str).unwrap_or("");

    if !expected.is_empty() && provided != expected {
        tracing::warn!("WSトークン認証失敗");
        return StatusCode::UNAUTHORIZED.into_response();
    }

    ws.on_upgrade(|socket| handle_socket(socket, state))
        .into_response()
}

// ────────────────────────────────────────
//  ソケット処理メインループ
// ────────────────────────────────────────
async fn handle_socket(mut socket: WebSocket, state: Arc<WsState>) {
    let mut rx = state.broadcast_tx.subscribe();

    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let text_str: &str = &text;
                        handle_client_message(text_str, &state, &mut socket).await;
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::info!("クライアント切断");
                        break;
                    }
                    _ => {}
                }
            }
            Ok(server_msg) = rx.recv() => {
                let json = serde_json::to_string(&server_msg).unwrap_or_default();
                if socket.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
            // keepAlive ping（30秒間隔）
            _ = tokio::time::sleep(Duration::from_secs(30)) => {
                if socket.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }
        }
    }
}

// ────────────────────────────────────────
//  メッセージルーティング
// ────────────────────────────────────────
async fn handle_client_message(
    raw: &str,
    state: &Arc<WsState>,
    socket: &mut WebSocket,
) {
    let msg: ClientMessage = match serde_json::from_str(raw) {
        Ok(m) => m,
        Err(e) => {
            send_direct(
                socket,
                ServerMessage::Error {
                    message: format!("不正なメッセージ形式: {}", e),
                },
            )
            .await;
            return;
        }
    };

    match msg {
        ClientMessage::SwarmStart { tasks } => {
            cmd_swarm_start(tasks, state).await;
        }
        ClientMessage::SwarmStop => {
            cmd_swarm_stop(state).await;
        }
        ClientMessage::SwarmInput { text } => {
            // stdin sanitize: 改行は1つに制限
            let sanitized = text.lines().next().unwrap_or("").to_string();
            cmd_swarm_input(sanitized, state).await;
        }
        ClientMessage::TaskSplit { text } => {
            cmd_task_split(text, state).await;
        }
        ClientMessage::Sync => {
            cmd_sync(state, socket).await;
        }
        ClientMessage::Ping => {
            send_direct(socket, ServerMessage::Pong).await;
        }
    }
}

// ────────────────────────────────────────
//  コマンド実装
// ────────────────────────────────────────
async fn cmd_swarm_start(tasks: Vec<SubTask>, state: &Arc<WsState>) {
    let mut guard = state.swarm.lock().await;
    if guard.is_some() {
        broadcast(
            &state.broadcast_tx,
            ServerMessage::Error {
                message: "Swarmはすでに起動中です".into(),
            },
        );
        return;
    }

    let total = tasks.len() as u32;
    broadcast(
        &state.broadcast_tx,
        ServerMessage::Status {
            phase: SwarmPhase::Starting,
            agent: None,
            completed: 0,
            total,
        },
    );

    let tx = state.broadcast_tx.clone();
    match SwarmController::spawn(tasks, tx).await {
        Ok(controller) => {
            *guard = Some(controller);
        }
        Err(e) => {
            broadcast(
                &state.broadcast_tx,
                ServerMessage::Error {
                    message: format!("Swarm起動失敗: {}", e),
                },
            );
        }
    }
}

async fn cmd_swarm_stop(state: &Arc<WsState>) {
    let mut guard = state.swarm.lock().await;
    if let Some(controller) = guard.take() {
        let (completed, total) = (controller.completed, controller.total);
        broadcast(
            &state.broadcast_tx,
            ServerMessage::Status {
                phase: SwarmPhase::Stopping,
                agent: None,
                completed,
                total,
            },
        );
        controller.kill();
        broadcast(
            &state.broadcast_tx,
            ServerMessage::Status {
                phase: SwarmPhase::Idle,
                agent: None,
                completed: 0,
                total: 0,
            },
        );
    }
}

async fn cmd_swarm_input(text: String, state: &Arc<WsState>) {
    let mut guard = state.swarm.lock().await;
    if let Some(ref mut controller) = *guard {
        if let Err(e) = controller.send_input(&text) {
            broadcast(
                &state.broadcast_tx,
                ServerMessage::Error {
                    message: format!("stdin書き込み失敗: {}", e),
                },
            );
        }
    }
}

async fn cmd_task_split(text: String, state: &Arc<WsState>) {
    broadcast(&state.broadcast_tx, ServerMessage::Splitting);

    let api_key = match get_api_key() {
        Ok(k) => k,
        Err(e) => {
            broadcast(
                &state.broadcast_tx,
                ServerMessage::Error {
                    message: format!("APIキー取得失敗: {}", e),
                },
            );
            return;
        }
    };

    let tx = state.broadcast_tx.clone();
    tokio::spawn(async move {
        match split_task(&text, &api_key).await {
            Ok(tasks) => {
                broadcast(&tx, ServerMessage::SplitResult { tasks });
            }
            Err(e) => {
                broadcast(
                    &tx,
                    ServerMessage::Error {
                        message: format!("タスク分割失敗: {}", e),
                    },
                );
            }
        }
    });
}

async fn cmd_sync(state: &Arc<WsState>, socket: &mut WebSocket) {
    let guard = state.swarm.lock().await;
    let msg = match &*guard {
        None => ServerMessage::Status {
            phase: SwarmPhase::Idle,
            agent: None,
            completed: 0,
            total: 0,
        },
        Some(c) => ServerMessage::Status {
            phase: c.phase.clone(),
            agent: c.current_agent.clone(),
            completed: c.completed,
            total: c.total,
        },
    };
    send_direct(socket, msg).await;
}

// ────────────────────────────────────────
//  ユーティリティ
// ────────────────────────────────────────
fn broadcast(tx: &broadcast::Sender<ServerMessage>, msg: ServerMessage) {
    let _ = tx.send(msg);
}

async fn send_direct(socket: &mut WebSocket, msg: ServerMessage) {
    let json = serde_json::to_string(&msg).unwrap_or_default();
    let _ = socket.send(Message::Text(json.into())).await;
}

fn get_api_key() -> Result<String, String> {
    // TODO: tauri-plugin-store 導入後に store 経由に切り替え
    // 現時点では環境変数から取得
    std::env::var("CLAUDE_API_KEY")
        .map_err(|_| "CLAUDE_API_KEY 環境変数が設定されていません".to_string())
}
