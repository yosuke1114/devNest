use crate::error::Result;
use crate::models::conflict::ConflictFileRow;
use super::DbPool;

/// コンフリクトファイルを upsert する（同一 project_id + file_path を更新）
pub async fn upsert(
    pool: &DbPool,
    project_id: i64,
    file_path: &str,
    is_managed: bool,
) -> Result<i64> {
    let now = chrono::Utc::now().to_rfc3339();
    let id = sqlx::query_scalar(
        "INSERT INTO conflict_files (project_id, file_path, is_managed, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id, file_path) DO UPDATE SET
           is_managed = excluded.is_managed,
           resolution = NULL,
           resolved_at = NULL
         RETURNING id",
    )
    .bind(project_id)
    .bind(file_path)
    .bind(is_managed as i64)
    .bind(&now)
    .fetch_one(pool)
    .await?;
    Ok(id)
}

/// プロジェクトの未解消コンフリクトファイル一覧を返す
pub async fn list_unresolved(pool: &DbPool, project_id: i64) -> Result<Vec<ConflictFileRow>> {
    let rows = sqlx::query_as::<_, ConflictFileRow>(
        "SELECT id, project_id, file_path, is_managed, resolution, resolved_at, created_at
         FROM conflict_files
         WHERE project_id = ? AND resolved_at IS NULL
         ORDER BY created_at",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// プロジェクトの全コンフリクトファイル（解消済み含む）を返す
pub async fn list_all(pool: &DbPool, project_id: i64) -> Result<Vec<ConflictFileRow>> {
    let rows = sqlx::query_as::<_, ConflictFileRow>(
        "SELECT id, project_id, file_path, is_managed, resolution, resolved_at, created_at
         FROM conflict_files
         WHERE project_id = ?
         ORDER BY created_at",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// ファイルの解消状態を更新する
pub async fn mark_resolved(pool: &DbPool, file_id: i64, resolution: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE conflict_files SET resolution = ?, resolved_at = ? WHERE id = ?",
    )
    .bind(resolution)
    .bind(&now)
    .bind(file_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// プロジェクトの全コンフリクトを削除する（解消後クリーンアップ）
pub async fn delete_all(pool: &DbPool, project_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM conflict_files WHERE project_id = ?")
        .bind(project_id)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect_for_test as connect, migrations};
    use tempfile::NamedTempFile;

    async fn setup() -> DbPool {
        let file = NamedTempFile::with_suffix(".db").unwrap();
        let url = format!("sqlite:{}", file.path().display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        std::mem::forget(file);
        pool
    }

    async fn insert_project(pool: &DbPool) -> i64 {
        sqlx::query_scalar(
            "INSERT INTO projects (name, repo_owner, repo_name, local_path, created_at, updated_at)
             VALUES ('p','o','r','/tmp/c','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z') RETURNING id",
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    // Red: upsert → list_unresolved でファイルが返ること
    #[tokio::test]
    async fn test_upsert_and_list() {
        let pool = setup().await;
        let pid = insert_project(&pool).await;
        upsert(&pool, pid, "docs/arch.md", true).await.unwrap();
        let list = list_unresolved(&pool, pid).await.unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].is_managed);
    }

    // Red: mark_resolved で resolved_at が設定されること
    #[tokio::test]
    async fn test_mark_resolved() {
        let pool = setup().await;
        let pid = insert_project(&pool).await;
        let id = upsert(&pool, pid, "docs/spec.md", true).await.unwrap();
        mark_resolved(&pool, id, "ours").await.unwrap();
        let list = list_unresolved(&pool, pid).await.unwrap();
        assert!(list.is_empty(), "解消後は unresolved から除外される");
    }

    // Red: upsert が同一パスに対して UPSERT になること
    #[tokio::test]
    async fn test_upsert_idempotent() {
        let pool = setup().await;
        let pid = insert_project(&pool).await;
        let id1 = upsert(&pool, pid, "docs/arch.md", true).await.unwrap();
        let id2 = upsert(&pool, pid, "docs/arch.md", true).await.unwrap();
        assert_eq!(id1, id2, "同一パスなら同じ id が返る");
        let all = list_all(&pool, pid).await.unwrap();
        assert_eq!(all.len(), 1);
    }

    // Red: delete_all でプロジェクトのコンフリクトが全件削除されること
    #[tokio::test]
    async fn test_delete_all() {
        let pool = setup().await;
        let pid = insert_project(&pool).await;
        upsert(&pool, pid, "docs/a.md", true).await.unwrap();
        upsert(&pool, pid, "src/main.rs", false).await.unwrap();
        delete_all(&pool, pid).await.unwrap();
        let list = list_all(&pool, pid).await.unwrap();
        assert!(list.is_empty());
    }
}
