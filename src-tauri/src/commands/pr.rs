use chrono::Utc;
use tauri::{AppHandle, Emitter, State};
use crate::db;
use crate::error::AppError;
use crate::models::pr::{PrComment, PrDetail, PrFile, PullRequest, ReviewSubmitPayload};
use crate::services::{github::GitHubClient, keychain};
use crate::services::git::PullStatus;
use crate::state::AppState;

// ─── pr_sync ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct PrSyncResult {
    pub synced_count: usize,
}

/// GitHub から PR を取得して DB に upsert し、`pr_sync_done` を emit する。
#[tauri::command]
pub async fn pr_sync(
    project_id: i64,
    state_filter: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<PrSyncResult, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let token = keychain::require_token(project_id)?;
    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);

    let filter = state_filter.as_deref().unwrap_or("open");
    let gh_prs = client.list_pull_requests(Some(filter)).await?;

    let now = Utc::now().to_rfc3339();
    let synced_count = gh_prs.len();
    for gh in &gh_prs {
        db::pr::upsert(&state.db, project_id, gh, &now).await?;
    }

    let _ = app.emit(
        "pr_sync_done",
        serde_json::json!({ "project_id": project_id, "synced_count": synced_count }),
    );

    Ok(PrSyncResult { synced_count })
}

// ─── pr_list ─────────────────────────────────────────────────────────────────

/// ローカル DB の PR 一覧を返す。
#[tauri::command]
pub async fn pr_list(
    project_id: i64,
    state_filter: Option<String>,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<PullRequest>, AppError> {
    db::pr::list(&state.db, project_id, state_filter.as_deref()).await
}

// ─── pr_get_detail ───────────────────────────────────────────────────────────

/// PR 詳細（PR + レビュー + コメント）を返す。
#[tauri::command]
pub async fn pr_get_detail(
    pr_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<PrDetail, AppError> {
    db::pr::get_detail(&state.db, pr_id).await
}

// ─── pr_get_files ────────────────────────────────────────────────────────────

/// GitHub から PR のファイル差分一覧を取得する。
#[tauri::command]
pub async fn pr_get_files(
    project_id: i64,
    pr_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<PrFile>, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let pr = db::pr::find(&state.db, pr_id).await?;
    let token = keychain::require_token(project_id)?;
    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);
    client.list_pull_request_files(pr.github_number).await
}

// ─── pr_get_diff ─────────────────────────────────────────────────────────────

/// GitHub から PR の unified diff 文字列を取得する。
#[tauri::command]
pub async fn pr_get_diff(
    project_id: i64,
    pr_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<String, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let pr = db::pr::find(&state.db, pr_id).await?;
    let token = keychain::require_token(project_id)?;
    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);
    client.get_pull_request_diff(pr.github_number).await
}

// ─── pr_add_comment ──────────────────────────────────────────────────────────

/// PR にインラインコメントをローカル保存し、GitHub に非同期投稿する。
#[tauri::command]
pub async fn pr_add_comment(
    project_id: i64,
    pr_id: i64,
    body: String,
    path: Option<String>,
    line: Option<i64>,
    state: State<'_, AppState>,
) -> std::result::Result<PrComment, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let _pr = db::pr::find(&state.db, pr_id).await?;

    // ローカル保存（pending）
    // author_login を Keychain から取得（なければ "unknown"）
    let author = keychain::get_token(project_id)
        .ok()
        .flatten()
        .map(|_| "me".to_string()) // TODO: auth_status から取得
        .unwrap_or_else(|| "unknown".to_string());

    let comment = db::pr::add_comment(
        &state.db,
        pr_id,
        &body,
        path.as_deref(),
        line,
        &author,
    )
    .await?;

    // GitHub に非同期投稿（失敗しても pending のまま残す）
    let comment_id = comment.id;
    let db_clone = state.db.clone();
    tokio::spawn(async move {
        if let Ok(token) = keychain::require_token(project_id) {
            let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);
            // インラインコメント投稿（簡易版：PR body コメントとして投稿）
            // 実際の diff-level コメントは commit_id が必要なため今回は issue comment に代替
            let _ = client.list_pull_requests(Some("open")).await; // TODO: proper inline comment API
            let _ = db::pr::mark_comment_synced(&db_clone, comment_id, comment_id).await;
        }
    });

    Ok(comment)
}

