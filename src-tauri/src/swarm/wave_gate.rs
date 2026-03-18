/// Wave Gate エンジン — Wave 間のマージ → テスト → AIレビュー を順次実行する。
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use tauri::AppHandle;

use super::git_branch::merge_worker_branch;
use super::wave::{GateOverall, GateStepResult, WaveGateResult};
use crate::notification::ring::{emit_ring_event, RingEvent, RingUrgency};

pub struct WaveGate {
    project_path: String,
    base_branch: String,
}

impl WaveGate {
    pub fn new(project_path: &str, base_branch: &str) -> Self {
        Self {
            project_path: project_path.to_string(),
            base_branch: base_branch.to_string(),
        }
    }

    /// Wave 完了後のゲート処理を一括実行する。
    /// `wave_number` は通知リング用（表示のみ）。
    pub async fn execute(
        &self,
        succeeded_branches: &[String],
        wave_number: u32,
        app: &AppHandle,
    ) -> WaveGateResult {
        // Step 1: マージ
        let merge_result = self.run_merge_step(succeeded_branches);

        // Step 2: テスト（マージ成功時のみ）
        let test_result = if merge_result.passed {
            self.run_test_step()
        } else {
            GateStepResult {
                passed: false,
                summary: "マージ失敗のためスキップ".to_string(),
                details: vec![],
                duration_secs: 0,
            }
        };

        // Step 3: AIレビュー（マージ成功時のみ）
        let review_result = if merge_result.passed {
            self.run_review_step().await
        } else {
            GateStepResult {
                passed: false,
                summary: "マージ失敗のためスキップ".to_string(),
                details: vec![],
                duration_secs: 0,
            }
        };

        // 総合判定
        let overall = if !merge_result.passed {
            GateOverall::Blocked
        } else if !test_result.passed || !review_result.passed {
            GateOverall::PassedWithWarnings
        } else {
            GateOverall::Passed
        };

        // 通知リング発火
        let urgency = match &overall {
            GateOverall::Passed => RingUrgency::Info,
            GateOverall::PassedWithWarnings => RingUrgency::Warning,
            GateOverall::Blocked => RingUrgency::Critical,
        };
        emit_ring_event(
            app,
            RingEvent::SwarmWaveGate {
                wave_number,
                overall: format!("{:?}", overall),
                urgency,
            },
        );

        WaveGateResult {
            merge: merge_result,
            test: test_result,
            review: review_result,
            overall,
        }
    }

    /// Step 1: 成功ブランチをベース（self.base_branch）にマージ
    fn run_merge_step(&self, branches: &[String]) -> GateStepResult {
        let start = Instant::now();
        let repo = Path::new(&self.project_path);
        let mut details = Vec::new();
        let mut all_success = true;

        for branch in branches {
            let outcome = merge_worker_branch(repo, branch, &self.base_branch);
            if outcome.success {
                details.push(format!("✅ {} → マージ成功", branch));
            } else if !outcome.conflict_files.is_empty() {
                details.push(format!(
                    "❌ {} → コンフリクト: {}",
                    branch,
                    outcome.conflict_files.join(", ")
                ));
                all_success = false;
            } else {
                let err = outcome.error.unwrap_or_else(|| "unknown".to_string());
                details.push(format!("❌ {} → マージ失敗: {}", branch, err));
                all_success = false;
            }
        }

        GateStepResult {
            passed: all_success,
            summary: if all_success {
                format!("{}件のブランチを正常にマージ", branches.len())
            } else {
                "マージにコンフリクトがあります".to_string()
            },
            details,
            duration_secs: start.elapsed().as_secs(),
        }
    }

    /// Step 2: テスト実行（cargo test + npm test）
    fn run_test_step(&self) -> GateStepResult {
        let start = Instant::now();
        let mut details = Vec::new();
        let mut all_passed = true;

        // Rust テスト
        let cargo_result = Command::new("cargo")
            .args(["test", "--", "--test-threads=1"])
            .current_dir(&self.project_path)
            .output();

        match cargo_result {
            Ok(output) if output.status.success() => {
                details.push("✅ cargo test: PASS".to_string());
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let failure_summary = stderr
                    .lines()
                    .filter(|l| l.contains("FAILED") || l.contains("test result"))
                    .take(5)
                    .collect::<Vec<_>>()
                    .join("\n");
                details.push(format!("❌ cargo test: FAIL\n{}", failure_summary));
                all_passed = false;
            }
            Err(e) => {
                // cargo が見つからない場合は警告のみ（ブロックしない）
                details.push(format!("⚠️ cargo test: 実行不可 ({})", e));
            }
        }

        // Node テスト（package.json があれば）
        let pkg_json = Path::new(&self.project_path).join("package.json");
        if pkg_json.exists() {
            let npm_result = Command::new("npm")
                .args(["test", "--", "--passWithNoTests"])
                .current_dir(&self.project_path)
                .output();

            match npm_result {
                Ok(output) if output.status.success() => {
                    details.push("✅ npm test: PASS".to_string());
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let failure_summary = stderr.lines().take(5).collect::<Vec<_>>().join("\n");
                    details.push(format!("❌ npm test: FAIL\n{}", failure_summary));
                    all_passed = false;
                }
                Err(e) => {
                    details.push(format!("⚠️ npm test: 実行不可 ({})", e));
                }
            }
        }

        GateStepResult {
            passed: all_passed,
            summary: if all_passed {
                "全テスト通過".to_string()
            } else {
                "テスト失敗があります".to_string()
            },
            details,
            duration_secs: start.elapsed().as_secs(),
        }
    }

    /// Step 3: AIレビュー（Wave 内の全変更に対して）
    async fn run_review_step(&self) -> GateStepResult {
        let start = Instant::now();

        match crate::review::engine::quick_review(&self.project_path, &self.base_branch).await {
            Ok(review_result) => {
                use crate::review::findings::FindingSeverity;
                let has_critical = review_result
                    .findings
                    .iter()
                    .any(|f| f.severity == FindingSeverity::Critical);

                let finding_summary: Vec<String> = review_result
                    .findings
                    .iter()
                    .take(5)
                    .map(|f| format!("{:?} [{}]: {}", f.severity, f.file, f.message))
                    .collect();

                GateStepResult {
                    passed: !has_critical,
                    summary: format!(
                        "{:?}: {}件の指摘",
                        review_result.overall_assessment,
                        review_result.findings.len()
                    ),
                    details: finding_summary,
                    duration_secs: start.elapsed().as_secs(),
                }
            }
            Err(e) => {
                // AI レビューが失敗しても Gate をブロックしない（警告のみ）
                GateStepResult {
                    passed: true,
                    summary: format!("AIレビュー実行エラー: {}", e),
                    details: vec![],
                    duration_secs: start.elapsed().as_secs(),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wave_gate_new_stores_config() {
        let gate = WaveGate::new("/tmp/project", "main");
        assert_eq!(gate.project_path, "/tmp/project");
        assert_eq!(gate.base_branch, "main");
    }

    #[test]
    fn run_merge_step_empty_branches_passes() {
        let gate = WaveGate::new("/tmp", "main");
        let result = gate.run_merge_step(&[]);
        assert!(result.passed);
        assert_eq!(result.summary, "0件のブランチを正常にマージ");
    }

    #[test]
    fn run_test_step_skips_cargo_gracefully() {
        // カレントディレクトリが Rust プロジェクトでない場合でもパニックしない
        let gate = WaveGate::new("/tmp", "main");
        let result = gate.run_test_step();
        // 実行不可でも passed=true か false かは環境依存、クラッシュしないことを確認
        let _ = result;
    }
}
