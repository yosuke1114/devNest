use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

use super::git_branch::merge_worker_branch;
use super::wave::{GateOverall, GateStepResult, WaveGateResult};

/// Gate のテスト設定
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GateConfig {
    /// テストコマンドのタイムアウト（秒）
    pub test_timeout_secs: u64,
    /// cargo clippy を実行するか
    pub run_clippy: bool,
    /// TypeScript 型チェックを実行するか
    pub run_tsc: bool,
    /// npm run build を実行するか
    pub run_build: bool,
    /// カスタムテストコマンド（空なら自動検出）
    pub custom_test_commands: Vec<String>,
}

impl Default for GateConfig {
    fn default() -> Self {
        Self {
            test_timeout_secs: 300,
            run_clippy: true,
            run_tsc: true,
            run_build: false,
            custom_test_commands: vec![],
        }
    }
}

impl GateConfig {
    /// `.devnest/gate-config.json` からロードする。ファイルが無ければデフォルト設定。
    pub fn load(project_path: &Path) -> Self {
        let config_path = project_path.join(".devnest").join("gate-config.json");
        std::fs::read_to_string(config_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
}

/// WaveGate: Wave 完了後に実行するゲートチェック
/// マージ → テスト → レビュー の3ステップを順次実行する。
pub struct WaveGate {
    project_path: String,
    base_branch: String,
    config: GateConfig,
}

impl WaveGate {
    pub fn new(project_path: &str, base_branch: &str) -> Self {
        Self {
            project_path: project_path.into(),
            base_branch: base_branch.into(),
            config: GateConfig::default(),
        }
    }

    pub fn with_config(project_path: &str, base_branch: &str, config: GateConfig) -> Self {
        Self {
            project_path: project_path.into(),
            base_branch: base_branch.into(),
            config,
        }
    }

    /// ゲートチェックを実行する
    pub async fn execute(&self, succeeded_branches: &[String]) -> WaveGateResult {
        let merge = self.step_merge(succeeded_branches).await;

        let test = if merge.passed {
            self.step_test().await
        } else {
            GateStepResult {
                passed: false,
                summary: "マージ失敗のためスキップ".into(),
                details: vec![],
                duration_secs: 0,
            }
        };

        let review = if merge.passed {
            self.step_review().await
        } else {
            GateStepResult {
                passed: false,
                summary: "マージ失敗のためスキップ".into(),
                details: vec![],
                duration_secs: 0,
            }
        };

        let overall = if !merge.passed {
            GateOverall::Blocked
        } else if !test.passed || !review.passed {
            GateOverall::PassedWithWarnings
        } else {
            GateOverall::Passed
        };

        WaveGateResult {
            merge,
            test,
            review,
            overall,
        }
    }

    /// Step 1: 各ワーカーブランチをベースにマージ
    async fn step_merge(&self, branches: &[String]) -> GateStepResult {
        let start = Instant::now();
        let repo = Path::new(&self.project_path);
        let mut details = Vec::new();
        let mut all_success = true;

        for branch in branches {
            let outcome = merge_worker_branch(repo, branch, &self.base_branch);
            if outcome.success {
                details.push(format!("[PASS] {} マージ成功", branch));
            } else {
                details.push(format!(
                    "[FAIL] {} コンフリクト: {}",
                    branch,
                    if outcome.conflict_files.is_empty() {
                        outcome.message.clone()
                    } else {
                        outcome.conflict_files.join(", ")
                    }
                ));
                all_success = false;
            }
        }

        GateStepResult {
            passed: all_success,
            summary: if all_success {
                format!("{}件マージ成功", branches.len())
            } else {
                "コンフリクトあり".into()
            },
            details,
            duration_secs: start.elapsed().as_secs(),
        }
    }

    /// Step 2: テスト・バリデーション実行
    ///
    /// 以下を順次実行する:
    /// 1. cargo test（Cargo.toml があれば）
    /// 2. cargo clippy（設定有効時）
    /// 3. npx tsc --noEmit（tsconfig.json があれば、設定有効時）
    /// 4. npm test（package.json があれば）
    /// 5. npm run build（設定有効時）
    /// 6. カスタムテストコマンド
    async fn step_test(&self) -> GateStepResult {
        let start = Instant::now();
        let mut details = Vec::new();
        let mut all_passed = true;
        let timeout = Duration::from_secs(self.config.test_timeout_secs);
        let project = Path::new(&self.project_path);
        let has_cargo = project.join("Cargo.toml").exists()
            || project.join("src-tauri/Cargo.toml").exists();
        let has_package_json = project.join("package.json").exists();
        let has_tsconfig = project.join("tsconfig.json").exists();

        // cargo test ディレクトリの特定（src-tauri があればそちらを使用）
        let cargo_dir = if project.join("src-tauri/Cargo.toml").exists() {
            project.join("src-tauri")
        } else {
            project.to_path_buf()
        };

        // ─── 1. cargo test ─────────────────────────────────
        if has_cargo {
            let result = run_command_with_timeout(
                "cargo", &["test", "--", "--test-threads=1"],
                &cargo_dir, timeout,
            );
            match result {
                CmdResult::Success => {
                    details.push("[PASS] cargo test".into());
                }
                CmdResult::Failed(output) => {
                    let summary = extract_test_summary(&output, &["FAILED", "test result"]);
                    details.push(format!("[FAIL] cargo test\n{}", summary));
                    all_passed = false;
                }
                CmdResult::Timeout => {
                    details.push(format!("[FAIL] cargo test: タイムアウト ({}秒)", self.config.test_timeout_secs));
                    all_passed = false;
                }
                CmdResult::NotFound(e) => {
                    details.push(format!("[WARN] cargo test 実行不可: {}", e));
                }
            }
        }

        // ─── 2. cargo clippy ────────────────────────────────
        if has_cargo && self.config.run_clippy {
            let result = run_command_with_timeout(
                "cargo", &["clippy", "--", "-D", "warnings"],
                &cargo_dir, timeout,
            );
            match result {
                CmdResult::Success => {
                    details.push("[PASS] cargo clippy".into());
                }
                CmdResult::Failed(output) => {
                    let summary = extract_test_summary(&output, &["error[", "warning:"]);
                    details.push(format!("[FAIL] cargo clippy\n{}", summary));
                    all_passed = false;
                }
                CmdResult::Timeout => {
                    details.push(format!("[FAIL] cargo clippy: タイムアウト ({}秒)", self.config.test_timeout_secs));
                    all_passed = false;
                }
                CmdResult::NotFound(e) => {
                    details.push(format!("[WARN] cargo clippy 実行不可: {}", e));
                }
            }
        }

        // ─── 3. TypeScript 型チェック ────────────────────────
        if has_tsconfig && self.config.run_tsc {
            let result = run_command_with_timeout(
                "npx", &["tsc", "--noEmit"],
                project, timeout,
            );
            match result {
                CmdResult::Success => {
                    details.push("[PASS] tsc --noEmit".into());
                }
                CmdResult::Failed(output) => {
                    let summary = extract_test_summary(&output, &["error TS", "Error:"]);
                    details.push(format!("[FAIL] tsc --noEmit\n{}", summary));
                    all_passed = false;
                }
                CmdResult::Timeout => {
                    details.push(format!("[FAIL] tsc: タイムアウト ({}秒)", self.config.test_timeout_secs));
                    all_passed = false;
                }
                CmdResult::NotFound(e) => {
                    details.push(format!("[WARN] tsc 実行不可: {}", e));
                }
            }
        }

        // ─── 4. npm test ────────────────────────────────────
        if has_package_json {
            let result = run_command_with_timeout(
                "npm", &["test", "--", "--passWithNoTests"],
                project, timeout,
            );
            match result {
                CmdResult::Success => {
                    details.push("[PASS] npm test".into());
                }
                CmdResult::Failed(output) => {
                    let summary = extract_test_summary(&output, &["FAIL", "Error", "failed"]);
                    details.push(format!("[FAIL] npm test\n{}", summary));
                    all_passed = false;
                }
                CmdResult::Timeout => {
                    details.push(format!("[FAIL] npm test: タイムアウト ({}秒)", self.config.test_timeout_secs));
                    all_passed = false;
                }
                CmdResult::NotFound(e) => {
                    details.push(format!("[WARN] npm test 実行不可: {}", e));
                }
            }
        }

        // ─── 5. npm run build ───────────────────────────────
        if has_package_json && self.config.run_build {
            let result = run_command_with_timeout(
                "npm", &["run", "build"],
                project, timeout,
            );
            match result {
                CmdResult::Success => {
                    details.push("[PASS] npm run build".into());
                }
                CmdResult::Failed(output) => {
                    let summary = extract_test_summary(&output, &["Error", "error"]);
                    details.push(format!("[FAIL] npm run build\n{}", summary));
                    all_passed = false;
                }
                CmdResult::Timeout => {
                    details.push(format!("[FAIL] npm run build: タイムアウト ({}秒)", self.config.test_timeout_secs));
                    all_passed = false;
                }
                CmdResult::NotFound(e) => {
                    details.push(format!("[WARN] npm run build 実行不可: {}", e));
                }
            }
        }

        // ─── 6. カスタムテストコマンド ──────────────────────
        for cmd_str in &self.config.custom_test_commands {
            let parts: Vec<&str> = cmd_str.split_whitespace().collect();
            if parts.is_empty() {
                continue;
            }
            let result = run_command_with_timeout(
                parts[0], &parts[1..],
                project, timeout,
            );
            match result {
                CmdResult::Success => {
                    details.push(format!("[PASS] {}", cmd_str));
                }
                CmdResult::Failed(output) => {
                    let summary: String = output.lines().take(5).collect::<Vec<_>>().join("\n");
                    details.push(format!("[FAIL] {}\n{}", cmd_str, summary));
                    all_passed = false;
                }
                CmdResult::Timeout => {
                    details.push(format!("[FAIL] {}: タイムアウト ({}秒)", cmd_str, self.config.test_timeout_secs));
                    all_passed = false;
                }
                CmdResult::NotFound(e) => {
                    details.push(format!("[WARN] {} 実行不可: {}", cmd_str, e));
                }
            }
        }

        let passed_count = details.iter().filter(|d| d.starts_with("[PASS]")).count();
        let failed_count = details.iter().filter(|d| d.starts_with("[FAIL]")).count();
        let warn_count = details.iter().filter(|d| d.starts_with("[WARN]")).count();

        GateStepResult {
            passed: all_passed,
            summary: if all_passed {
                format!("{}件すべて通過", passed_count)
            } else {
                format!("{}/{} 通過, {} 失敗, {} 警告",
                    passed_count, passed_count + failed_count, failed_count, warn_count)
            },
            details,
            duration_secs: start.elapsed().as_secs(),
        }
    }

    /// Step 3: AI レビュー（将来の拡張ポイント。現時点では常にパス）
    async fn step_review(&self) -> GateStepResult {
        let start = Instant::now();
        // AI レビューは Phase 3+ で実装予定
        // 現時点では常にパスを返す
        GateStepResult {
            passed: true,
            summary: "AIレビュー: スキップ（未実装）".into(),
            details: vec!["AI レビューは将来のフェーズで実装予定".into()],
            duration_secs: start.elapsed().as_secs(),
        }
    }
}

// ─── コマンド実行ヘルパー ────────────────────────────────────────────────────

/// コマンド実行結果
enum CmdResult {
    Success,
    Failed(String),
    Timeout,
    NotFound(String),
}

/// タイムアウト付きコマンド実行
fn run_command_with_timeout(
    program: &str,
    args: &[&str],
    cwd: &Path,
    timeout: Duration,
) -> CmdResult {
    use std::process::Stdio;

    let child = Command::new(program)
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => return CmdResult::NotFound(e.to_string()),
    };

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = child.stdout.take()
                    .map(|mut s| { let mut b = String::new(); std::io::Read::read_to_string(&mut s, &mut b).ok(); b })
                    .unwrap_or_default();
                let stderr = child.stderr.take()
                    .map(|mut s| { let mut b = String::new(); std::io::Read::read_to_string(&mut s, &mut b).ok(); b })
                    .unwrap_or_default();

                if status.success() {
                    return CmdResult::Success;
                } else {
                    let output = if stderr.is_empty() { stdout } else { stderr };
                    return CmdResult::Failed(output);
                }
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    return CmdResult::Timeout;
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => {
                return CmdResult::NotFound(e.to_string());
            }
        }
    }
}

