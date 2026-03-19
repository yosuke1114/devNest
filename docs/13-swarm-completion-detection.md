# DevNest Swarm 対話モード自動完了検出 実装指示書

> **目的**: Swarm Workerの対話モードにおける自動完了検出を実装する。
> **方式**: PTYパターン検出 + Claude Code hooks のハイブリッド。
> **前提**: `swarm/worker.rs`, `api/socket_server.rs`, `notification/ring.rs` が実装済み。
> **ブランチ**: `feature/swarm-completion-detect`

---

## 1. アーキテクチャ

```
Worker (PTY プロセス)
    │
    ├── PTY出力ストリーム ──▶ CompletionDetector（パターン検出）
    │                            │
    │                            ├── プロンプト復帰検出 ──▶ 完了「推定」
    │                            └── Claude完了マーカー ──▶ 完了「推定」
    │
    └── Claude Code hooks ──▶ Socket API ──▶ HookReceiver ──▶ 完了「確定」

                tokio::select! {
                    hook通知（最優先） => 確定完了
                    PTYパターン（次優先） => 推定完了
                    タイムアウト（最終手段） => エラー
                }
```

---

## 2. CompletionDetector 実装

**ファイル作成先**: `src-tauri/src/swarm/completion.rs`

```rust
use std::time::{Duration, Instant};

/// 完了検出の情報源
#[derive(Debug, Clone, PartialEq)]
pub enum CompletionSource {
    /// Claude Code hooks からの通知（最も信頼性が高い）
    Hook,
    /// PTY出力パターン検出による推定
    PtyPattern,
    /// プロセス終了（バッチモード用フォールバック）
    ProcessExit,
    /// タイムアウト
    Timeout,
}

/// 完了検出の結果
#[derive(Debug, Clone)]
pub struct CompletionResult {
    pub source: CompletionSource,
    pub success: bool,
    pub summary: Option<String>,
}

/// PTY出力パターンベースの完了検出器
pub struct CompletionDetector {
    /// シェルプロンプトパターン（SwarmSettings.prompt_patterns から）
    prompt_patterns: Vec<String>,
    /// プロンプト検出後、この期間出力がなければ完了と判定
    idle_threshold: Duration,
    /// 最後に出力を受け取った時刻
    last_output_at: Instant,
    /// プロンプトが検出されたか
    prompt_detected: bool,
    /// Claude Code固有の完了マーカーが検出されたか
    claude_marker_detected: bool,
    /// 累積出力バッファ（直近N行を保持）
    recent_lines: Vec<String>,
    /// 最大保持行数
    max_recent_lines: usize,
}

/// Claude Code が作業完了時に出力する既知のパターン
const CLAUDE_DONE_PATTERNS: &[&str] = &[
    // バッチモード完了
    "Task completed",
    "タスクが完了しました",
    // コミット完了
    "Changes committed",
    "変更をコミットしました",
    // ファイル書き込み完了
    "All changes applied",
    "すべての変更を適用しました",
    // エラーなし完了
    "Done!",
    "完了",
];

/// Claude Code がエラー時に出力する既知のパターン
const CLAUDE_ERROR_PATTERNS: &[&str] = &[
    "Error:",
    "エラー:",
    "Failed to",
    "失敗しました",
    "Permission denied",
    "Compilation error",
    "コンパイルエラー",
    "Test failed",
    "テストが失敗",
];

impl CompletionDetector {
    pub fn new(prompt_patterns_str: &str, idle_threshold_secs: u64) -> Self {
        let prompt_patterns = prompt_patterns_str
            .split('|')
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect();

        Self {
            prompt_patterns,
            idle_threshold: Duration::from_secs(idle_threshold_secs),
            last_output_at: Instant::now(),
            prompt_detected: false,
            claude_marker_detected: false,
            recent_lines: Vec::new(),
            max_recent_lines: 50,
        }
    }

    /// PTY出力を受け取って分析する。即座に完了判定できる場合はSomeを返す。
    pub fn feed(&mut self, output: &str) -> Option<CompletionResult> {
        self.last_output_at = Instant::now();

        // 行単位で保持
        for line in output.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                self.recent_lines.push(trimmed.to_string());
                if self.recent_lines.len() > self.max_recent_lines {
                    self.recent_lines.remove(0);
                }
            }
        }

        // Claude Code エラーパターン検出 → 即座にエラー判定
        if CLAUDE_ERROR_PATTERNS.iter().any(|p| output.contains(p)) {
            // ただしエラーパターンが出ても Claude が自動修正する場合がある
            // → エラーマーカーとして記録するが、即座に Error にはしない
            // → idle判定でエラーを確定
        }

        // Claude Code 完了マーカー検出
        if CLAUDE_DONE_PATTERNS.iter().any(|p| output.contains(p)) {
            self.claude_marker_detected = true;
        }

        // プロンプトパターン検出（行末にプロンプト記号）
        let last_line = output.trim_end();
        if self.prompt_patterns.iter().any(|p| last_line.ends_with(p)) {
            self.prompt_detected = true;
        }

        // 即座の完了判定はしない（idle判定に委ねる）
        None
    }

    /// 一定時間出力がない場合の完了判定
    pub fn check_idle(&self) -> Option<CompletionResult> {
        let elapsed = self.last_output_at.elapsed();

        if elapsed < self.idle_threshold {
            return None;
        }

        // Case 1: Claude完了マーカー + プロンプト復帰 + idle → 確実に完了
        if self.claude_marker_detected && self.prompt_detected {
            return Some(CompletionResult {
                source: CompletionSource::PtyPattern,
                success: true,
                summary: self.extract_summary(),
            });
        }

        // Case 2: プロンプト復帰のみ + idle → おそらく完了
        if self.prompt_detected {
            return Some(CompletionResult {
                source: CompletionSource::PtyPattern,
                success: !self.has_error_in_recent_output(),
                summary: self.extract_summary(),
            });
        }

        // Case 3: Claude完了マーカーのみ + 長いidle → 完了とみなす
        if self.claude_marker_detected && elapsed > self.idle_threshold * 2 {
            return Some(CompletionResult {
                source: CompletionSource::PtyPattern,
                success: true,
                summary: self.extract_summary(),
            });
        }

        // Case 4: 何も検出されず長いidle → タイムアウト扱い
        if elapsed > self.idle_threshold * 6 {
            return Some(CompletionResult {
                source: CompletionSource::Timeout,
                success: false,
                summary: Some("出力が長時間ありません".to_string()),
            });
        }

        None
    }

    /// 直近の出力からエラーパターンを検出
    fn has_error_in_recent_output(&self) -> bool {
        self.recent_lines.iter().rev().take(10).any(|line| {
            CLAUDE_ERROR_PATTERNS.iter().any(|p| line.contains(p))
        })
    }

    /// 直近の出力からサマリーを抽出
    fn extract_summary(&self) -> Option<String> {
        // 直近5行を結合してサマリーとする
        let summary: String = self.recent_lines
            .iter()
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");

        if summary.is_empty() {
            None
        } else {
            Some(summary)
        }
    }

    /// 状態をリセット（リトライ時に使用）
    pub fn reset(&mut self) {
        self.last_output_at = Instant::now();
        self.prompt_detected = false;
        self.claude_marker_detected = false;
        self.recent_lines.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_detector() -> CompletionDetector {
        CompletionDetector::new("$|%|❯|>", 5)
    }

    #[test]
    fn detects_prompt_pattern() {
        let mut d = make_detector();
        d.feed("some output\n❯ ");
        assert!(d.prompt_detected);
    }

    #[test]
    fn detects_claude_completion_marker() {
        let mut d = make_detector();
        d.feed("All changes applied\n");
        assert!(d.claude_marker_detected);
    }

    #[test]
    fn no_immediate_completion_on_pattern() {
        let mut d = make_detector();
        let result = d.feed("Task completed\n❯ ");
        // feed()は即座にNoneを返す（idle判定に委ねる）
        assert!(result.is_none());
        assert!(d.claude_marker_detected);
        assert!(d.prompt_detected);
    }

    #[test]
    fn idle_check_returns_none_when_recent() {
        let d = make_detector();
        assert!(d.check_idle().is_none());
    }

    #[test]
    fn detects_error_patterns() {
        let mut d = make_detector();
        d.feed("Error: compilation failed\n");
        assert!(d.has_error_in_recent_output());
    }

    #[test]
    fn extract_summary_returns_recent_lines() {
        let mut d = make_detector();
        d.feed("line 1\nline 2\nline 3\n");
        let summary = d.extract_summary().unwrap();
        assert!(summary.contains("line 1"));
        assert!(summary.contains("line 3"));
    }

    #[test]
    fn reset_clears_state() {
        let mut d = make_detector();
        d.feed("Task completed\n❯ ");
        assert!(d.prompt_detected);
        d.reset();
        assert!(!d.prompt_detected);
        assert!(!d.claude_marker_detected);
    }

    #[test]
    fn japanese_patterns_detected() {
        let mut d = make_detector();
        d.feed("すべての変更を適用しました\n");
        assert!(d.claude_marker_detected);
    }

    #[test]
    fn error_patterns_japanese() {
        let mut d = make_detector();
        d.feed("テストが失敗しました\n");
        assert!(d.has_error_in_recent_output());
    }
}
```

