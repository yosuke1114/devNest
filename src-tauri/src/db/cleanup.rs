use crate::error::Result;
use super::DbPool;

/// 起動時クリーンアップ（古いレコード削除・pending_submit 除去）
pub async fn run(pool: &DbPool) -> Result<()> {
    // ① 孤立した pending_submit レビューの削除
    sqlx::query(
        "DELETE FROM pr_reviews WHERE submit_status = 'pending_submit' AND github_id IS NULL"
    )
    .execute(pool)
    .await?;

    // ② 古い sync_logs の削除（30日）
    sqlx::query(
        "DELETE FROM sync_logs WHERE created_at < datetime('now', '-30 days')"
    )
    .execute(pool)
    .await?;

    // ③ 古い issues の削除（closed から 90日）
    sqlx::query(
        "DELETE FROM issues WHERE status = 'closed' AND github_updated_at < datetime('now', '-90 days')"
    )
    .execute(pool)
    .await?;

    // ④ 送信済み issue_drafts の削除（submitted から 24 時間）
    sqlx::query(
        "DELETE FROM issue_drafts WHERE status = 'submitted' AND github_issue_id IS NOT NULL AND updated_at < datetime('now', '-1 day')"
    )
    .execute(pool)
    .await?;

    // ⑤ 古い notifications の削除（90 日）
    super::notifications::cleanup_old(pool).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect, migrations};
    use tempfile::NamedTempFile;

    async fn setup() -> DbPool {
        let file = NamedTempFile::with_suffix(".db").unwrap();
        let url = format!("sqlite:{}", file.path().display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        // NamedTempFile がドロップされないようにリークさせる（テスト用）
        std::mem::forget(file);
        pool
    }

    // Red: テーブルが存在する状態で cleanup が成功すること
    #[tokio::test]
    async fn test_cleanup_runs_without_error() {
        let pool = setup().await;
        let result = run(&pool).await;
        assert!(result.is_ok());
    }
}
