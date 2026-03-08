pub mod cleanup;
pub mod conflict;
pub mod document;
pub mod issue;
pub mod migrations;
pub mod notifications;
pub mod pr;
pub mod project;
pub mod search;
pub mod terminal;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::str::FromStr;
use crate::error::Result;

pub type DbPool = SqlitePool;

/// SQLite プールを開いて WAL モード・外部キーを有効化する
pub async fn connect(db_url: &str) -> Result<DbPool> {
    let opts = SqliteConnectOptions::from_str(db_url)?
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await?;

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    // Red: connect() が成功して WAL モードになること
    #[tokio::test]
    async fn test_connect_enables_wal() {
        let file = NamedTempFile::with_suffix(".db").unwrap();
        let url = format!("sqlite:{}", file.path().display());
        let pool = connect(&url).await.unwrap();

        let (mode,): (String,) = sqlx::query_as("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(mode, "wal");
    }

    // Red: foreign_keys が有効になること
    #[tokio::test]
    async fn test_connect_enables_foreign_keys() {
        let file = NamedTempFile::with_suffix(".db").unwrap();
        let url = format!("sqlite:{}", file.path().display());
        let pool = connect(&url).await.unwrap();

        let (fk,): (i64,) = sqlx::query_as("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(fk, 1);
    }

    // Red: 存在しないディレクトリへの接続はエラーになること
    #[tokio::test]
    async fn test_connect_nonexistent_parent_dir_returns_error() {
        let result = connect("sqlite:/nonexistent_dir_xyz/test.db").await;
        assert!(result.is_err(), "存在しない親ディレクトリへの接続はエラーになるべき");
    }
}
