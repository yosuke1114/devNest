use serde::{Deserialize, Serialize};

/// キーワード / セマンティック検索の結果チャンク。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub document_id: i64,
    pub chunk_id: i64,
    pub path: String,
    pub title: Option<String>,
    pub section_heading: Option<String>,
    pub content: String,
    pub start_line: i64,
    pub score: f64,
}

/// Issue のコンテキスト検索結果チャンク（Terminal セッション起動時に使用）。
#[derive(Debug, Clone, Serialize)]
pub struct IssueContextChunk {
    pub path: String,
    pub section_heading: Option<String>,
    pub content: String,
}

/// 検索履歴エントリ。
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SearchHistory {
    pub id: i64,
    pub project_id: i64,
    pub query: String,
    pub search_type: String,
    pub result_count: Option<i64>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    // 🔴 Red: SearchResult がシリアライズできること
    #[test]
    fn test_search_result_serializes() {
        let r = SearchResult {
            document_id: 1,
            chunk_id: 10,
            path: "docs/arch.md".to_string(),
            title: Some("Architecture".to_string()),
            section_heading: Some("## Overview".to_string()),
            content: "git2-rs を使って commit を行う。".to_string(),
            start_line: 8,
            score: 0.95,
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("chunk_id"));
        assert!(json.contains("section_heading"));
    }

    // 🔴 Red: SearchHistory が FromRow を実装していること（serde でチェック）
    #[test]
    fn test_search_history_deserializes() {
        let json = r#"{
            "id": 1, "project_id": 2, "query": "git commit",
            "search_type": "keyword", "result_count": 3,
            "created_at": "2026-03-08T00:00:00Z"
        }"#;
        let h: SearchHistory = serde_json::from_str(json).unwrap();
        assert_eq!(h.query, "git commit");
        assert_eq!(h.search_type, "keyword");
    }
}