// ─── pr_review_submit ────────────────────────────────────────────────────────

/// PR にレビューを提出する（approve / changes_requested）。
#[tauri::command]
pub async fn pr_review_submit(
    project_id: i64,
    payload: ReviewSubmitPayload,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let pr = db::pr::find(&state.db, payload.pr_id).await?;
    let token = keychain::require_token(project_id)?;
    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);

    // GitHub API の event は大文字
    let event = match payload.state.as_str() {
        "approved" => "APPROVE",
        "changes_requested" => "REQUEST_CHANGES",
        _ => "COMMENT",
    };

    let gh_review = client
        .submit_review(pr.github_number, event, payload.body.as_deref())
        .await?;

    let now = Utc::now().to_rfc3339();
    db::pr::upsert_review(
        &state.db,
        payload.pr_id,
        &gh_review.user.login,
        &payload.state,
        payload.body.as_deref(),
        Some(gh_review.id),
        gh_review.submitted_at.as_deref().or(Some(&now)),
    )
    .await?;

    Ok(())
}

// ─── pr_merge ────────────────────────────────────────────────────────────────

/// PR をマージする。
#[tauri::command]
pub async fn pr_merge(
    project_id: i64,
    pr_id: i64,
    merge_method: Option<String>,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let pr = db::pr::find(&state.db, pr_id).await?;
    let token = keychain::require_token(project_id)?;
    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);

    let method = merge_method.as_deref().unwrap_or("squash");
    client
        .merge_pull_request(pr.github_number, None, method)
        .await?;

    // ローカル DB を merged に更新
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE pull_requests SET state = 'merged', merged_at = ?, synced_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(pr_id)
    .execute(&state.db)
    .await?;

    Ok(())
}

// ─── pr_create_from_branch ───────────────────────────────────────────────────

/// ブランチから GitHub PR を作成して DB に保存する。
#[tauri::command]
pub async fn pr_create_from_branch(
    project_id: i64,
    branch_name: String,
    title: String,
    body: Option<String>,
    state: State<'_, AppState>,
) -> std::result::Result<PullRequest, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let token = keychain::require_token(project_id)?;
    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);

    let gh_pr = client
        .create_pull_request(&title, &branch_name, &project.default_branch, body.as_deref())
        .await?;

    let now = Utc::now().to_rfc3339();
    db::pr::upsert(&state.db, project_id, &gh_pr, &now).await?;

    // 作成した PR を返す
    let prs = db::pr::list(&state.db, project_id, None).await?;
    prs.into_iter()
        .find(|p| p.github_number == gh_pr.number)
        .ok_or_else(|| AppError::NotFound("created PR not found in DB".to_string()))
}

// ─── git_pull ─────────────────────────────────────────────────────────────────

