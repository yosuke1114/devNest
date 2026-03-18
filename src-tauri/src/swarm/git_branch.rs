use git2::{BranchType, MergeOptions, Repository};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// ブランチマージの結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeOutcome {
    pub success: bool,
    pub message: String,
    pub conflict_files: Vec<String>,
}

/// ワーカーブランチをベースブランチにマージする
///
/// repo_path: リポジトリのルートパス
/// worker_branch: マージするワーカーブランチ名
/// base_branch: マージ先のベースブランチ名
pub fn merge_worker_branch(
    repo_path: &Path,
    worker_branch: &str,
    base_branch: &str,
) -> MergeOutcome {
    let repo = match Repository::open(repo_path) {
        Ok(r) => r,
        Err(e) => {
            return MergeOutcome {
                success: false,
                message: format!("リポジトリを開けません: {}", e),
                conflict_files: vec![],
            }
        }
    };

    // ベースブランチにチェックアウト
    let base_ref = format!("refs/heads/{}", base_branch);
    if let Err(e) = repo.set_head(&base_ref) {
        return MergeOutcome {
            success: false,
            message: format!("ベースブランチへの切替失敗: {}", e),
            conflict_files: vec![],
        };
    }
    if let Err(e) = repo.checkout_head(Some(
        git2::build::CheckoutBuilder::default().force(),
    )) {
        return MergeOutcome {
            success: false,
            message: format!("チェックアウト失敗: {}", e),
            conflict_files: vec![],
        };
    }

    // ワーカーブランチのコミットを取得
    let worker = match repo.find_branch(worker_branch, BranchType::Local) {
        Ok(b) => b,
        Err(e) => {
            return MergeOutcome {
                success: false,
                message: format!("ブランチ '{}' が見つかりません: {}", worker_branch, e),
                conflict_files: vec![],
            }
        }
    };

    let worker_commit = match worker.get().peel_to_commit() {
        Ok(c) => c,
        Err(e) => {
            return MergeOutcome {
                success: false,
                message: format!("コミット取得失敗: {}", e),
                conflict_files: vec![],
            }
        }
    };

    let annotated = match repo.find_annotated_commit(worker_commit.id()) {
        Ok(a) => a,
        Err(e) => {
            return MergeOutcome {
                success: false,
                message: format!("annotated commit 取得失敗: {}", e),
                conflict_files: vec![],
            }
        }
    };

    // マージ解析
    let (analysis, _) = match repo.merge_analysis(&[&annotated]) {
        Ok(a) => a,
        Err(e) => {
            return MergeOutcome {
                success: false,
                message: format!("マージ解析失敗: {}", e),
                conflict_files: vec![],
            }
        }
    };

    if analysis.is_up_to_date() {
        return MergeOutcome {
            success: true,
            message: "既に最新".into(),
            conflict_files: vec![],
        };
    }

    if analysis.is_fast_forward() {
        // Fast-forward
        if let Ok(mut reference) = repo.find_reference(&base_ref) {
            let _ = reference.set_target(worker_commit.id(), "swarm: fast-forward merge");
            let _ = repo.checkout_head(Some(
                git2::build::CheckoutBuilder::default().force(),
            ));
        }
        return MergeOutcome {
            success: true,
            message: format!("fast-forward マージ: {}", worker_branch),
            conflict_files: vec![],
        };
    }

    // 通常マージ
    let mut merge_opts = MergeOptions::new();
    merge_opts.fail_on_conflict(false);

    if let Err(e) = repo.merge(&[&annotated], Some(&mut merge_opts), None) {
        return MergeOutcome {
            success: false,
            message: format!("マージ実行失敗: {}", e),
            conflict_files: vec![],
        };
    }

    // コンフリクト確認
    let index = match repo.index() {
        Ok(i) => i,
        Err(_) => {
            return MergeOutcome {
                success: false,
                message: "インデックス取得失敗".into(),
                conflict_files: vec![],
            }
        }
    };

    if index.has_conflicts() {
        let conflict_files: Vec<String> = index
            .conflicts()
            .into_iter()
            .flatten()
            .filter_map(|c| {
                c.our
                    .as_ref()
                    .or(c.their.as_ref())
                    .and_then(|e| std::str::from_utf8(&e.path).ok().map(|s| s.to_string()))
            })
            .collect();

        // マージ状態をクリーンアップ
        let _ = repo.cleanup_state();

        return MergeOutcome {
            success: false,
            message: format!(
                "{} 件のコンフリクト",
                conflict_files.len()
            ),
            conflict_files,
        };
    }

    // コンフリクトなし → マージコミット作成
    let sig = repo
        .signature()
        .unwrap_or_else(|_| git2::Signature::now("DevNest Swarm", "swarm@devnest").unwrap());
    let base_commit = repo.head().and_then(|h| h.peel_to_commit());

    if let Ok(base) = base_commit {
        let mut idx = repo.index().unwrap();
        if let Ok(tree_id) = idx.write_tree() {
            if let Ok(tree) = repo.find_tree(tree_id) {
                let msg = format!("swarm: merge {} into {}", worker_branch, base_branch);
                let _ = repo.commit(
                    Some("HEAD"),
                    &sig,
                    &sig,
                    &msg,
                    &tree,
                    &[&base, &worker_commit],
                );
            }
        }
    }

    let _ = repo.cleanup_state();

    MergeOutcome {
        success: true,
        message: format!("マージ成功: {}", worker_branch),
        conflict_files: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_repo(dir: &TempDir) -> Repository {
        let repo = Repository::init(dir.path()).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@test.com").unwrap();
        drop(cfg);

        // 初回コミット
        let path = dir.path().join("readme.md");
        std::fs::write(&path, "# Test").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("readme.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[])
            .unwrap();

        repo
    }

    #[test]
    fn fast_forward_merge() {
        let dir = TempDir::new().unwrap();
        let repo = setup_repo(&dir);
        let head = repo.head().unwrap().peel_to_commit().unwrap();

        // feature ブランチ作成・コミット
        repo.branch("feature-1", &head, false).unwrap();
        repo.set_head("refs/heads/feature-1").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .unwrap();

        std::fs::write(dir.path().join("new.md"), "# New").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("new.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "add new.md", &tree, &[&parent])
            .unwrap();

        // main に戻る
        let default_branch = if repo.find_branch("main", BranchType::Local).is_ok() {
            "main"
        } else {
            "master"
        };
        repo.set_head(&format!("refs/heads/{}", default_branch))
            .unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .unwrap();

        let result = merge_worker_branch(dir.path(), "feature-1", default_branch);
        assert!(result.success, "fast-forward は成功するはず: {}", result.message);
        assert!(result.conflict_files.is_empty());
    }

    #[test]
    fn conflict_detected() {
        let dir = TempDir::new().unwrap();
        let repo = setup_repo(&dir);
        let head = repo.head().unwrap().peel_to_commit().unwrap();
        let default_branch = if repo.find_branch("main", BranchType::Local).is_ok() {
            "main"
        } else {
            "master"
        };

        // feature ブランチで readme.md を変更
        repo.branch("feature-conflict", &head, false).unwrap();
        repo.set_head("refs/heads/feature-conflict").unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .unwrap();

        std::fs::write(dir.path().join("readme.md"), "# Feature version").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("readme.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "feature change", &tree, &[&parent])
            .unwrap();

        // main で readme.md を別内容に変更
        repo.set_head(&format!("refs/heads/{}", default_branch))
            .unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .unwrap();

        std::fs::write(dir.path().join("readme.md"), "# Main version").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("readme.md")).unwrap();
        index.write().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = repo.signature().unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "main change", &tree, &[&parent])
            .unwrap();

        let result = merge_worker_branch(dir.path(), "feature-conflict", default_branch);
        assert!(!result.success, "コンフリクトが検出されるはず");
        assert!(!result.conflict_files.is_empty());
    }

    #[test]
    fn nonexistent_branch() {
        let dir = TempDir::new().unwrap();
        let _ = setup_repo(&dir);
        let default_branch = "main";

        let result = merge_worker_branch(dir.path(), "nonexistent", default_branch);
        assert!(!result.success);
    }
}
