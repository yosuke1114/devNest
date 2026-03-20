use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::notification::ring::{emit_ring_event, RingEvent, RingUrgency};

use super::completion::{CompletionDetector, CompletionResult};
use super::hooks;
use super::worker::{WorkerConfig, WorkerInfo, WorkerKind, WorkerMode, WorkerStatus};

/// PTY 出力から ANSI エスケープシーケンスを除去する
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x1b && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
            // ESC [ で始まる CSI シーケンスをスキップ
            i += 2;
            while i < bytes.len() && !bytes[i].is_ascii_alphabetic() {
                i += 1;
            }
            i = i.saturating_add(1);
        } else if bytes[i] == 0x1b && i + 1 < bytes.len() {
            // その他の ESC シーケンス（ESC + 1文字）
            i += 2;
        } else {
            out.push(bytes[i] as char);
            i += 1;
        }
    }
    out
}

/// Claude Code 起動コマンド引数を構築する純粋関数。
/// - `instruction` 内の `'` はシェルインジェクション防止のためエスケープする
/// - `metadata` に応じてオプションフラグを付与する
/// センチネル文字列（PTY出力でタスク完了を検出するために使用）
pub(crate) const SWARM_DONE_SENTINEL: &str = "__SWARM_TASK_DONE__";

pub(crate) fn build_claude_arg(instruction: &str, metadata: &HashMap<String, String>) -> String {
    let safe_instr = instruction.replace('\'', "'\\''");
    let mut flags = String::new();
    // バッチモードは自動実行のため常に --dangerously-skip-permissions を付与
    let is_interactive = metadata.get("claude_interactive").map(|v| v == "1").unwrap_or(false);
    if !is_interactive || metadata.get("claude_flag_skip_permissions").map(|v| v == "1").unwrap_or(false) {
        flags.push_str(" --dangerously-skip-permissions");
    }
    if metadata.get("claude_flag_no_stream").map(|v| v == "1").unwrap_or(false) {
        flags.push_str(" --no-stream");
    }
    let default_shell = metadata
        .get("default_shell")
        .cloned()
        .unwrap_or_else(|| std::env::var("SHELL").unwrap_or_else(|_| "zsh".to_string()));

    if is_interactive {
        // 対話モード: TUI で起動（-p なし）→ ユーザーが /quit で終了後にセンチネル出力 → exec でシェル継続
        format!(
            "claude{flags} '{instr}' ; echo '{sentinel}' ; exec {shell}",
            flags = flags,
            instr = safe_instr,
            sentinel = SWARM_DONE_SENTINEL,
            shell = default_shell,
        )
    } else {
        // バッチモード: フラグを -p の前に配置（-p が次トークンを引数として取るため）
        // < /dev/null でstdinをEOFにし、PTY環境でもclaudeがインタラクティブモードに入らないよう防ぐ
        format!("claude{} -p '{}' < /dev/null", flags, safe_instr)
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
        // macOS では Tauri の PATH が限定的なため、一般的な claude インストール先を先頭に追加
        let augmented_path = format!(
            "/opt/homebrew/bin:/usr/local/bin:{}",
            std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".to_string())
        );

        // Stop フック用に完了ファイルをクリーンアップ（前回の残留を除去）
        hooks::cleanup_done_file(&id);

        let mut cmd = match (&config.kind, &config.mode, task_instruction) {
            (WorkerKind::ClaudeCode, WorkerMode::Batch, Some(ref instruction)) if !instruction.is_empty() => {
                let mut c = CommandBuilder::new(&default_shell);
                let claude_arg = build_claude_arg(instruction, &config.metadata);
                eprintln!("[Swarm] spawning claude command: {} -c {:?}", default_shell, claude_arg);
                c.arg("-c");
                c.arg(claude_arg);
                c.env("PATH", &augmented_path);
                // Stop フック完了検出用: worker ID を環境変数で渡す
                c.env("SWARM_WORKER_ID", &id);
                c
            }
            (WorkerKind::ClaudeCode, WorkerMode::Interactive, Some(ref instruction)) if !instruction.is_empty() => {
                let mut c = CommandBuilder::new(&default_shell);
                let claude_arg = build_claude_arg(instruction, &config.metadata);
                eprintln!("[Swarm] spawning interactive claude: {} -c {:?}", default_shell, claude_arg);
                c.arg("-c");
                c.arg(claude_arg);
                c.env("PATH", &augmented_path);
                c.env("SWARM_WORKER_ID", &id);
                c
            }
            (kind, mode, ref instr) => {
                eprintln!("[Swarm] fallback shell: kind={:?} mode={:?} instruction={:?}", kind, mode, instr.as_deref().unwrap_or("(none)"));
                let mut c = CommandBuilder::new(&default_shell);
                c.env("PATH", &augmented_path);
                c
            }
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

        // 完了フラグ（reader thread と monitor thread で共有）
        let done_flag = Arc::new(AtomicBool::new(false));
        let done_flag_reader = Arc::clone(&done_flag);
        let done_flag_monitor = Arc::clone(&done_flag);

        // ── PTY 読み取りスレッド ─────────────────────────────────
        // PTY 出力を worker-output イベントとしてストリーミングし、
        // output パターン（フック通知・完了マーカー）で done_flag を設定する。
        // プロセス終了の検出は Monitor Thread が担当する。
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

            loop {
                // ① フック通知チェック（Claude Code PostTask/TaskError → Socket API）
                if !done_flag_reader.load(Ordering::SeqCst) && !is_interactive_claude {
                    if let Ok(()) = hook_rx.try_recv() {
                        if !done_flag_reader.swap(true, Ordering::SeqCst) {
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
                        }
                    }
                }

                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_clone.emit(
                            "worker-output",
                            serde_json::json!({
                                "workerId": worker_id,
                                "data": data,
                            }),
                        );

                        // ② PTYパターン検出（ANSI除去後に検査）
                        if !done_flag_reader.load(Ordering::SeqCst) {
                            let plain = strip_ansi(&data);
                            let result = detector.check(&plain);
                            let (new_status, status_str, msg) = match result {
                                Some(CompletionResult::Done) => (
                                    WorkerStatus::Done,
                                    "done",
                                    format!("Worker {} がタスクを完了しました（出力検出）", worker_id),
                                ),
                                Some(CompletionResult::Error) => (
                                    WorkerStatus::Error,
                                    "error",
                                    format!("Worker {} がエラーを検出しました（出力検出）", worker_id),
                                ),
                                None => continue,
                            };
                            if !done_flag_reader.swap(true, Ordering::SeqCst) {
                                {
                                    let mut s = statuses_clone.lock().unwrap();
                                    s.insert(worker_id.clone(), new_status);
                                }
                                let _ = app_clone.emit(
                                    "worker-status-changed",
                                    serde_json::json!({ "workerId": worker_id, "status": status_str }),
                                );
                                let urgency = if status_str == "done" { RingUrgency::Info } else { RingUrgency::Warning };
                                emit_ring_event(&app_clone, RingEvent::AgentAttention {
                                    task_id: worker_id.clone(),
                                    task_type: "swarm_worker".to_string(),
                                    product_id: String::new(),
                                    urgency,
                                    message: msg,
                                });
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            // PTY reader 終了（フック設定クリーンアップ用）
            let _ = &working_dir;
            {
                use crate::swarm::SharedHookRegistry;
                if let Some(registry) = app_clone.try_state::<SharedHookRegistry>() {
                    if let Ok(mut reg) = registry.lock() {
                        reg.remove(&worker_id);
                    }
                }
            }
        });

        // ── Monitor Thread ──────────────────────────────────────
        // done_flag が立った場合（出力パターン検出）は child を kill して終了させる。
        // done_flag が立っていない場合は child.wait() でプロセス終了を待ち、
        // exit code に基づいて done/error を emit する（PTY パターン検出の補完）。
        let statuses_monitor = Arc::clone(&self.statuses);
        let app_monitor = app.clone();
        let worker_id_monitor = id.clone();

        let worker_id_for_monitor = id.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_millis(500));

                // ① Stop フック完了ファイル検出（最優先・最確実）
                if hooks::is_done_file_present(&worker_id_for_monitor) {
                    hooks::cleanup_done_file(&worker_id_for_monitor);
                    eprintln!("[Monitor] Worker {}: Stop フック完了ファイル検出", worker_id_for_monitor);
                    if !done_flag_monitor.swap(true, Ordering::SeqCst) {
                        {
                            let mut s = statuses_monitor.lock().unwrap();
                            s.insert(worker_id_for_monitor.clone(), WorkerStatus::Done);
                        }
                        let _ = app_monitor.emit(
                            "worker-status-changed",
                            serde_json::json!({ "workerId": worker_id_for_monitor, "status": "done" }),
                        );
                        emit_ring_event(&app_monitor, RingEvent::AgentAttention {
                            task_id: worker_id_for_monitor.clone(),
                            task_type: "swarm_worker".to_string(),
                            product_id: String::new(),
                            urgency: RingUrgency::Info,
                            message: format!("Worker {} がタスクを完了しました（Stop フック検出）", worker_id_for_monitor),
                        });
                    }
                    // プロセスを kill してゾンビ回収
                    let _ = child.kill();
                    let _ = child.wait();
                    return;
                }

                // ② PTY出力パターン or フック通知で done_flag が立った場合
                if done_flag_monitor.load(Ordering::SeqCst) {
                    let _ = child.kill();
                    let _ = child.wait();
                    hooks::cleanup_done_file(&worker_id_for_monitor);
                    eprintln!("[Monitor] Worker {}: 出力パターン検出フラグ → プロセスをkill", worker_id_for_monitor);
                    return;
                }

                // ③ プロセス自体が終了したか確認（kill(pid,0) で生存確認）
                let still_running = if let Some(pid) = child.process_id() {
                    let ret = unsafe { libc::kill(pid as libc::pid_t, 0) };
                    ret == 0
                } else {
                    false
                };
                if !still_running {
                    break;
                }
            }

            // プロセスが自然終了 → exit code で done/error 判定
            let exit_success = child.wait().map(|s| s.success()).unwrap_or(false);
            hooks::cleanup_done_file(&worker_id_for_monitor);

            if done_flag_monitor.swap(true, Ordering::SeqCst) {
                return; // 既に done 発火済み
            }

            let status_str = if exit_success { "done" } else { "error" };
            let final_status = if exit_success { WorkerStatus::Done } else { WorkerStatus::Error };
            {
                let mut s = statuses_monitor.lock().unwrap();
                s.insert(worker_id_for_monitor.clone(), final_status);
            }
            let _ = app_monitor.emit(
                "worker-status-changed",
                serde_json::json!({ "workerId": worker_id_for_monitor, "status": status_str }),
            );
            let urgency = if exit_success { RingUrgency::Info } else { RingUrgency::Warning };
            emit_ring_event(&app_monitor, RingEvent::AgentAttention {
                task_id: worker_id_for_monitor.clone(),
                task_type: "swarm_worker".to_string(),
                product_id: String::new(),
                urgency,
                message: format!("Worker {} が{}しました（プロセス終了検出）",
                    worker_id_for_monitor, if exit_success { "完了" } else { "エラー終了" }),
            });
            eprintln!("[Monitor] Worker {}: プロセス自然終了 → status={}", worker_id_for_monitor, status_str);
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
