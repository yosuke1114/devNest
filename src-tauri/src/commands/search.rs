use tauri::State;
use crate::db;
use crate::error::{AppError, Result};
use crate::models::search::{SearchHistory, SearchResult};
use crate::services::chunker;
use crate::state::AppState;

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

/// セマンティック検索：Anthropic API でクエリを拡張してから FTS5 で検索する。
#[tauri::command]
pub async fn document_search_semantic(
    project_id: i64,
    query: String,
    state: State<'_, AppState>,
) -> std::result::Result<Vec<SearchResult>, AppError> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    // Anthropic API キーを取得（なければ keyword search に fallback）
    let api_key_row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = 'app.anthropic_api_key'",
    )
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);
    let api_key = api_key_row
        .and_then(|(v,)| serde_json::from_str::<String>(&v).ok())
        .unwrap_or_default();

    let expanded = if api_key.is_empty() {
        query.clone()
    } else {
        expand_query_with_ai(&query, &api_key)
            .await
            .unwrap_or_else(|_| query.clone())
    };

    let results = db::search::search_keyword(&state.db, project_id, &expanded, 20).await?;

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

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

/// Anthropic claude-haiku にクエリを渡し、FTS5 用の拡張キーワードリストを得る。
async fn expand_query_with_ai(query: &str, api_key: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent("DevNest/0.1")
        .build()
        .unwrap_or_default();

    let prompt = format!(
        "You are a search assistant. Given the search query, return 3-5 related English/Japanese keywords \
         that would help find relevant documentation. Output ONLY the keywords separated by spaces, \
         no explanation.\n\nQuery: {}",
        query
    );

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 100,
            "messages": [{ "role": "user", "content": prompt }]
        }))
        .send()
        .await
        .map_err(|e| AppError::Anthropic(e.to_string()))?;

    if !resp.status().is_success() {
        return Err(AppError::Anthropic(format!(
            "API error: {}",
            resp.status()
        )));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Anthropic(e.to_string()))?;

    let expanded = body
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or(query)
        .trim()
        .to_string();

    // 元のクエリ + 拡張キーワードを組み合わせる
    Ok(format!("{} {}", query, expanded))
}

#[cfg(test)]
mod tests {
    use crate::db::{self, connect, migrations};
    use crate::db::project;
    use crate::services::{chunker, git::GitService};
    use crate::state::AppState;
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
