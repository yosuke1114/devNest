use tauri::State;
use crate::db;
use crate::error::{AppError, Result};

// ─── managed/unmanaged 分類ロジック（テスト容易性のため公開） ──────────────────
pub(crate) fn is_managed_path(path: &str, docs_root: &str) -> bool {
    path.starts_with(docs_root) || path.ends_with(".md")
}
use crate::models::conflict::{
    apply_resolutions, parse_conflict_blocks, BlockResolutionInput, ConflictFile,
    ConflictScanResult, ResolveAllResult,
};
use crate::services::{git::GitService, keychain};
use crate::state::AppState;

// ─── conflict_scan ────────────────────────────────────────────────────────────

/// プロジェクトの git リポジトリをスキャンしてコンフリクトファイルを検出・DB 保存する。
#[tauri::command]
pub async fn conflict_scan(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<ConflictScanResult> {
    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();
    let docs_root = project.docs_root.clone();

    tokio::task::spawn_blocking(move || -> std::result::Result<ConflictScanResult, AppError> {
        let git = GitService::open(&local_path)?;
        let conflicted = git.list_conflicted_files()?;

        if conflicted.is_empty() {
            return Ok(ConflictScanResult {
                managed: vec![],
                unmanaged_count: 0,
            });
        }

        Ok(ConflictScanResult {
            managed: conflicted
                .iter()
                .filter(|p| is_managed_path(p, &docs_root))
                .map(|p| ConflictFile {
                    id: 0,
                    project_id,
                    file_path: p.clone(),
                    is_managed: true,
                    resolution: None,
                    resolved_at: None,
                    blocks: {
                        let abs = format!("{}/{}", local_path, p);
                        let content = std::fs::read_to_string(&abs).unwrap_or_default();
                        parse_conflict_blocks(&content)
                    },
                })
                .collect(),
            unmanaged_count: conflicted
                .iter()
                .filter(|p| !is_managed_path(p, &docs_root))
                .count(),
        })
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
}

// ─── conflict_list ────────────────────────────────────────────────────────────

/// DB 保存済みのコンフリクトファイル一覧をブロック付きで返す。
#[tauri::command]
pub async fn conflict_list(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<ConflictScanResult> {
    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();
    let docs_root = project.docs_root.clone();

    // DB から未解消ファイル一覧を取得
    let rows = db::conflict::list_unresolved(&state.db, project_id).await?;

    let mut managed = Vec::new();
    let mut unmanaged_count = 0usize;

    // 実際のファイルを読んで blocks をパース
    for row in &rows {
        if row.is_managed {
            let abs = format!("{}/{}", local_path, row.file_path);
            let content = tokio::fs::read_to_string(&abs).await.unwrap_or_default();
            let blocks = parse_conflict_blocks(&content);
            managed.push(ConflictFile {
                id: row.id,
                project_id: row.project_id,
                file_path: row.file_path.clone(),
                is_managed: true,
                resolution: row.resolution.clone(),
                resolved_at: row.resolved_at.clone(),
                blocks,
            });
        } else {
            unmanaged_count += 1;
        }
    }

    // scan を実行してないプロジェクトにも対応（ファイルが DB になければ scan から）
    if rows.is_empty() {
        let scan = conflict_scan(project_id, state.clone()).await?;
        // DB に保存
        for f in &scan.managed {
            let _ = db::conflict::upsert(&state.db, project_id, &f.file_path, true).await;
        }
        return Ok(scan);
    }

    Ok(ConflictScanResult {
        managed,
        unmanaged_count,
    })
}

// ─── conflict_resolve ─────────────────────────────────────────────────────────

/// 1 ファイルのコンフリクトを解消してディスクに書き込む。
#[tauri::command]
pub async fn conflict_resolve(
    project_id: i64,
    file_id: i64,
    file_path: String,
    resolutions: Vec<BlockResolutionInput>,
    state: State<'_, AppState>,
) -> Result<()> {
    let project = db::project::find(&state.db, project_id).await?;
    let abs_path = format!("{}/{}", project.local_path, file_path);

    // ファイルを読む
    let content = tokio::fs::read_to_string(&abs_path)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;

    // 解消を適用
    let resolved = apply_resolutions(&content, &resolutions)
        .map_err(|e| AppError::Validation(e))?;

    // ディスクに書き戻す
    tokio::fs::write(&abs_path, resolved)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;

    // DB 更新
    db::conflict::mark_resolved(&state.db, file_id, "ours").await?;

    Ok(())
}

// ─── conflict_resolve_all ─────────────────────────────────────────────────────

/// 全解消済みファイルを git add → commit → push する。
#[tauri::command]
pub async fn conflict_resolve_all(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<ResolveAllResult> {
    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();
    let branch = project.default_branch.clone();

    // 全ファイルを取得
    let rows = db::conflict::list_all(&state.db, project_id).await?;
    let resolved_files = rows.len();
    let file_paths: Vec<String> = rows.iter().map(|r| r.file_path.clone()).collect();

    // git add + commit (spawn_blocking for git2)
    let sha = tokio::task::spawn_blocking(move || -> std::result::Result<String, AppError> {
        let git = GitService::open(&local_path)?;
        let sha = git.stage_and_commit(&file_paths, "chore: resolve conflicts [DevNest]")?;
        Ok(sha)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;

    // git push
    if let Ok(token) = keychain::require_token(project_id) {
        let local_path2 = project.local_path.clone();
        let token_clone = token.clone();
        let branch_clone = branch.clone();
        let _ = tokio::task::spawn_blocking(move || {
            if let Ok(git) = GitService::open(&local_path2) {
                let _ = git.push(&token_clone, "origin", &branch_clone);
            }
        })
        .await;
    }

    // DB クリーンアップ
    db::conflict::delete_all(&state.db, project_id).await?;

    Ok(ResolveAllResult {
        commit_sha: sha,
        resolved_files,
    })
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect, migrations};
    use crate::db::project;
    use crate::models::conflict::{BlockResolutionInput, parse_conflict_blocks, apply_resolutions};
    use crate::services::git::GitService;
    use crate::state::AppState;
    use git2::Repository;
    use tempfile::TempDir;

    async fn setup() -> (AppState, TempDir) {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();
        drop(cfg); drop(repo);
        let pool = connect(&format!("sqlite:{}", dir.path().join("dev.db").display()))
            .await.unwrap();
        migrations::run(&pool).await.unwrap();
        (AppState::new(pool), dir)
    }

    // ─── is_managed_path ────────────────────────────────────────────────────

    // 🔴 Red: docs/ 配下のファイルは managed
    #[test]
    fn test_is_managed_docs_root_prefix() {
        assert!(is_managed_path("docs/spec.md", "docs/"));
        assert!(is_managed_path("docs/sub/design.md", "docs/"));
    }

    // 🔴 Red: .md 拡張子なら docs_root 外でも managed
    #[test]
    fn test_is_managed_md_extension_anywhere() {
        assert!(is_managed_path("README.md", "docs/"));
        assert!(is_managed_path("src/notes.md", "docs/"));
    }

    // 🔴 Red: docs/ 外かつ .md 以外は unmanaged
    #[test]
    fn test_is_unmanaged_non_md_outside_docs() {
        assert!(!is_managed_path("src/main.rs", "docs/"));
        assert!(!is_managed_path("Cargo.toml", "docs/"));
        assert!(!is_managed_path("package.json", "docs/"));
    }

    // 🔴 Red: docs_root が空文字のときは全ファイルが managed
    #[test]
    fn test_is_managed_empty_docs_root() {
        assert!(is_managed_path("src/main.rs", ""));
        assert!(is_managed_path("Cargo.toml", ""));
    }

    // ─── conflict_resolve の書き込みロジック ────────────────────────────────

    // 🔴 Red: ours を選択するとコンフリクトマーカーが消えること
    #[tokio::test]
    async fn test_conflict_resolve_writes_ours_content_to_disk() {
        let (state, dir) = setup().await;
        let local = dir.path().to_str().unwrap();
        let p = project::insert(&state.db, "P", local, "o", "r").await.unwrap();

        let conflict_content = "<<<<<<< HEAD\nours content here\n=======\ntheirs content here\n>>>>>>> feature\n";
        let rel_path = "docs/conflict.md";
        let abs_path = dir.path().join(rel_path);
        std::fs::create_dir_all(abs_path.parent().unwrap()).unwrap();
        std::fs::write(&abs_path, conflict_content).unwrap();

        let file_id = db::conflict::upsert(&state.db, p.id, rel_path, true).await.unwrap();

        let blocks = parse_conflict_blocks(conflict_content);
        assert_eq!(blocks.len(), 1);

        let resolutions = vec![BlockResolutionInput {
            block_index: 0,
            resolution: "ours".to_string(),
            manual_content: None,
        }];
        let resolved = apply_resolutions(conflict_content, &resolutions).unwrap();
        tokio::fs::write(&abs_path, &resolved).await.unwrap();
        db::conflict::mark_resolved(&state.db, file_id, "ours").await.unwrap();

        let written = tokio::fs::read_to_string(&abs_path).await.unwrap();
        assert!(written.contains("ours content here"));
        assert!(!written.contains("<<<<<<<"));
        assert!(!written.contains("theirs content here"));
    }

    // 🔴 Red: theirs を選択すると theirs の内容になること
    #[test]
    fn test_conflict_resolve_applies_theirs() {
        let conflict_content = "<<<<<<< HEAD\nmine\n=======\nyours\n>>>>>>> branch\n";
        let resolutions = vec![BlockResolutionInput {
            block_index: 0,
            resolution: "theirs".to_string(),
            manual_content: None,
        }];
        let resolved = apply_resolutions(conflict_content, &resolutions).unwrap();
        assert!(resolved.contains("yours"));
        assert!(!resolved.contains("mine"));
        assert!(!resolved.contains("<<<<<<<"));
    }

    // 🔴 Red: DB 未登録のときは list_unresolved が 0 件
    #[tokio::test]
    async fn test_conflict_list_db_empty_returns_no_rows() {
        let (state, _dir) = setup().await;
        let p = project::insert(&state.db, "P", "/tmp", "o", "r").await.unwrap();
        let rows = db::conflict::list_unresolved(&state.db, p.id).await.unwrap();
        assert!(rows.is_empty());
    }

    // 🔴 Red: upsert + mark_resolved でレコードが resolved になること
    #[tokio::test]
    async fn test_conflict_upsert_and_mark_resolved() {
        let (state, _dir) = setup().await;
        let p = project::insert(&state.db, "P", "/tmp", "o", "r").await.unwrap();
        let file_id = db::conflict::upsert(&state.db, p.id, "docs/a.md", true).await.unwrap();
        let before = db::conflict::list_unresolved(&state.db, p.id).await.unwrap();
        assert_eq!(before.len(), 1);
        db::conflict::mark_resolved(&state.db, file_id, "ours").await.unwrap();
        let after = db::conflict::list_unresolved(&state.db, p.id).await.unwrap();
        assert!(after.is_empty());
    }

    // 🔴 Red: stage_and_commit が解消済み複数ファイルをコミットできること
    #[test]
    fn test_stage_and_commit_resolved_files() {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();
        drop(cfg); drop(repo);

        let svc = GitService::open(dir.path().to_str().unwrap()).unwrap();
        std::fs::create_dir_all(dir.path().join("docs")).unwrap();
        std::fs::write(dir.path().join("docs/a.md"), "resolved a").unwrap();
        std::fs::write(dir.path().join("docs/b.md"), "resolved b").unwrap();

        let sha = svc
            .stage_and_commit(
                &["docs/a.md".to_string(), "docs/b.md".to_string()],
                "chore: resolve conflicts [DevNest]",
            )
            .unwrap();
        assert_eq!(sha.len(), 40);
        let scanned = svc.scan_docs("docs/").unwrap();
        assert_eq!(scanned.len(), 2);
    }
}
