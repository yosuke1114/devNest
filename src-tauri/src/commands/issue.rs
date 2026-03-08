use chrono::Utc;
use tauri::{AppHandle, Emitter, State};
use crate::db;
use crate::error::AppError;
use crate::models::issue::{Issue, IssueDocLink, IssueDraft, IssueDraftPatch};
use crate::services::{github::GitHubClient, keychain};
use crate::state::AppState;

// ─── T-R-D01: issue_sync ─────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct IssueSyncResult {
    pub synced_count: usize,
}

/// GitHub から Issue を取得して DB に upsert し、`issue_sync_done` を emit する。
#[tauri::command]
pub async fn issue_sync(
    project_id: i64,
    state_filter: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<IssueSyncResult, AppError> {
    // プロジェクト情報取得
    let project = db::project::find(&state.db, project_id).await?;

    // Keychain からトークン取得
    let token = keychain::require_token(project_id)?;

    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);
    let filter = state_filter.as_deref().unwrap_or("open");
    let gh_issues = client.list_issues(Some(filter)).await?;

    let now = Utc::now().to_rfc3339();
    let synced_count = gh_issues.len();
    for gh in &gh_issues {
        db::issue::upsert(&state.db, project_id, gh, &now).await?;
    }

    let _ = app.emit(
        "issue_sync_done",
        serde_json::json!({ "project_id": project_id, "synced_count": synced_count }),
    );

    Ok(IssueSyncResult { synced_count })
}

// ─── T-R-D02: issue_list ─────────────────────────────────────────────────────

