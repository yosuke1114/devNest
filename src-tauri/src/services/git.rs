use crate::error::{AppError, Result};
use git2::{Repository, Signature};
use std::path::{Path, PathBuf};

pub struct GitService {
    repo: Repository,
    repo_path: PathBuf,
}

/// git2 で走査したファイル情報
#[derive(Debug, Clone)]
pub struct ScannedFile {
    pub path: String,   // repo ルートからの相対パス
    pub sha: String,    // git blob SHA (hex)
    pub size_bytes: i64,
}

/// push / pull の結果
#[derive(Debug, Clone, PartialEq)]
pub enum PullStatus {
    Success,
    Conflict,
    UpToDate,
}

#[derive(Debug, Clone)]
pub struct PullResult {
    pub status: PullStatus,
    pub conflict_files: Vec<String>,
}

impl GitService {
    /// リポジトリを開く
    pub fn open(local_path: &str) -> Result<Self> {
        let repo = Repository::open(local_path).map_err(|e| {
            AppError::Git(format!("リポジトリを開けません '{}': {}", local_path, e))
        })?;
        Ok(Self {
            repo_path: PathBuf::from(local_path),
            repo,
        })
    }

    /// 現在チェックアウトしているブランチ名を返す
    pub fn current_branch(&self) -> Result<String> {
        let head = self.repo.head().map_err(|e| AppError::Git(e.to_string()))?;
        head.shorthand()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Git("HEAD が detached 状態です".to_string()))
    }

    /// docs_root 配下の .md ファイルを git tree から走査して返す
    /// git add 済みのファイルだけが対象（git blob SHA を取得できる）
    pub fn scan_docs(&self, docs_root: &str) -> Result<Vec<ScannedFile>> {
        // HEAD コミットがない（初回コミット前）ならファイルシステムから走査
        let head = match self.repo.head() {
            Ok(h) => h,
            Err(_) => return self.scan_docs_from_fs(docs_root),
        };

        let commit = head
            .peel_to_commit()
            .map_err(|e| AppError::Git(e.to_string()))?;
        let tree = commit
            .tree()
            .map_err(|e| AppError::Git(e.to_string()))?;

        let mut files = Vec::new();
        tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
            if entry.kind() != Some(git2::ObjectType::Blob) {
                return git2::TreeWalkResult::Ok;
            }
            let name = entry.name().unwrap_or("");
            if !name.ends_with(".md") {
                return git2::TreeWalkResult::Ok;
            }
            let full_path = format!("{}{}", root, name);
            if !full_path.starts_with(docs_root) && !docs_root.is_empty() {
                return git2::TreeWalkResult::Ok;
            }
            let sha = entry.id().to_string();
            let blob = self.repo.find_blob(entry.id());
            let size_bytes = blob.map(|b| b.size() as i64).unwrap_or(0);
            files.push(ScannedFile { path: full_path, sha, size_bytes });
            git2::TreeWalkResult::Ok
        })
        .map_err(|e| AppError::Git(e.to_string()))?;

        Ok(files)
    }

    /// HEAD がない場合はファイルシステムから走査（初回コミット前）
    fn scan_docs_from_fs(&self, docs_root: &str) -> Result<Vec<ScannedFile>> {
        let docs_dir = self.repo_path.join(docs_root);
        if !docs_dir.exists() {
            return Ok(vec![]);
        }
        let mut files = Vec::new();
        for entry in walkdir::WalkDir::new(&docs_dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_type().is_file()
                    && e.path().extension().and_then(|s| s.to_str()) == Some("md")
            })
        {
            let abs = entry.path();
            let rel = abs
                .strip_prefix(&self.repo_path)
                .unwrap_or(abs)
                .to_string_lossy()
                .to_string();
            let size_bytes = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
            // FS 走査時は SHA を空文字にする（git add 後に確定）
            files.push(ScannedFile { path: rel, sha: String::new(), size_bytes });
        }
        Ok(files)
    }

    /// ファイルを書き込み・ステージ・コミットして commit SHA を返す
    pub fn write_and_commit(&self, relative_path: &str, content: &str, msg: &str) -> Result<String> {
        let abs_path = self.repo_path.join(relative_path);
        if let Some(parent) = abs_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&abs_path, content)?;

        // git add
        let mut index = self.repo.index().map_err(|e| AppError::Git(e.to_string()))?;
        index
            .add_path(Path::new(relative_path))
            .map_err(|e| AppError::Git(e.to_string()))?;
        index.write().map_err(|e| AppError::Git(e.to_string()))?;

        let tree_id = index
            .write_tree()
            .map_err(|e| AppError::Git(e.to_string()))?;
        let tree = self
            .repo
            .find_tree(tree_id)
            .map_err(|e| AppError::Git(e.to_string()))?;

        let sig = self.signature()?;
        let parent_commits = self.parent_commits()?;
        let parents: Vec<&git2::Commit> = parent_commits.iter().collect();

        let commit_id = self
            .repo
            .commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)
            .map_err(|e| AppError::Git(e.to_string()))?;

        Ok(commit_id.to_string())
    }

    /// HTTPS トークン認証で push する
    pub fn push(&self, token: &str, remote_name: &str, branch: &str) -> Result<()> {
        let mut remote = self
            .repo
            .find_remote(remote_name)
            .map_err(|e| AppError::Git(e.to_string()))?;

        let mut callbacks = git2::RemoteCallbacks::new();
        let token = token.to_string();
        callbacks.credentials(move |_url, _username, _allowed| {
            git2::Cred::userpass_plaintext("x-oauth-basic", &token)
        });

        let mut push_opts = git2::PushOptions::new();
        push_opts.remote_callbacks(callbacks);

        let refspec = format!("refs/heads/{}:refs/heads/{}", branch, branch);
        remote
            .push(&[refspec.as_str()], Some(&mut push_opts))
            .map_err(|e| AppError::Git(format!("push 失敗: {}", e)))?;

        Ok(())
    }

    /// HTTPS トークン認証で fetch + fast-forward pull する
    pub fn pull(&self, token: &str, remote_name: &str, branch: &str) -> crate::error::Result<PullResult> {
        // 1. fetch
        let mut remote = self.repo.find_remote(remote_name)
            .map_err(|e| AppError::Git(e.to_string()))?;

        let mut callbacks = git2::RemoteCallbacks::new();
        let token_clone = token.to_string();
        callbacks.credentials(move |_url, _username_from_url, _allowed| {
            git2::Cred::userpass_plaintext("x-access-token", &token_clone)
        });

        let mut fetch_opts = git2::FetchOptions::new();
        fetch_opts.remote_callbacks(callbacks);

        remote.fetch(&[branch], Some(&mut fetch_opts), None)
            .map_err(|e| AppError::Git(format!("fetch 失敗: {}", e)))?;

        // 2. FETCH_HEAD
        let fetch_head = match self.repo.find_reference("FETCH_HEAD") {
            Ok(r) => r,
            Err(_) => return Ok(PullResult { status: PullStatus::UpToDate, conflict_files: vec![] }),
        };
        let fetch_commit = self.repo.reference_to_annotated_commit(&fetch_head)
            .map_err(|e| AppError::Git(e.to_string()))?;

        // 3. merge analysis
        let (analysis, _) = self.repo.merge_analysis(&[&fetch_commit])
            .map_err(|e| AppError::Git(e.to_string()))?;

        if analysis.is_up_to_date() {
            return Ok(PullResult { status: PullStatus::UpToDate, conflict_files: vec![] });
        }

        if analysis.is_fast_forward() {
            let ref_name = format!("refs/heads/{}", branch);
            let mut reference = self.repo.find_reference(&ref_name)
                .map_err(|e| AppError::Git(e.to_string()))?;
            reference.set_target(fetch_commit.id(), "pull: fast-forward")
                .map_err(|e| AppError::Git(e.to_string()))?;
            self.repo.set_head(&ref_name)
                .map_err(|e| AppError::Git(e.to_string()))?;
            self.repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
                .map_err(|e| AppError::Git(e.to_string()))?;
            return Ok(PullResult { status: PullStatus::Success, conflict_files: vec![] });
        }

        // diverged or conflict
        Ok(PullResult { status: PullStatus::Conflict, conflict_files: vec![] })
    }

    /// git status でコンフリクト状態のファイルパスを返す
    pub fn list_conflicted_files(&self) -> Result<Vec<String>> {
        let statuses = self
            .repo
            .statuses(None)
            .map_err(|e| AppError::Git(e.to_string()))?;
        let conflicted: Vec<String> = statuses
            .iter()
            .filter(|e| {
                let s = e.status();
                s.contains(git2::Status::CONFLICTED)
                    || (s.contains(git2::Status::INDEX_MODIFIED)
                        && s.contains(git2::Status::WT_MODIFIED))
            })
            .filter_map(|e| e.path().map(|p| p.to_string()))
            .collect();
        Ok(conflicted)
    }

    /// 複数ファイルを git add してコミットし、commit SHA を返す
    pub fn stage_and_commit(&self, relative_paths: &[String], msg: &str) -> Result<String> {
        let mut index = self.repo.index().map_err(|e| AppError::Git(e.to_string()))?;
        for path in relative_paths {
            index
                .add_path(Path::new(path))
                .map_err(|e| AppError::Git(e.to_string()))?;
        }
        index.write().map_err(|e| AppError::Git(e.to_string()))?;

        let tree_id = index
            .write_tree()
            .map_err(|e| AppError::Git(e.to_string()))?;
        let tree = self
            .repo
            .find_tree(tree_id)
            .map_err(|e| AppError::Git(e.to_string()))?;

        let sig = self.signature()?;
        let parent_commits = self.parent_commits()?;
        let parents: Vec<&git2::Commit> = parent_commits.iter().collect();

        let commit_id = self
            .repo
            .commit(Some("HEAD"), &sig, &sig, msg, &tree, &parents)
            .map_err(|e| AppError::Git(e.to_string()))?;

        Ok(commit_id.to_string())
    }

    fn signature(&self) -> Result<Signature<'_>> {
        self.repo
            .signature()
            .or_else(|_| Signature::now("DevNest", "devnest@local"))
            .map_err(|e| AppError::Git(e.to_string()))
    }

    fn parent_commits(&self) -> Result<Vec<git2::Commit<'_>>> {
        match self.repo.head() {
            Ok(head) => {
                let commit = head
                    .peel_to_commit()
                    .map_err(|e| AppError::Git(e.to_string()))?;
                Ok(vec![commit])
            }
            Err(_) => Ok(vec![]), // 初回コミット
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn init_bare_repo(dir: &TempDir) -> (GitService, PathBuf) {
        let path = dir.path().to_path_buf();
        let repo = Repository::init(&path).unwrap();
        // git config user.name / user.email（テスト用）
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();
        drop(cfg);
        drop(repo);
        let svc = GitService::open(path.to_str().unwrap()).unwrap();
        (svc, path)
    }

    // 🔴 Red: open が正常なリポジトリを開けること
    #[test]
    fn test_open_valid_repo() {
        let dir = TempDir::new().unwrap();
        Repository::init(dir.path()).unwrap();
        let result = GitService::open(dir.path().to_str().unwrap());
        assert!(result.is_ok());
    }

    // 🔴 Red: open が非 git ディレクトリでエラーを返すこと
    #[test]
    fn test_open_non_git_dir_returns_error() {
        let dir = TempDir::new().unwrap();
        let result = GitService::open(dir.path().to_str().unwrap());
        assert!(matches!(result, Err(AppError::Git(_))));
    }

    // 🔴 Red: write_and_commit が SHA を返すこと
    #[test]
    fn test_write_and_commit_returns_sha() {
        let dir = TempDir::new().unwrap();
        let (svc, _) = init_bare_repo(&dir);
        std::fs::create_dir_all(dir.path().join("docs")).unwrap();
        let sha = svc
            .write_and_commit("docs/spec.md", "# Spec", "docs: add spec.md")
            .unwrap();
        assert_eq!(sha.len(), 40, "SHA は 40 文字の hex");
    }

    // 🔴 Red: 2回コミットすると SHA が変わること（変更検知のベース）
    #[test]
    fn test_two_commits_have_different_shas() {
        let dir = TempDir::new().unwrap();
        let (svc, _) = init_bare_repo(&dir);
        let sha1 = svc
            .write_and_commit("docs/a.md", "v1", "docs: v1")
            .unwrap();
        let sha2 = svc
            .write_and_commit("docs/a.md", "v2", "docs: v2")
            .unwrap();
        assert_ne!(sha1, sha2);
    }

    // 🔴 Red: scan_docs が .md ファイルを検出すること
    #[test]
    fn test_scan_docs_detects_md_files() {
        let dir = TempDir::new().unwrap();
        let (svc, path) = init_bare_repo(&dir);
        std::fs::create_dir_all(path.join("docs")).unwrap();
        svc.write_and_commit("docs/spec.md", "# Spec", "docs: add spec.md").unwrap();
        svc.write_and_commit("docs/design.md", "# Design", "docs: add design.md").unwrap();

        let files = svc.scan_docs("docs/").unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|f| !f.sha.is_empty()));
    }

    // 🔴 Red: scan_docs が .md 以外を除外すること
    #[test]
    fn test_scan_docs_ignores_non_md() {
        let dir = TempDir::new().unwrap();
        let (svc, _path) = init_bare_repo(&dir);
        svc.write_and_commit("docs/spec.md", "# Spec", "add spec").unwrap();
        svc.write_and_commit("docs/image.png", "binary", "add image").unwrap();

        let files = svc.scan_docs("docs/").unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "docs/spec.md");
    }

    // 🔴 Red: current_branch が "main" または "master" を返すこと
    #[test]
    fn test_current_branch_after_first_commit() {
        let dir = TempDir::new().unwrap();
        let (svc, _) = init_bare_repo(&dir);
        svc.write_and_commit("readme.md", "# README", "initial").unwrap();
        let branch = svc.current_branch().unwrap();
        assert!(branch == "main" || branch == "master", "got: {branch}");
    }

    // 🔴 Red: scan_docs が初回コミット前（HEAD なし）でもパニックしないこと
    #[test]
    fn test_scan_docs_before_first_commit() {
        let dir = TempDir::new().unwrap();
        let (svc, path) = init_bare_repo(&dir);
        std::fs::create_dir_all(path.join("docs")).unwrap();
        std::fs::write(path.join("docs/a.md"), "# A").unwrap();
        // コミット前 → FS 走査にフォールバック
        let files = svc.scan_docs("docs/").unwrap();
        assert_eq!(files.len(), 1);
    }

    // 🔴 Red: stage_and_commit が複数ファイルをまとめてコミットできること
    #[test]
    fn test_stage_and_commit_multiple_files() {
        let dir = TempDir::new().unwrap();
        let (svc, path) = init_bare_repo(&dir);
        std::fs::create_dir_all(path.join("docs")).unwrap();

        // 2 ファイルを手動作成（stage_and_commit は既存ファイルをステージする）
        std::fs::write(path.join("docs/a.md"), "# A").unwrap();
        std::fs::write(path.join("docs/b.md"), "# B").unwrap();

        let sha = svc
            .stage_and_commit(
                &["docs/a.md".to_string(), "docs/b.md".to_string()],
                "chore: resolve conflicts",
            )
            .unwrap();

        assert_eq!(sha.len(), 40, "SHA は 40 文字 hex");

        // コミットツリーに両ファイルが含まれること
        let files = svc.scan_docs("docs/").unwrap();
        assert_eq!(files.len(), 2);
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.contains(&"docs/a.md"));
        assert!(paths.contains(&"docs/b.md"));
    }

    // 🔴 Red: stage_and_commit を 2 回呼ぶと SHA が変わること
    #[test]
    fn test_stage_and_commit_produces_unique_sha() {
        let dir = TempDir::new().unwrap();
        let (svc, path) = init_bare_repo(&dir);

        std::fs::write(path.join("file.md"), "v1").unwrap();
        let sha1 = svc
            .stage_and_commit(&["file.md".to_string()], "first")
            .unwrap();

        std::fs::write(path.join("file.md"), "v2").unwrap();
        let sha2 = svc
            .stage_and_commit(&["file.md".to_string()], "second")
            .unwrap();

        assert_ne!(sha1, sha2);
    }

    // 🔴 Red: クリーンなリポジトリでは list_conflicted_files が空を返すこと
    #[test]
    fn test_list_conflicted_files_empty_on_clean_repo() {
        let dir = TempDir::new().unwrap();
        let (svc, _) = init_bare_repo(&dir);
        svc.write_and_commit("readme.md", "# README", "initial").unwrap();

        let conflicts = svc.list_conflicted_files().unwrap();
        assert!(conflicts.is_empty(), "クリーンなリポジトリにコンフリクトはない");
    }

    // 🔴 Red: pull がリモート未設定のときエラーを返すこと
    #[test]
    fn test_pull_without_remote_returns_error() {
        let dir = TempDir::new().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();
        drop(cfg);
        let svc = GitService::open(dir.path().to_str().unwrap()).unwrap();
        // origin が設定されていないのでエラー
        let result = svc.pull("token", "origin", "main");
        assert!(result.is_err(), "origin 未設定なら AppError::Git が返る");
    }

    // 🔴 Red: current_branch が HEAD コミット後にブランチ名を返すこと
    #[test]
    fn test_current_branch_returns_head_name() {
        let dir = TempDir::new().unwrap();
        let (svc, _) = init_bare_repo(&dir);
        // コミット前は HEAD が存在しないためエラーになる
        let result_before = svc.current_branch();
        // コミット後はブランチ名を返す
        svc.write_and_commit("readme.md", "# README", "initial").unwrap();
        let branch = svc.current_branch().unwrap();
        assert!(!branch.is_empty(), "ブランチ名が空でないこと");
        // コミット前の結果（エラーの場合）または成功（git init デフォルトブランチ名）
        let _ = result_before; // どちらでも ok
    }

    // 🔴 Red: 2ブランチのマージコンフリクトを list_conflicted_files が検出すること
    #[test]
    fn test_list_conflicted_files_detects_conflict() {
        use git2::{BranchType, MergeOptions};

        let dir = TempDir::new().unwrap();
        let path = dir.path();
        let repo = Repository::init(path).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();
        drop(cfg);

        let svc = GitService::open(path.to_str().unwrap()).unwrap();

        // 初回コミット（共通祖先）
        svc.write_and_commit("docs/conflict.md", "shared", "initial").unwrap();

        // feature ブランチで変更
        let head_commit = repo.head().unwrap().peel_to_commit().unwrap();
        repo.branch("feature", &head_commit, false).unwrap();
        let feat_ref = repo.find_branch("feature", BranchType::Local).unwrap();
        repo.set_head(feat_ref.get().name().unwrap()).unwrap();
        svc.write_and_commit("docs/conflict.md", "feature version", "feat").unwrap();

        // main / master どちらかに戻る（init 時のデフォルトブランチ名を使用）
        let default_ref = if repo.find_branch("main", BranchType::Local).is_ok() {
            "refs/heads/main"
        } else {
            "refs/heads/master"
        };
        repo.set_head(default_ref).unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force())).unwrap();
        svc.write_and_commit("docs/conflict.md", "main version", "main").unwrap();

        // マージを試みる（コンフリクトが発生するはず）
        let feat_commit = repo
            .find_branch("feature", BranchType::Local)
            .unwrap()
            .get()
            .peel_to_commit()
            .unwrap();
        let annotated = repo.find_annotated_commit(feat_commit.id()).unwrap();
        let _ = repo.merge(&[&annotated], Some(MergeOptions::new().fail_on_conflict(false)), None);

        let conflicts = svc.list_conflicted_files().unwrap();
        assert!(
            !conflicts.is_empty(),
            "マージコンフリクト後はコンフリクトファイルが検出される"
        );
        assert!(
            conflicts.iter().any(|p| p.contains("conflict.md")),
            "conflict.md が検出される: {:?}",
            conflicts
        );
    }
}
