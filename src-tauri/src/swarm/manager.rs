use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::notification::ring::{emit_ring_event, RingEvent, RingUrgency};

use super::completion::{CompletionDetector, CompletionResult};
use super::hooks::{setup_claude_hooks, teardown_claude_hooks};
use super::worker::{WorkerConfig, WorkerInfo, WorkerKind, WorkerMode, WorkerStatus};

/// Claude Code 起動コマンド引数を構築する純粋関数。
/// - `instruction` 内の `'` はシェルインジェクション防止のためエスケープする
/// - `metadata` に応じてオプションフラグを付与する
/// センチネル文字列（PTY出力でタスク完了を検出するために使用）
pub(crate) const SWARM_DONE_SENTINEL: &str = "__SWARM_TASK_DONE__";

pub(crate) fn build_claude_arg(instruction: &str, metadata: &HashMap<String, String>) -> String {
    let safe_instr = instruction.replace('\'', "'\\''");
    let mut flags = String::new();
    if metadata.get("claude_flag_skip_permissions").map(|v| v == "1").unwrap_or(false) {
        flags.push_str(" --dangerously-skip-permissions");
    }
    if metadata.get("claude_flag_no_stream").map(|v| v == "1").unwrap_or(false) {
        flags.push_str(" --no-stream");
    }
    let interactive = metadata.get("claude_interactive").map(|v| v == "1").unwrap_or(false);
    let default_shell = metadata
        .get("default_shell")
        .cloned()
        .unwrap_or_else(|| std::env::var("SHELL").unwrap_or_else(|_| "zsh".to_string()));

    if interactive {
        // 対話モード: TUI で起動（-p なし）→ ユーザーが /quit で終了後にセンチネル出力 → exec でシェル継続
        format!(
            "claude{flags} '{instr}' ; echo '{sentinel}' ; exec {shell}",
            flags = flags,
            instr = safe_instr,
            sentinel = SWARM_DONE_SENTINEL,
            shell = default_shell,
        )
    } else {
        // バッチモード: -p で非インタラクティブ実行し、完了後に自動終了
        format!("claude -p{} '{}'", flags, safe_instr)
    }
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
        let task_instruction = config.metadata.get("task_instruction").cloned();
        let is_interactive_claude = config
            .metadata
            .get("claude_interactive")
            .map(|v| v == "1")
            .unwrap_or(false);
        let default_shell = config
            .metadata
            .get("default_shell")
            .cloned()
            .unwrap_or_else(|| std::env::var("SHELL").unwrap_or_else(|_| "zsh".to_string()));
        let mut cmd = match (&config.kind, &config.mode, task_instruction) {
            (WorkerKind::ClaudeCode, WorkerMode::Batch, Some(instruction)) => {
                // 対話/バッチ共通: `<shell> -c '<cmd>'` 形式
                // - バッチ: claude -p '...' → 完了後プロセス終了
                // - 対話:  claude '...'    → ユーザーが /quit 後センチネル → exec shell
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

        // Claude Code フック通知チャネル（PostTask/TaskError → Socket API → ここ）
        let (hook_tx, hook_rx) = std::sync::mpsc::channel::<()>();
        {
            use crate::swarm::SharedHookRegistry;
            if let Some(registry) = app.try_state::<SharedHookRegistry>() {
                if let Ok(mut reg) = registry.lock() {
                    reg.insert(id.clone(), hook_tx);
                }
            }
        }

        // NOTE: setup_claude_hooks は並列 Worker 実行時に .claude/settings.json を
        // 上書きし合う競合が発生するため現在は使用しない。
        // 並列実行対応（SWARM_WORKER_ID 環境変数方式）が実装されたら有効化する。
        // 現在の完了検出: バッチ→EOF、対話→センチネル、フック通知は補完的。
        let is_batch_claude = matches!(
            (&config.kind, &config.mode),
            (WorkerKind::ClaudeCode, WorkerMode::Batch)
        ) && !config
            .metadata
            .get("claude_interactive")
            .map(|v| v == "1")
            .unwrap_or(false);

        // 読み取りスレッド起動（PTY出力のストリーミング + プロセス終了検出）
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| e.to_string())?;
        let worker_id = id.clone();
        let working_dir = config.working_dir.clone();
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

            let detector = CompletionDetector::new();
            let mut buf = [0u8; 1024];
            // 対話モード: センチネル / PTYパターン でタスク完了を検出しつつ PTY を継続
            // バッチモード: フック通知 → PTYパターン → EOF の順で完了を検出
            let mut done_emitted = false;

            loop {
                // ① フック通知チェック（Claude Code PostTask/TaskError → Socket API）
                // バッチモードで有効。先にフックが来た場合は PTY が閉じる前に done を発火する。
                if !done_emitted && !is_interactive_claude {
                    if let Ok(()) = hook_rx.try_recv() {
                        done_emitted = true;
                        {
                            let mut s = statuses_clone.lock().unwrap();
                            s.insert(worker_id.clone(), WorkerStatus::Done);
                        }
                        let _ = app_clone.emit(
                            "worker-status-changed",
                            serde_json::json!({ "workerId": worker_id, "status": "done" }),
                        );
                        emit_ring_event(&app_clone, RingEvent::AgentAttention {
                            task_id: worker_id.clone(),
                            task_type: "swarm_worker".to_string(),
                            product_id: String::new(),
                            urgency: RingUrgency::Info,
                            message: format!("Worker {} がタスクを完了しました（フック検出）", worker_id),
                        });
                        // PTY が閉じるまで読み続ける（done 済みなので追加発火しない）
                    }
                }

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

                        if !done_emitted {
                            // ② PTYパターン検出（センチネル / Claude完了マーカー）
                            let completion = detector.check(&data);
                            match completion {
                                Some(CompletionResult::Done) => {
                                    done_emitted = true;
                                    {
                                        let mut s = statuses_clone.lock().unwrap();
                                        s.insert(worker_id.clone(), WorkerStatus::Done);
                                    }
                                    let _ = app_clone.emit(
                                        "worker-status-changed",
                                        serde_json::json!({ "workerId": worker_id, "status": "done" }),
                                    );
                                    let msg = if is_interactive_claude {
                                        format!("Worker {} がタスクを完了しました（追加指示可能）", worker_id)
                                    } else {
                                        format!("Worker {} がタスクを完了しました（PTY検出）", worker_id)
                                    };
                                    emit_ring_event(&app_clone, RingEvent::AgentAttention {
                                        task_id: worker_id.clone(),
                                        task_type: "swarm_worker".to_string(),
                                        product_id: String::new(),
                                        urgency: RingUrgency::Info,
                                        message: msg,
                                    });
                                }
                                Some(CompletionResult::Error) => {
                                    done_emitted = true;
                                    {
                                        let mut s = statuses_clone.lock().unwrap();
                                        s.insert(worker_id.clone(), WorkerStatus::Error);
                                    }
                                    let _ = app_clone.emit(
                                        "worker-status-changed",
                                        serde_json::json!({ "workerId": worker_id, "status": "error" }),
                                    );
                                    emit_ring_event(&app_clone, RingEvent::AgentAttention {
                                        task_id: worker_id.clone(),
                                        task_type: "swarm_worker".to_string(),
                                        product_id: String::new(),
                                        urgency: RingUrgency::Warning,
                                        message: format!("Worker {} がエラーを検出しました（PTY検出）", worker_id),
                                    });
                                }
                                None => {}
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            // ③ プロセス終了時: done 済みでなければ exit code で判定
            if !done_emitted {
                let exit_success = child
                    .wait()
                    .map(|s| s.success())
                    .unwrap_or(false);
                let final_status = if exit_success { WorkerStatus::Done } else { WorkerStatus::Error };
                let status_str = if exit_success { "done" } else { "error" };

                {
                    let mut s = statuses_clone.lock().unwrap();
                    s.insert(worker_id.clone(), final_status);
                }
                let _ = app_clone.emit(
                    "worker-status-changed",
                    serde_json::json!({ "workerId": worker_id, "status": status_str }),
                );

                let urgency = if exit_success { RingUrgency::Info } else { RingUrgency::Warning };
                let message = if exit_success {
                    format!("Worker {} が完了しました（EOF検出）", worker_id)
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
            } else {
                // done 済みなので wait だけ回収（ゾンビプロセス防止）
                let _ = child.wait();
            }

            // フック設定のクリーンアップ（現在は setup を使っていないため noop）
            let _ = &working_dir; // 将来の teardown_claude_hooks 用に変数を保持

            // レジストリから自分自身を除去
            {
                use crate::swarm::SharedHookRegistry;
                if let Some(registry) = app_clone.try_state::<SharedHookRegistry>() {
                    if let Ok(mut reg) = registry.lock() {
                        reg.remove(&worker_id);
                    }
                }
            }
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
        // -p フラグ付きで非インタラクティブ実行
        let arg = build_claude_arg("fix the bug", &meta(&[]));
        assert_eq!(arg, "claude -p 'fix the bug'");
    }

    #[test]
    fn build_claude_arg_escapes_single_quote() {
        // シェルインジェクション防止: ' → '\'' にエスケープされる
        let arg = build_claude_arg("it's broken", &meta(&[]));
        assert_eq!(arg, "claude -p 'it'\\''s broken'");
    }

    #[test]
    fn build_claude_arg_skip_permissions_flag() {
        let arg = build_claude_arg("do x", &meta(&[("claude_flag_skip_permissions", "1")]));
        assert_eq!(arg, "claude -p --dangerously-skip-permissions 'do x'");
    }

    #[test]
    fn build_claude_arg_no_stream_flag() {
        let arg = build_claude_arg("do x", &meta(&[("claude_flag_no_stream", "1")]));
        assert_eq!(arg, "claude -p --no-stream 'do x'");
    }

    #[test]
    fn build_claude_arg_both_flags() {
        let arg = build_claude_arg("do x", &meta(&[
            ("claude_flag_skip_permissions", "1"),
            ("claude_flag_no_stream", "1"),
        ]));
        assert!(arg.contains("-p"));
        assert!(arg.contains("--dangerously-skip-permissions"));
        assert!(arg.contains("--no-stream"));
        assert!(arg.ends_with("'do x'"));
    }

    #[test]
    fn build_claude_arg_flag_off_when_zero() {
        let arg = build_claude_arg("do x", &meta(&[("claude_flag_skip_permissions", "0")]));
        assert!(!arg.contains("--dangerously-skip-permissions"));
        assert_eq!(arg, "claude -p 'do x'");
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
