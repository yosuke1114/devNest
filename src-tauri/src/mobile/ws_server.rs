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

use crate::state::AppState;
use crate::swarm::wave_orchestrator::{SharedWaveOrchestrator, WaveOrchestratorStatus};
use crate::swarm::worker::WorkerStatus;
use crate::swarm::SharedWorkerManager;
use crate::swarm::subtask::{detect_file_conflicts, detect_circular_deps};
use crate::swarm::task_splitter::TaskSplitter;

use super::message::{ClientMessage, ServerMessage, SwarmSnapshot, WorkerSnapshot};

// ────────────────────────────────────────
//  State
// ────────────────────────────────────────
pub struct WsState {
    pub broadcast_tx: broadcast::Sender<ServerMessage>,
    pub wave_orch: SharedWaveOrchestrator,
    pub manager: SharedWorkerManager,
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
        ClientMessage::TaskSplit { prompt, project_path } => {
            cmd_task_split(prompt, project_path, state).await;
        }
        ClientMessage::SwarmStart { tasks, settings, project_path } => {
            cmd_swarm_start(tasks, settings, project_path, state).await;
        }
        ClientMessage::SwarmStop => {
            cmd_swarm_stop(state).await;
        }
        ClientMessage::WorkerInput { worker_id, data } => {
            cmd_worker_input(worker_id, data, state);
        }
        ClientMessage::RunGate => {
            cmd_run_gate(state).await;
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

async fn cmd_task_split(prompt: String, project_path: String, state: &Arc<WsState>) {
    broadcast(&state.broadcast_tx, ServerMessage::Splitting);

    let api_key = match load_anthropic_key(&state.app_handle).await {
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
        let splitter = TaskSplitter::new(&api_key);
        match splitter.split(&prompt, &project_path, &[]).await {
            Ok(tasks) => {
                let conflict_warnings = detect_file_conflicts(&tasks);
                if let Err(cycle_err) = detect_circular_deps(&tasks) {
                    broadcast(
                        &tx,
                        ServerMessage::Error {
                            message: format!("循環依存検出: {}", cycle_err),
                        },
                    );
                    return;
                }
                broadcast(&tx, ServerMessage::SplitResult { tasks, conflict_warnings });
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

async fn cmd_swarm_start(
    tasks: Vec<crate::swarm::subtask::SubTask>,
    settings: crate::swarm::settings::SwarmSettings,
    project_path: String,
    state: &Arc<WsState>,
) {
    use crate::swarm::wave_orchestrator::WaveOrchestrator;

    // Wave Orchestrator を初期化して開始
    let spawn_requests = {
        let mut wo = match state.wave_orch.lock() {
            Ok(wo) => wo,
            Err(e) => {
                broadcast(&state.broadcast_tx, ServerMessage::Error {
                    message: format!("ロック取得失敗: {}", e),
                });
                return;
            }
        };

        // 既に実行中なら拒否
        if wo.snapshot().status != WaveOrchestratorStatus::Idle {
            broadcast(&state.broadcast_tx, ServerMessage::Error {
                message: "Swarmはすでに実行中です".into(),
            });
            return;
        }

        // 新しい WaveOrchestrator を作成して開始
        *wo = WaveOrchestrator::new(tasks, settings, project_path);
        match wo.start() {
            Ok(spawns) => spawns,
            Err(e) => {
                broadcast(&state.broadcast_tx, ServerMessage::Error {
                    message: format!("Swarm開始失敗: {}", e),
                });
                return;
            }
        }
    };

    // ワーカーを起動（ロック外で実行）
    for req in spawn_requests {
        let task_id = req.task_id;
        let new_id = {
            let mut mgr = match state.manager.lock() {
                Ok(m) => m,
                Err(e) => {
                    broadcast(&state.broadcast_tx, ServerMessage::Error {
                        message: format!("Manager ロック失敗: {}", e),
                    });
                    return;
                }
            };
            match mgr.spawn_worker(req.worker_config.into(), state.app_handle.clone()) {
                Ok(id) => id,
                Err(e) => {
                    broadcast(&state.broadcast_tx, ServerMessage::Error {
                        message: format!("Worker起動失敗: {}", e),
                    });
                    continue;
                }
            }
        };

        // assign_worker_id
        if let Ok(mut wo) = state.wave_orch.lock() {
            wo.assign_worker_id(task_id, new_id);
        }
    }

    // スナップショットをブロードキャスト
    broadcast_snapshot(state);
}

async fn cmd_swarm_stop(state: &Arc<WsState>) {
    // Wave Orchestrator をキャンセル
    let worker_ids: Vec<String> = {
        let mut wo = match state.wave_orch.lock() {
            Ok(wo) => wo,
            Err(_) => return,
        };
        wo.cancel();

        // 現在のワーカー ID を取得
        let mgr = match state.manager.lock() {
            Ok(m) => m,
            Err(_) => return,
        };
        mgr.list_workers().iter().map(|w| w.id.clone()).collect()
    };

    // 全ワーカーを kill
    for wid in worker_ids {
        if let Ok(mut mgr) = state.manager.lock() {
            let _ = mgr.kill_worker(&wid, state.app_handle.clone());
        }
    }

    broadcast_snapshot(state);
}

fn cmd_worker_input(worker_id: String, data: String, state: &Arc<WsState>) {
    if let Ok(mut mgr) = state.manager.lock() {
        if let Err(e) = mgr.write_to_worker(&worker_id, data.as_bytes()) {
            broadcast(
                &state.broadcast_tx,
                ServerMessage::Error {
                    message: format!("stdin書き込み失敗: {}", e),
                },
            );
        }
    }
}

async fn cmd_run_gate(state: &Arc<WsState>) {
    // run_gate は async なので、必要なデータを取り出してからロック解放 → async 処理 → 再ロック
    let gate_result = {
        let mut wo = match state.wave_orch.lock() {
            Ok(wo) => wo,
            Err(_) => return,
        };
        // run_gate 自体は内部で project_path 等を使うだけなので、
        // std::sync::Mutex 内で block_on するのは避けたい。
        // WaveOrchestrator::run_gate は &mut self を取る async fn。
        // ここでは tokio::task::block_in_place を使って安全に呼ぶ。
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(wo.run_gate())
        })
    };

    match gate_result {
        Ok(result) => {
            let overall_str = format!("{:?}", result.overall).to_lowercase();
            let wave_number = {
                let wo = state.wave_orch.lock().unwrap();
                wo.snapshot().current_wave
            };

            // Gate 結果を適用して次 Wave のタスクを取得
            let next_spawns = {
                let mut wo = state.wave_orch.lock().unwrap();
                wo.apply_gate_result(result)
            };

            broadcast(
                &state.broadcast_tx,
                ServerMessage::GateResult {
                    wave_number,
                    overall: overall_str,
                },
            );

            // 次 Wave のワーカーを起動
            for req in next_spawns {
                let task_id = req.task_id;
                let new_id = {
                    let mut mgr = match state.manager.lock() {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    match mgr.spawn_worker(req.worker_config.into(), state.app_handle.clone()) {
                        Ok(id) => id,
                        Err(_) => continue,
                    }
                };
                if let Ok(mut wo) = state.wave_orch.lock() {
                    wo.assign_worker_id(task_id, new_id);
                }
            }

            broadcast_snapshot(state);
        }
        Err(e) => {
            broadcast(
                &state.broadcast_tx,
                ServerMessage::Error {
                    message: format!("Gate実行失敗: {}", e),
                },
            );
        }
    }
}

async fn cmd_sync(state: &Arc<WsState>, socket: &mut WebSocket) {
    let snapshot = make_snapshot(state);
    send_direct(socket, ServerMessage::SwarmStatus(snapshot)).await;

    let workers = make_worker_list(state);
    send_direct(socket, ServerMessage::Workers(workers)).await;
}

// ────────────────────────────────────────
//  Tauri イベント → WS broadcast ブリッジ
// ────────────────────────────────────────

/// Tauri イベントを listen して WS にブリッジする。
/// lib.rs の setup から呼ばれる。
pub fn setup_event_bridge(state: Arc<WsState>) {
    use tauri::Listener;

    let app = state.app_handle.clone();

    // worker-output → WorkerOutput
    {
        let tx = state.broadcast_tx.clone();
        app.listen("worker-output", move |event| {
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                let worker_id = payload["workerId"].as_str().unwrap_or("").to_string();
                let data = payload["data"].as_str().unwrap_or("").to_string();
                let _ = tx.send(ServerMessage::WorkerOutput { worker_id, data });
            }
        });
    }

    // worker-status-changed → WorkerStatus + WaveOrchestrator 更新
    {
        let state_clone = Arc::clone(&state);
        let tx = state.broadcast_tx.clone();
        app.listen("worker-status-changed", move |event| {
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                let worker_id = payload["workerId"].as_str().unwrap_or("").to_string();
                let status_str = payload["status"].as_str().unwrap_or("").to_string();

                // WS クライアントに通知
                let _ = tx.send(ServerMessage::WorkerStatus {
                    worker_id: worker_id.clone(),
                    status: status_str.clone(),
                });

                // WaveOrchestrator を更新
                let ws = parse_worker_status(&status_str);
                if let Some(ws) = ws {
                    if let Ok(mut wo) = state_clone.wave_orch.lock() {
                        let result = wo.update_worker_status(&worker_id, ws);

                        // Gate Ready 通知
                        if result.wave_gate_ready {
                            let wave_number = wo.snapshot().current_wave;
                            let _ = tx.send(ServerMessage::GateReady { wave_number });
                        }

                        // スナップショット更新
                        let snap = wo.snapshot();
                        let _ = tx.send(ServerMessage::SwarmStatus(SwarmSnapshot {
                            status: format!("{:?}", snap.status).to_lowercase(),
                            current_wave: snap.current_wave,
                            total_tasks: snap.total_tasks,
                            completed_tasks: snap.completed_tasks,
                            failed_tasks: snap.failed_tasks,
                        }));

                        // 新 Spawn がある場合（依存解決で Ready になったタスク）
                        if !result.new_spawns.is_empty() {
                            for req in result.new_spawns {
                                let task_id = req.task_id;
                                let new_id = {
                                    let mut mgr = match state_clone.manager.lock() {
                                        Ok(m) => m,
                                        Err(_) => continue,
                                    };
                                    match mgr.spawn_worker(
                                        req.worker_config.into(),
                                        state_clone.app_handle.clone(),
                                    ) {
                                        Ok(id) => id,
                                        Err(_) => continue,
                                    }
                                };
                                wo.assign_worker_id(task_id, new_id);
                            }
                        }
                    }
                }
            }
        });
    }
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

fn make_snapshot(state: &Arc<WsState>) -> SwarmSnapshot {
    if let Ok(wo) = state.wave_orch.lock() {
        let snap = wo.snapshot();
        SwarmSnapshot {
            status: format!("{:?}", snap.status).to_lowercase(),
            current_wave: snap.current_wave,
            total_tasks: snap.total_tasks,
            completed_tasks: snap.completed_tasks,
            failed_tasks: snap.failed_tasks,
        }
    } else {
        SwarmSnapshot {
            status: "idle".into(),
            current_wave: 0,
            total_tasks: 0,
            completed_tasks: 0,
            failed_tasks: 0,
        }
    }
}

fn make_worker_list(state: &Arc<WsState>) -> Vec<WorkerSnapshot> {
    if let Ok(mgr) = state.manager.lock() {
        mgr.list_workers()
            .iter()
            .map(|w| WorkerSnapshot {
                id: w.id.clone(),
                label: w.config.label.clone(),
                status: format!("{:?}", w.status).to_lowercase(),
            })
            .collect()
    } else {
        vec![]
    }
}

fn broadcast_snapshot(state: &Arc<WsState>) {
    let snapshot = make_snapshot(state);
    broadcast(&state.broadcast_tx, ServerMessage::SwarmStatus(snapshot));
}

fn parse_worker_status(s: &str) -> Option<WorkerStatus> {
    match s {
        "idle" => Some(WorkerStatus::Idle),
        "running" => Some(WorkerStatus::Running),
        "done" => Some(WorkerStatus::Done),
        "error" => Some(WorkerStatus::Error),
        _ => None,
    }
}

/// DB → 環境変数フォールバックで Anthropic API キーを取得する
async fn load_anthropic_key(app_handle: &AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let app_state = app_handle.state::<AppState>();
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = 'anthropic.api_key'")
            .fetch_optional(&app_state.db)
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
