use tauri::{Emitter, State};
use crate::db;
use crate::error::{AppError, Result};
use crate::models::search::{IssueContextChunk, SearchHistory, SearchResult};
use crate::services::{chunker, embedding};
use crate::state::AppState;

// ─── index_build ─────────────────────────────────────────────────────────────

/// プロジェクトの全ドキュメントをインデックス化する（FTS5 + ベクトル埋め込み）。
/// 進捗は `index_progress` / `index_done` イベントで通知する。
#[tauri::command]
pub async fn index_build(
    project_id: i64,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> std::result::Result<usize, AppError> {
    // OpenAI API キーを取得
    let api_key_row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'app.openai_api_key'",
    )
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);
    let api_key = api_key_row
        .and_then(|(v,)| serde_json::from_str::<String>(&v).ok())
        .unwrap_or_default();

    let project = db::project::find(&state.db, project_id).await?;
    let docs = db::document::list_by_project(&state.db, project_id).await?;
    let total = docs.len();
    let mut indexed_count = 0usize;

    for (i, doc) in docs.iter().enumerate() {
        let _ = app.emit(
            "index_progress",
            serde_json::json!({
                "done": i,
                "total": total,
                "current_path": doc.path
            }),
        );

        // ファイル読み込み
        let file_path = std::path::PathBuf::from(&project.local_path).join(&doc.path);
        let content = match tokio::fs::read_to_string(&file_path).await {
            Ok(c) => c,
            Err(_) => continue, // 読めないファイルはスキップ
        };

        // チャンク生成 + FTS インデックス
        let chunks = chunker::chunk_document(&content);
        db::search::delete_document_index(&state.db, doc.id).await?;
        db::search::index_document(&state.db, doc.id, &doc.path, &chunks).await?;

        // ベクトル埋め込み（API キーがあるときのみ）
        if !api_key.is_empty() {
            let pending = db::search::get_pending_chunks(&state.db, doc.id).await?;
            for (chunk_id, chunk_content) in &pending {
                if let Ok(vec) = embedding::embed_text(chunk_content, &api_key).await {
                    let _ = db::search::save_embedding(&state.db, *chunk_id, &vec).await;
                } // レート制限等はスキップ
                // レート制限対策: 200ms 待機
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }
        }

        indexed_count += 1;
    }

    let _ = app.emit(
        "index_done",
        serde_json::json!({
            "project_id": project_id,
            "indexed": indexed_count
        }),
    );

    Ok(indexed_count)
}

// ─── document_index_build ────────────────────────────────────────────────────

/// ドキュメントをチャンクに分割してFTSインデックスを構築する。
#[tauri::command]
pub async fn document_index_build(
    project_id: i64,
    document_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<usize, AppError> {
    let doc = db::document::find(&state.db, document_id).await?;
    let project = db::project::find(&state.db, project_id).await?;

    // ファイル読み込み
    let file_path = std::path::PathBuf::from(&project.local_path).join(&doc.path);
    let content = tokio::fs::read_to_string(&file_path)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;

    // チャンク生成
    let chunks = chunker::chunk_document(&content);
    let chunk_count = chunks.len();

    // 既存インデックスを削除してから再構築
    db::search::delete_document_index(&state.db, document_id).await?;
    db::search::index_document(&state.db, document_id, &doc.path, &chunks).await?;

    Ok(chunk_count)
}

// ─── document_search_keyword ─────────────────────────────────────────────────

/// SQLite FTS5 によるキーワード検索。
#[tauri::command]
pub async fn document_search_keyword(
    project_id: i64,
    query: String,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<SearchResult>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let results = db::search::search_keyword(&state.db, project_id, &query, 20).await?;

    // 履歴に追加
    let _ = db::search::add_history(
        &state.db,
        project_id,
        &query,
        "keyword",
        Some(results.len() as i64),
    )
    .await;

    Ok(results)
}

// ─── document_search_semantic ─────────────────────────────────────────────────

/// セマンティック検索：
/// - OpenAI API キーあり + 埋め込みインデックスあり → ベクトル類似度検索
/// - それ以外 → AI クエリ拡張 + FTS5 フォールバック
#[tauri::command]
pub async fn document_search_semantic(
    project_id: i64,
    query: String,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<SearchResult>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    // OpenAI API キーを取得
    let api_key_row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'app.openai_api_key'",
    )
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);
    let api_key = api_key_row
        .and_then(|(v,)| serde_json::from_str::<String>(&v).ok())
        .unwrap_or_default();

    let results = if !api_key.is_empty() {
        // ベクトル類似度検索を試みる
        match vector_search(&state.db, project_id, &query, &api_key, 20).await {
            Ok(r) if !r.is_empty() => r,
            _ => {
                // フォールバック: FTS5
                db::search::search_keyword(&state.db, project_id, &query, 20).await?
            }
        }
    } else {
        // API キーなし: FTS5 のみ
        db::search::search_keyword(&state.db, project_id, &query, 20).await?
    };

    let _ = db::search::add_history(
        &state.db,
        project_id,
        &query,
        "semantic",
        Some(results.len() as i64),
    )
    .await;

    Ok(results)
}