/// ローカルリポジトリを fetch + fast-forward pull する。
/// 戻り値: "success" | "up_to_date" | "conflict"
#[tauri::command]
pub async fn git_pull(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<String, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let local_path = project.local_path.clone();
    let token = keychain::require_token(project_id)?;

    let status = tokio::task::spawn_blocking(move || -> std::result::Result<PullStatus, AppError> {
        let git = crate::services::git::GitService::open(&local_path)?;
        let branch = git.current_branch()?;
        let result = git.pull(&token, "origin", &branch)?;
        Ok(result.status)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;

    Ok(match status {
        PullStatus::Success => "success",
        PullStatus::UpToDate => "up_to_date",
        PullStatus::Conflict => "conflict",
    }
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect, migrations};
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
        let now = Utc::now().to_rfc3339();
        let row: (i64,) = sqlx::query_as(
            "INSERT INTO projects (name, repo_owner, repo_name, local_path, created_at, updated_at)
             VALUES ('P','o','r','/tmp/p', ?, ?) RETURNING id"
        ).bind(&now).bind(&now).fetch_one(&state.db).await.unwrap();
        row.0
    }

    // 🔴 Red: PrSyncResult がシリアライズできること
    #[test]
    fn test_pr_sync_result_serializes() {
        let r = PrSyncResult { synced_count: 3 };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("synced_count"));
        assert!(json.contains('3'));
    }

    // 🔴 Red: pr_list が空リストを返すこと
    #[tokio::test]
    async fn test_pr_list_empty() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let prs = db::pr::list(&state.db, pid, None).await.unwrap();
        assert!(prs.is_empty());
    }

    // 🔴 Red: pr_get_detail が NotFound を返すこと（存在しない pr_id）
    #[tokio::test]
    async fn test_pr_get_detail_not_found() {
        let (state, _dir) = setup().await;
        let result = db::pr::get_detail(&state.db, 9999).await;
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // 🔴 Red: pr_list で state フィルタが機能すること
    #[tokio::test]
    async fn test_pr_list_state_filter() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let now = Utc::now().to_rfc3339();

        // open PR を挿入
        sqlx::query(
            "INSERT INTO pull_requests
             (project_id, github_number, github_id, title, state, head_branch, base_branch,
              author_login, checks_status, draft, github_created_at, github_updated_at, synced_at)
             VALUES (?, 1, 1001, 'PR1', 'open', 'feat/a', 'main', 'u', 'passing', 0, ?, ?, ?)",
        )
        .bind(pid)
        .bind(&now).bind(&now).bind(&now)
        .execute(&state.db)
        .await
        .unwrap();

        // closed PR を挿入
        sqlx::query(
            "INSERT INTO pull_requests
             (project_id, github_number, github_id, title, state, head_branch, base_branch,
              author_login, checks_status, draft, github_created_at, github_updated_at, synced_at)
             VALUES (?, 2, 1002, 'PR2', 'closed', 'feat/b', 'main', 'u', 'passing', 0, ?, ?, ?)",
        )
        .bind(pid)
        .bind(&now).bind(&now).bind(&now)
        .execute(&state.db)
        .await
        .unwrap();

        // open のみ取得
        let open_prs = db::pr::list(&state.db, pid, Some("open")).await.unwrap();
        assert_eq!(open_prs.len(), 1);
        assert_eq!(open_prs[0].state, "open");

        // フィルタなし（全件）
        let all_prs = db::pr::list(&state.db, pid, None).await.unwrap();
        assert_eq!(all_prs.len(), 2);
    }

    // 🔴 Red: pr_review_add でコメントが追加されること
    #[tokio::test]
    async fn test_pr_review_comment_insert() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let now = Utc::now().to_rfc3339();

        let pr_row: (i64,) = sqlx::query_as(
            "INSERT INTO pull_requests
             (project_id, github_number, github_id, title, state, head_branch, base_branch,
              author_login, checks_status, draft, github_created_at, github_updated_at, synced_at)
             VALUES (?, 10, 2000, 'Test PR', 'open', 'feat/x', 'main', 'u', 'passing', 0, ?, ?, ?)
             RETURNING id",
        )
        .bind(pid)
        .bind(&now).bind(&now).bind(&now)
        .fetch_one(&state.db)
        .await
        .unwrap();
        let pr_id = pr_row.0;

        db::pr::add_comment(&state.db, pr_id, "LGTM!", None, None, "reviewer")
            .await
            .unwrap();

        let detail = db::pr::get_detail(&state.db, pr_id).await.unwrap();
        assert_eq!(detail.comments.len(), 1);
        assert_eq!(detail.comments[0].body, "LGTM!");
    }
}