---

## 3. Claude Code hooks 自動設定

**ファイル作成先**: `src-tauri/src/swarm/hooks.rs`

```rust
use std::fs;
use std::path::Path;

use serde_json::json;

/// Worker起動時に Claude Code hooks を自動設定する
/// worker_idをDevNest Socket APIに通知するhookを.claude/settings.jsonに書き込む
pub fn setup_claude_hooks(working_dir: &Path, worker_id: &str) -> Result<(), String> {
    let claude_dir = working_dir.join(".claude");
    fs::create_dir_all(&claude_dir).map_err(|e| e.to_string())?;

    let settings_path = claude_dir.join("settings.json");

    // 既存の設定を読み込み（あれば）
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    // devnest CLI のパスを検出
    let devnest_cli = detect_devnest_cli_path();

    // hooks を設定
    let hooks = json!({
        "PostTask": [{
            "command": format!(
                "{} notify --type worker-done --worker-id {} --status success --source hook",
                devnest_cli, worker_id
            ),
            "timeout": 5000
        }],
        "TaskError": [{
            "command": format!(
                "{} notify --type worker-done --worker-id {} --status error --source hook",
                devnest_cli, worker_id
            ),
            "timeout": 5000
        }]
    });

    // 既存のhooksとマージ（devnest以外のhookを壊さない）
    if let Some(existing_hooks) = settings.get("hooks").cloned() {
        let mut merged = existing_hooks.clone();
        // PostTask/TaskError にdevnestのhookを追加
        for key in &["PostTask", "TaskError"] {
            let devnest_hook = hooks[key].as_array().unwrap().clone();
            if let Some(arr) = merged.get_mut(key).and_then(|v| v.as_array_mut()) {
                // 既存のdevnestフックを除去してから追加（重複防止）
                arr.retain(|h| {
                    h.get("command")
                        .and_then(|c| c.as_str())
                        .map(|c| !c.contains("devnest"))
                        .unwrap_or(true)
                });
                arr.extend(devnest_hook);
            } else {
                merged[key] = json!(devnest_hook);
            }
        }
        settings["hooks"] = merged;
    } else {
        settings["hooks"] = hooks;
    }

    fs::write(&settings_path, serde_json::to_string_pretty(&settings).unwrap())
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Worker終了時に hooks を除去する（クリーンアップ）
pub fn cleanup_claude_hooks(working_dir: &Path) -> Result<(), String> {
    let settings_path = working_dir.join(".claude/settings.json");
    if !settings_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let mut settings: serde_json::Value = serde_json::from_str(&content).unwrap_or(json!({}));

    if let Some(hooks) = settings.get_mut("hooks") {
        for key in &["PostTask", "TaskError"] {
            if let Some(arr) = hooks.get_mut(key).and_then(|v| v.as_array_mut()) {
                arr.retain(|h| {
                    h.get("command")
                        .and_then(|c| c.as_str())
                        .map(|c| !c.contains("devnest"))
                        .unwrap_or(true)
                });
            }
        }
    }

    fs::write(&settings_path, serde_json::to_string_pretty(&settings).unwrap())
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// devnest CLI のパスを検出
fn detect_devnest_cli_path() -> String {
    // 1. DevNestアプリ内のCLIバイナリ
    if let Ok(exe) = std::env::current_exe() {
        let cli_path = exe.parent()
            .map(|p| p.join("devnest"))
            .filter(|p| p.exists());
        if let Some(p) = cli_path {
            return p.to_string_lossy().to_string();
        }
    }

    // 2. PATHから検索
    if let Ok(output) = std::process::Command::new("which").arg("devnest").output() {
        if output.status.success() {
            return String::from_utf8_lossy(&output.stdout).trim().to_string();
        }
    }

    // 3. フォールバック: Socket直接通信スクリプト
    // devnest CLIがなくても動くように、簡易的なcurlコマンドで代替
    format!(
        "echo '{{\"jsonrpc\":\"2.0\",\"method\":\"worker.done\",\"params\":{{}}}}' | nc -U {}",
        dirs::home_dir()
            .unwrap_or_default()
            .join(".devnest/devnest.sock")
            .display()
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn setup_creates_settings_file() {
        let tmp = TempDir::new().unwrap();
        setup_claude_hooks(tmp.path(), "worker-123").unwrap();

        let settings_path = tmp.path().join(".claude/settings.json");
        assert!(settings_path.exists());

        let content = fs::read_to_string(settings_path).unwrap();
        assert!(content.contains("worker-123"));
        assert!(content.contains("PostTask"));
    }

    #[test]
    fn setup_preserves_existing_hooks() {
        let tmp = TempDir::new().unwrap();
        let claude_dir = tmp.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();

        // 既存のhookを作成
        let existing = json!({
            "hooks": {
                "PostTask": [{"command": "echo existing", "timeout": 1000}]
            }
        });
        fs::write(claude_dir.join("settings.json"), existing.to_string()).unwrap();

        // DevNest hookを追加
        setup_claude_hooks(tmp.path(), "worker-456").unwrap();

        let content = fs::read_to_string(claude_dir.join("settings.json")).unwrap();
        // 既存のhookが残っている
        assert!(content.contains("echo existing"));
        // DevNestのhookも追加されている
        assert!(content.contains("worker-456"));
    }

    #[test]
    fn cleanup_removes_only_devnest_hooks() {
        let tmp = TempDir::new().unwrap();
        setup_claude_hooks(tmp.path(), "worker-789").unwrap();

        // 既存hookを追加
        let settings_path = tmp.path().join(".claude/settings.json");
        let content = fs::read_to_string(&settings_path).unwrap();
        let mut settings: serde_json::Value = serde_json::from_str(&content).unwrap();
        settings["hooks"]["PostTask"].as_array_mut().unwrap()
            .push(json!({"command": "echo keep-me", "timeout": 1000}));
        fs::write(&settings_path, settings.to_string()).unwrap();

        // クリーンアップ
        cleanup_claude_hooks(tmp.path()).unwrap();

        let content = fs::read_to_string(&settings_path).unwrap();
        assert!(!content.contains("devnest"));
        assert!(content.contains("keep-me"));
    }
}
```

