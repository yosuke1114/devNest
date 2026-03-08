use chrono::Utc;
use crate::db::DbPool;
use crate::error::Result;
use crate::models::search::{SearchHistory, SearchResult};
use crate::services::chunker::Chunk;

/// ドキュメントの既存チャンク + FTS エントリを削除する。
pub async fn delete_document_index(pool: &DbPool, document_id: i64) -> Result<()> {
    // FTS: chunk_id でエントリを削除
    let chunk_ids: Vec<(i64,)> = sqlx::query_as(
        "SELECT id FROM document_chunks WHERE document_id = ?",
    )
    .bind(document_id)
    .fetch_all(pool)
    .await?;

    for (cid,) in &chunk_ids {
        sqlx::query("DELETE FROM documents_fts WHERE chunk_id = ?")
            .bind(cid)
            .execute(pool)
            .await?;
    }

    sqlx::query("DELETE FROM document_chunks WHERE document_id = ?")
        .bind(document_id)
        .execute(pool)
        .await?;

    Ok(())
}

/// チャンク配列を document_chunks と documents_fts に挿入する。
pub async fn index_document(
    pool: &DbPool,
    document_id: i64,
    path: &str,
    chunks: &[Chunk],
) -> Result<()> {
    let now = Utc::now().to_rfc3339();

    for chunk in chunks {
        let token_count = chunk.content.split_whitespace().count() as i64;

        let row: (i64,) = sqlx::query_as(
            r#"
            INSERT INTO document_chunks
              (document_id, chunk_index, section_heading, content, start_line, end_line, token_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(document_id, chunk_index) DO UPDATE SET
              section_heading = excluded.section_heading,
              content         = excluded.content,
              start_line      = excluded.start_line,
              end_line        = excluded.end_line,
              token_count     = excluded.token_count
            RETURNING id
            "#,
        )
        .bind(document_id)
        .bind(chunk.chunk_index as i64)
        .bind(&chunk.section_heading)
        .bind(&chunk.content)
        .bind(chunk.start_line as i64)
        .bind(chunk.end_line as i64)
        .bind(token_count)
        .bind(&now)
        .fetch_one(pool)
        .await?;

        let chunk_id = row.0;

        // FTS に挿入（既存エントリは削除してから）
        sqlx::query("DELETE FROM documents_fts WHERE chunk_id = ?")
            .bind(chunk_id)
            .execute(pool)
            .await?;

        sqlx::query(
            "INSERT INTO documents_fts (content, section_heading, document_id, chunk_id, start_line)
             VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&chunk.content)
        .bind(&chunk.section_heading)
        .bind(document_id)
        .bind(chunk_id)
        .bind(chunk.start_line as i64)
        .execute(pool)
        .await?;
    }

    // documents.embedding_status を 'indexed' に更新
    sqlx::query(
        "UPDATE documents SET embedding_status = 'indexed', last_indexed_at = ? WHERE id = ?",
    )
    .bind(&now)
    .bind(document_id)
    .execute(pool)
    .await?;

    // path は使わない（document_id + documents テーブルから取得可能）
    let _ = path;

    Ok(())
}

/// FTS5 クエリ用に特殊文字をエスケープする。
fn fts5_escape(query: &str) -> String {
    let words: Vec<String> = query
        .split_whitespace()
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{}\"", w.replace('"', "")))
        .collect();
    if words.is_empty() {
        return String::new();
    }
    words.join(" OR ")
}

/// FTS5 キーワード検索。BM25 スコア順で返す。
pub async fn search_keyword(
    pool: &DbPool,
    project_id: i64,
    query: &str,
    limit: i64,
) -> Result<Vec<SearchResult>> {
    let safe_query = fts5_escape(query);
    if safe_query.is_empty() {
        return Ok(vec![]);
    }
    // FTS5 で chunk_id を取得し、document_chunks と JOIN する
    let fts_rows: Vec<(i64, f64)> = sqlx::query_as(
        "SELECT CAST(chunk_id AS INTEGER), -bm25(documents_fts) AS score
         FROM documents_fts
         WHERE documents_fts MATCH ?
         ORDER BY score DESC
         LIMIT ?",
    )
    .bind(&safe_query)
    .bind(limit * 3) // 多めに取得して project_id でフィルタリング
    .fetch_all(pool)
    .await?;

    type ChunkRow = (i64, String, Option<String>, Option<String>, String, i64);

    let mut rows: Vec<SearchResult> = Vec::new();
    for (chunk_id, score) in fts_rows {
        let row: Option<ChunkRow> = sqlx::query_as(
                r#"SELECT dc.document_id, d.path, d.title, dc.section_heading, dc.content, dc.start_line
                   FROM document_chunks dc
                   JOIN documents d ON d.id = dc.document_id
                   WHERE dc.id = ? AND d.project_id = ?"#,
            )
            .bind(chunk_id)
            .bind(project_id)
            .fetch_optional(pool)
            .await?;

        if let Some((document_id, path, title, section_heading, content, start_line)) = row {
            rows.push(SearchResult {
                document_id,
                chunk_id,
                path,
                title,
                section_heading,
                content,
                start_line,
                score,
            });
        }
        if rows.len() >= limit as usize {
            break;
        }
    }

    Ok(rows)
}