/// ローカル DB の Issue 一覧を返す。
#[tauri::command]
pub async fn issue_list(
    project_id: i64,
    status_filter: Option<String>,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<Issue>, AppError> {
    db::issue::list(&state.db, project_id, status_filter.as_deref()).await
}

// ─── T-R-D03: issue_doc_link_list / add / remove ─────────────────────────────

/// Issue に紐づくドキュメントリンク一覧を返す。
#[tauri::command]
pub async fn issue_doc_link_list(
    issue_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<IssueDocLink>, AppError> {
    db::issue::link_list(&state.db, issue_id).await
}

/// Issue にドキュメントリンクを追加する。
#[tauri::command]
pub async fn issue_doc_link_add(
    issue_id: i64,
    document_id: i64,
    link_type: Option<String>,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let lt = link_type.as_deref().unwrap_or("manual");
    db::issue::link_add(&state.db, issue_id, document_id, lt, "user").await
}

/// Issue からドキュメントリンクを削除する。
#[tauri::command]
pub async fn issue_doc_link_remove(
    issue_id: i64,
    document_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    db::issue::link_remove(&state.db, issue_id, document_id).await
}

// ─── T-R-D05: issue_draft_create / update / list ─────────────────────────────

/// Issue ドラフトを新規作成する。
#[tauri::command]
pub async fn issue_draft_create(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<IssueDraft, AppError> {
    db::issue::draft_create(&state.db, project_id).await
}

/// Issue ドラフトを更新する。
#[tauri::command]
pub async fn issue_draft_update(
    patch: IssueDraftPatch,
    state: State<'_, AppState>,
) -> std::result::Result<IssueDraft, AppError> {
    db::issue::draft_update(&state.db, &patch).await
}

/// Issue ドラフト一覧を返す。
#[tauri::command]
pub async fn issue_draft_list(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<IssueDraft>, AppError> {
    db::issue::draft_list(&state.db, project_id).await
}

// ─── issue_draft_cancel ──────────────────────────────────────────────────────

/// Issue ドラフトを削除（キャンセル）する。
#[tauri::command]
pub async fn issue_draft_cancel(
    draft_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    db::issue::draft_delete(&state.db, draft_id).await
}

// ─── T-R-D06: issue_draft_generate ──────────────────────────────────────────

/// issue_draft_chunk イベントのペイロード
#[derive(Debug, Clone, serde::Serialize)]
pub struct DraftChunkPayload {
    pub draft_id: i64,
    pub delta: String,
}

/// issue_draft_generate_done イベントのペイロード
#[derive(Debug, Clone, serde::Serialize)]
pub struct DraftGenerateDonePayload {
    pub draft_id: i64,
    pub draft_body: String,
}

/// Anthropic API で Issue 本文をストリーミング生成する。
/// - `issue_draft_chunk` イベントで delta を都度 emit
/// - 完了後 draft_body を DB に保存して `issue_draft_generate_done` を emit
#[tauri::command]
pub async fn issue_draft_generate(
    draft_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    // ドラフトと Anthropic API キーを取得
    let draft = db::issue::draft_find(&state.db, draft_id).await?;

    let api_key_row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'anthropic.api_key'",
    )
    .fetch_optional(&state.db)
    .await?;
    let api_key = api_key_row
        .map(|(v,)| v.trim_matches('"').to_string())
        .ok_or_else(|| AppError::Validation("Anthropic API キーが設定されていません".to_string()))?;

    // 関連ドキュメント一覧
    let links = db::issue::link_list(&state.db, draft_id).await.unwrap_or_default();
    let doc_context = links
        .iter()
        .filter_map(|l| l.path.as_deref())
        .collect::<Vec<_>>()
        .join(", ");

    // プロンプト構築
    let system_prompt = "あなたは GitHub Issue の作成を支援するアシスタントです。\
        ユーザーの指示に従い、明確で構造化された Issue 本文を Markdown で生成してください。";

    let user_content = format!(
        "以下の情報をもとに、GitHub Issue の本文を生成してください。\n\n\
        タイトル: {}\n\
        コンテキスト: {}\n\
        関連ドキュメント: {}\n\n\
        ## 要求\n\
        - ## 概要、## 詳細、## 再現手順（バグの場合）、## 期待する動作 のセクションを含める\
        - Markdown 形式で出力する",
        draft.title,
        draft.wizard_context.as_deref().unwrap_or("（なし）"),
        if doc_context.is_empty() { "（なし）".to_string() } else { doc_context },
    );

    // Anthropic Messages API リクエスト（streaming）
    let http = reqwest::Client::new();
    let resp = http
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": "claude-sonnet-4-6",
            "max_tokens": 2048,
            "stream": true,
            "system": system_prompt,
            "messages": [{ "role": "user", "content": user_content }]
        }))
        .send()
        .await
        .map_err(|e| AppError::Anthropic(e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Anthropic(format!("API エラー {}: {}", status, body)));
    }

    // SSE ストリームを処理
    use eventsource_stream::Eventsource;
    use futures_util::StreamExt;

    let mut full_body = String::new();
    let mut stream = resp.bytes_stream().eventsource();

    while let Some(event) = stream.next().await {
        let event = event.map_err(|e| AppError::Anthropic(e.to_string()))?;

        if event.event == "message_stop" {
            break;
        }
        if event.event != "content_block_delta" {
            continue;
        }

        // {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
        let val: serde_json::Value = serde_json::from_str(&event.data)
            .unwrap_or(serde_json::Value::Null);
        let delta = val
            .get("delta")
            .and_then(|d| d.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("");

        if !delta.is_empty() {
            full_body.push_str(delta);
            let _ = app.emit(
                "issue_draft_chunk",
                DraftChunkPayload { draft_id, delta: delta.to_string() },
            );
        }
    }

    // DB に draft_body を保存
    let patch = IssueDraftPatch {
        id: draft_id,
        title: None,
        body: None,
        draft_body: Some(full_body.clone()),
        wizard_context: None,
        labels: None,
        assignee_login: None,
        status: None,
        github_issue_id: None,
    };
    db::issue::draft_update(&state.db, &patch).await?;

    let _ = app.emit(
        "issue_draft_generate_done",
        DraftGenerateDonePayload { draft_id, draft_body: full_body },
    );

    Ok(())
}

// ─── T-R-E01: github_labels_list ─────────────────────────────────────────────

/// GitHub のラベル一覧を取得する。
#[tauri::command]
pub async fn github_labels_list(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<crate::services::github::GitHubLabel>, AppError> {
    let project = db::project::find(&state.db, project_id).await?;
    let token = keychain::require_token(project_id)?;
    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);
    client.list_labels().await
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

    // 🔴 Red: IssueSyncResult が正しくシリアライズされること
    #[test]
    fn test_issue_sync_result_serializes() {
        let result = IssueSyncResult { synced_count: 5 };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("synced_count"));
        assert!(json.contains('5'));
    }

    // 🔴 Red: issue_draft_create でドラフトが作成されること（DB 統合）
    #[tokio::test]
    async fn test_issue_draft_create_via_db() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let draft = db::issue::draft_create(&state.db, pid).await.unwrap();
        assert_eq!(draft.project_id, pid);
        assert_eq!(draft.status, "draft");
    }

    // 🔴 Red: issue_draft_list が空リストを返すこと
    #[tokio::test]
    async fn test_issue_draft_list_empty() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let drafts = db::issue::draft_list(&state.db, pid).await.unwrap();
        assert!(drafts.is_empty());
    }

    // 🔴 Red: DraftChunkPayload がシリアライズできること
    #[test]
    fn test_draft_chunk_payload_serializes() {
        let payload = DraftChunkPayload {
            draft_id: 1,
            delta: "Hello".to_string(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("Hello"));
        assert!(json.contains("draft_id"));
    }

    // 🔴 Red: issue_list が status フィルタ付きで動作すること（DB 統合）
    #[tokio::test]
    async fn test_issue_list_status_filter_via_db() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        // Issue なしの場合は空リスト
        let issues = db::issue::list(&state.db, pid, Some("open")).await.unwrap();
        assert!(issues.is_empty());
    }

    // 🔴 Red: draft_create → draft_update → draft_list のライフサイクル
    #[tokio::test]
    async fn test_draft_lifecycle_create_update_list() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;

        // create
        let draft = db::issue::draft_create(&state.db, pid).await.unwrap();
        assert_eq!(draft.title, "");
        assert_eq!(draft.status, "draft");

        // update title
        let patch = crate::models::issue::IssueDraftPatch {
            id: draft.id,
            title: Some("New title".to_string()),
            body: None,
            draft_body: None,
            wizard_context: None,
            labels: None,
            assignee_login: None,
            status: None,
            github_issue_id: None,
        };
        let updated = db::issue::draft_update(&state.db, &patch).await.unwrap();
        assert_eq!(updated.title, "New title");

        // list
        let drafts = db::issue::draft_list(&state.db, pid).await.unwrap();
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].id, draft.id);
    }

    // 🔴 Red: link_add → link_list → link_remove のサイクル
    #[tokio::test]
    async fn test_link_add_list_remove() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;

        // issue を挿入
        let now = Utc::now().to_rfc3339();
        let issue_row: (i64,) = sqlx::query_as(
            "INSERT INTO issues (project_id, github_number, github_id, title, status, author_login,
              labels, created_by, github_created_at, github_updated_at, synced_at)
             VALUES (?, 1, 100, 'fix', 'open', 'user', '[]', 'user', ?, ?, ?) RETURNING id",
        )
        .bind(pid)
        .bind(&now)
        .bind(&now)
        .bind(&now)
        .fetch_one(&state.db)
        .await
        .unwrap();
        let issue_id = issue_row.0;

        // document を直接 SQL で挿入
        let doc_row: (i64,) = sqlx::query_as(
            "INSERT INTO documents (project_id, path, title, push_status, is_dirty, created_at, updated_at)
             VALUES (?, 'docs/spec.md', 'Spec', 'synced', 0, ?, ?) RETURNING id",
        )
        .bind(pid)
        .bind(&now)
        .bind(&now)
        .fetch_one(&state.db)
        .await
        .unwrap();
        let doc_id = doc_row.0;

        // link add
        db::issue::link_add(&state.db, issue_id, doc_id, "manual", "user")
            .await
            .unwrap();

        // list
        let links = db::issue::link_list(&state.db, issue_id).await.unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].issue_id, issue_id);
        assert_eq!(links[0].document_id, doc_id);

        // remove
        db::issue::link_remove(&state.db, issue_id, doc_id).await.unwrap();
        let links_after = db::issue::link_list(&state.db, issue_id).await.unwrap();
        assert!(links_after.is_empty());
    }

    // 🔴 Red: draft_cancel で下書きが DB から消えること
    #[tokio::test]
    async fn test_draft_cancel_removes_from_db() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let draft = db::issue::draft_create(&state.db, pid).await.unwrap();
        // command layer delegates to db::issue::draft_delete
        db::issue::draft_delete(&state.db, draft.id).await.unwrap();
        let list = db::issue::draft_list(&state.db, pid).await.unwrap();
        assert!(list.is_empty());
    }

    // 🔴 Red: 存在しない draft_id は NotFound エラー
    #[tokio::test]
    async fn test_draft_cancel_not_found_returns_error() {
        let (state, _dir) = setup().await;
        let result = db::issue::draft_delete(&state.db, 9999).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            AppError::NotFound(_) => {}
            other => panic!("Expected NotFound, got {:?}", other),
        }
    }

    // 🔴 Red: draft_update で status を 'submitted' に変更できること
    #[tokio::test]
    async fn test_draft_update_status_to_submitted() {
        let (state, _dir) = setup().await;
        let pid = insert_project(&state).await;
        let draft = db::issue::draft_create(&state.db, pid).await.unwrap();

        let patch = crate::models::issue::IssueDraftPatch {
            id: draft.id,
            title: None,
            body: None,
            draft_body: None,
            wizard_context: None,
            labels: None,
            assignee_login: None,
            status: Some("submitted".to_string()),
            github_issue_id: Some(999),
        };
        let updated = db::issue::draft_update(&state.db, &patch).await.unwrap();
        assert_eq!(updated.status, "submitted");
        assert_eq!(updated.github_issue_id, Some(999));
    }
}