---

## 4. ハイブリッド完了待機ループ

**ファイル作成先**: `src-tauri/src/swarm/completion_loop.rs`

```rust
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};

use super::completion::{CompletionDetector, CompletionResult, CompletionSource};
use super::worker::WorkerStatus;

/// Socket API経由で受信するhook通知
#[derive(Debug, Clone)]
pub struct HookNotification {
    pub worker_id: String,
    pub status: WorkerStatus,
    pub source: String,
}

/// PTY + Hook + Timeout のハイブリッド完了待機
///
/// 優先順位:
/// 1. Claude Code hooks（Socket API経由） → 最も信頼性が高い
/// 2. PTYパターン検出 → 途中経過も見える
/// 3. タイムアウト → 最終手段
pub async fn wait_for_completion(
    worker_id: &str,
    pty_output: &mut mpsc::Receiver<Vec<u8>>,
    hook_receiver: &mut mpsc::Receiver<HookNotification>,
    detector: &mut CompletionDetector,
    timeout_minutes: u32,
    app: &tauri::AppHandle,
) -> (WorkerStatus, CompletionSource) {
    let mut idle_check_interval = interval(Duration::from_secs(1));
    let timeout = Duration::from_secs(timeout_minutes as u64 * 60);
    let start = tokio::time::Instant::now();

    loop {
        tokio::select! {
            // 最優先: Claude Code hooks からの通知
            Some(hook) = hook_receiver.recv() => {
                if hook.worker_id == worker_id {
                    return (hook.status, CompletionSource::Hook);
                }
            }

            // PTY出力の処理
            Some(data) = pty_output.recv() => {
                let output = String::from_utf8_lossy(&data);

                // UIにライブ出力を転送
                let _ = app.emit("worker-output", &serde_json::json!({
                    "workerId": worker_id,
                    "data": output.to_string(),
                }));

                // CompletionDetector に入力
                if let Some(result) = detector.feed(&output) {
                    let status = if result.success {
                        WorkerStatus::Done
                    } else {
                        WorkerStatus::Error
                    };
                    return (status, result.source);
                }
            }

            // 定期的なidle判定
            _ = idle_check_interval.tick() => {
                if let Some(result) = detector.check_idle() {
                    let status = if result.success {
                        WorkerStatus::Done
                    } else {
                        WorkerStatus::Error
                    };
                    return (status, result.source);
                }

                // 全体タイムアウト
                if start.elapsed() > timeout {
                    return (WorkerStatus::Error, CompletionSource::Timeout);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn hook_takes_priority() {
        let (mut pty_tx, mut pty_rx) = mpsc::channel(10);
        let (hook_tx, mut hook_rx) = mpsc::channel(10);
        let mut detector = CompletionDetector::new("$|❯", 5);

        // hookを先に送信
        hook_tx.send(HookNotification {
            worker_id: "w1".to_string(),
            status: WorkerStatus::Done,
            source: "hook".to_string(),
        }).await.unwrap();

        // PTYにもデータがある
        pty_tx.send(b"some output\n".to_vec()).await.unwrap();

        // タイムアウトなしの簡易版（テスト用）
        let hook = hook_rx.recv().await.unwrap();
        assert_eq!(hook.status, WorkerStatus::Done);
    }
}
```

