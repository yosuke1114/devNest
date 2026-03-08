use tauri::State;
use crate::db;
use crate::error::AppError;
use crate::models::document::SyncLog;
use crate::state::AppState;

#[tauri::command]
pub async fn startup_cleanup(
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    db::cleanup::run(&state.db).await
}

#[tauri::command]
pub async fn sync_log_list(
    project_id: i64,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<SyncLog>, AppError> {
    db::document::sync_log_list(&state.db, project_id, limit.unwrap_or(50)).await
}

#[cfg(test)]
mod tests {
    use crate::db::{self, connect, migrations};
    use crate::state::AppState;
    use tempfile::TempDir;

    async fn setup() -> (AppState, TempDir) {
        let dir = TempDir::new().unwrap();
        let url = format!("sqlite:{}", dir.path().join("test.db").display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (AppState::new(pool), dir)
    }

    async fn insert_project(state: &AppState) -> i64 {
        let now = chrono::Utc::now().to_rfc3339();
        let row: (i64,) = sqlx::query_as(
            "INSERT INTO projects (name, repo_owner, repo_name, local_path, created_at, updated_at)
             VALUES ('P','o','r','/tmp/p-util', ?, ?) RETURNING id",
        )
        .bind(&now)
        .bind(&now)
        .fetch_one(&state.db)
        .await
        .unwrap();
        row.0
    }

    // 🔴 Red: startup_cleanup が空 DB でエラーなく完了すること
    #[tokio::test]
    async fn test_startup_cleanup_runs_successfully() {
        let (state, _dir) = setup().await;
        let result = db::cleanup::run(&state.db).await;
        assert!(result.is_ok());
    }

    // 🔴 Red: startup_cleanup が pending_submit レビューを削除すること
    #[tokio::test]
    async fn test_startup_cleanup_removes_pending_submit_reviews() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;

        // PR を挿入
        let now = chrono::Utc::now().to_rfc3339();
        let pr_row: (i64,) = sqlx::query_as(
            "INSERT INTO pull_requests
             (project_id, github_number, github_id, title, state, head_branch, base_branch,
              author_login, checks_status, draft, github_created_at, github_updated_at, synced_at)
             VALUES (?, 1, 9001, 'PR', 'open', 'feat/a', 'main', 'u', 'passing', 0, ?, ?, ?)
             RETURNING id",
        )
        .bind(pid)
        .bind(&now).bind(&now).bind(&now)
        .fetch_one(&state.db)
        .await
        .unwrap();
        let pr_id = pr_row.0;

        // pending_submit かつ github_id NULL のレビューを挿入（reviewer_login/state/synced_at 必須）
        sqlx::query(
            "INSERT INTO pr_reviews (pr_id, reviewer_login, state, submit_status, body, synced_at)
             VALUES (?, 'reviewer', 'pending', 'pending_submit', 'review body', ?)",
        )
        .bind(pr_id)
        .bind(&now)
        .execute(&state.db)
        .await
        .unwrap();

        // cleanup 実行
        db::cleanup::run(&state.db).await.unwrap();

        // レビューが削除されていること
        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM pr_reviews WHERE submit_status = 'pending_submit'")
                .fetch_one(&state.db)
                .await
                .unwrap();
        assert_eq!(count.0, 0);
    }

    // 🔴 Red: sync_log_list が空プロジェクトで空リストを返すこと
    #[tokio::test]
    async fn test_sync_log_list_empty() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let logs = db::document::sync_log_list(&state.db, pid, 50).await.unwrap();
        assert!(logs.is_empty());
    }

    // 🔴 Red: sync_log_list が limit で件数を制限すること
    #[tokio::test]
    async fn test_sync_log_list_respects_limit() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let now = chrono::Utc::now().to_rfc3339();

        // sync_logs を3件挿入（operation/status/created_at 必須）
        for _ in 0..3i32 {
            sqlx::query(
                "INSERT INTO sync_logs (project_id, operation, status, created_at)
                 VALUES (?, 'push', 'success', ?)",
            )
            .bind(pid)
            .bind(&now)
            .execute(&state.db)
            .await
            .unwrap();
        }

        let logs = db::document::sync_log_list(&state.db, pid, 2).await.unwrap();
        assert_eq!(logs.len(), 2);
    }
}
