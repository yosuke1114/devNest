use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
use tokio::sync::RwLock;
use crate::db::DbPool;

/// アクティブな PTY セッションのライターを保持する。
pub struct PtySessionHandle {
    pub session_id: i64,
    /// PTY master への書き込み端
    pub writer: Box<dyn std::io::Write + Send>,
}

pub struct AppState {
    pub db: DbPool,
    /// ポーリングタスクのハンドル管理（project_id → JoinHandle）
    pub polling_handles: Arc<RwLock<HashMap<i64, tokio::task::JoinHandle<()>>>>,
    /// OAuth コールバック待ちチャンネル（project_id → oneshot::Sender）
    pub oauth_channels: Arc<RwLock<HashMap<i64, tokio::sync::oneshot::Sender<String>>>>,
    /// アクティブな PTY セッション（同時 1 セッション）
    pub pty_session: Arc<Mutex<Option<PtySessionHandle>>>,
    /// バックグラウンドポーリングの有効／無効フラグ（デフォルト: 有効）
    pub polling_active: Arc<AtomicBool>,
}

impl AppState {
    pub fn new(db: DbPool) -> Self {
        Self {
            db,
            polling_handles: Arc::new(RwLock::new(HashMap::new())),
            oauth_channels: Arc::new(RwLock::new(HashMap::new())),
            pty_session: Arc::new(Mutex::new(None)),
            polling_active: Arc::new(AtomicBool::new(true)),
        }
    }
}
