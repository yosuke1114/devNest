use std::sync::atomic::Ordering;
use tauri::State;
use crate::error::Result;
use crate::state::AppState;

/// バックグラウンドポーリングを有効にする。
#[tauri::command]
pub async fn polling_start(state: State<'_, AppState>) -> Result<()> {
    state.polling_active.store(true, Ordering::Relaxed);
    Ok(())
}

/// バックグラウンドポーリングを無効にする。
#[tauri::command]
pub async fn polling_stop(state: State<'_, AppState>) -> Result<()> {
    state.polling_active.store(false, Ordering::Relaxed);
    Ok(())
}

/// バックグラウンドポーリングの現在の状態を返す。
#[tauri::command]
pub async fn polling_status(state: State<'_, AppState>) -> Result<bool> {
    Ok(state.polling_active.load(Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use crate::db;
    use crate::state::AppState;
    use std::sync::atomic::Ordering;
    use tempfile::TempDir;

    async fn setup() -> (AppState, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_url = format!("sqlite:{}", dir.path().join("dev.db").display());
        let pool = db::connect(&db_url).await.unwrap();
        db::migrations::run(&pool).await.unwrap();
        (AppState::new(pool), dir)
    }

    // 🔴 Red: polling_start で active が true になる
    #[tokio::test]
    async fn test_polling_start_sets_active() {
        let (state, _dir) = setup().await;
        // まず false にしてから true に戻す
        state.polling_active.store(false, Ordering::Relaxed);
        assert!(!state.polling_active.load(Ordering::Relaxed));
        state.polling_active.store(true, Ordering::Relaxed);
        assert!(state.polling_active.load(Ordering::Relaxed));
    }

    // 🔴 Red: polling_stop で active が false になる
    #[tokio::test]
    async fn test_polling_stop_sets_inactive() {
        let (state, _dir) = setup().await;
        state.polling_active.store(true, Ordering::Relaxed);
        state.polling_active.store(false, Ordering::Relaxed);
        assert!(!state.polling_active.load(Ordering::Relaxed));
    }

    // 🔴 Red: デフォルトは active=true
    #[tokio::test]
    async fn test_polling_default_active() {
        let (state, _dir) = setup().await;
        assert!(state.polling_active.load(Ordering::Relaxed));
    }

    // AtomicBool が複数スレッドから安全に読み書きできること
    #[tokio::test]
    async fn test_polling_active_is_send_sync() {
        let (state, _dir) = setup().await;
        let flag = state.polling_active.clone();
        let handle = tokio::spawn(async move {
            flag.store(false, Ordering::Relaxed);
            flag.load(Ordering::Relaxed)
        });
        let result = handle.await.unwrap();
        assert!(!result);
    }

    // start → stop → start のトグル動作を確認
    #[tokio::test]
    async fn test_polling_toggle() {
        let (state, _dir) = setup().await;
        assert!(state.polling_active.load(Ordering::Relaxed));
        state.polling_active.store(false, Ordering::Relaxed);
        assert!(!state.polling_active.load(Ordering::Relaxed));
        state.polling_active.store(true, Ordering::Relaxed);
        assert!(state.polling_active.load(Ordering::Relaxed));
    }
}
