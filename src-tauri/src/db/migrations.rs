use crate::error::Result;
use super::DbPool;

/// マイグレーションを実行する
pub async fn run(pool: &DbPool) -> Result<()> {
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connect_for_test as connect;
    use tempfile::NamedTempFile;

    // Red: マイグレーション後に projects テーブルが存在すること
    #[tokio::test]
    async fn test_migration_creates_projects_table() {
        let file = NamedTempFile::with_suffix(".db").unwrap();
        let url = format!("sqlite:{}", file.path().display());
        let pool = connect(&url).await.unwrap();
        run(&pool).await.unwrap();

        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='projects'"
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1);
    }

    // Red: マイグレーション後に app_settings に初期値が入っていること
    #[tokio::test]
    async fn test_migration_inserts_default_settings() {
        let file = NamedTempFile::with_suffix(".db").unwrap();
        let url = format!("sqlite:{}", file.path().display());
        let pool = connect(&url).await.unwrap();
        run(&pool).await.unwrap();

        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM app_settings WHERE key='app.theme'"
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1);
    }

    // Red: 2回実行してもエラーにならないこと（idempotent）
    #[tokio::test]
    async fn test_migration_is_idempotent() {
        let file = NamedTempFile::with_suffix(".db").unwrap();
        let url = format!("sqlite:{}", file.path().display());
        let pool = connect(&url).await.unwrap();
        run(&pool).await.unwrap();
        let result = run(&pool).await;
        assert!(result.is_ok());
    }
}
