use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::notification::ring::{emit_ring_event, RingEvent, RingUrgency};

use super::worker::{WorkerConfig, WorkerInfo, WorkerKind, WorkerMode, WorkerStatus};

/// Claude Code 起動コマンド引数を構築する純粋関数。
/// - `instruction` 内の `'` はシェルインジェクション防止のためエスケープする
/// - `metadata` に応じてオプションフラグを付与する
pub(crate) fn build_claude_arg(instruction: &str, metadata: &HashMap<String, String>) -> String {
    let safe_instr = instruction.replace('\'', "'\\''");
    let mut flags = String::new();
    if metadata.get("claude_flag_skip_permissions").map(|v| v == "1").unwrap_or(false) {
        flags.push_str(" --dangerously-skip-permissions");
    }
    if metadata.get("claude_flag_no_stream").map(|v| v == "1").unwrap_or(false) {
        flags.push_str(" --no-stream");
    }
    format!("claude{} '{}'", flags, safe_instr)
}

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

impl Default for WorkerManager {
    fn default() -> Self {
        Self::new()
    }
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
        // Batch + ClaudeCode の場合は `<shell> -c 'claude [flags] "instruction"'` で起動する
        let task_instruction = config.metadata.get("task_instruction").cloned();
        let default_shell = config
            .metadata
            .get("default_shell")
            .cloned()
            .unwrap_or_else(|| std::env::var("SHELL").unwrap_or_else(|_| "zsh".to_string()));
        let mut cmd = match (&config.kind, &config.mode, task_instruction) {
            (WorkerKind::ClaudeCode, WorkerMode::Batch, Some(instruction)) => {
                let mut c = CommandBuilder::new(&default_shell);
                let claude_arg = build_claude_arg(&instruction, &config.metadata);
                c.arg("-c");
                c.arg(claude_arg);
                c
            }
            _ => CommandBuilder::new(&default_shell),
        };
        cmd.cwd(&config.working_dir);

        // 子プロセス起動（exit code 取得のために child を保持）
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

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

            // exit code を確認して Done/Error を判定
            let exit_success = child
                .wait()
                .map(|s| s.success())
                .unwrap_or(false);
            let final_status = if exit_success {
                WorkerStatus::Done
            } else {
                WorkerStatus::Error
            };
            let status_str = if exit_success { "done" } else { "error" };

            {
                let mut s = statuses_clone.lock().unwrap();
                s.insert(worker_id.clone(), final_status);
            }
            let _ = app_clone.emit(
                "worker-status-changed",
                serde_json::json!({ "workerId": worker_id, "status": status_str }),
            );

            // Ring notification（F-11-19）
            let urgency = if exit_success { RingUrgency::Info } else { RingUrgency::Warning };
            let message = if exit_success {
                format!("Worker {} が完了しました", worker_id)
            } else {
                format!("Worker {} がエラーで終了しました", worker_id)
            };
            emit_ring_event(&app_clone, RingEvent::AgentAttention {
                task_id: worker_id.clone(),
                task_type: "swarm_worker".to_string(),
                product_id: String::new(),
                urgency,
                message,
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

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn build_claude_arg_basic() {
        let arg = build_claude_arg("fix the bug", &meta(&[]));
        assert_eq!(arg, "claude 'fix the bug'");
    }

    #[test]
    fn build_claude_arg_escapes_single_quote() {
        // シェルインジェクション防止: ' → '\'' にエスケープされる
        let arg = build_claude_arg("it's broken", &meta(&[]));
        assert_eq!(arg, "claude 'it'\\''s broken'");
    }

    #[test]
    fn build_claude_arg_skip_permissions_flag() {
        let arg = build_claude_arg("do x", &meta(&[("claude_flag_skip_permissions", "1")]));
        assert_eq!(arg, "claude --dangerously-skip-permissions 'do x'");
    }

    #[test]
    fn build_claude_arg_no_stream_flag() {
        let arg = build_claude_arg("do x", &meta(&[("claude_flag_no_stream", "1")]));
        assert_eq!(arg, "claude --no-stream 'do x'");
    }

    #[test]
    fn build_claude_arg_both_flags() {
        let arg = build_claude_arg("do x", &meta(&[
            ("claude_flag_skip_permissions", "1"),
            ("claude_flag_no_stream", "1"),
        ]));
        assert!(arg.contains("--dangerously-skip-permissions"));
        assert!(arg.contains("--no-stream"));
        assert!(arg.ends_with("'do x'"));
    }

    #[test]
    fn build_claude_arg_flag_off_when_zero() {
        let arg = build_claude_arg("do x", &meta(&[("claude_flag_skip_permissions", "0")]));
        assert!(!arg.contains("--dangerously-skip-permissions"));
        assert_eq!(arg, "claude 'do x'");
    }

    #[test]
    fn worker_manager_new_has_empty_state() {
        let mgr = WorkerManager::new();
        assert!(mgr.workers.is_empty());
        assert!(mgr.ptys.is_empty());
        assert!(mgr.list_workers().is_empty());
    }

    #[test]
    fn write_to_worker_returns_error_when_not_found() {
        let mut mgr = WorkerManager::new();
        let result = mgr.write_to_worker("nonexistent", b"hello");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Worker not found");
    }

    #[test]
    fn resize_worker_returns_error_when_not_found() {
        let mut mgr = WorkerManager::new();
        let result = mgr.resize_worker("nonexistent", 80, 24);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Worker not found");
    }
}