/// テスト出力からキーワードにマッチする行を抽出する
fn extract_test_summary(output: &str, keywords: &[&str]) -> String {
    let relevant: Vec<&str> = output
        .lines()
        .filter(|l| keywords.iter().any(|k| l.contains(k)))
        .take(8)
        .collect();
    if relevant.is_empty() {
        output.lines().take(5).collect::<Vec<_>>().join("\n")
    } else {
        relevant.join("\n")
    }
}

/// テスト用に簡易 GateResult を生成するヘルパー
pub fn make_passed_result() -> WaveGateResult {
    WaveGateResult {
        merge: GateStepResult {
            passed: true,
            summary: "OK".into(),
            details: vec![],
            duration_secs: 0,
        },
        test: GateStepResult {
            passed: true,
            summary: "OK".into(),
            details: vec![],
            duration_secs: 0,
        },
        review: GateStepResult {
            passed: true,
            summary: "OK".into(),
            details: vec![],
            duration_secs: 0,
        },
        overall: GateOverall::Passed,
    }
}

pub fn make_blocked_result() -> WaveGateResult {
    WaveGateResult {
        merge: GateStepResult {
            passed: false,
            summary: "コンフリクト".into(),
            details: vec![],
            duration_secs: 0,
        },
        test: GateStepResult {
            passed: false,
            summary: "スキップ".into(),
            details: vec![],
            duration_secs: 0,
        },
        review: GateStepResult {
            passed: false,
            summary: "スキップ".into(),
            details: vec![],
            duration_secs: 0,
        },
        overall: GateOverall::Blocked,
    }
}