/// 検索履歴を追加する（同一 query があれば削除してから）。
pub async fn add_history(
    pool: &DbPool,
    project_id: i64,
    query: &str,
    search_type: &str,
    result_count: Option<i64>,
) -> Result<()> {
    let now = Utc::now().to_rfc3339();

    // 同一 (project_id, query) を削除
    sqlx::query("DELETE FROM search_history WHERE project_id = ? AND query = ?")
        .bind(project_id)
        .bind(query)
        .execute(pool)
        .await?;

    sqlx::query(
        "INSERT INTO search_history (project_id, query, search_type, result_count, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(project_id)
    .bind(query)
    .bind(search_type)
    .bind(result_count)
    .bind(&now)
    .execute(pool)
    .await?;

    // 古い履歴を削除（最新 50 件を残す）
    sqlx::query(
        "DELETE FROM search_history WHERE project_id = ? AND id NOT IN (
           SELECT id FROM search_history WHERE project_id = ?
           ORDER BY created_at DESC LIMIT 50
         )",
    )
    .bind(project_id)
    .bind(project_id)
    .execute(pool)
    .await?;

    Ok(())
}

/// 検索履歴を新しい順で返す。
pub async fn list_history(
    pool: &DbPool,
    project_id: i64,
    limit: i64,
) -> Result<Vec<SearchHistory>> {
    let rows = sqlx::query_as::<_, SearchHistory>(
        "SELECT * FROM search_history WHERE project_id = ? ORDER BY created_at DESC LIMIT ?",
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
    use crate::services::chunker::chunk_document;
    use tempfile::TempDir;

    async fn setup() -> (DbPool, TempDir) {
        let dir = TempDir::new().unwrap();
        let url = format!("sqlite:{}", dir.path().join("test.db").display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (pool, dir)
    }

    async fn insert_project_and_document(pool: &DbPool) -> (i64, i64) {
        let now = Utc::now().to_rfc3339();
        let (pid,): (i64,) = sqlx::query_as(
            "INSERT INTO projects (name, repo_owner, repo_name, local_path, created_at, updated_at)
             VALUES ('P','o','r','/tmp/p', ?, ?) RETURNING id",
        )
        .bind(&now)
        .bind(&now)
        .fetch_one(pool)
        .await
        .unwrap();

        let (did,): (i64,) = sqlx::query_as(
            "INSERT INTO documents (project_id, path, created_at, updated_at)
             VALUES (?, 'docs/arch.md', ?, ?) RETURNING id",
        )
        .bind(pid)
        .bind(&now)
        .bind(&now)
        .fetch_one(pool)
        .await
        .unwrap();

        (pid, did)
    }

    // 🔴 Red: index_document がチャンクを DB に挿入できること
    #[tokio::test]
    async fn test_index_document_inserts_chunks() {
        let (pool, _dir) = setup().await;
        let (_, did) = insert_project_and_document(&pool).await;

        let md = "## Intro\nHello world.\n\n## Design\nWe use git2-rs.";
        let chunks = chunk_document(md);
        index_document(&pool, did, "docs/arch.md", &chunks).await.unwrap();

        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM document_chunks WHERE document_id = ?")
            .bind(did)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
    }

    // 🔴 Red: search_keyword がマッチを返すこと
    #[tokio::test]
    async fn test_search_keyword_finds_match() {
        let (pool, _dir) = setup().await;
        let (pid, did) = insert_project_and_document(&pool).await;

        let md = "## Design\nWe use git2-rs for commits.";
        let chunks = chunk_document(md);
        index_document(&pool, did, "docs/arch.md", &chunks).await.unwrap();

        let results = search_keyword(&pool, pid, "git2-rs", 10).await.unwrap();
        assert!(!results.is_empty());
        assert!(results[0].content.contains("git2-rs"));
    }

    // 🔴 Red: search_keyword がマッチしない場合は空を返すこと
    #[tokio::test]
    async fn test_search_keyword_no_match() {
        let (pool, _dir) = setup().await;
        let (pid, did) = insert_project_and_document(&pool).await;

        let md = "## Intro\nHello world.";
        let chunks = chunk_document(md);
        index_document(&pool, did, "docs/arch.md", &chunks).await.unwrap();

        let results = search_keyword(&pool, pid, "tokio", 10).await.unwrap();
        assert!(results.is_empty());
    }

    // 🔴 Red: add_history / list_history が動作すること
    #[tokio::test]
    async fn test_search_history() {
        let (pool, _dir) = setup().await;
        let (pid, _) = insert_project_and_document(&pool).await;

        add_history(&pool, pid, "git commit", "keyword", Some(3)).await.unwrap();
        add_history(&pool, pid, "oauth flow", "semantic", None).await.unwrap();

        let history = list_history(&pool, pid, 10).await.unwrap();
        assert_eq!(history.len(), 2);
        // 新しい順
        assert_eq!(history[0].query, "oauth flow");
    }

    // ─── fts5_escape 単体テスト ──────────────────────────────────────────────

    // 🔴 Red: 空文字列は空を返すこと
    #[test]
    fn test_fts5_escape_empty_returns_empty() {
        assert_eq!(fts5_escape(""), "");
    }

    // 🔴 Red: 空白のみも空を返すこと
    #[test]
    fn test_fts5_escape_whitespace_only_returns_empty() {
        assert_eq!(fts5_escape("   "), "");
        assert_eq!(fts5_escape("\t\n"), "");
    }

    // 🔴 Red: 1 語はクォートで囲まれること
    #[test]
    fn test_fts5_escape_single_word() {
        assert_eq!(fts5_escape("hello"), "\"hello\"");
    }

    // 🔴 Red: 複数語は OR で結合されること
    #[test]
    fn test_fts5_escape_multiple_words_joined_with_or() {
        assert_eq!(fts5_escape("foo bar baz"), "\"foo\" OR \"bar\" OR \"baz\"");
    }

    // 🔴 Red: ダブルクォートを含む語はクォートが除去されること
    #[test]
    fn test_fts5_escape_strips_double_quotes() {
        // 入力: hello"world → クォート除去 → helloworld → "helloworld"
        assert_eq!(fts5_escape("hello\"world"), "\"helloworld\"");
    }

    // 🔴 Red: FTS5 特殊文字 * を含む語が安全にフレーズとして扱われること
    #[test]
    fn test_fts5_escape_asterisk_wrapped_in_phrase() {
        // フレーズ内の * は FTS5 ワイルドカードとして機能しない
        assert_eq!(fts5_escape("foo*"), "\"foo*\"");
    }

    // 🔴 Red: 括弧を含む語が安全に処理されること
    #[test]
    fn test_fts5_escape_parentheses_are_safe() {
        let result = fts5_escape("foo(bar)");
        assert_eq!(result, "\"foo(bar)\"");
    }

    // 🔴 Red: 日本語クエリが正しくエスケープされること
    #[test]
    fn test_fts5_escape_japanese_word() {
        let result = fts5_escape("アーキテクチャ");
        assert_eq!(result, "\"アーキテクチャ\"");
    }

    // 🔴 Red: 日本語複数語が OR で結合されること
    #[test]
    fn test_fts5_escape_japanese_multiple_words() {
        let result = fts5_escape("認証 認可 設計");
        assert_eq!(result, "\"認証\" OR \"認可\" OR \"設計\"");
    }

    // ─── delete_document_index ────────────────────────────────────────────────

    // 🔴 Red: delete_document_index が FTS エントリも削除すること
    #[tokio::test]
    async fn test_delete_document_index() {
        let (pool, _dir) = setup().await;
        let (pid, did) = insert_project_and_document(&pool).await;

        let md = "## Section\nSome content.";
        let chunks = chunk_document(md);
        index_document(&pool, did, "docs/arch.md", &chunks).await.unwrap();

        delete_document_index(&pool, did).await.unwrap();

        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM document_chunks WHERE document_id = ?")
            .bind(did)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);

        // FTS も空になっていること
        let results = search_keyword(&pool, pid, "content", 10).await.unwrap();
        assert!(results.is_empty());
    }
}