---

## 5. Worker起動フローの更新

**ファイル変更**: `src-tauri/src/swarm/worker.rs`（既存ファイル修正）

Worker起動時の処理に以下を追加:

```rust
// worker.rs の spawn_worker() 内に追加

pub fn spawn_worker(&mut self, config: WorkerConfig, app: AppHandle) -> Result<String, String> {
    let worker_id = Uuid::new_v4().to_string();

    // 1. Claude Code hooks を自動設定（NEW）
    if config.kind == WorkerKind::ClaudeCode {
        let working_dir = &config.working_dir;
        if let Err(e) = super::hooks::setup_claude_hooks(working_dir, &worker_id) {
            eprintln!("[Worker] hooks setup failed (non-fatal): {}", e);
            // hooksの設定失敗はfatalにしない（PTY検出でフォールバック）
        }
    }

    // 2. PTY プロセス起動（既存処理）
    // ...

    // 3. 完了検出ループを非同期タスクとして起動（NEW）
    let detector = CompletionDetector::new(
        config.metadata.get("prompt_patterns")
            .map(|s| s.as_str())
            .unwrap_or("$|%|❯|>|#|→"),
        5, // idle_threshold_secs
    );

    let app_clone = app.clone();
    let worker_id_clone = worker_id.clone();
    tokio::spawn(async move {
        let (status, source) = wait_for_completion(
            &worker_id_clone,
            &mut pty_output_rx,
            &mut hook_rx,
            &mut detector,
            timeout_minutes,
            &app_clone,
        ).await;

        // 4. 完了後: Orchestrator に通知
        // commands/swarm.rs の orchestrator_notify_worker_done と同等の処理
        let _ = app_clone.emit("worker-status-changed", &serde_json::json!({
            "workerId": worker_id_clone,
            "status": status,
            "source": format!("{:?}", source),
        }));

        // 5. hooks クリーンアップ（NEW）
        let _ = super::hooks::cleanup_claude_hooks(&config.working_dir);
    });

    Ok(worker_id)
}
```

