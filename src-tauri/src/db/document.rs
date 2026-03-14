use crate::error::{AppError, Result};
use crate::models::document::{Document, SyncLog};
use super::DbPool;
use chrono::Utc;

pub async fn find(pool: &DbPool, id: i64) -> Result<Document> {
    sqlx::query_as::<_, Document>("SELECT * FROM documents WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("document id={}", id)))
}

pub async fn list_by_project(pool: &DbPool, project_id: i64) -> Result<Vec<Document>> {
    let rows = sqlx::query_as::<_, Document>(
        "SELECT * FROM documents WHERE project_id = ? ORDER BY path ASC"
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

pub async fn set_dirty(pool: &DbPool, document_id: i64, is_dirty: bool) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let affected = sqlx::query(
        "UPDATE documents SET is_dirty = ?, updated_at = ? WHERE id = ?"
    )
    .bind(is_dirty as i64)
    .bind(&now)
    .bind(document_id)
    .execute(pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound(format!("document id={}", document_id)));
    }
    Ok(())
}

pub async fn update_push_status(
    pool: &DbPool,
    document_id: i64,
    status: &str,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE documents SET push_status = ?, updated_at = ? WHERE id = ?"
    )
    .bind(status)
    .bind(&now)
    .bind(document_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// プロジェクト登録時・document_scan 時に .md ファイルを走査して documents に upsert する
/// 戻り値: 挿入/更新されたファイル件数
pub async fn scan_and_insert(
    pool: &DbPool,
    project_id: i64,
    local_path: &str,
    docs_root: &str,
) -> Result<u32> {
    let docs_dir = std::path::Path::new(local_path).join(docs_root);
    if !docs_dir.exists() {
        return Ok(0);
    }

    let now = Utc::now().to_rfc3339();
    let mut count = 0u32;

    for entry in walkdir::WalkDir::new(&docs_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path().extension().and_then(|s| s.to_str()) == Some("md")
        })
    {
        let abs_path = entry.path();
        let rel_path = abs_path
            .strip_prefix(local_path)
            .unwrap_or(abs_path)
            .to_string_lossy()
            .to_string();

        let size_bytes = entry.metadata().map(|m| m.len() as i64).ok();

        sqlx::query(
            r#"
            INSERT INTO documents (project_id, path, size_bytes, embedding_status, push_status, created_at, updated_at)
            VALUES (?, ?, ?, 'pending', 'synced', ?, ?)
            ON CONFLICT(project_id, path) DO UPDATE SET
                size_bytes = excluded.size_bytes,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(project_id)
        .bind(&rel_path)
        .bind(size_bytes)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;

        count += 1;
    }

    Ok(count)
}

/// 新規ドキュメントを DB に挿入する
pub async fn insert_one(
    pool: &DbPool,
    project_id: i64,
    path: &str,
) -> Result<Document> {
    let now = Utc::now().to_rfc3339();
    let id: (i64,) = sqlx::query_as(
        r#"INSERT INTO documents (project_id, path, size_bytes, embedding_status, push_status, created_at, updated_at)
           VALUES (?, ?, 0, 'pending', 'synced', ?, ?) RETURNING id"#,
    )
    .bind(project_id)
    .bind(path)
    .bind(&now)
    .bind(&now)
    .fetch_one(pool)
    .await?;
    find(pool, id.0).await
}

/// ドキュメントのパスを変更する（リネーム）
pub async fn rename(
    pool: &DbPool,
    document_id: i64,
    new_path: &str,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let affected = sqlx::query(
        "UPDATE documents SET path = ?, updated_at = ? WHERE id = ?"
    )
    .bind(new_path)
    .bind(&now)
    .bind(document_id)
    .execute(pool)
    .await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound(format!("document id={}", document_id)));
    }
    Ok(())
}

