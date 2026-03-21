use crate::error::Result;
use crate::models::notifications::{NavigationTarget, NewNotification, Notification};
use super::DbPool;

/// 通知を作成して ID を返す
pub async fn create(pool: &DbPool, n: &NewNotification) -> Result<i64> {
    let now = chrono::Utc::now().to_rfc3339();
    let id = sqlx::query_scalar(
        "INSERT INTO notifications
           (project_id, event_type, title, body, dest_screen, dest_resource_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id",
    )
    .bind(n.project_id)
    .bind(&n.event_type)
    .bind(&n.title)
    .bind(&n.body)
    .bind(&n.dest_screen)
    .bind(n.dest_resource_id)
    .bind(&now)
    .fetch_one(pool)
    .await?;
    Ok(id)
}

/// プロジェクトの通知一覧（最新 50 件、作成日降順）
pub async fn list(pool: &DbPool, project_id: i64) -> Result<Vec<Notification>> {
    let rows = sqlx::query_as::<_, Notification>(
        "SELECT id, project_id, event_type, title, body, dest_screen, dest_resource_id,
                is_read, os_notified, created_at
         FROM notifications
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT 50",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// 未読数を返す
pub async fn unread_count(pool: &DbPool, project_id: i64) -> Result<i64> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM notifications WHERE project_id = ? AND is_read = 0",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// 指定 ID を既読にする
pub async fn mark_read(pool: &DbPool, notification_id: i64) -> Result<()> {
    sqlx::query("UPDATE notifications SET is_read = 1 WHERE id = ?")
        .bind(notification_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// プロジェクトの通知を全件既読にする
pub async fn mark_all_read(pool: &DbPool, project_id: i64) -> Result<()> {
    sqlx::query("UPDATE notifications SET is_read = 1 WHERE project_id = ? AND is_read = 0")
        .bind(project_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 通知の遷移先を返す
pub async fn navigate(pool: &DbPool, notification_id: i64) -> Result<NavigationTarget> {
    let row: (Option<String>, Option<i64>) = sqlx::query_as(
        "SELECT dest_screen, dest_resource_id FROM notifications WHERE id = ?",
    )
    .bind(notification_id)
    .fetch_one(pool)
    .await?;
    Ok(NavigationTarget {
        screen: row.0.unwrap_or_else(|| "editor".to_string()),
        resource_id: row.1,
    })
}

/// 90 日以上前の通知を削除する
pub async fn cleanup_old(pool: &DbPool) -> Result<()> {
    sqlx::query("DELETE FROM notifications WHERE created_at < datetime('now', '-90 days')")
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
             VALUES ('p','o','r','/tmp/n','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z') RETURNING id",
        )
        .fetch_one(pool)
        .await
        .unwrap()
    }

    // Red: create → list で取得できること
    #[tokio::test]
    async fn test_create_and_list() {
        let pool = setup().await;
        let project_id = insert_project(&pool).await;
        let n = NewNotification {
            project_id,
            event_type: "ci_pass".to_string(),
            title: "CI passed".to_string(),
            body: Some("All good".to_string()),
            dest_screen: Some("pr".to_string()),
            dest_resource_id: Some(1),
        };
        create(&pool, &n).await.unwrap();
        let list = list(&pool, project_id).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "CI passed");
        assert!(!list[0].is_read);
    }

    // Red: mark_read で is_read が 1 になること
    #[tokio::test]
    async fn test_mark_read() {
        let pool = setup().await;
        let project_id = insert_project(&pool).await;
        let n = NewNotification {
            project_id,
            event_type: "ci_fail".to_string(),
            title: "CI failed".to_string(),
            body: None,
            dest_screen: None,
            dest_resource_id: None,
        };
        let id = create(&pool, &n).await.unwrap();
        mark_read(&pool, id).await.unwrap();
        let list = list(&pool, project_id).await.unwrap();
        assert!(list[0].is_read);
    }

    // Red: mark_all_read でプロジェクト全件既読になること
    #[tokio::test]
    async fn test_mark_all_read() {
        let pool = setup().await;
        let project_id = insert_project(&pool).await;
        for i in 0..3 {
            let n = NewNotification {
                project_id,
                event_type: "conflict".to_string(),
                title: format!("Conflict {i}"),
                body: None,
                dest_screen: None,
                dest_resource_id: None,
            };
            create(&pool, &n).await.unwrap();
        }
        let count_before = unread_count(&pool, project_id).await.unwrap();
        assert_eq!(count_before, 3);
        mark_all_read(&pool, project_id).await.unwrap();
        let count_after = unread_count(&pool, project_id).await.unwrap();
        assert_eq!(count_after, 0);
    }

    // Red: navigate が dest_screen を返すこと
    #[tokio::test]
    async fn test_navigate() {
        let pool = setup().await;
        let project_id = insert_project(&pool).await;
        let n = NewNotification {
            project_id,
            event_type: "pr_opened".to_string(),
            title: "PR opened".to_string(),
            body: None,
            dest_screen: Some("pr".to_string()),
            dest_resource_id: Some(99),
        };
        let id = create(&pool, &n).await.unwrap();
        let target = navigate(&pool, id).await.unwrap();
        assert_eq!(target.screen, "pr");
        assert_eq!(target.resource_id, Some(99));
    }

    // Red: cleanup_old がエラーなく動くこと
    #[tokio::test]
    async fn test_cleanup_old() {
        let pool = setup().await;
        let result = cleanup_old(&pool).await;
        assert!(result.is_ok());
    }
}
