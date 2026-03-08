use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PullRequest {
    pub id: i64,
    pub project_id: i64,
    pub github_number: i64,
    pub github_id: i64,
    pub title: String,
    pub body: Option<String>,
    /// "open" | "closed" | "merged"
    pub state: String,
    pub head_branch: String,
    pub base_branch: String,
    pub author_login: String,
    /// "pending" | "passing" | "failing" | "unknown"
    pub checks_status: String,
    pub linked_issue_number: Option<i64>,
    pub draft: bool,
    pub merged_at: Option<String>,
    pub github_created_at: String,
    pub github_updated_at: String,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PrReview {
    pub id: i64,
    pub pr_id: i64,
    pub github_id: Option<i64>,
    pub reviewer_login: String,
    /// "pending" | "approved" | "changes_requested" | "dismissed"
    pub state: String,
    /// "pending_submit" | "submitted"
    pub submit_status: String,
    pub body: Option<String>,
    pub submitted_at: Option<String>,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PrComment {
    pub id: i64,
    pub pr_id: i64,
    pub github_id: Option<i64>,
    pub body: String,
    pub path: Option<String>,
    pub line: Option<i64>,
    pub author_login: String,
    pub is_pending: bool,
    pub created_at: String,
    pub synced_at: Option<String>,
}

/// PR 詳細（PR + レビュー + コメント）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrDetail {
    pub pr: PullRequest,
    pub reviews: Vec<PrReview>,
    pub comments: Vec<PrComment>,
}

/// PR diff ファイル情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrFile {
    pub filename: String,
    pub status: String, // "added" | "removed" | "modified" | "renamed"
    pub additions: i64,
    pub deletions: i64,
    pub patch: Option<String>, // unified diff
}

/// pr_review_submit コマンド引数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSubmitPayload {
    pub pr_id: i64,
    pub state: String, // "approved" | "changes_requested"
    pub body: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // 🔴 Red: PullRequest.state が許容値であること
    #[test]
    fn test_pull_request_states() {
        let states = ["open", "closed", "merged"];
        for s in states {
            let pr = PullRequest {
                id: 1, project_id: 1, github_number: 1, github_id: 1,
                title: "t".to_string(), body: None,
                state: s.to_string(),
                head_branch: "feat/1".to_string(),
                base_branch: "main".to_string(),
                author_login: "alice".to_string(),
                checks_status: "pending".to_string(),
                linked_issue_number: None, draft: false,
                merged_at: None,
                github_created_at: "2026-03-08T00:00:00Z".to_string(),
                github_updated_at: "2026-03-08T00:00:00Z".to_string(),
                synced_at: "2026-03-08T00:00:00Z".to_string(),
            };
            assert_eq!(pr.state, s);
        }
    }

    // 🔴 Red: PrDetail がシリアライズできること
    #[test]
    fn test_pr_detail_serializes() {
        let detail = PrDetail {
            pr: PullRequest {
                id: 1, project_id: 1, github_number: 42, github_id: 9999,
                title: "feat: add login".to_string(), body: None,
                state: "open".to_string(),
                head_branch: "feat/42-login".to_string(),
                base_branch: "main".to_string(),
                author_login: "alice".to_string(),
                checks_status: "passing".to_string(),
                linked_issue_number: Some(42),
                draft: false, merged_at: None,
                github_created_at: "2026-03-08T00:00:00Z".to_string(),
                github_updated_at: "2026-03-08T00:00:00Z".to_string(),
                synced_at: "2026-03-08T00:00:00Z".to_string(),
            },
            reviews: vec![],
            comments: vec![],
        };
        let json = serde_json::to_string(&detail).unwrap();
        assert!(json.contains("feat/42-login"));
        assert!(json.contains("passing"));
    }

    // 🔴 Red: PrFile がデシリアライズできること
    #[test]
    fn test_pr_file_deserializes() {
        let json = r#"{
            "filename": "src/main.rs",
            "status": "modified",
            "additions": 10,
            "deletions": 3,
            "patch": "@@ -1 +1 @@"
        }"#;
        let file: PrFile = serde_json::from_str(json).unwrap();
        assert_eq!(file.filename, "src/main.rs");
        assert_eq!(file.additions, 10);
    }
}
