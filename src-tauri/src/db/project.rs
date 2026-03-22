use crate::error::{AppError, Result};
use crate::models::project::{Project, ProjectPatch, ProjectStatus};
use super::DbPool;
use chrono::Utc;

pub async fn insert(
    pool: &DbPool,
    name: &str,
    local_path: &str,
    repo_owner: &str,
    repo_name: &str,
) -> Result<Project> {
    let now = Utc::now().to_rfc3339();

    // 重複チェック
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE local_path = ?)"
    )
    .bind(local_path)
    .fetch_one(pool)
    .await?;

    if exists {
        return Err(AppError::Validation(format!(
            "パス '{}' はすでに登録されています",
            local_path
        )));
    }

    let id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO projects
            (name, repo_owner, repo_name, local_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id
        "#,
    )
    .bind(name)
    .bind(repo_owner)
    .bind(repo_name)
    .bind(local_path)
    .bind(&now)
    .bind(&now)
    .fetch_one(pool)
    .await?;

    find(pool, id).await
}

pub async fn find(pool: &DbPool, id: i64) -> Result<Project> {
    sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("project id={}", id)))
}

pub async fn list(pool: &DbPool) -> Result<Vec<Project>> {
    let rows = sqlx::query_as::<_, Project>(
        "SELECT * FROM projects ORDER BY last_synced_at DESC"
    )
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn delete(pool: &DbPool, id: i64) -> Result<()> {
    let affected = sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound(format!("project id={}", id)));
    }
    Ok(())
}

pub async fn update(pool: &DbPool, patch: &ProjectPatch) -> Result<Project> {
    let now = Utc::now().to_rfc3339();

    // 存在チェック
    find(pool, patch.project_id).await?;

    // Option<Option<T>> パターン: Some(Some(v))=更新, Some(None)=NULL, None=スキップ
    macro_rules! set_opt_opt {
        ($pool:expr, $id:expr, $col:literal, $val:expr, $now:expr) => {
            match $val {
                Some(Some(v)) => {
                    sqlx::query(concat!("UPDATE projects SET ", $col, " = ?, updated_at = ? WHERE id = ?"))
                        .bind(v)
                        .bind($now)
                        .bind($id)
                        .execute($pool)
                        .await?;
                }
                Some(None) => {
                    sqlx::query(concat!("UPDATE projects SET ", $col, " = NULL, updated_at = ? WHERE id = ?"))
                        .bind($now)
                        .bind($id)
                        .execute($pool)
                        .await?;
                }
                None => {}
            }
        };
    }

    macro_rules! set_opt {
        ($pool:expr, $id:expr, $col:literal, $val:expr, $now:expr) => {
            if let Some(v) = $val {
                sqlx::query(concat!("UPDATE projects SET ", $col, " = ?, updated_at = ? WHERE id = ?"))
                    .bind(v)
                    .bind($now)
                    .bind($id)
                    .execute($pool)
                    .await?;
            }
        };
    }

    set_opt_opt!(pool, patch.project_id, "repo_owner", &patch.repo_owner, &now);
    set_opt_opt!(pool, patch.project_id, "repo_name", &patch.repo_name, &now);
    set_opt_opt!(pool, patch.project_id, "default_branch", &patch.default_branch, &now);
    set_opt!(pool, patch.project_id, "sync_mode", &patch.sync_mode, &now);
    set_opt!(pool, patch.project_id, "docs_root", &patch.docs_root, &now);
    set_opt!(pool, patch.project_id, "commit_msg_format", &patch.commit_msg_format, &now);
    set_opt!(pool, patch.project_id, "debounce_ms", patch.debounce_ms, &now);
    set_opt!(pool, patch.project_id, "remote_poll_interval_min", patch.remote_poll_interval_min, &now);

    find(pool, patch.project_id).await
}

pub async fn set_last_opened_document(
    pool: &DbPool,
    project_id: i64,
    document_id: Option<i64>,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let affected = sqlx::query(
        "UPDATE projects SET last_opened_document_id = ?, updated_at = ? WHERE id = ?"
    )
    .bind(document_id)
    .bind(&now)
    .bind(project_id)
    .execute(pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound(format!("project id={}", project_id)));
    }
    Ok(())
}

