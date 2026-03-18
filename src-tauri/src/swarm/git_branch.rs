/// Swarm Worker 用 Git ブランチ操作（std::process::Command ベース）
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeOutcome {
    pub branch: String,
    pub success: bool,
    pub conflict_files: Vec<String>,
    pub error: Option<String>,
}

/// ベースブランチから worker ブランチを作成する
pub fn create_worker_branch(repo_path: &Path, branch_name: &str) -> Result<(), String> {
    let out = Command::new("git")
        .args(["checkout", "-b", branch_name])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("git checkout -b failed: {}", e))?;

    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "git checkout -b '{}' failed: {}",
            branch_name,
            String::from_utf8_lossy(&out.stderr)
        ))
    }
}

/// 現在のブランチ名を取得する
pub fn current_branch(repo_path: &Path) -> Result<String, String> {
    let out = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("git rev-parse failed: {}", e))?;

    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// base ブランチに worker ブランチをマージする
pub fn merge_worker_branch(
    repo_path: &Path,
    worker_branch: &str,
    base_branch: &str,
) -> MergeOutcome {
    // base ブランチに戻る
    let checkout = Command::new("git")
        .args(["checkout", base_branch])
        .current_dir(repo_path)
        .output();

    if let Err(e) = checkout {
        return MergeOutcome {
            branch: worker_branch.to_string(),
            success: false,
            conflict_files: vec![],
            error: Some(format!("checkout failed: {}", e)),
        };
    }

    // --no-ff でマージ
    let merge = Command::new("git")
        .args(["merge", "--no-ff", "--no-edit", worker_branch])
        .current_dir(repo_path)
        .output();

    match merge {
        Err(e) => MergeOutcome {
            branch: worker_branch.to_string(),
            success: false,
            conflict_files: vec![],
            error: Some(format!("merge failed: {}", e)),
        },
        Ok(out) if out.status.success() => MergeOutcome {
            branch: worker_branch.to_string(),
            success: true,
            conflict_files: vec![],
            error: None,
        },
        Ok(out) => {
            // コンフリクトしたファイルを列挙
            let conflict_files = list_conflict_files(repo_path);
            MergeOutcome {
                branch: worker_branch.to_string(),
                success: false,
                conflict_files,
                error: Some(String::from_utf8_lossy(&out.stderr).trim().to_string()),
            }
        }
    }
}

/// git status で UU（コンフリクト）状態のファイルを取得する
fn list_conflict_files(repo_path: &Path) -> Vec<String> {
    let out = Command::new("git")
        .args(["diff", "--name-only", "--diff-filter=U"])
        .current_dir(repo_path)
        .output()
        .unwrap_or_else(|_| std::process::Command::new("true").output().unwrap());
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect()
}

/// worker ブランチを削除する（クリーンアップ用）
pub fn delete_worker_branch(repo_path: &Path, branch_name: &str) -> Result<(), String> {
    let out = Command::new("git")
        .args(["branch", "-D", branch_name])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("git branch -D failed: {}", e))?;

    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_branch_returns_string_in_git_repo() {
        // devNest 自体が git リポジトリなので動作確認
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
        let branch = current_branch(repo);
        assert!(branch.is_ok(), "current_branch should succeed in a git repo");
        assert!(!branch.unwrap().is_empty());
    }

    #[test]
    fn merge_outcome_serializes_correctly() {
        let outcome = MergeOutcome {
            branch: "swarm/worker-1".into(),
            success: true,
            conflict_files: vec![],
            error: None,
        };
        let json = serde_json::to_string(&outcome).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"branch\":\"swarm/worker-1\""));
    }
}