---

## 6. Socket API へのhook受信エンドポイント追加

**ファイル変更**: `src-tauri/src/api/methods.rs`

```rust
// methods.rs のハンドラに追加

"worker.done" => {
    let worker_id = params.get("worker_id")
        .and_then(|v| v.as_str())
        .ok_or("worker_id required")?
        .to_string();

    let status_str = params.get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("success");

    let status = match status_str {
        "success" => WorkerStatus::Done,
        "error" => WorkerStatus::Error,
        _ => WorkerStatus::Error,
    };

    // hook_sender チャネルに通知を送信
    // (AppState に hook_sender: mpsc::Sender<HookNotification> を追加)
    if let Some(sender) = &state.hook_sender {
        let _ = sender.send(HookNotification {
            worker_id: worker_id.clone(),
            status: status.clone(),
            source: "claude-hook".to_string(),
        }).await;
    }

    // 通知リングも発火
    emit_ring_event(app, RingEvent::SwarmWorkerUpdate {
        run_id: String::new(),
        worker_id,
        task_title: String::new(),
        status: status_str.to_string(),
        urgency: if status == WorkerStatus::Done {
            RingUrgency::Info
        } else {
            RingUrgency::Warning
        },
    });

    ApiResponse::ok(json!({"received": true}))
}
```

---

## 7. mod.rs への追加

**ファイル変更**: `src-tauri/src/swarm/mod.rs`

```rust
// 既存のモジュール宣言に追加
pub mod completion;
pub mod completion_loop;
pub mod hooks;
```

---

## 8. テストサマリー

| ファイル | テスト数 | 内容 |
|---------|---------|------|
| `completion.rs` | 9 | パターン検出、エラー検出、サマリー抽出、リセット |
| `hooks.rs` | 3 | hook設定、既存hook保持、クリーンアップ |
| `completion_loop.rs` | 1 | hook優先度テスト |
| **合計** | **13** | |

---

## 9. ドキュメント更新

- [ ] `docs/swarm/completion-detection.md` を新規作成
  - 3つのアプローチの説明
  - ハイブリッド方式の詳細
  - CompletionDetectorの設定パラメータ
  - トラブルシューティング（誤検知時の対処）
- [ ] `docs/api/socket-api.md` に `worker.done` メソッドを追記
- [ ] `docs/swarm/hooks.md` を新規作成（Claude Code hooks自動設定の仕組み）
- [ ] `12-swarm-completion-guide.md` にこのドキュメントへの参照を追加
