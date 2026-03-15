/// ResultAggregator — 全 Worker 完了後の Git diff 統計を集約する
use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDiff {
    pub worker_id: String,
    pub branch: String,
    pub files_changed: u32,
    pub insertions: u32,
    pub deletions: u32,
    /// 変更されたファイルのパス一覧（最大10件）
    pub changed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregatedResult {
    pub worker_diffs: Vec<WorkerDiff>,
    pub succeeded_ids: Vec<String>,
    pub failed_ids: Vec<String>,
    pub total_files_changed: u32,
    pub total_insertions: u32,
    pub total_deletions: u32,
}

pub struct ResultAggregator;

impl ResultAggregator {
    /// base ブランチに対する各 worker ブランチの diff 統計を集約する
    pub fn aggregate(
        repo_path: &Path,
        base_branch: &str,
        assignments: &[(&str, &str, bool)], // (worker_id, branch, succeeded)
    ) -> AggregatedResult {
        let mut worker_diffs = Vec::new();
        let mut succeeded_ids = Vec::new();
        let mut failed_ids = Vec::new();

        for &(worker_id, branch, succeeded) in assignments {
            if succeeded {
                succeeded_ids.push(worker_id.to_string());
                let diff = get_diff_stats(repo_path, base_branch, branch, worker_id);
                worker_diffs.push(diff);
            } else {
                failed_ids.push(worker_id.to_string());
            }
        }

        let total_files_changed = worker_diffs.iter().map(|d| d.files_changed).sum();
        let total_insertions = worker_diffs.iter().map(|d| d.insertions).sum();
        let total_deletions = worker_diffs.iter().map(|d| d.deletions).sum();

        AggregatedResult {
            worker_diffs,
            succeeded_ids,
            failed_ids,
            total_files_changed,
            total_insertions,
            total_deletions,
        }
    }
}

/// `git diff --stat base..branch` で統計を取得する
fn get_diff_stats(repo_path: &Path, base: &str, branch: &str, worker_id: &str) -> WorkerDiff {
    // 変更ファイル一覧
    let files_out = Command::new("git")
        .args(["diff", "--name-only", &format!("{}..{}", base, branch)])
        .current_dir(repo_path)
        .output()
        .unwrap_or_else(|_| std::process::Command::new("true").output().unwrap());
    let changed_files: Vec<String> = String::from_utf8_lossy(&files_out.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .take(10)
        .map(|l| l.to_string())
        .collect();
    let files_changed = changed_files.len() as u32;

    // 追加/削除行数
    let stat_out = Command::new("git")
        .args(["diff", "--shortstat", &format!("{}..{}", base, branch)])
        .current_dir(repo_path)
        .output()
        .unwrap_or_else(|_| std::process::Command::new("true").output().unwrap());
    let stat_str = String::from_utf8_lossy(&stat_out.stdout);

    let insertions = extract_number(&stat_str, "insertion");
    let deletions = extract_number(&stat_str, "deletion");

    WorkerDiff {
        worker_id: worker_id.to_string(),
        branch: branch.to_string(),
        files_changed,
        insertions,
        deletions,
        changed_files,
    }
}

fn extract_number(text: &str, keyword: &str) -> u32 {
    // "3 insertions(+)" のような文字列から 3 を取り出す
    text.split_whitespace()
        .zip(text.split_whitespace().skip(1))
        .find(|(_, kw)| kw.starts_with(keyword))
        .and_then(|(n, _)| n.parse().ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_number_finds_insertions() {
        let s = "5 files changed, 12 insertions(+), 3 deletions(-)";
        assert_eq!(extract_number(s, "insertion"), 12);
        assert_eq!(extract_number(s, "deletion"), 3);
    }

    #[test]
    fn extract_number_returns_zero_on_no_match() {
        assert_eq!(extract_number("nothing here", "insertion"), 0);
    }

    #[test]
    fn aggregate_separates_succeeded_and_failed() {
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let assignments = vec![("w1", "main", true), ("w2", "missing-branch", false)];
        let result = ResultAggregator::aggregate(repo, "main", &assignments);
        assert_eq!(result.succeeded_ids, vec!["w1"]);
        assert_eq!(result.failed_ids, vec!["w2"]);
    }
}