pub fn make_warning_result() -> WaveGateResult {
    WaveGateResult {
        merge: GateStepResult {
            passed: true,
            summary: "OK".into(),
            details: vec![],
            duration_secs: 0,
        },
        test: GateStepResult {
            passed: false,
            summary: "テスト失敗".into(),
            details: vec![],
            duration_secs: 0,
        },
        review: GateStepResult {
            passed: true,
            summary: "OK".into(),
            details: vec![],
            duration_secs: 0,
        },
        overall: GateOverall::PassedWithWarnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passed_result_helper() {
        let r = make_passed_result();
        assert_eq!(r.overall, GateOverall::Passed);
        assert!(r.merge.passed);
        assert!(r.test.passed);
    }

    #[test]
    fn blocked_result_helper() {
        let r = make_blocked_result();
        assert_eq!(r.overall, GateOverall::Blocked);
        assert!(!r.merge.passed);
    }

    #[test]
    fn warning_result_helper() {
        let r = make_warning_result();
        assert_eq!(r.overall, GateOverall::PassedWithWarnings);
        assert!(r.merge.passed);
        assert!(!r.test.passed);
    }

    #[test]
    fn gate_config_default() {
        let config = GateConfig::default();
        assert_eq!(config.test_timeout_secs, 300);
        assert!(config.run_clippy);
        assert!(config.run_tsc);
        assert!(!config.run_build);
        assert!(config.custom_test_commands.is_empty());
    }

    #[test]
    fn gate_config_load_default_when_no_file() {
        let dir = tempfile::tempdir().unwrap();
        let config = GateConfig::load(dir.path());
        assert_eq!(config.test_timeout_secs, 300);
        assert!(config.run_clippy);
    }

    #[test]
    fn gate_config_load_from_file() {
        let dir = tempfile::tempdir().unwrap();
        let devnest_dir = dir.path().join(".devnest");
        std::fs::create_dir_all(&devnest_dir).unwrap();
        std::fs::write(
            devnest_dir.join("gate-config.json"),
            r#"{"testTimeoutSecs": 60, "runClippy": false, "runTsc": true, "runBuild": true, "customTestCommands": ["echo hello"]}"#,
        ).unwrap();

        let config = GateConfig::load(dir.path());
        assert_eq!(config.test_timeout_secs, 60);
        assert!(!config.run_clippy);
        assert!(config.run_tsc);
        assert!(config.run_build);
        assert_eq!(config.custom_test_commands, vec!["echo hello"]);
    }

    #[test]
    fn gate_config_serde_roundtrip() {
        let config = GateConfig {
            test_timeout_secs: 120,
            run_clippy: false,
            run_tsc: true,
            run_build: true,
            custom_test_commands: vec!["pytest".into(), "make lint".into()],
        };
        let json = serde_json::to_string(&config).unwrap();
        let loaded: GateConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(loaded.test_timeout_secs, 120);
        assert!(!loaded.run_clippy);
        assert_eq!(loaded.custom_test_commands.len(), 2);
    }

    #[test]
    fn extract_test_summary_filters_by_keywords() {
        let output = "line 1\nerror[E0001]: something\nline 3\nwarning: unused\nline 5";
        let summary = extract_test_summary(output, &["error["]);
        assert!(summary.contains("error[E0001]"));
        assert!(!summary.contains("line 1"));
    }

    #[test]
    fn extract_test_summary_falls_back_to_first_lines() {
        let output = "line 1\nline 2\nline 3\nline 4\nline 5\nline 6";
        let summary = extract_test_summary(output, &["NONEXISTENT"]);
        assert!(summary.contains("line 1"));
        assert!(summary.contains("line 5"));
        assert!(!summary.contains("line 6"));
    }

    #[test]
    fn run_command_success() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_command_with_timeout("echo", &["hello"], dir.path(), Duration::from_secs(5));
        assert!(matches!(result, CmdResult::Success));
    }

    #[test]
    fn run_command_failure() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_command_with_timeout("false", &[], dir.path(), Duration::from_secs(5));
        assert!(matches!(result, CmdResult::Failed(_)));
    }

    #[test]
    fn run_command_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_command_with_timeout("__nonexistent_command__", &[], dir.path(), Duration::from_secs(5));
        assert!(matches!(result, CmdResult::NotFound(_)));
    }

    #[test]
    fn run_command_timeout() {
        let dir = tempfile::tempdir().unwrap();
        let result = run_command_with_timeout("sleep", &["10"], dir.path(), Duration::from_millis(200));
        assert!(matches!(result, CmdResult::Timeout));
    }
}
