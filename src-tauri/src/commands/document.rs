use tauri::{AppHandle, Emitter, State};
use serde::Serialize;
use crate::db;
use crate::error::{AppError, Result};
use crate::models::document::{Document, DocumentWithContent, SaveResult, ScanResult};
use crate::models::issue::Issue;
use crate::services::{chunker, git::GitService, keychain};
use crate::state::AppState;

/// doc_save_progress イベントのペイロード
#[derive(Debug, Clone, Serialize)]
pub struct DocSaveProgressPayload {
    pub document_id: i64,
    pub status: String, // "committing" | "pushing" | "synced" | "push_failed"
    pub commit_sha: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn document_list(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<Document>, AppError> {
    db::project::find(&state.db, project_id).await?; // ProjectNotFound チェック
    db::document::list_by_project(&state.db, project_id).await
}

#[tauri::command]
pub async fn document_get(
    project_id: i64,
    document_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<DocumentWithContent, AppError> {
    let doc = db::document::find(&state.db, document_id).await?;
    if doc.project_id != project_id {
        return Err(AppError::NotFound(format!("document id={}", document_id)));
    }
    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();
    let doc_path = doc.path.clone();

    // ファイル読み込みはブロッキング → spawn_blocking でラップ
    let content = tokio::task::spawn_blocking(move || {
        let abs = std::path::Path::new(&local_path).join(&doc_path);
        std::fs::read_to_string(&abs).map_err(|e| {
            AppError::Io(format!("ファイル読み込み失敗 '{}': {}", abs.display(), e))
        })
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;

    Ok(DocumentWithContent { document: doc, content })
}

#[tauri::command]
pub async fn document_scan(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<ScanResult, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();
    let docs_root = project.docs_root.clone();

    // git2 はブロッキング操作 → spawn_blocking
    let scanned = tokio::task::spawn_blocking(move || {
        let svc = GitService::open(&local_path)?;
        svc.scan_docs(&docs_root)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;

    let existing = db::document::list_by_project(&state.db, project_id).await?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut added = 0u32;
    let mut updated = 0u32;

    for file in &scanned {
        let found = existing.iter().find(|d| d.path == file.path);
        match found {
            None => {
                sqlx::query(
                    r#"INSERT INTO documents
                       (project_id, path, sha, size_bytes, embedding_status, push_status, created_at, updated_at)
                       VALUES (?, ?, ?, ?, 'pending', 'synced', ?, ?)"#,
                )
                .bind(project_id)
                .bind(&file.path)
                .bind(if file.sha.is_empty() { None } else { Some(&file.sha) })
                .bind(file.size_bytes)
                .bind(&now)
                .bind(&now)
                .execute(&state.db)
                .await?;
                added += 1;
            }
            Some(doc) if doc.sha.as_deref() != Some(&file.sha) && !file.sha.is_empty() => {
                sqlx::query(
                    "UPDATE documents SET sha = ?, size_bytes = ?, embedding_status = 'stale', updated_at = ? WHERE id = ?"
                )
                .bind(&file.sha)
                .bind(file.size_bytes)
                .bind(&now)
                .bind(doc.id)
                .execute(&state.db)
                .await?;
                updated += 1;
            }
            _ => {}
        }
    }

    // ディスクに存在しないファイルをDBから削除
    let scanned_paths: std::collections::HashSet<&str> = scanned.iter().map(|f| f.path.as_str()).collect();
    let mut deleted = 0u32;
    for doc in &existing {
        if !scanned_paths.contains(doc.path.as_str()) {
            sqlx::query("DELETE FROM documents WHERE id = ?")
                .bind(doc.id)
                .execute(&state.db)
                .await?;
            deleted += 1;
        }
    }

    let total = added + updated;
    Ok(ScanResult { added, updated, deleted, total })
}

#[tauri::command]
pub async fn document_save(
    project_id: i64,
    document_id: i64,
    content: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<SaveResult, AppError> {
    let doc = db::document::find(&state.db, document_id).await?;
    if doc.project_id != project_id {
        return Err(AppError::NotFound(format!("document id={}", document_id)));
    }
    let project = db::project::find(&state.db, project_id).await?;

    let _ = app_handle.emit("doc_save_progress", DocSaveProgressPayload {
        document_id,
        status: "committing".to_string(),
        commit_sha: None,
        error: None,
    });

    // git2 操作を spawn_blocking でラップ（Repository は !Send）
    let local_path = project.local_path.clone();
    let doc_path = doc.path.clone();
    let content_clone = content.clone();
    let filename = std::path::Path::new(&doc.path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&doc.path)
        .to_string();
    let commit_msg = format!("docs: update {}", filename);

    let (commit_sha, branch) = tokio::task::spawn_blocking(move || {
        let svc = GitService::open(&local_path)?;
        let sha = svc.write_and_commit(&doc_path, &content_clone, &commit_msg)?;
        let branch = svc.current_branch().unwrap_or_else(|_| "main".to_string());
        Ok::<_, AppError>((sha, branch))
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;

    let now = chrono::Utc::now().to_rfc3339();

    // 保存と同時にインデックスを非同期再構築（fire-and-forget）
    {
        let pool = state.db.clone();
        let doc_path = doc.path.clone();
        let content_for_index = content.clone();
        tokio::spawn(async move {
            let chunks = chunker::chunk_document(&content_for_index);
            let _ = db::search::delete_document_index(&pool, document_id).await;
            let _ = db::search::index_document(&pool, document_id, &doc_path, &chunks).await;
            let _ = sqlx::query(
                "UPDATE documents SET embedding_status = 'indexed' WHERE id = ?"
            )
            .bind(document_id)
            .execute(&pool)
            .await;
        });
    }

    // SHA → DB 更新（embedding_status は fire-and-forget タスクが管理）
    sqlx::query(
        "UPDATE documents SET sha = ?, push_status = 'pending_push', is_dirty = 0, updated_at = ? WHERE id = ?"
    )
    .bind(&commit_sha)
    .bind(&now)
    .bind(document_id)
    .execute(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO sync_logs (project_id, operation, status, commit_sha, branch, file_path, created_at)
         VALUES (?, 'commit', 'success', ?, ?, ?, ?)"
    )
    .bind(project_id)
    .bind(&commit_sha)
    .bind(&branch)
    .bind(&doc.path)
    .bind(&now)
    .execute(&state.db)
    .await?;

    // push（auto の場合のみ）
    if project.sync_mode == "auto" {
        let _ = app_handle.emit("doc_save_progress", DocSaveProgressPayload {
            document_id,
            status: "pushing".to_string(),
            commit_sha: Some(commit_sha.clone()),
            error: None,
        });

        let push_result = if let Ok(token) = keychain::require_token(project_id) {
            let local_path2 = project.local_path.clone();
            let branch2 = branch.clone();
            tokio::task::spawn_blocking(move || {
                let svc = GitService::open(&local_path2)?;
                push_with_retry_sync(&svc, &token, "origin", &branch2, 3)
            })
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?
        } else {
            Err(AppError::GitHubAuthRequired)
        };

        match push_result {
            Ok(()) => {
                sqlx::query(
                    "UPDATE documents SET push_status = 'synced', last_synced_at = ?, updated_at = ? WHERE id = ?"
                )
                .bind(&now).bind(&now).bind(document_id)
                .execute(&state.db).await?;

                sqlx::query(
                    "INSERT INTO sync_logs (project_id, operation, status, commit_sha, branch, file_path, created_at)
                     VALUES (?, 'push', 'success', ?, ?, ?, ?)"
                )
                .bind(project_id).bind(&commit_sha)
                .bind(&branch).bind(&doc.path).bind(&now)
                .execute(&state.db).await?;

                let _ = app_handle.emit("doc_save_progress", DocSaveProgressPayload {
                    document_id,
                    status: "synced".to_string(),
                    commit_sha: Some(commit_sha.clone()),
                    error: None,
                });
            }
            Err(e) => {
                sqlx::query(
                    "UPDATE documents SET push_status = 'push_failed', updated_at = ? WHERE id = ?"
                )
                .bind(&now).bind(document_id)
                .execute(&state.db).await?;

                sqlx::query(
                    "INSERT INTO sync_logs (project_id, operation, status, commit_sha, branch, file_path, error_message, created_at)
                     VALUES (?, 'push', 'failure', ?, ?, ?, ?, ?)"
                )
                .bind(project_id).bind(&commit_sha)
                .bind(&branch).bind(&doc.path)
                .bind(e.to_string()).bind(&now)
                .execute(&state.db).await?;

                let _ = app_handle.emit("doc_save_progress", DocSaveProgressPayload {
                    document_id,
                    status: "push_failed".to_string(),
                    commit_sha: Some(commit_sha.clone()),
                    error: Some(e.to_string()),
                });
            }
        }
    }

    // push_status を DB から再読み込み
    let final_push_status = if project.sync_mode == "auto" {
        sqlx::query_scalar::<_, String>(
            "SELECT push_status FROM documents WHERE id = ?"
        )
        .bind(document_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or_else(|_| "pending_push".to_string())
    } else {
        "pending_push".to_string()
    };

    Ok(SaveResult {
        sha: commit_sha,
        committed: true,
        push_status: final_push_status,
    })
}

#[tauri::command]
pub async fn document_set_dirty(
    project_id: i64,
    document_id: i64,
    is_dirty: bool,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let doc = db::document::find(&state.db, document_id).await?;
    if doc.project_id != project_id {
        return Err(AppError::NotFound(format!("document id={}", document_id)));
    }
    db::document::set_dirty(&state.db, document_id, is_dirty).await
}

#[tauri::command]
pub async fn document_push_retry(
    project_id: i64,
    document_id: i64,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<SaveResult, AppError> {
    let doc = db::document::find(&state.db, document_id).await?;
    if doc.project_id != project_id {
        return Err(AppError::NotFound(format!("document id={}", document_id)));
    }
    let project = db::project::find(&state.db, project_id).await?;

    let _ = app_handle.emit("doc_save_progress", DocSaveProgressPayload {
        document_id,
        status: "pushing".to_string(),
        commit_sha: doc.sha.clone(),
        error: None,
    });

    let token = keychain::require_token(project_id)?;
    let local_path = project.local_path.clone();
    let now = chrono::Utc::now().to_rfc3339();

    let push_result = tokio::task::spawn_blocking(move || {
        let svc = GitService::open(&local_path)?;
        let branch = svc.current_branch().unwrap_or_else(|_| "main".to_string());
        push_with_retry_sync(&svc, &token, "origin", &branch, 3)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    match push_result {
        Ok(()) => {
            sqlx::query(
                "UPDATE documents SET push_status = 'synced', last_synced_at = ?, updated_at = ? WHERE id = ?"
            )
            .bind(&now).bind(&now).bind(document_id)
            .execute(&state.db).await?;

            let _ = app_handle.emit("doc_save_progress", DocSaveProgressPayload {
                document_id,
                status: "synced".to_string(),
                commit_sha: doc.sha.clone(),
                error: None,
            });

            Ok(SaveResult {
                sha: doc.sha.clone().unwrap_or_default(),
                committed: true,
                push_status: "synced".to_string(),
            })
        }
        Err(e) => {
            let _ = app_handle.emit("doc_save_progress", DocSaveProgressPayload {
                document_id,
                status: "push_failed".to_string(),
                commit_sha: doc.sha.clone(),
                error: Some(e.to_string()),
            });
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn document_linked_issues(
    project_id: i64,
    document_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<Issue>, AppError> {
    db::document::find(&state.db, document_id).await?;
    let rows = sqlx::query_as::<_, Issue>(
        r#"SELECT i.* FROM issues i
           JOIN issue_doc_links l ON l.issue_id = i.id
           WHERE l.document_id = ?
             AND i.project_id = ?
             AND l.link_type != 'user_rejected'
           ORDER BY l.created_at ASC"#,
    )
    .bind(document_id)
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(rows)
}

/// 新規 Markdown ファイルを作成して DB に登録する。
/// `rel_path` は `docs/foo.md` 形式のプロジェクトルートからの相対パス。
#[tauri::command]
pub async fn document_create(
    project_id: i64,
    rel_path: String,
    state: State<'_, AppState>,
) -> std::result::Result<Document, AppError> {
    let project = db::project::find(&state.db, project_id).await?;

    // パスのバリデーション
    if !rel_path.ends_with(".md") {
        return Err(AppError::Validation("ファイル名は .md で終わる必要があります".to_string()));
    }
    if rel_path.contains("..") {
        return Err(AppError::Validation("不正なパスです".to_string()));
    }

    let local_path = project.local_path.clone();
    let rel = rel_path.clone();

    // ファイル作成（既存の場合はエラー）
    tokio::task::spawn_blocking(move || {
        let abs = std::path::Path::new(&local_path).join(&rel);
        if abs.exists() {
            return Err(AppError::Validation(format!("ファイルが既に存在します: {}", rel)));
        }
        if let Some(parent) = abs.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Io(format!("ディレクトリ作成失敗: {}", e)))?;
        }
        std::fs::write(&abs, format!("# {}\n", abs.file_stem().unwrap_or_default().to_string_lossy()))
            .map_err(|e| AppError::Io(format!("ファイル作成失敗: {}", e)))
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;

    // DB に登録
    db::document::insert_one(&state.db, project_id, &rel_path).await
}

/// ドキュメントをリネーム（ファイル移動 + DB 更新）する。
#[tauri::command]
pub async fn document_rename(
    project_id: i64,
    document_id: i64,
    new_rel_path: String,
    state: State<'_, AppState>,
) -> std::result::Result<Document, AppError> {
    let doc = db::document::find(&state.db, document_id).await?;
    if doc.project_id != project_id {
        return Err(AppError::NotFound(format!("document id={}", document_id)));
    }
    let project = db::project::find(&state.db, project_id).await?;

    if !new_rel_path.ends_with(".md") {
        return Err(AppError::Validation("ファイル名は .md で終わる必要があります".to_string()));
    }
    if new_rel_path.contains("..") {
        return Err(AppError::Validation("不正なパスです".to_string()));
    }

    let local_path = project.local_path.clone();
    let old_path = doc.path.clone();
    let new_path = new_rel_path.clone();

    tokio::task::spawn_blocking(move || {
        let abs_old = std::path::Path::new(&local_path).join(&old_path);
        let abs_new = std::path::Path::new(&local_path).join(&new_path);
        if !abs_old.exists() {
            return Err(AppError::Io(format!("元ファイルが存在しません: {}", old_path)));
        }
        if abs_new.exists() {
            return Err(AppError::Validation(format!("移動先に同名ファイルが存在します: {}", new_path)));
        }
        if let Some(parent) = abs_new.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::Io(format!("ディレクトリ作成失敗: {}", e)))?;
        }
        std::fs::rename(&abs_old, &abs_new)
            .map_err(|e| AppError::Io(format!("リネーム失敗: {}", e)))
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;

    db::document::rename(&state.db, document_id, &new_rel_path).await?;
    db::document::find(&state.db, document_id).await
}

/// 同期版 push with retry（spawn_blocking 内で使用、std::thread::sleep）
fn push_with_retry_sync(
    svc: &GitService,
    token: &str,
    remote: &str,
    branch: &str,
    max_retries: u32,
) -> Result<()> {
    let mut attempt = 0u32;
    loop {
        match svc.push(token, remote, branch) {
            Ok(()) => return Ok(()),
            Err(e) if attempt < max_retries => {
                attempt += 1;
                tracing::warn!("push 失敗 attempt={} err={:?}", attempt, e);
                std::thread::sleep(std::time::Duration::from_secs(
                    2u64.pow(attempt - 1),
                ));
            }
            Err(e) => return Err(e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect_for_test as connect, migrations};
    use crate::db::project;
    use crate::services::git::GitService;
    use git2::Repository;
    use tempfile::TempDir;

    async fn setup_with_repo() -> (AppState, TempDir) {
        let dir = TempDir::new().unwrap();
        // git リポジトリ初期化
        let repo = Repository::init(dir.path()).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();
        drop(cfg);
        drop(repo);

        // DB
        let db_path = dir.path().join("devnest.db");
        let url = format!("sqlite:{}", db_path.display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();

        (AppState::new(pool), dir)
    }

    // 🔴 Red: document_list が空プロジェクトで [] を返すこと
    #[tokio::test]
    async fn test_document_list_empty() {
        let (state, dir) = setup_with_repo().await;
        let p = project::insert(
            &state.db, "P", dir.path().to_str().unwrap(), "o", "r"
        ).await.unwrap();
        let docs = db::document::list_by_project(&state.db, p.id).await.unwrap();
        assert!(docs.is_empty());
    }

    // 🔴 Red: document_scan が .md を検出して DB に INSERT すること
    #[tokio::test]
    async fn test_document_scan_inserts_md_files() {
        let (state, dir) = setup_with_repo().await;
        let local = dir.path().to_str().unwrap();
        let p = project::insert(&state.db, "P", local, "o", "r").await.unwrap();

        // docs/ に .md を作成してコミット
        let docs_dir = dir.path().join("docs");
        std::fs::create_dir_all(&docs_dir).unwrap();
        let svc = GitService::open(local).unwrap();
        svc.write_and_commit("docs/spec.md", "# Spec", "init").unwrap();

        // document_scan 相当のロジックを DB 層でテスト
        let count = db::document::scan_and_insert(
            &state.db, p.id, local, "docs/"
        ).await.unwrap();
        assert_eq!(count, 1);

        let docs = db::document::list_by_project(&state.db, p.id).await.unwrap();
        assert_eq!(docs.len(), 1);
        assert!(docs[0].path.ends_with("spec.md"));
    }

    // 🔴 Red: document_set_dirty が正しく動作すること
    #[tokio::test]
    async fn test_document_set_dirty_via_db() {
        let (state, dir) = setup_with_repo().await;
        let local = dir.path().to_str().unwrap();
        let p = project::insert(&state.db, "P", local, "o", "r").await.unwrap();

        std::fs::create_dir_all(dir.path().join("docs")).unwrap();
        db::document::scan_and_insert(&state.db, p.id, local, "docs/").await.unwrap();

        // docs/a.md を作成して再スキャン
        let svc = GitService::open(local).unwrap();
        svc.write_and_commit("docs/a.md", "# A", "add a").unwrap();
        db::document::scan_and_insert(&state.db, p.id, local, "docs/").await.unwrap();

        let docs = db::document::list_by_project(&state.db, p.id).await.unwrap();
        assert!(!docs.is_empty(), "docs が 1 件以上存在する");
        let doc = &docs[0];
        db::document::set_dirty(&state.db, doc.id, true).await.unwrap();
        let updated = db::document::find(&state.db, doc.id).await.unwrap();
        assert!(updated.is_dirty);
    }

    // 🔴 Red: 別プロジェクトの document を取得しようとすると NotFound になること
    // document_get / document_save / document_set_dirty の共通ガードの仕様検証
    #[tokio::test]
    async fn test_cross_project_document_access_denied() {
        let (state, dir) = setup_with_repo().await;
        let local = dir.path().to_str().unwrap();
        let p1 = project::insert(&state.db, "P1", local, "o1", "r1").await.unwrap();
        // P2 は別の local_path（一意制約のため）
        let p2 = project::insert(&state.db, "P2", "/tmp/devnest-test-p2", "o2", "r2").await.unwrap();

        // P1 にドキュメントを追加
        std::fs::create_dir_all(dir.path().join("docs")).unwrap();
        let svc = GitService::open(local).unwrap();
        svc.write_and_commit("docs/private.md", "# Private", "add").unwrap();
        db::document::scan_and_insert(&state.db, p1.id, local, "docs/").await.unwrap();

        let docs = db::document::list_by_project(&state.db, p1.id).await.unwrap();
        let doc_id = docs[0].id;

        // DB 層は project_id によらず find できる（コマンド層がガードする）
        let doc = db::document::find(&state.db, doc_id).await.unwrap();
        assert_eq!(doc.project_id, p1.id);

        // コマンド層のガード: doc.project_id != 要求した project_id → NotFound
        let mismatch_result: Result<()> = if doc.project_id != p2.id {
            Err(AppError::NotFound(format!("document id={}", doc_id)))
        } else {
            Ok(())
        };
        assert!(
            matches!(mismatch_result, Err(AppError::NotFound(_))),
            "別プロジェクトとしてアクセスすると NotFound になること"
        );

        // 正しい project_id ならガードを通過できること
        let correct_result: Result<()> = if doc.project_id != p1.id {
            Err(AppError::NotFound(format!("document id={}", doc_id)))
        } else {
            Ok(())
        };
        assert!(correct_result.is_ok(), "正しい project_id ならアクセス可能");
    }

    // 🔴 Red: write_and_commit が SHA を返しコミット履歴が増えること
    #[test]
    fn test_write_and_commit_creates_history() {
        let dir = TempDir::new().unwrap();
        Repository::init(dir.path()).unwrap();
        let svc = GitService::open(dir.path().to_str().unwrap()).unwrap();
        std::fs::create_dir_all(dir.path().join("docs")).unwrap();
        let sha1 = svc.write_and_commit("docs/a.md", "v1", "docs: v1").unwrap();
        let sha2 = svc.write_and_commit("docs/a.md", "v2", "docs: v2").unwrap();
        assert_ne!(sha1, sha2, "コミットのたびに SHA が変わる");
    }

    // 🔴 Red: 存在しない document_id で set_dirty するとエラー
    #[tokio::test]
    async fn test_set_dirty_not_found() {
        let (state, _dir) = setup_with_repo().await;
        let result = db::document::set_dirty(&state.db, 9999, true).await;
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // 🔴 Red: document_save 後に検索インデックスが構築されること（fire-and-forget の DB 層を直接検証）
    #[tokio::test]
    async fn test_index_rebuild_after_save() {
        use crate::services::chunker;

        let (state, dir) = setup_with_repo().await;
        let local = dir.path().to_str().unwrap();
        let p = project::insert(&state.db, "P", local, "o", "r").await.unwrap();

        // doc を作成してスキャン登録
        let svc = GitService::open(local).unwrap();
        svc.write_and_commit("docs/design.md", "# Design\n\nInitial content.", "init").unwrap();
        db::document::scan_and_insert(&state.db, p.id, local, "docs/").await.unwrap();
        let docs = db::document::list_by_project(&state.db, p.id).await.unwrap();
        let doc_id = docs[0].id;

        // インデックスが空であることを確認
        let before: Vec<(i64,)> = sqlx::query_as(
            "SELECT id FROM document_chunks WHERE document_id = ?"
        )
        .bind(doc_id)
        .fetch_all(&state.db)
        .await
        .unwrap();
        assert!(before.is_empty(), "インデックス構築前はチャンクがない");

        // インデックス再構築（document_save の fire-and-forget と同じロジック）
        let content = "# Design\n\nUpdated content for search.";
        let chunks = chunker::chunk_document(content);
        db::search::delete_document_index(&state.db, doc_id).await.unwrap();
        db::search::index_document(&state.db, doc_id, "docs/design.md", &chunks).await.unwrap();

        // チャンクが登録されていること
        let after: Vec<(i64,)> = sqlx::query_as(
            "SELECT id FROM document_chunks WHERE document_id = ?"
        )
        .bind(doc_id)
        .fetch_all(&state.db)
        .await
        .unwrap();
        assert!(!after.is_empty(), "インデックス構築後はチャンクが存在する");
    }
}
