pub mod agile;
pub mod ai;
pub mod analytics;
pub mod collaboration;
pub mod commands;
pub mod core;
pub mod db;
pub mod doc_mapping;
pub mod error;
pub mod maintenance;
pub mod mcp;
pub mod models;
pub mod policy;
pub mod review;
pub mod services;
pub mod state;
pub mod swarm;
pub mod notification;
pub mod browser;
pub mod api;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let data_dir = app_handle
                    .path()
                    .app_data_dir()
                    .expect("failed to get app data dir");
                std::fs::create_dir_all(&data_dir)?;
                let db_path = data_dir.join("devnest.db");
                let db_url = format!("sqlite:{}", db_path.display());

                let pool = db::connect(&db_url).await.map_err(|e| {
                    std::io::Error::other(e.to_string())
                })?;
                db::migrations::run(&pool).await.map_err(|e| {
                    std::io::Error::other(e.to_string())
                })?;

                let state = state::AppState::new(pool.clone());
                app_handle.manage(state);
                app_handle.manage(swarm::create_manager());
                app_handle.manage(swarm::create_orchestrator());
                app_handle.manage(swarm::create_hook_registry());
                // Swarm Stop フックをグローバル ~/.claude/settings.json に設定
                if let Err(e) = swarm::hooks::install_global_stop_hook() {
                    eprintln!("[Swarm] Stop フック設定失敗（無視して続行）: {}", e);
                }
                app_handle.manage(browser::create_browser());
                // Socket API サーバー起動
                let api_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    api::socket_server::DevNestApiServer::start(api_handle).await.ok();
                });

                let pool_cleanup = pool.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = db::cleanup::run(&pool_cleanup).await;
                });

                // バックグラウンドポーリング起動
                services::poller::start(app_handle.clone(), pool);

                // Swarm Wave Orchestrator 状態を登録
                let wave_orch: swarm::wave_orchestrator::SharedWaveOrchestrator =
                    std::sync::Arc::new(std::sync::Mutex::new(
                        swarm::wave_orchestrator::WaveOrchestrator::new(
                            vec![], swarm::settings::SwarmSettings::default(), String::new(),
                        ),
                    ));
                app_handle.manage(wave_orch);

                Ok(())
            })
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(crate::all_commands!())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