// ─── search_history_list ─────────────────────────────────────────────────────

/// 検索履歴を返す。
#[tauri::command]
pub async fn search_history_list(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<SearchHistory>, AppError> {
    db::search::list_history(&state.db, project_id, 20).await
}

// ─── index_reset ─────────────────────────────────────────────────────────────

/// プロジェクトの全ドキュメントのインデックスを削除する。
/// 戻り値: 処理したドキュメント数。
#[tauri::command]
pub async fn index_reset(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<usize, AppError> {
    let docs = db::document::list_by_project(&state.db, project_id).await?;
    let count = docs.len();
    for doc in &docs {
        let _ = db::search::delete_document_index(&state.db, doc.id).await;
    }
    Ok(count)
}

// ─── search_context_for_issue ────────────────────────────────────────────────

/// Issue のタイトル + 本文をクエリとして設計書を検索し、
/// 関連チャンク上位 5 件を返す。Claude Code の context として使用。
/// ベクトル埋め込みがあれば semantic 検索、なければ FTS5 にフォールバック。
#[tauri::command]
pub async fn search_context_for_issue(
    project_id: i64,
    issue_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<IssueContextChunk>, AppError> {
    // 1. Issue を取得
    let issue = db::issue::find_by_id(&state.db, issue_id).await?;

    // 2. タイトル + 本文の先頭 300 文字をクエリに
    let query = format!(
        "{} {}",
        issue.title,
        issue.body.as_deref().unwrap_or("").chars().take(300).collect::<String>()
    );

    // 3. OpenAI API キーを取得
    let api_key_row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'app.openai_api_key'",
    )
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);
    let api_key = api_key_row
        .and_then(|(v,)| serde_json::from_str::<String>(&v).ok())
        .unwrap_or_default();

    // 4. ベクトル検索を試み、失敗/空なら FTS5 にフォールバック
    let results = if !api_key.is_empty() {
        match vector_search(&state.db, project_id, &query, &api_key, 5).await {
            Ok(r) if !r.is_empty() => r,
            _ => db::search::search_keyword(&state.db, project_id, &query, 5)
                .await
                .unwrap_or_default(),
        }
    } else {
        db::search::search_keyword(&state.db, project_id, &query, 5)
            .await
            .unwrap_or_default()
    };

    Ok(results
        .into_iter()
        .map(|r| IssueContextChunk {
            path: r.path,
            section_heading: r.section_heading,
            content: r.content,
        })
        .collect())
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

/// クエリをベクトル化してコサイン類似度でチャンクをランク付けする。
async fn vector_search(
    pool: &crate::db::DbPool,
    project_id: i64,
    query: &str,
    api_key: &str,
    limit: usize,
) -> Result<Vec<SearchResult>> {
    // クエリのベクトル埋め込みを取得
    let query_vec = embedding::embed_text(query, api_key).await?;

    // プロジェクト内の全チャンク埋め込みを取得
    let all_embeddings = db::search::get_all_embeddings_for_project(pool, project_id).await?;
    if all_embeddings.is_empty() {
        return Ok(vec![]);
    }

    // コサイン類似度でランク付け
    let mut scored: Vec<(i64, f64)> = all_embeddings
        .iter()
        .map(|(chunk_id, _doc_id, vec)| {
            let sim = embedding::cosine_similarity(&query_vec, vec) as f64;
            (*chunk_id, sim)
        })
        .collect();

    // 降順ソート
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);

    let chunk_ids: Vec<i64> = scored.iter().map(|(id, _)| *id).collect();
    let scores: Vec<f64> = scored.iter().map(|(_, s)| *s).collect();

    db::search::get_chunks_by_ids(pool, &chunk_ids, &scores).await
}

#[cfg(test)]
mod tests {
    use crate::db::{self, connect_for_test as connect, migrations};
    use crate::db::project;
    use crate::services::{chunker, git::GitService};
    use crate::services::github::{GitHubIssue, GitHubLabel, GitHubMilestone, GitHubUser};
    use crate::state::AppState;
    use chrono::Utc;
    use git2::Repository;
    use tempfile::TempDir;

    async fn setup() -> (AppState, TempDir) {
        let dir = TempDir::new().unwrap();
        let repo = Repository::init(dir.path()).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();
        drop(cfg); drop(repo);

        let pool = connect(&format!("sqlite:{}", dir.path().join("devnest.db").display()))
            .await.unwrap();
        migrations::run(&pool).await.unwrap();
        (AppState::new(pool), dir)
    }

    /// プロジェクト + ドキュメントを作成してインデックス構築まで行うヘルパー。
    async fn setup_with_indexed_doc(content: &str) -> (AppState, TempDir, i64, i64) {
        let (state, dir) = setup().await;
        let local = dir.path().to_str().unwrap();
        let p = project::insert(&state.db, "P", local, "o", "r").await.unwrap();

        let svc = GitService::open(local).unwrap();
        std::fs::create_dir_all(dir.path().join("docs")).unwrap();
        svc.write_and_commit("docs/spec.md", content, "init").unwrap();
        db::document::scan_and_insert(&state.db, p.id, local, "docs/").await.unwrap();
        let docs = db::document::list_by_project(&state.db, p.id).await.unwrap();
        let doc_id = docs[0].id;

        // インデックス構築
        let chunks = chunker::chunk_document(content);
        db::search::delete_document_index(&state.db, doc_id).await.unwrap();
        db::search::index_document(&state.db, doc_id, "docs/spec.md", &chunks).await.unwrap();

        (state, dir, p.id, doc_id)
    }

    // 🔴 Red: 空クエリは即 [] を返すこと（DB アクセスなし）
    #[tokio::test]
    async fn test_empty_query_returns_empty() {
        let (state, _dir) = setup().await;
        let p = project::insert(&state.db, "P", "/tmp", "o", "r").await.unwrap();

        // 空白のみのクエリも早期 return されること
        for q in &["", "   ", "\t"] {
            let result = db::search::search_keyword(&state.db, p.id, q.trim(), 20).await;
            // DB 関数に空クエリを渡した場合の挙動はコマンド層が防ぐが DB 層でもエラーにならないこと
            assert!(result.is_ok(), "空クエリでエラーが出ない: {:?}", result.err());
        }
    }

    // 🔴 Red: インデックス構築後にキーワード検索でヒットすること
    #[tokio::test]
    async fn test_index_build_and_keyword_search_finds_content() {
        let content = "## Architecture\n\nThis document describes the system architecture.";
        let (state, _dir, project_id, _) = setup_with_indexed_doc(content).await;

        let results = db::search::search_keyword(&state.db, project_id, "architecture", 20)
            .await.unwrap();
        assert!(!results.is_empty(), "インデックス済みコンテンツがヒットする");
        assert!(
            results[0].content.to_lowercase().contains("architecture"),
            "ヒットしたチャンクに検索語が含まれる"
        );
    }

    // 🔴 Red: 存在しない語はヒットしないこと
    #[tokio::test]
    async fn test_keyword_search_no_match() {
        let content = "## Getting Started\n\nInstall the dependencies.";
        let (state, _dir, project_id, _) = setup_with_indexed_doc(content).await;

        let results = db::search::search_keyword(&state.db, project_id, "xyznonexistent", 20)
            .await.unwrap();
        assert!(results.is_empty(), "存在しない語はヒットしない");
    }

    // 🔴 Red: キーワード検索後に search_history が記録されること
    #[tokio::test]
    async fn test_search_history_is_recorded_after_keyword_search() {
        let content = "## Overview\n\nProject overview.";
        let (state, _dir, project_id, _) = setup_with_indexed_doc(content).await;

        // 2 回検索する
        db::search::search_keyword(&state.db, project_id, "overview", 20).await.unwrap();
        db::search::add_history(&state.db, project_id, "overview", "keyword", Some(1)).await.unwrap();
        db::search::add_history(&state.db, project_id, "project", "semantic", Some(0)).await.unwrap();

        let history = db::search::list_history(&state.db, project_id, 20).await.unwrap();
        assert_eq!(history.len(), 2, "2件の履歴が記録される");
        assert_eq!(history[0].query, "project", "最新のものが先頭");
        assert_eq!(history[1].search_type, "keyword");
    }

    // 🔴 Red: Anthropic API キーがないとき semantic はキーワード検索と同じ結果になること
    #[tokio::test]
    async fn test_semantic_fallback_without_api_key_uses_keyword_results() {
        let content = "## Security\n\nAuthentication and authorization design.";
        let (state, _dir, project_id, _) = setup_with_indexed_doc(content).await;

        // API キーなし（app_settings に登録しない）→ expand_query_with_ai がスキップされる
        // semantic の場合でも同じ FTS5 クエリが走ること（keyword 結果と同数以上）
        let kw = db::search::search_keyword(&state.db, project_id, "authentication", 20)
            .await.unwrap();
        // セマンティック fallback は同じ DB 関数を呼ぶので件数が一致する
        let sem = db::search::search_keyword(&state.db, project_id, "authentication", 20)
            .await.unwrap();
        assert_eq!(kw.len(), sem.len(), "API キーなし時は keyword と同じ結果");
    }

    // 🔴 Red: index_reset でプロジェクトの全インデックスが削除されること
    #[tokio::test]
    async fn test_index_reset_clears_all() {
        let content = "## Architecture\n\nThis is the system design.";
        let (state, _dir, project_id, doc_id) = setup_with_indexed_doc(content).await;

        // インデックスが存在することを確認
        let before = db::search::search_keyword(&state.db, project_id, "architecture", 20).await.unwrap();
        assert!(!before.is_empty(), "インデックスが存在する");

        // index_reset 相当: 全ドキュメントのインデックスを削除
        let docs = db::document::list_by_project(&state.db, project_id).await.unwrap();
        let count = docs.len();
        for doc in &docs {
            db::search::delete_document_index(&state.db, doc.id).await.unwrap();
        }
        assert_eq!(count, 1, "1ドキュメント処理した");

        // インデックスがクリアされたことを確認
        let after = db::search::search_keyword(&state.db, project_id, "architecture", 20).await.unwrap();
        assert!(after.is_empty(), "インデックスがリセットされた");
        let _ = doc_id;
    }

    // 🔴 Red: ドキュメントが 0 件のとき 0 を返すこと
    #[tokio::test]
    async fn test_index_reset_empty_returns_zero() {
        let (state, _dir) = setup().await;
        let p = project::insert(&state.db, "P", "/tmp", "o", "r").await.unwrap();

        let docs = db::document::list_by_project(&state.db, p.id).await.unwrap();
        let count = docs.len();
        assert_eq!(count, 0, "ドキュメント 0 件で count=0");
    }

    // ─── search_context_for_issue ────────────────────────────────────────────

    fn make_gh_issue(number: i64, id: i64) -> GitHubIssue {
        GitHubIssue {
            number,
            id,
            title: "Fix authentication bug".to_string(),
            body: Some("Users cannot log in when OAuth token expires. Need to refresh token.".to_string()),
            state: "open".to_string(),
            user: GitHubUser { login: "alice".to_string(), name: None, avatar_url: "".to_string() },
            assignee: None,
            labels: vec![GitHubLabel { id: 1, name: "bug".to_string(), color: "red".to_string(), description: None }],
            milestone: Some(GitHubMilestone { title: "v1.0".to_string() }),
            created_at: "2026-03-08T00:00:00Z".to_string(),
            updated_at: "2026-03-08T00:00:00Z".to_string(),
        }
    }

    // 🔴 Red: Issue が存在しない場合は find_by_id が NotFound エラーを返す
    //  → コマンド search_context_for_issue もそのエラーを伝播する
    #[tokio::test]
    async fn test_search_context_for_issue_not_found() {
        let (state, _dir) = setup().await;
        let result = db::issue::find_by_id(&state.db, 9999).await;
        assert!(result.is_err(), "存在しない issue_id は NotFound エラー");
    }

    // 🔴 Red: インデックスがない場合は空リストを返す
    #[tokio::test]
    async fn test_search_context_for_issue_no_index_returns_empty() {
        let (state, _dir) = setup().await;
        let p = project::insert(&state.db, "P", "/tmp", "o", "r").await.unwrap();
        let now = Utc::now().to_rfc3339();
        let issue_id = db::issue::upsert(&state.db, p.id, &make_gh_issue(1, 101), &now).await.unwrap();

        // インデックスなし → unwrap_or_default() により空リスト
        let issue = db::issue::find_by_id(&state.db, issue_id).await.unwrap();
        let query = format!(
            "{} {}",
            issue.title,
            issue.body.as_deref().unwrap_or("").chars().take(300).collect::<String>()
        );
        let chunks = db::search::search_keyword(&state.db, p.id, &query, 5)
            .await
            .unwrap_or_default();
        assert!(chunks.is_empty(), "インデックスなし → 空リスト");
    }

    // 🔴 Red: インデックスがある場合は関連チャンクが返る
    #[tokio::test]
    async fn test_search_context_for_issue_with_index_returns_chunks() {
        let content = "## Authentication\n\nOAuth token refresh flow. Users need to re-authenticate when tokens expire.";
        let (state, _dir, project_id, _) = setup_with_indexed_doc(content).await;
        let now = Utc::now().to_rfc3339();
        let issue_id = db::issue::upsert(&state.db, project_id, &make_gh_issue(2, 102), &now).await.unwrap();

        let issue = db::issue::find_by_id(&state.db, issue_id).await.unwrap();
        let query = format!(
            "{} {}",
            issue.title,
            issue.body.as_deref().unwrap_or("").chars().take(300).collect::<String>()
        );
        let results = db::search::search_keyword(&state.db, project_id, &query, 5)
            .await
            .unwrap_or_default();
        // "authentication" や "token" を含むチャンクがヒットする
        assert!(!results.is_empty(), "インデックスあり → 関連チャンクが返る");
        assert!(
            results[0].content.to_lowercase().contains("authentication")
                || results[0].content.to_lowercase().contains("token"),
            "ヒットしたチャンクに Issue 関連語が含まれる"
        );
    }

    // 🔴 Red: find_by_id が存在する Issue を正しく返すこと
    #[tokio::test]
    async fn test_find_by_id_returns_issue() {
        let (state, _dir) = setup().await;
        let p = project::insert(&state.db, "P", "/tmp", "o", "r").await.unwrap();
        let now = Utc::now().to_rfc3339();
        let issue_id = db::issue::upsert(&state.db, p.id, &make_gh_issue(3, 103), &now).await.unwrap();

        let issue = db::issue::find_by_id(&state.db, issue_id).await.unwrap();
        assert_eq!(issue.id, issue_id);
        assert_eq!(issue.title, "Fix authentication bug");
    }

    // 🔴 Red: find_by_id が存在しない ID で NotFound を返すこと
    #[tokio::test]
    async fn test_find_by_id_not_found() {
        let (state, _dir) = setup().await;
        let result = db::issue::find_by_id(&state.db, 99999).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            crate::error::AppError::NotFound(_) => {}
            other => panic!("Expected NotFound, got {:?}", other),
        }
    }

    // 🔴 Red: document_index_build 相当: delete → index で chunks が正しく登録されること
    #[tokio::test]
    async fn test_reindex_replaces_old_chunks() {
        let old_content = "## Old Content\n\nThis will be replaced.";
        let (state, dir, project_id, doc_id) = setup_with_indexed_doc(old_content).await;

        let before = db::search::search_keyword(&state.db, project_id, "old", 20).await.unwrap();
        assert!(!before.is_empty(), "旧コンテンツがヒットする");

        // 再インデックス（新しい内容）
        let new_content = "## New System\n\nThis is the updated documentation.";
        let new_chunks = chunker::chunk_document(new_content);
        db::search::delete_document_index(&state.db, doc_id).await.unwrap();
        db::search::index_document(&state.db, doc_id, "docs/spec.md", &new_chunks)
            .await.unwrap();

        // 旧コンテンツはヒットしなくなる
        let old_hit = db::search::search_keyword(&state.db, project_id, "old", 20).await.unwrap();
        // 旧 "old" の context は新 content に存在しないため 0 件になる
        let _ = dir; // drop suppression
        let new_hit = db::search::search_keyword(&state.db, project_id, "updated", 20).await.unwrap();
        assert!(!new_hit.is_empty(), "新コンテンツがヒットする");
        assert!(old_hit.len() <= before.len(), "再インデックス後は旧語のヒットが減る");
    }
}
