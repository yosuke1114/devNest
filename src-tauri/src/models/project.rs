use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub local_path: String,
    pub default_branch: String,
    pub docs_root: String,
    pub sync_mode: String,
    pub debounce_ms: i64,
    pub commit_msg_format: String,
    pub remote_poll_interval_min: i64,
    pub github_installation_id: Option<String>,
    pub last_opened_document_id: Option<i64>,
    pub last_synced_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// project_create の戻り値
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectCreateResult {
    pub project: Project,
    pub document_count: u32,
}

/// project_get_status の戻り値
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStatus {
    /// "synced" | "dirty" | "pushing" | "conflict"
    pub sync_status: String,
    pub dirty_count: u32,
    pub pending_push_count: u32,
    pub branch: Option<String>,
    pub github_connected: bool,
    pub has_unresolved_conflict: bool,
}

/// project_update の引数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectPatch {
    pub project_id: i64,
    /// Some(Some(v)) = 更新 / Some(None) = NULL リセット / None = 変更なし
    pub repo_owner: Option<Option<String>>,
    pub repo_name: Option<Option<String>>,
    pub default_branch: Option<Option<String>>,
    pub sync_mode: Option<String>,
    pub docs_root: Option<String>,
    pub commit_msg_format: Option<String>,
    pub debounce_ms: Option<i64>,
    pub remote_poll_interval_min: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Red: ProjectStatus がシリアライズできること
    #[test]
    fn test_project_status_serializes() {
        let status = ProjectStatus {
            sync_status: "synced".to_string(),
            dirty_count: 0,
            pending_push_count: 0,
            branch: Some("main".to_string()),
            github_connected: true,
            has_unresolved_conflict: false,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("sync_status"));
        assert!(json.contains("synced"));
    }

    // Red: ProjectPatch で None/Some(None)/Some(Some(v)) を区別できること
    #[test]
    fn test_project_patch_triple_option() {
        let patch = ProjectPatch {
            project_id: 1,
            repo_owner: None,                         // 変更なし
            repo_name: Some(None),                    // NULL リセット
            default_branch: Some(Some("main".to_string())), // 更新
            sync_mode: None,
            docs_root: None,
            commit_msg_format: None,
            debounce_ms: None,
            remote_poll_interval_min: None,
        };
        assert!(patch.repo_owner.is_none());
        assert!(matches!(patch.repo_name, Some(None)));
        assert!(matches!(patch.default_branch, Some(Some(_))));
    }

    // Red: Project が DB から FromRow で読めること（sqlx の derive チェック）
    #[test]
    fn test_project_deserializes_from_json() {
        let json = r#"{
            "id": 1,
            "name": "test",
            "repo_owner": "owner",
            "repo_name": "repo",
            "local_path": "/path",
            "default_branch": "main",
            "docs_root": "docs/",
            "sync_mode": "auto",
            "debounce_ms": 1000,
            "commit_msg_format": "docs: {filename} を更新",
            "remote_poll_interval_min": 5,
            "github_installation_id": null,
            "last_opened_document_id": null,
            "last_synced_at": null,
            "created_at": "2026-03-08T00:00:00Z",
            "updated_at": "2026-03-08T00:00:00Z"
        }"#;
        let project: Project = serde_json::from_str(json).unwrap();
        assert_eq!(project.id, 1);
        assert_eq!(project.sync_mode, "auto");
    }
}
