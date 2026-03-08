use chrono::Utc;
use crate::db::DbPool;
use crate::error::{AppError, Result};
use crate::models::issue::{Issue, IssueDocLink, IssueDraft, IssueDraftPatch};
use crate::services::github::GitHubIssue;

/// GitHub Issue を DB に upsert する。戻り値は DB の id。
pub async fn upsert(
    pool: &DbPool,
    project_id: i64,
    gh: &GitHubIssue,
    now: &str,
) -> Result<i64> {
    // GitHub の state ("open"/"closed") → DB status
    let status = match gh.state.as_str() {
        "closed" => "closed",
        _ => "open",
    };

    let labels_json = serde_json::to_string(
        &gh.labels.iter().map(|l| &l.name).collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| "[]".to_string());

    let milestone = gh.milestone.as_ref().map(|m| m.title.as_str());
    let assignee_login = gh.assignee.as_ref().map(|u| u.login.as_str());

    let row: (i64,) = sqlx::query_as(
        r#"
        INSERT INTO issues
          (project_id, github_number, github_id, title, body, status,
           author_login, assignee_login, labels, milestone,
           created_by, github_created_at, github_updated_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?)
        ON CONFLICT(project_id, github_number) DO UPDATE SET
          title             = excluded.title,
          body              = excluded.body,
          status            = excluded.status,
          assignee_login    = excluded.assignee_login,
          labels            = excluded.labels,
          milestone         = excluded.milestone,
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
    .bind(status)
    .bind(&gh.user.login)
    .bind(assignee_login)
    .bind(&labels_json)
    .bind(milestone)
    .bind(&gh.created_at)
    .bind(&gh.updated_at)
    .bind(now)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

/// プロジェクトの Issue 一覧を取得する（status フィルタは None = 全件）。
pub async fn list(
    pool: &DbPool,
    project_id: i64,
    status: Option<&str>,
) -> Result<Vec<Issue>> {
    let issues = if let Some(s) = status {
        sqlx::query_as::<_, Issue>(
            "SELECT * FROM issues WHERE project_id = ? AND status = ? ORDER BY github_number DESC",
        )
        .bind(project_id)
        .bind(s)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, Issue>(
            "SELECT * FROM issues WHERE project_id = ? ORDER BY github_number DESC",
        )
        .bind(project_id)
        .fetch_all(pool)
        .await?
    };
    Ok(issues)
}

/// Issue に紐づくドキュメントリンク一覧（document の path/title を JOIN）。
pub async fn link_list(pool: &DbPool, issue_id: i64) -> Result<Vec<IssueDocLink>> {
    let links = sqlx::query_as::<_, IssueDocLink>(
        r#"
        SELECT idl.id, idl.issue_id, idl.document_id, idl.link_type,
               idl.created_by, idl.created_at,
               d.path, d.title
        FROM issue_doc_links idl
        LEFT JOIN documents d ON d.id = idl.document_id
        WHERE idl.issue_id = ?
        ORDER BY idl.id ASC
        "#,
    )
    .bind(issue_id)
    .fetch_all(pool)
    .await?;
    Ok(links)
}

/// ドキュメントリンクを追加する。重複は無視。
pub async fn link_add(
    pool: &DbPool,
    issue_id: i64,
    document_id: i64,
    link_type: &str,
    created_by: &str,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO issue_doc_links (issue_id, document_id, link_type, created_by, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(issue_id, document_id) DO UPDATE SET link_type = excluded.link_type
        "#,
    )
    .bind(issue_id)
    .bind(document_id)
    .bind(link_type)
    .bind(created_by)
    .bind(&now)
    .execute(pool)
    .await?;
    Ok(())
}

/// ドキュメントリンクを削除する（論理削除ではなく物理削除）。
pub async fn link_remove(pool: &DbPool, issue_id: i64, document_id: i64) -> Result<()> {
    sqlx::query(
        "DELETE FROM issue_doc_links WHERE issue_id = ? AND document_id = ?",
    )
    .bind(issue_id)
    .bind(document_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Issue ドラフトを新規作成する。
pub async fn draft_create(pool: &DbPool, project_id: i64) -> Result<IssueDraft> {
    let now = Utc::now().to_rfc3339();
    let row: (i64,) = sqlx::query_as(
        r#"
        INSERT INTO issue_drafts (project_id, title, body, labels, status, created_at, updated_at)
        VALUES (?, '', '', '[]', 'draft', ?, ?)
        RETURNING id
        "#,
    )
    .bind(project_id)
    .bind(&now)
    .bind(&now)
    .fetch_one(pool)
    .await?;

    draft_find(pool, row.0).await
}

/// Issue ドラフトをフィールド単位で更新する。
pub async fn draft_update(pool: &DbPool, patch: &IssueDraftPatch) -> Result<IssueDraft> {
    let now = Utc::now().to_rfc3339();

    // 動的 SET 句はマクロで組み立てず、全フィールドを CASE で更新
    sqlx::query(
        r#"
        UPDATE issue_drafts SET
          title          = CASE WHEN ?1 IS NOT NULL THEN ?1 ELSE title END,
          body           = CASE WHEN ?2 IS NOT NULL THEN ?2 ELSE body END,
          draft_body     = CASE WHEN ?3 IS NOT NULL THEN ?3 ELSE draft_body END,
          wizard_context = CASE WHEN ?4 IS NOT NULL THEN ?4 ELSE wizard_context END,
          labels         = CASE WHEN ?5 IS NOT NULL THEN ?5 ELSE labels END,
          assignee_login = CASE WHEN ?6 IS NOT NULL THEN ?6 ELSE assignee_login END,
          status         = CASE WHEN ?7 IS NOT NULL THEN ?7 ELSE status END,
          github_issue_id = CASE WHEN ?8 IS NOT NULL THEN ?8 ELSE github_issue_id END,
          updated_at     = ?9
        WHERE id = ?10
        "#,
    )
    .bind(patch.title.as_deref())
    .bind(patch.body.as_deref())
    .bind(patch.draft_body.as_deref())
    .bind(patch.wizard_context.as_deref())
    .bind(patch.labels.as_deref())
    .bind(patch.assignee_login.as_deref())
    .bind(patch.status.as_deref())
    .bind(patch.github_issue_id)
    .bind(&now)
    .bind(patch.id)
    .execute(pool)
    .await?;

    draft_find(pool, patch.id).await
}

/// Issue ドラフトを ID で取得する。
pub async fn draft_find(pool: &DbPool, draft_id: i64) -> Result<IssueDraft> {
    sqlx::query_as::<_, IssueDraft>(
        "SELECT * FROM issue_drafts WHERE id = ?",
    )
    .bind(draft_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("draft id={}", draft_id)))
}

/// プロジェクトの Issue ドラフト一覧。
pub async fn draft_list(pool: &DbPool, project_id: i64) -> Result<Vec<IssueDraft>> {
    let drafts = sqlx::query_as::<_, IssueDraft>(
        "SELECT * FROM issue_drafts WHERE project_id = ? ORDER BY updated_at DESC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(drafts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect, migrations};
    use crate::services::github::{GitHubIssue, GitHubLabel, GitHubMilestone, GitHubUser};
    use tempfile::TempDir;

    async fn setup() -> (DbPool, TempDir) {
        let dir = TempDir::new().unwrap();
        let url = format!("sqlite:{}", dir.path().join("test.db").display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (pool, dir)
    }

    fn make_gh_issue(number: i64, id: i64, state: &str) -> GitHubIssue {
        GitHubIssue {
            number,
            id,
            title: format!("Issue #{}", number),
            body: Some("body".to_string()),
            state: state.to_string(),
            user: GitHubUser { login: "alice".to_string(), name: None, avatar_url: "".to_string() },
            assignee: None,
            labels: vec![GitHubLabel {
                id: 1, name: "bug".to_string(),
                color: "red".to_string(), description: None,
            }],
            milestone: Some(GitHubMilestone { title: "v1.0".to_string() }),
            created_at: "2026-03-08T00:00:00Z".to_string(),
            updated_at: "2026-03-08T00:00:00Z".to_string(),
        }
    }

    // 🔴 Red: project が必要なので insert してから issue upsert
    async fn insert_project(pool: &DbPool) -> i64 {
        let now = Utc::now().to_rfc3339();
        let row: (i64,) = sqlx::query_as(
            "INSERT INTO projects (name, repo_owner, repo_name, local_path, created_at, updated_at)
             VALUES ('P','o','r','/tmp/p', ?, ?) RETURNING id"
        ).bind(&now).bind(&now).fetch_one(pool).await.unwrap();
        row.0
    }

    // 🔴 Red: upsert が Issue を登録できること
    #[tokio::test]
    async fn test_upsert_creates_issue() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let gh = make_gh_issue(1, 101, "open");
        let now = Utc::now().to_rfc3339();
        let id = upsert(&pool, pid, &gh, &now).await.unwrap();
        assert!(id > 0);

        let issues = list(&pool, pid, None).await.unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].github_number, 1);
        assert_eq!(issues[0].status, "open");
    }

    // 🔴 Red: upsert は重複登録で UPDATE されること
    #[tokio::test]
    async fn test_upsert_updates_on_conflict() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let now = Utc::now().to_rfc3339();

        let gh1 = make_gh_issue(1, 101, "open");
        upsert(&pool, pid, &gh1, &now).await.unwrap();

        let mut gh2 = make_gh_issue(1, 101, "closed");
        gh2.title = "Updated Title".to_string();
        upsert(&pool, pid, &gh2, &now).await.unwrap();

        let issues = list(&pool, pid, None).await.unwrap();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].status, "closed");
        assert_eq!(issues[0].title, "Updated Title");
    }

    // 🔴 Red: list の status フィルタ
    #[tokio::test]
    async fn test_list_with_status_filter() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let now = Utc::now().to_rfc3339();

        upsert(&pool, pid, &make_gh_issue(1, 101, "open"), &now).await.unwrap();
        upsert(&pool, pid, &make_gh_issue(2, 102, "closed"), &now).await.unwrap();

        let open = list(&pool, pid, Some("open")).await.unwrap();
        assert_eq!(open.len(), 1);
        assert_eq!(open[0].github_number, 1);

        let all = list(&pool, pid, None).await.unwrap();
        assert_eq!(all.len(), 2);
    }

    // 🔴 Red: link_add → link_list でリンクが取得できること
    #[tokio::test]
    async fn test_link_add_and_list() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let now = Utc::now().to_rfc3339();

        // issue 作成
        let issue_id = upsert(&pool, pid, &make_gh_issue(1, 101, "open"), &now).await.unwrap();

        // document 作成
        let doc_id: (i64,) = sqlx::query_as(
            "INSERT INTO documents (project_id, path, created_at, updated_at)
             VALUES (?, 'docs/spec.md', ?, ?) RETURNING id"
        ).bind(pid).bind(&now).bind(&now).fetch_one(&pool).await.unwrap();

        link_add(&pool, issue_id, doc_id.0, "manual", "user").await.unwrap();
        let links = link_list(&pool, issue_id).await.unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].link_type, "manual");
        assert_eq!(links[0].path.as_deref(), Some("docs/spec.md"));
    }

    // 🔴 Red: link_remove でリンクが削除されること
    #[tokio::test]
    async fn test_link_remove() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let now = Utc::now().to_rfc3339();

        let issue_id = upsert(&pool, pid, &make_gh_issue(1, 101, "open"), &now).await.unwrap();
        let doc_id: (i64,) = sqlx::query_as(
            "INSERT INTO documents (project_id, path, created_at, updated_at)
             VALUES (?, 'docs/a.md', ?, ?) RETURNING id"
        ).bind(pid).bind(&now).bind(&now).fetch_one(&pool).await.unwrap();

        link_add(&pool, issue_id, doc_id.0, "manual", "user").await.unwrap();
        link_remove(&pool, issue_id, doc_id.0).await.unwrap();
        let links = link_list(&pool, issue_id).await.unwrap();
        assert!(links.is_empty());
    }

    // 🔴 Red: draft_create で空ドラフトが作成されること
    #[tokio::test]
    async fn test_draft_create() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let draft = draft_create(&pool, pid).await.unwrap();
        assert_eq!(draft.project_id, pid);
        assert_eq!(draft.status, "draft");
        assert_eq!(draft.title, "");
        assert_eq!(draft.labels, "[]");
    }

    // 🔴 Red: draft_update でフィールドを更新できること
    #[tokio::test]
    async fn test_draft_update() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        let draft = draft_create(&pool, pid).await.unwrap();

        let patch = IssueDraftPatch {
            id: draft.id,
            title: Some("New Title".to_string()),
            body: Some("Body content".to_string()),
            draft_body: None,
            wizard_context: None,
            labels: Some("[\"bug\"]".to_string()),
            assignee_login: None,
            status: None,
            github_issue_id: None,
        };
        let updated = draft_update(&pool, &patch).await.unwrap();
        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.body, "Body content");
        assert_eq!(updated.labels, "[\"bug\"]");
    }

    // 🔴 Red: draft_list でドラフト一覧が取得できること
    #[tokio::test]
    async fn test_draft_list() {
        let (pool, _dir) = setup().await;
        let pid = insert_project(&pool).await;
        draft_create(&pool, pid).await.unwrap();
        draft_create(&pool, pid).await.unwrap();
        let drafts = draft_list(&pool, pid).await.unwrap();
        assert_eq!(drafts.len(), 2);
    }
}
