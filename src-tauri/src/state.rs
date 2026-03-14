use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
use tokio::sync::RwLock;
use crate::db::DbPool;

/// Box<dyn MasterPty> を Send にするラッパー（ネイティブ実装は fd ベースでスレッドセーフ）
pub struct PtyMaster(pub Box<dyn portable_pty::MasterPty>);
// SAFETY: NativePtySystem の MasterPty 実装はファイルディスクリプタベースでスレッドセーフ
unsafe impl Send for PtyMaster {}
impl PtyMaster {
    pub fn resize(&self, size: portable_pty::PtySize) -> anyhow::Result<()> {
        self.0.resize(size)
    }
}

/// アクティブな PTY セッションのライターと master を保持する。
pub struct PtySessionHandle {
    pub session_id: i64,
    /// PTY master への書き込み端
    pub writer: Box<dyn std::io::Write + Send>,
    /// PTY master（リサイズ用）
    pub master: PtyMaster,
}

pub struct AppState {
    pub db: DbPool,
    /// ポーリングタスクのハンドル管理（project_id → JoinHandle）
    pub polling_handles: Arc<RwLock<HashMap<i64, tokio::task::JoinHandle<()>>>>,
    /// OAuth コールバック待ちチャンネル（project_id → oneshot::Sender）
    pub oauth_channels: Arc<RwLock<HashMap<i64, tokio::sync::oneshot::Sender<String>>>>,
    /// OAuth コールバックサーバータスクの中断ハンドル（再試行時に前回のサーバーを止める）
    pub oauth_task: Arc<Mutex<Option<tokio::task::AbortHandle>>>,
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
            oauth_task: Arc::new(Mutex::new(None)),
            pty_session: Arc::new(Mutex::new(None)),
            polling_active: Arc::new(AtomicBool::new(true)),
        }
    }
}