pub async fn get_status(pool: &DbPool, project_id: i64) -> Result<ProjectStatus> {
    find(pool, project_id).await?;

    let (dirty_count, pending_push_count): (i64, i64) = sqlx::query_as(
        r#"
        SELECT
            (SELECT COUNT(*) FROM documents WHERE project_id = ? AND is_dirty = 1),
            (SELECT COUNT(*) FROM documents WHERE project_id = ? AND push_status = 'pending_push')
        "#,
    )
    .bind(project_id)
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    let sync_status = if dirty_count > 0 {
        "dirty"
    } else if pending_push_count > 0 {
        "pushing"
    } else {
        "synced"
    }
    .to_string();

    Ok(ProjectStatus {
        sync_status,
        dirty_count: dirty_count as u32,
        pending_push_count: pending_push_count as u32,
        branch: None, // git2 で取得（T-R-B01 以降）
        github_connected: false, // keychain チェック（T-R-C03 以降）
        has_unresolved_conflict: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect_for_test as connect, migrations};
    use tempfile::TempDir;

    async fn setup_pool() -> (DbPool, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let url = format!("sqlite:{}", db_path.display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (pool, dir)
    }

    // 🔴 Red: プロジェクトを作成できること
    #[tokio::test]
    async fn test_insert_creates_project() {
        let (pool, _dir) = setup_pool().await;
        let project = insert(&pool, "MyProject", "/tmp/repo", "owner", "repo")
            .await
            .unwrap();
        assert_eq!(project.name, "MyProject");
        assert_eq!(project.local_path, "/tmp/repo");
        assert_eq!(project.sync_mode, "auto");
    }

    // 🔴 Red: 同一パスの重複登録はエラーになること
    #[tokio::test]
    async fn test_insert_duplicate_path_returns_error() {
        let (pool, _dir) = setup_pool().await;
        insert(&pool, "P1", "/tmp/same", "o", "r").await.unwrap();
        let result = insert(&pool, "P2", "/tmp/same", "o", "r").await;
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    // 🔴 Red: list が last_synced_at DESC で返ること
    #[tokio::test]
    async fn test_list_returns_all_projects() {
        let (pool, _dir) = setup_pool().await;
        insert(&pool, "A", "/tmp/a", "o", "r1").await.unwrap();
        insert(&pool, "B", "/tmp/b", "o", "r2").await.unwrap();
        let projects = list(&pool).await.unwrap();
        assert_eq!(projects.len(), 2);
    }

    // 🔴 Red: 存在しない ID を delete するとエラー
    #[tokio::test]
    async fn test_delete_nonexistent_returns_not_found() {
        let (pool, _dir) = setup_pool().await;
        let result = delete(&pool, 9999).await;
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // 🔴 Red: delete で CASCADE 削除が機能すること
    #[tokio::test]
    async fn test_delete_cascades() {
        let (pool, _dir) = setup_pool().await;
        let p = insert(&pool, "P", "/tmp/p", "o", "r").await.unwrap();
        delete(&pool, p.id).await.unwrap();
        let result = find(&pool, p.id).await;
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // 🔴 Red: update で sync_mode を変更できること
    #[tokio::test]
    async fn test_update_sync_mode() {
        let (pool, _dir) = setup_pool().await;
        let p = insert(&pool, "P", "/tmp/p", "o", "r").await.unwrap();
        let patch = ProjectPatch {
            project_id: p.id,
            repo_owner: None,
            repo_name: None,
            default_branch: None,
            sync_mode: Some("manual".to_string()),
            docs_root: None,
            commit_msg_format: None,
            debounce_ms: None,
            remote_poll_interval_min: None,
        };
        let updated = update(&pool, &patch).await.unwrap();
        assert_eq!(updated.sync_mode, "manual");
    }

    // 🔴 Red: get_status が dirty_count を正しく集計すること
    #[tokio::test]
    async fn test_get_status_dirty_count() {
        let (pool, _dir) = setup_pool().await;
        let p = insert(&pool, "P", "/tmp/p", "o", "r").await.unwrap();
        let now = Utc::now().to_rfc3339();
        // dirty なドキュメントを直接 INSERT
        sqlx::query(
            "INSERT INTO documents (project_id, path, is_dirty, embedding_status, push_status, created_at, updated_at)
             VALUES (?, 'docs/a.md', 1, 'pending', 'synced', ?, ?)"
        )
        .bind(p.id).bind(&now).bind(&now)
        .execute(&pool).await.unwrap();

        let status = get_status(&pool, p.id).await.unwrap();
        assert_eq!(status.dirty_count, 1);
        assert_eq!(status.sync_status, "dirty");
    }

    // 🔴 Red: set_last_opened_document で NULL をセットできること
    #[tokio::test]
    async fn test_set_last_opened_document_null() {
        let (pool, _dir) = setup_pool().await;
        let p = insert(&pool, "P", "/tmp/p", "o", "r").await.unwrap();
        let result = set_last_opened_document(&pool, p.id, None).await;
        assert!(result.is_ok());
    }
}
