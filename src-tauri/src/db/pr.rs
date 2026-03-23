use chrono::Utc;
use crate::db::DbPool;
use crate::error::{AppError, Result};
use crate::models::pr::{PrComment, PrDetail, PrReview, PullRequest};
use crate::services::github::GitHubPullRequest;

/// GitHub PR を DB に upsert する。
pub async fn upsert(pool: &DbPool, project_id: i64, gh: &GitHubPullRequest, now: &str) -> Result<i64> {
    // GitHub PR一覧APIは `merged` フィールドを返さないため merged_at で判定する
    let state = if gh.merged.unwrap_or(false) || gh.merged_at.is_some() { "merged" } else { &gh.state };

    let row: (i64,) = sqlx::query_as(
        r#"
        INSERT INTO pull_requests
          (project_id, github_number, github_id, title, body, state,
           head_branch, base_branch, author_login, draft,
           merged_at, github_created_at, github_updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, github_number) DO UPDATE SET
          title             = excluded.title,
          body              = excluded.body,
          state             = excluded.state,
          checks_status     = CASE WHEN excluded.state = 'merged' THEN 'passing' ELSE checks_status END,
          merged_at         = excluded.merged_at,
          github_updated_at = excluded.github_updated_at,
          synced_at         = excluded.synced_at
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(gh.number)
    .bind(gh.id)
    .bind(&gh.title)
    .bind(&gh.body)
    .bind(state)
    .bind(&gh.head.ref_name)
    .bind(&gh.base.ref_name)
    .bind(&gh.user.login)
    .bind(gh.draft)
    .bind(&gh.merged_at)
    .bind(&gh.created_at)
    .bind(&gh.updated_at)
    .bind(now)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

/// PR 一覧を取得する（state フィルタは None = 全件）。
pub async fn list(pool: &DbPool, project_id: i64, state: Option<&str>) -> Result<Vec<PullRequest>> {
    let prs = if let Some(s) = state {
        sqlx::query_as::<_, PullRequest>(
            "SELECT * FROM pull_requests WHERE project_id = ? AND state = ? ORDER BY github_number DESC",
        )
        .bind(project_id)
        .bind(s)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, PullRequest>(
            "SELECT * FROM pull_requests WHERE project_id = ? ORDER BY github_number DESC",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?
    };
    Ok(prs)
}

/// PR を ID で取得する。
pub async fn find(pool: &DbPool, pr_id: i64) -> Result<PullRequest> {
    sqlx::query_as::<_, PullRequest>("SELECT * FROM pull_requests WHERE id = ?")
        .bind(pr_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("pull_request id={}", pr_id)))
}

/// PR 詳細（PR + レビュー + コメント）を取得する。
pub async fn get_detail(pool: &DbPool, pr_id: i64) -> Result<PrDetail> {
    let pr = find(pool, pr_id).await?;

    let reviews = sqlx::query_as::<_, PrReview>(
        "SELECT * FROM pr_reviews WHERE pr_id = ? ORDER BY id ASC",
    )
    .bind(pr_id)
    .fetch_all(pool)
    .await?;

    let comments = sqlx::query_as::<_, PrComment>(
        "SELECT * FROM pr_comments WHERE pr_id = ? ORDER BY id ASC",
    )
    .bind(pr_id)
    .fetch_all(pool)
    .await?;

    Ok(PrDetail { pr, reviews, comments })
}

/// レビューを upsert する。
pub async fn upsert_review(
    pool: &DbPool,
    pr_id: i64,
    reviewer_login: &str,
    state: &str,
    body: Option<&str>,
    github_id: Option<i64>,
    submitted_at: Option<&str>,
) -> Result<i64> {
    let now = Utc::now().to_rfc3339();
    let row: (i64,) = sqlx::query_as(
        r#"
        INSERT INTO pr_reviews (pr_id, github_id, reviewer_login, state, body, submitted_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(github_id) DO UPDATE SET
          state        = excluded.state,
          body         = excluded.body,
          submitted_at = excluded.submitted_at,
          synced_at    = excluded.synced_at
        RETURNING id
        "#,
    )
    .bind(pr_id)
    .bind(github_id)
    .bind(reviewer_login)
    .bind(state)
    .bind(body)
    .bind(submitted_at)
    .bind(&now)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

/// ローカルにコメントを追加（pending_submit）。
pub async fn add_comment(
    pool: &DbPool,
    pr_id: i64,
    body: &str,
    path: Option<&str>,
    line: Option<i64>,
    author_login: &str,
) -> Result<PrComment> {
    let now = Utc::now().to_rfc3339();
    let row: (i64,) = sqlx::query_as(
        r#"
        INSERT INTO pr_comments (pr_id, body, path, line, author_login, is_pending, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        RETURNING id
        "#,
    )
    .bind(pr_id)
    .bind(body)
    .bind(path)
    .bind(line)
    .bind(author_login)
    .bind(&now)
    .fetch_one(pool)
    .await?;

    sqlx::query_as::<_, PrComment>("SELECT * FROM pr_comments WHERE id = ?")
        .bind(row.0)
        .fetch_one(pool)
        .await
        .map_err(Into::into)
}

/// コメントを GitHub 同期済みにする。
pub async fn mark_comment_synced(
    pool: &DbPool,
    comment_id: i64,
    github_id: i64,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE pr_comments SET github_id = ?, is_pending = 0, synced_at = ? WHERE id = ?",
    )
    .bind(github_id)
    .bind(&now)
    .bind(comment_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// PR の checks_status を更新する。
pub async fn update_checks_status(pool: &DbPool, pr_id: i64, status: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE pull_requests SET checks_status = ?, synced_at = ? WHERE id = ?",
    )
    .bind(status)
    .bind(&now)
    .bind(pr_id)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect_for_test as connect, migrations};
    use crate::services::github::{GitHubBranch, GitHubPullRequest, GitHubUser};
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
             VALUES ('P','o','r','/tmp/p', ?, ?) RETURNING id"
        ).bind(&now).bind(&now).fetch_one(pool).await.unwrap();
        row.0
    }

    fn make_gh_pr(number: i64, id: i64, state: &str) -> GitHubPullRequest {
        GitHubPullRequest {
            number, id,
            title: format!("feat: PR #{}", number),
            body: None,
            state: state.to_string(),
            user: GitHubUser { login: "alice".to_string(), name: None, avatar_url: "".to_string() },
            head: GitHubBranch { ref_name: format!("feat/{}", number), sha: "abc".to_string(), label: "".to_string() },
            base: GitHubBranch { ref_name: "main".to_string(), sha: "def".to_string(), label: "".to_string() },
            draft: false,
            merged: None,
            merged_at: None,
            created_at: "2026-03-08T00:00:00Z".to_string(),
            updated_at: "2026-03-08T00:00:00Z".to_string(),
        }
    }

    // 🔴 Red: upsert が PR を登録できること
    #[tokio::test]
    async fn test_upsert_creates_pr() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let gh = make_gh_pr(1, 101, "open");
        let now = Utc::now().to_rfc3339();
        let id = upsert(&pool, pid, &gh, &now).await.unwrap();
        assert!(id > 0);

        let prs = list(&pool, pid, None).await.unwrap();
        assert_eq!(prs.len(), 1);
        assert_eq!(prs[0].github_number, 1);
        assert_eq!(prs[0].state, "open");
    }

    // 🔴 Red: upsert は state が merged になること（merged=true）
    #[tokio::test]
    async fn test_upsert_merged_state() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let mut gh = make_gh_pr(1, 101, "closed");
        gh.merged = Some(true);
        gh.merged_at = Some("2026-03-08T12:00:00Z".to_string());
        let now = Utc::now().to_rfc3339();
        upsert(&pool, pid, &gh, &now).await.unwrap();

        let prs = list(&pool, pid, None).await.unwrap();
        assert_eq!(prs[0].state, "merged");
    }

    // 🔴 Red: get_detail が PrDetail を返すこと
    #[tokio::test]
    async fn test_get_detail() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let now = Utc::now().to_rfc3339();
        let pr_id = upsert(&pool, pid, &make_gh_pr(1, 101, "open"), &now).await.unwrap();

        let detail = get_detail(&pool, pr_id).await.unwrap();
        assert_eq!(detail.pr.github_number, 1);
        assert!(detail.reviews.is_empty());
        assert!(detail.comments.is_empty());
    }

    // 🔴 Red: add_comment が pending コメントを作成すること
    #[tokio::test]
    async fn test_add_comment() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let now = Utc::now().to_rfc3339();
        let pr_id = upsert(&pool, pid, &make_gh_pr(1, 101, "open"), &now).await.unwrap();

        let comment = add_comment(&pool, pr_id, "LGTM", Some("src/main.rs"), Some(42), "alice").await.unwrap();
        assert!(comment.is_pending);
        assert_eq!(comment.body, "LGTM");
        assert_eq!(comment.line, Some(42));
    }

    // 🔴 Red: list の state フィルタ
    #[tokio::test]
    async fn test_list_with_state_filter() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let now = Utc::now().to_rfc3339();
        upsert(&pool, pid, &make_gh_pr(1, 101, "open"), &now).await.unwrap();
        upsert(&pool, pid, &make_gh_pr(2, 102, "closed"), &now).await.unwrap();

        let open = list(&pool, pid, Some("open")).await.unwrap();
        assert_eq!(open.len(), 1);
        let all = list(&pool, pid, None).await.unwrap();
        assert_eq!(all.len(), 2);
    }
}
