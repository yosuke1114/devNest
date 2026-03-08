use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Issue {
    pub id: i64,
    pub project_id: i64,
    pub github_number: i64,
    pub github_id: i64,
    pub title: String,
    pub body: Option<String>,
    /// "open" | "in_progress" | "closed"
    pub status: String,
    pub author_login: String,
    pub assignee_login: Option<String>,
    /// JSON 配列文字列（フロントで JSON.parse する）
    pub labels: String,
    pub milestone: Option<String>,
    pub linked_pr_number: Option<i64>,
    /// "user" | "ai_wizard"
    pub created_by: String,
    pub github_created_at: String,
    pub github_updated_at: String,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct IssueDocLink {
    pub id: i64,
    pub issue_id: i64,
    pub document_id: i64,
    /// "manual" | "ai_suggested" | "ai_confirmed" | "user_rejected"
    pub link_type: String,
    /// "user" | "ai"
    pub created_by: String,
    pub created_at: String,
    // JOINで取得するフィールド
    pub path: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct IssueDraft {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub body: String,
    pub draft_body: Option<String>,
    pub wizard_context: Option<String>,
    pub labels: String,
    pub assignee_login: Option<String>,
    /// "draft" | "submitting" | "submitted" | "failed"
    pub status: String,
    pub github_issue_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// issue_draft_update の引数（None = 変更なし）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueDraftPatch {
    pub id: i64,
    pub title: Option<String>,
    pub body: Option<String>,
    pub draft_body: Option<String>,
    pub wizard_context: Option<String>,
    pub labels: Option<String>,
    pub assignee_login: Option<String>,
    pub status: Option<String>,
    pub github_issue_id: Option<i64>,
}

/// issue_create の引数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueCreatePayload {
    pub project_id: i64,
    pub title: String,
    pub body: String,
    pub labels: Vec<String>,
    pub assignee: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Red: Issue.labels が JSON 配列文字列として保持されること
    #[test]
    fn test_issue_labels_as_json_string() {
        let issue_json = r#"{
            "id": 1, "project_id": 1,
            "github_number": 42, "github_id": 99,
            "title": "Bug fix", "body": null,
            "status": "open", "author_login": "alice",
            "assignee_login": null,
            "labels": "[\"bug\",\"help wanted\"]",
            "milestone": null, "linked_pr_number": null,
            "created_by": "user",
            "github_created_at": "2026-03-08T00:00:00Z",
            "github_updated_at": "2026-03-08T00:00:00Z",
            "synced_at": "2026-03-08T00:00:00Z"
        }"#;
        let issue: Issue = serde_json::from_str(issue_json).unwrap();
        // labels は文字列のまま保持
        let labels: Vec<String> = serde_json::from_str(&issue.labels).unwrap();
        assert_eq!(labels, vec!["bug", "help wanted"]);
    }

    // Red: IssueDraft.status が許容値の検証（ロジック単体テスト）
    #[test]
    fn test_issue_draft_valid_statuses() {
        let valid = ["draft", "submitting", "submitted", "failed"];
        for s in valid {
            let draft = IssueDraft {
                id: 1, project_id: 1,
                title: "t".to_string(), body: "b".to_string(),
                draft_body: None, wizard_context: None,
                labels: "[]".to_string(), assignee_login: None,
                status: s.to_string(), github_issue_id: None,
                created_at: "2026-03-08T00:00:00Z".to_string(),
                updated_at: "2026-03-08T00:00:00Z".to_string(),
            };
            assert_eq!(draft.status, s);
        }
    }

    // Red: IssueDocLink の link_type で user_rejected を除外するロジックの準備
    #[test]
    fn test_issue_doc_link_rejected_filter() {
        let links = [
            IssueDocLink { id: 1, issue_id: 1, document_id: 1,
                link_type: "manual".to_string(), created_by: "user".to_string(),
                created_at: "2026-03-08T00:00:00Z".to_string(),
                path: Some("docs/spec.md".to_string()), title: None },
            IssueDocLink { id: 2, issue_id: 1, document_id: 2,
                link_type: "user_rejected".to_string(), created_by: "user".to_string(),
                created_at: "2026-03-08T00:00:00Z".to_string(),
                path: Some("docs/other.md".to_string()), title: None },
        ];
        let active: Vec<_> = links.iter()
            .filter(|l| l.link_type != "user_rejected")
            .collect();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].link_type, "manual");
    }
}
