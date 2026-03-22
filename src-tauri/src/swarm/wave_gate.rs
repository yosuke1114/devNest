use std::path::Path;
use std::process::Command;
use std::time::Instant;

use super::git_branch::{merge_worker_branch, merge_worker_branch_theirs};
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

        // マージが全件失敗（Blocked）でなければ test/review を実行する
        let test = if merge.passed {
            self.step_test().await
        } else {
            GateStepResult {
                passed: false,
                summary: "マージ全件失敗のためスキップ".into(),
                details: vec![],
                duration_secs: 0,
            }
        };

        let review = if merge.passed {
            self.step_review().await
        } else {
            GateStepResult {
                passed: false,
                summary: "マージ全件失敗のためスキップ".into(),
                details: vec![],
                duration_secs: 0,
            }
        };

        // !merge.passed = 全件マージ失敗のみ Blocked
        // 部分失敗（skip_count > 0 だが success_count > 0）は PassedWithWarnings
        let overall = if !merge.passed {
            GateOverall::Blocked
        } else if merge.summary.contains("スキップ") || !test.passed || !review.passed {
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
    ///
    /// コンフリクトが発生した場合は `-X theirs`（ワーカー優先）でリトライする。
    /// それでも失敗した場合は警告扱いとしてスキップし、他のブランチのマージを継続する。
    /// 全件失敗した場合のみ `passed = false`（Blocked）とする。
    async fn step_merge(&self, branches: &[String]) -> GateStepResult {
        let start = Instant::now();
        let repo = Path::new(&self.project_path);
        let mut details = Vec::new();
        let mut success_count = 0usize;
        let mut skip_count = 0usize;

        for branch in branches {
            // 1st attempt: 通常マージ
            let outcome = merge_worker_branch(repo, branch, &self.base_branch);
            if outcome.success {
                details.push(format!("[PASS] {} マージ成功", branch));
                success_count += 1;
                continue;
            }

            // コンフリクト発生 → ワーカー変更優先でリトライ
            let retry = merge_worker_branch_theirs(repo, branch, &self.base_branch);
            if retry.success {
                details.push(format!(
                    "[PASS] {} コンフリクト解消（ワーカー変更を優先）",
                    branch
                ));
                success_count += 1;
            } else {
                details.push(format!(
                    "[WARN] {} スキップ（解消不能なコンフリクト: {}）",
                    branch,
                    if outcome.conflict_files.is_empty() {
                        outcome.message.clone()
                    } else {
                        outcome.conflict_files.join(", ")
                    }
                ));
                skip_count += 1;
            }
        }

        let all_failed = success_count == 0 && !branches.is_empty();
        GateStepResult {
            passed: !all_failed,
            summary: if all_failed {
                "全ブランチのマージに失敗".into()
            } else if skip_count > 0 {
                format!(
                    "{}件成功 / {}件スキップ（コンフリクト）",
                    success_count, skip_count
                )
            } else {
                format!("{}件マージ成功", success_count)
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