pub async fn sync_log_list(pool: &DbPool, project_id: i64, limit: i64) -> Result<Vec<SyncLog>> {
    let rows = sqlx::query_as::<_, SyncLog>(
        "SELECT * FROM sync_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .bind(project_id)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect, migrations};
    use crate::db::project;
    use tempfile::TempDir;

    async fn setup() -> (DbPool, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let url = format!("sqlite:{}", db_path.display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (pool, dir)
    }

    // 🔴 Red: scan_and_insert が docs/ なしでも 0 件を返すこと
    #[tokio::test]
    async fn test_scan_and_insert_no_docs_dir_returns_zero() {
        let (pool, dir) = setup().await;
        let p = project::insert(&pool, "P", dir.path().to_str().unwrap(), "o", "r")
            .await
            .unwrap();
        let count = scan_and_insert(&pool, p.id, dir.path().to_str().unwrap(), "docs/")
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    // 🔴 Red: scan_and_insert が .md ファイルを検出して INSERT すること
    #[tokio::test]
    async fn test_scan_and_insert_detects_md_files() {
        let (pool, dir) = setup().await;
        // docs/ と .md ファイルを作成
        let docs = dir.path().join("docs");
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(docs.join("spec.md"), "# Spec").unwrap();
        std::fs::write(docs.join("design.md"), "# Design").unwrap();
        std::fs::write(docs.join("ignore.txt"), "not md").unwrap();

        let p = project::insert(&pool, "P", dir.path().to_str().unwrap(), "o", "r")
            .await
            .unwrap();
        let count = scan_and_insert(&pool, p.id, dir.path().to_str().unwrap(), "docs/")
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    // 🔴 Red: set_dirty が正しく更新されること
    #[tokio::test]
    async fn test_set_dirty() {
        let (pool, dir) = setup().await;
        let docs = dir.path().join("docs");
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(docs.join("a.md"), "# A").unwrap();
        let p = project::insert(&pool, "P", dir.path().to_str().unwrap(), "o", "r")
            .await
            .unwrap();
        scan_and_insert(&pool, p.id, dir.path().to_str().unwrap(), "docs/")
            .await
            .unwrap();

        let docs_list = list_by_project(&pool, p.id).await.unwrap();
        let doc = &docs_list[0];
        set_dirty(&pool, doc.id, true).await.unwrap();

        let updated = find(&pool, doc.id).await.unwrap();
        assert!(updated.is_dirty);
    }

    // 🔴 Red: scan_and_insert が冪等であること（2回実行しても件数が変わらない）
    #[tokio::test]
    async fn test_scan_and_insert_is_idempotent() {
        let (pool, dir) = setup().await;
        let docs = dir.path().join("docs");
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(docs.join("a.md"), "# A").unwrap();
        let p = project::insert(&pool, "P", dir.path().to_str().unwrap(), "o", "r")
            .await
            .unwrap();

        scan_and_insert(&pool, p.id, dir.path().to_str().unwrap(), "docs/").await.unwrap();
        scan_and_insert(&pool, p.id, dir.path().to_str().unwrap(), "docs/").await.unwrap();

        let docs_list = list_by_project(&pool, p.id).await.unwrap();
        assert_eq!(docs_list.len(), 1, "冪等: 2回実行しても1件のまま");
    }

    // 🔴 Red: 存在しない document_id は NotFound エラーを返すこと
    #[tokio::test]
    async fn test_find_not_found_returns_error() {
        let (pool, _dir) = setup().await;
        let result = find(&pool, 9999).await;
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // 🔴 Red: find は project_id でフィルタしない（コマンド層でチェックするため）
    // → find でドキュメントを取得し、project_id が期待値と一致することを確認
    #[tokio::test]
    async fn test_find_returns_correct_project_id() {
        let (pool, dir) = setup().await;
        let docs_dir = dir.path().join("docs");
        std::fs::create_dir_all(&docs_dir).unwrap();
        std::fs::write(docs_dir.join("spec.md"), "# Spec").unwrap();

        let p1 = project::insert(&pool, "P1", dir.path().to_str().unwrap(), "o1", "r1").await.unwrap();
        let p2 = project::insert(&pool, "P2", "/other", "o2", "r2").await.unwrap();

        scan_and_insert(&pool, p1.id, dir.path().to_str().unwrap(), "docs/").await.unwrap();
        let docs_list = list_by_project(&pool, p1.id).await.unwrap();
        assert_eq!(docs_list.len(), 1);

        // find は project_id によらずドキュメントを返す
        let doc = find(&pool, docs_list[0].id).await.unwrap();
        assert_eq!(doc.project_id, p1.id);
        // P2 のコンテキストで使用しようとすると不一致になること
        assert_ne!(doc.project_id, p2.id, "別プロジェクトとして渡すと不一致になる");
    }

    // 🔴 Red: list_by_project がプロジェクトスコープで分離されること
    #[tokio::test]
    async fn test_list_by_project_is_scoped() {
        let (pool, dir) = setup().await;
        let docs_dir = dir.path().join("docs");
        std::fs::create_dir_all(&docs_dir).unwrap();
        std::fs::write(docs_dir.join("a.md"), "# A").unwrap();
        std::fs::write(docs_dir.join("b.md"), "# B").unwrap();

        let p1 = project::insert(&pool, "P1", dir.path().to_str().unwrap(), "o1", "r1").await.unwrap();
        let p2 = project::insert(&pool, "P2", "/other", "o2", "r2").await.unwrap();

        scan_and_insert(&pool, p1.id, dir.path().to_str().unwrap(), "docs/").await.unwrap();

        let docs_p1 = list_by_project(&pool, p1.id).await.unwrap();
        let docs_p2 = list_by_project(&pool, p2.id).await.unwrap();

        assert_eq!(docs_p1.len(), 2, "P1 は 2 件");
        assert_eq!(docs_p2.len(), 0, "P2 は 0 件（スコープが分離されている）");
    }
}
