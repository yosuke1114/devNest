use std::path::Path;
use std::process::Command;
use std::time::Instant;

use super::git_branch::merge_worker_branch;
use super::wave::{GateOverall, GateStepResult, WaveGateResult};

/// WaveGate: Wave 完了後に実行するゲートチェック
/// マージ → テスト → レビュー の3ステップを順次実行する。
pub struct WaveGate {
    project_path: String,
    base_branch: String,
}

impl WaveGate {
    pub fn new(project_path: &str, base_branch: &str) -> Self {
        Self {
            project_path: project_path.into(),
            base_branch: base_branch.into(),
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

    /// Step 2: テスト実行（cargo test + npm test）
    async fn step_test(&self) -> GateStepResult {
        let start = Instant::now();
        let mut details = Vec::new();
        let mut all_passed = true;

        // cargo test
        match Command::new("cargo")
            .args(["test", "--", "--test-threads=1"])
            .current_dir(&self.project_path)
            .output()
        {
            Ok(o) if o.status.success() => {
                details.push("[PASS] cargo test".into());
            }
            Ok(o) => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                let summary: String = stderr
                    .lines()
                    .filter(|l| l.contains("FAILED") || l.contains("test result"))
                    .take(5)
                    .collect::<Vec<_>>()
                    .join("\n");
                details.push(format!("[FAIL] cargo test\n{}", summary));
                all_passed = false;
            }
            Err(e) => {
                details.push(format!("[WARN] cargo test 実行不可: {}", e));
            }
        }

        // npm test
        if Path::new(&self.project_path).join("package.json").exists() {
            match Command::new("npm")
                .args(["test", "--", "--passWithNoTests"])
                .current_dir(&self.project_path)
                .output()
            {
                Ok(o) if o.status.success() => {
                    details.push("[PASS] npm test".into());
                }
                Ok(o) => {
                    let stderr = String::from_utf8_lossy(&o.stderr);
                    details.push(format!(
                        "[FAIL] npm test\n{}",
                        stderr.lines().take(5).collect::<Vec<_>>().join("\n")
                    ));
                    all_passed = false;
                }
                Err(e) => {
                    details.push(format!("[WARN] npm test 実行不可: {}", e));
                }
            }
        }

        GateStepResult {
            passed: all_passed,
            summary: if all_passed {
                "全テスト通過".into()
            } else {
                "テスト失敗あり".into()
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
}
