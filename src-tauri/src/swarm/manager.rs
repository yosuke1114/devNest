use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::notification::ring::{emit_ring_event, RingEvent, RingUrgency};

use super::worker::{WorkerConfig, WorkerInfo, WorkerKind, WorkerMode, WorkerStatus};

// Safety: WorkerManager は Arc<Mutex<WorkerManager>> 経由でのみアクセスされる。
// UnixMasterPty は内部でファイルディスクリプタを保持しており、
// Mutex 保護下であればスレッド間転送は安全。
struct ResizableMaster(Box<dyn portable_pty::MasterPty>);
unsafe impl Send for ResizableMaster {}

/// PTYプロセスの実体を保持する内部構造体
struct PtyHandle {
    writer: Box<dyn Write + Send>,
    master: ResizableMaster,
}

/// Worker ステータスの共有ストア（リーダースレッドと共有）
type StatusStore = Arc<Mutex<HashMap<String, WorkerStatus>>>;

pub struct WorkerManager {
    workers: HashMap<String, WorkerInfo>,
    ptys: HashMap<String, PtyHandle>,
    statuses: StatusStore,
}

impl WorkerManager {
    pub fn new() -> Self {
        Self {
            workers: HashMap::new(),
            ptys: HashMap::new(),
            statuses: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Workerを起動してPTYを作成する
    pub fn spawn_worker(&mut self, config: WorkerConfig, app: AppHandle) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();

        // PTY作成
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        // コマンド構築
        // Batch + ClaudeCode の場合は `zsh -c 'claude "instruction"'` で起動する
        let task_instruction = config.metadata.get("task_instruction").cloned();
        let mut cmd = match (&config.kind, &config.mode, task_instruction) {
            (WorkerKind::ClaudeCode, WorkerMode::Batch, Some(instruction)) => {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                let mut c = CommandBuilder::new(&shell);
                // 引数内の ' をエスケープしてシェルインジェクションを防止
                let safe_instr = instruction.replace('\'', "'\\''");
                c.arg("-c");
                c.arg(format!("claude '{}'", safe_instr));
                c
            }
            _ => {
                let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
                CommandBuilder::new(shell)
            }
        };
        cmd.cwd(&config.working_dir);

        // 子プロセス起動
        let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        // 読み取りスレッド起動（PTY出力のストリーミング + プロセス終了検出）
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| e.to_string())?;
        let worker_id = id.clone();
        let app_clone = app.clone();
        let statuses_clone = Arc::clone(&self.statuses);

        std::thread::spawn(move || {
            // PTY起動直後: Running に更新
            {
                let mut s = statuses_clone.lock().unwrap();
                s.insert(worker_id.clone(), WorkerStatus::Running);
            }
            let _ = app_clone.emit(
                "worker-status-changed",
                serde_json::json!({ "workerId": worker_id, "status": "running" }),
            );

            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF: プロセス終了
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_clone.emit(
                            "worker-output",
                            serde_json::json!({
                                "workerId": worker_id,
                                "data": data,
                            }),
                        );
                    }
                    Err(_) => break,
                }
            }

            // プロセス終了 → Done に更新
            {
                let mut s = statuses_clone.lock().unwrap();
                s.insert(worker_id.clone(), WorkerStatus::Done);
            }
            let _ = app_clone.emit(
                "worker-status-changed",
                serde_json::json!({ "workerId": worker_id, "status": "done" }),
            );
            // Ring notification（F-11-19）
            emit_ring_event(&app_clone, RingEvent::AgentAttention {
                task_id: worker_id.clone(),
                task_type: "swarm_worker".to_string(),
                product_id: String::new(),
                urgency: RingUrgency::Info,
                message: format!("Worker {} が完了しました", worker_id),
            });
        });

        // writer と master を保持
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        self.ptys.insert(
            id.clone(),
            PtyHandle {
                writer: Box::new(writer),
                master: ResizableMaster(pair.master),
            },
        );

        // 初期ステータス登録（Idle → Runningはリーダースレッドが遷移する）
        {
            let mut s = self.statuses.lock().unwrap();
            s.insert(id.clone(), WorkerStatus::Idle);
        }

        // WorkerInfo 登録
        let info = WorkerInfo {
            id: id.clone(),
            config,
            status: WorkerStatus::Idle,
        };
        self.workers.insert(id.clone(), info.clone());

        // フロントに通知
        let _ = app.emit("worker-spawned", &info);

        Ok(id)
    }

    /// Workerを停止してPTYを破棄する
    pub fn kill_worker(&mut self, worker_id: &str, app: AppHandle) -> Result<(), String> {
        self.ptys.remove(worker_id);
        self.workers.remove(worker_id);
        {
            let mut s = self.statuses.lock().unwrap();
            s.remove(worker_id);
        }
        let _ = app.emit(
            "worker-killed",
            serde_json::json!({ "workerId": worker_id }),
        );
        Ok(())
    }

    /// PTYにデータを書き込む（キーボード入力の転送）
    pub fn write_to_worker(&mut self, worker_id: &str, data: &[u8]) -> Result<(), String> {
        let pty = self.ptys.get_mut(worker_id).ok_or("Worker not found")?;
        pty.writer.write_all(data).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// PTYのサイズを変更する（xterm.jsのリサイズに追従）
    pub fn resize_worker(
        &mut self,
        worker_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        let pty = self.ptys.get_mut(worker_id).ok_or("Worker not found")?;
        pty.master
            .0
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// ステータスストアから最新状態を反映した Worker 一覧を返す
    pub fn list_workers(&self) -> Vec<WorkerInfo> {
        let statuses = self.statuses.lock().unwrap();
        self.workers
            .values()
            .map(|w| {
                let mut info = w.clone();
                if let Some(s) = statuses.get(&w.id) {
                    info.status = s.clone();
                }
                info
            })
            .collect()
    }
}
