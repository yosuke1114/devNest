use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Document {
    pub id: i64,
    pub project_id: i64,
    pub path: String,
    pub title: Option<String>,
    pub sha: Option<String>,
    pub size_bytes: Option<i64>,
    pub embedding_status: String,
    pub push_status: String,
    pub is_dirty: bool,
    pub last_indexed_at: Option<String>,
    pub last_synced_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// document_get の戻り値（メタデータ + ファイル内容）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentWithContent {
    #[serde(flatten)]
    pub document: Document,
    pub content: String,
}

/// document_save / document_push_retry の戻り値
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveResult {
    pub sha: String,
    pub committed: bool,
    pub push_status: String, // "synced" | "pending_push" | "push_failed"
}

/// document_scan の戻り値
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub added: u32,
    pub updated: u32,
    pub deleted: u32,
    pub total: u32,
}

/// sync_log_list の戻り値
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SyncLog {
    pub id: i64,
    pub project_id: i64,
    pub operation: String,
    pub status: String,
    pub commit_sha: Option<String>,
    pub branch: Option<String>,
    pub file_path: Option<String>,
    pub retry_count: i64,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Red: Document.is_dirty が bool として扱えること（SQLite では 0/1 INTEGER）
    #[test]
    fn test_document_deserializes() {
        let json = r#"{
            "id": 1,
            "project_id": 1,
            "path": "docs/spec.md",
            "title": null,
            "sha": null,
            "size_bytes": null,
            "embedding_status": "pending",
            "push_status": "synced",
            "is_dirty": false,
            "last_indexed_at": null,
            "last_synced_at": null,
            "created_at": "2026-03-08T00:00:00Z",
            "updated_at": "2026-03-08T00:00:00Z"
        }"#;
        let doc: Document = serde_json::from_str(json).unwrap();
        assert_eq!(doc.path, "docs/spec.md");
        assert!(!doc.is_dirty);
    }

    // Red: DocumentWithContent が flatten で正しくシリアライズできること
    #[test]
    fn test_document_with_content_flattens() {
        let doc = Document {
            id: 1,
            project_id: 1,
            path: "docs/spec.md".to_string(),
            title: None,
            sha: None,
            size_bytes: None,
            embedding_status: "pending".to_string(),
            push_status: "synced".to_string(),
            is_dirty: false,
            last_indexed_at: None,
            last_synced_at: None,
            created_at: "2026-03-08T00:00:00Z".to_string(),
            updated_at: "2026-03-08T00:00:00Z".to_string(),
        };
        let with_content = DocumentWithContent {
            document: doc,
            content: "# Spec\n".to_string(),
        };
        let json = serde_json::to_string(&with_content).unwrap();
        // flatten により content と id が同じ階層に出る
        assert!(json.contains("\"content\""));
        assert!(json.contains(r#""id":1"#));
    }

    // Red: ScanResult の各フィールドが u32 であること
    #[test]
    fn test_scan_result_fields() {
        let result = ScanResult { added: 3, updated: 1, deleted: 0, total: 4 };
        assert_eq!(result.total, result.added + result.updated);
    }

    // Red: SaveResult が正しいフィールド名でシリアライズされること（フロントエンドの SaveResult 型と一致）
    #[test]
    fn test_save_result_serializes_correct_field_names() {
        let r = SaveResult {
            sha: "abc123".to_string(),
            committed: true,
            push_status: "synced".to_string(),
        };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains("\"sha\""), "sha フィールドが必要: {}", json);
        assert!(json.contains("\"committed\""), "committed フィールドが必要: {}", json);
        assert!(json.contains("\"push_status\""), "push_status フィールドが必要: {}", json);
        // 旧フィールド名が含まれていないこと
        assert!(!json.contains("commit_sha"), "旧フィールド commit_sha が残存: {}", json);
        assert!(!json.contains("pushed_at"), "旧フィールド pushed_at が残存: {}", json);
    }

    // Red: SaveResult が push_failed ステータスを保持できること
    #[test]
    fn test_save_result_push_failed_status() {
        let r = SaveResult {
            sha: "def456".to_string(),
            committed: true,
            push_status: "push_failed".to_string(),
        };
        assert_eq!(r.push_status, "push_failed");
        assert!(r.committed);
    }
}
