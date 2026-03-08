use chrono::Utc;
use crate::db::DbPool;
use crate::error::Result;
use crate::models::terminal::TerminalSession;

/// ターミナルセッションを DB に作成する（status='running'）。
pub async fn create_session(pool: &DbPool, project_id: i64) -> Result<TerminalSession> {
    let now = Utc::now().to_rfc3339();
    let row: (i64,) = sqlx::query_as(
        "INSERT INTO terminal_sessions (project_id, status, started_at)
         VALUES (?, 'running', ?)
         RETURNING id",
    )
    .bind(project_id)
    .bind(&now)
    .fetch_one(pool)
    .await?;

    find(pool, row.0).await
}

/// セッションを ID で取得する。
pub async fn find(pool: &DbPool, session_id: i64) -> Result<TerminalSession> {
    sqlx::query_as::<_, TerminalSession>("SELECT * FROM terminal_sessions WHERE id = ?")
        .bind(session_id)
        .fetch_one(pool)
        .await
        .map_err(Into::into)
}

/// セッション完了時に更新する。
pub async fn complete_session(
    pool: &DbPool,
    session_id: i64,
    exit_code: i64,
    branch_name: Option<&str>,
    has_doc_changes: bool,
    output_log: &str,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let status = if exit_code == 0 { "completed" } else { "failed" };
    sqlx::query(
        "UPDATE terminal_sessions
         SET status = ?, exit_code = ?, branch_name = ?, has_doc_changes = ?,
             output_log = ?, ended_at = ?
         WHERE id = ?",
    )
    .bind(status)
    .bind(exit_code)
    .bind(branch_name)
    .bind(has_doc_changes as i64)
    .bind(output_log)
    .bind(&now)
    .bind(session_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// セッションを中断（aborted）にする。
pub async fn abort_session(pool: &DbPool, session_id: i64) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE terminal_sessions SET status = 'aborted', ended_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(session_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// プロジェクトのセッション一覧（新しい順）。
pub async fn list_sessions(
    pool: &DbPool,
    project_id: i64,
    limit: i64,
) -> Result<Vec<TerminalSession>> {
    let rows = sqlx::query_as::<_, TerminalSession>(
        "SELECT * FROM terminal_sessions WHERE project_id = ? ORDER BY started_at DESC LIMIT ?",
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
    use tempfile::TempDir;

    async fn setup() -> (DbPool, TempDir) {
        let dir = TempDir::new().unwrap();
        let url = format!("sqlite:{}", dir.path().join("test.db").display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (pool, dir)
    }

    async fn insert_project(pool: &DbPool) -> i64 {
        let now = Utc::now().to_rfc3339();
        let row: (i64,) = sqlx::query_as(
            "INSERT INTO projects (name, repo_owner, repo_name, local_path, created_at, updated_at)
             VALUES ('P','o','r','/tmp/p', ?, ?) RETURNING id",
        )
        .bind(&now)
        .bind(&now)
        .fetch_one(pool)
        .await
        .unwrap();
        row.0
    }

    // 🔴 Red: create_session が running セッションを作成すること
    #[tokio::test]
    async fn test_create_session() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let session = create_session(&pool, pid).await.unwrap();
        assert_eq!(session.status, "running");
        assert!(session.exit_code.is_none());
    }

    // 🔴 Red: complete_session が status を更新すること
    #[tokio::test]
    async fn test_complete_session() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let session = create_session(&pool, pid).await.unwrap();

        complete_session(&pool, session.id, 0, Some("feat/42"), true, "output log").await.unwrap();

        let updated = find(&pool, session.id).await.unwrap();
        assert_eq!(updated.status, "completed");
        assert_eq!(updated.exit_code, Some(0));
        assert!(updated.has_doc_changes);
        assert_eq!(updated.branch_name.as_deref(), Some("feat/42"));
    }

    // 🔴 Red: abort_session が status を aborted にすること
    #[tokio::test]
    async fn test_abort_session() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let session = create_session(&pool, pid).await.unwrap();

        abort_session(&pool, session.id).await.unwrap();
        let updated = find(&pool, session.id).await.unwrap();
        assert_eq!(updated.status, "aborted");
    }

    // 🔴 Red: list_sessions が新しい順で返すこと
    #[tokio::test]
    async fn test_list_sessions() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;

        create_session(&pool, pid).await.unwrap();
        create_session(&pool, pid).await.unwrap();

        let sessions = list_sessions(&pool, pid, 10).await.unwrap();
        assert_eq!(sessions.len(), 2);
        // 新しい順（id 降順）
        assert!(sessions[0].id >= sessions[1].id);
    }
}
