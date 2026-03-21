use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Write;
use tokio::sync::broadcast;

use super::message::{LogLevel, ServerMessage, SubTask, SwarmPhase};

// ────────────────────────────────────────
//  完了検知キーワード
//  実運用で .devnest/mobile-config.toml に移動予定
//  現時点はここで管理してチューニングする
// ────────────────────────────────────────
const TASK_DONE_KEYWORDS: &[&str] = &[
    "Task completed",
    "タスク完了",
    "✅",
    "Done:",
    "完了",
];

const WAITING_KEYWORDS: &[&str] = &[
    "Waiting for input",
    "承認しますか",
    "続行しますか",
    "[y/n]",
    "Enter your response",
    "(y/n)",
];

pub struct SwarmController {
    pub phase: SwarmPhase,
    pub current_agent: Option<String>,
    pub completed: u32,
    pub total: u32,
    writer: Box<dyn Write + Send>,
    #[cfg(target_os = "macos")]
    caffeinate: Option<std::process::Child>,
}

impl SwarmController {
    pub async fn spawn(
        tasks: Vec<SubTask>,
        tx: broadcast::Sender<ServerMessage>,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        // タスクを一時ファイルに書き出す
        let tasks_path = "/tmp/devnest_swarm_tasks.json";
        let tasks_json = serde_json::to_string_pretty(&tasks)?;
        std::fs::write(tasks_path, &tasks_json)?;

        // pty でscrum.shを起動
        let pty = native_pty_system();
        let pair = pty.openpty(PtySize {
            rows: 24,
            cols: 200,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let scrum_sh = std::env::var("SCRUM_SH_PATH")
            .unwrap_or_else(|_| "./scrum-agents/scrum.sh".into());
        // TODO: scrum.sh 追加後に --tasks オプション対応を確認

        let mut cmd = CommandBuilder::new("bash");
        cmd.arg(&scrum_sh);
        cmd.arg("start");
        cmd.arg("--tasks");
        cmd.arg(tasks_path);
        cmd.env("TERM", "xterm-256color");

        let child = pair.slave.spawn_command(cmd)?;

        // caffeinate: macOS のみ — Swarm実行中だけスリープを抑制
        // -i: システムスリープ防止
        // -w: 指定PIDが終了したら自動解除
        #[cfg(target_os = "macos")]
        let caffeinate = {
            let pid = child.process_id().unwrap_or(0);
            std::process::Command::new("caffeinate")
                .args(["-i", "-w", &pid.to_string()])
                .spawn()
                .ok()
        };
        // TODO: macOS デプロイ時に Info.plist に NSAppSleepDisabled を追加

        let _ = child; // child は pty slave 側で管理される

        let writer = pair.master.take_writer()?;
        let reader = pair.master.try_clone_reader()?;
        let total = tasks.len() as u32;

        // stdoutを非同期で読み取り、WSにブロードキャスト
        let tx_clone = tx.clone();
        let total_clone = total;
        tokio::task::spawn_blocking(move || {
            stdout_reader_loop(reader, tx_clone, total_clone);
        });

        Ok(SwarmController {
            phase: SwarmPhase::Running,
            current_agent: None,
            completed: 0,
            total,
            writer,
            #[cfg(target_os = "macos")]
            caffeinate,
        })
    }

    /// stdinへの入力中継
    pub fn send_input(&mut self, text: &str) -> std::io::Result<()> {
        writeln!(self.writer, "{}", text)?;
        self.writer.flush()?;
        Ok(())
    }

    /// プロセス強制終了
    pub fn kill(self) {
        #[cfg(target_os = "macos")]
        {
            if let Some(mut c) = self.caffeinate {
                let _ = c.kill();
            }
        }
        // writer を drop することで pty に EOF を送る
    }
}

impl Drop for SwarmController {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        {
            if let Some(ref mut c) = self.caffeinate {
                let _ = c.kill();
            }
        }
    }
}

// ────────────────────────────────────────
//  stdout読み取りループ（別スレッド）
// ────────────────────────────────────────
fn stdout_reader_loop(
    reader: Box<dyn std::io::Read + Send>,
    tx: broadcast::Sender<ServerMessage>,
    total: u32,
) {
    use std::io::BufRead;
    let mut reader = std::io::BufReader::new(reader);
    let mut buf = String::new();
    let mut completed: u32 = 0;
    let mut current_agent: Option<String> = None;

    loop {
        buf.clear();
        match reader.read_line(&mut buf) {
            Ok(0) => {
                // EOF = プロセス終了 → Idle通知
                let _ = tx.send(ServerMessage::Status {
                    phase: SwarmPhase::Idle,
                    agent: None,
                    completed: total, // EOF到達 = 全完了とみなす
                    total,
                });
                break;
            }
            Ok(_) => {
                let line = buf.trim_end().to_string();

                // Agent名の更新
                if let Some(agent) = parse_agent_name(&line) {
                    current_agent = Some(agent.clone());
                    let _ = tx.send(ServerMessage::Status {
                        phase: SwarmPhase::Running,
                        agent: Some(agent),
                        completed,
                        total,
                    });
                }

                // タスク完了検知
                if TASK_DONE_KEYWORDS.iter().any(|kw| line.contains(kw)) {
                    completed = (completed + 1).min(total);
                    let _ = tx.send(ServerMessage::Status {
                        phase: SwarmPhase::Running,
                        agent: current_agent.clone(),
                        completed,
                        total,
                    });
                }

                // WaitingInput検知
                if WAITING_KEYWORDS.iter().any(|kw| line.contains(kw)) {
                    let _ = tx.send(ServerMessage::WaitingInput {
                        prompt: line.clone(),
                    });
                }

                // ログ送出
                let level = detect_log_level(&line);
                let _ = tx.send(ServerMessage::Log { text: line, level });
            }
            Err(e) => {
                let _ = tx.send(ServerMessage::Error {
                    message: format!("stdout読み取りエラー: {}", e),
                });
                break;
            }
        }
    }
}

// ────────────────────────────────────────
//  ユーティリティ
// ────────────────────────────────────────
fn parse_agent_name(line: &str) -> Option<String> {
    for agent in &["SM", "PO", "Dev", "Reviewer"] {
        if line.contains(&format!("[{}]", agent)) {
            return Some(agent.to_string());
        }
    }
    None
}

fn detect_log_level(line: &str) -> LogLevel {
    let lower = line.to_lowercase();
    if lower.contains("error") || lower.contains("failed") || lower.contains("エラー") {
        LogLevel::Error
    } else if lower.contains("warn") || lower.contains("警告") {
        LogLevel::Warn
    } else if lower.contains("complete") || lower.contains("success") || lower.contains("完了") {
        LogLevel::Success
    } else {
        LogLevel::Info
    }
}
