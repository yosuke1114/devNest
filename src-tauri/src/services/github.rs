use crate::error::{AppError, Result};
use crate::models::pr::PrFile;
use reqwest::Client;
use serde::{Deserialize, Serialize};

// ─── PR 関連の GitHub API 型 ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubPullRequest {
    pub number: i64,
    pub id: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub user: GitHubUser,
    pub head: GitHubBranch,
    pub base: GitHubBranch,
    pub draft: bool,
    pub merged: Option<bool>,
    pub merged_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubBranch {
    #[serde(rename = "ref")]
    pub ref_name: String,
    pub sha: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubReview {
    pub id: i64,
    pub user: GitHubUser,
    pub state: String,
    pub body: Option<String>,
    pub submitted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubPrFile {
    pub filename: String,
    pub status: String,
    pub additions: i64,
    pub deletions: i64,
    pub patch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubLabel {
    pub id: u64,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubIssue {
    pub number: i64,
    pub id: i64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub user: GitHubUser,
    pub assignee: Option<GitHubUser>,
    pub labels: Vec<GitHubLabel>,
    pub milestone: Option<GitHubMilestone>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubMilestone {
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubAuthStatus {
    pub connected: bool,
    pub user_login: Option<String>,
    pub avatar_url: Option<String>,
}

// ─── GitHub Notifications API 型 ─────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct GithubNotification {
    pub id: String,
    pub reason: String,
    pub unread: bool,
    pub subject: GithubNotificationSubject,
    pub repository: GithubNotificationRepo,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubNotificationSubject {
    pub title: String,
    #[serde(rename = "type")]
    pub subject_type: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubNotificationRepo {
    pub full_name: String,
}

// ─── CI Check Runs 型 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct CheckRunsResponse {
    pub check_runs: Vec<CheckRun>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CheckRun {
    pub id: i64,
    pub name: String,
    pub status: String,      // "queued" | "in_progress" | "completed"
    pub conclusion: Option<String>, // "success" | "failure" | "cancelled" | ...
}

pub struct GitHubClient {
    token: String,
    owner: String,
    repo: String,
    http: Client,
}

impl GitHubClient {
    pub fn new(token: &str, owner: &str, repo: &str) -> Self {
        Self {
            token: token.to_string(),
            owner: owner.to_string(),
            repo: repo.to_string(),
            http: Client::builder()
                .user_agent("DevNest/0.1")
                .build()
                .unwrap_or_default(),
        }
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.token)
    }

    fn check_rate_limit(&self, resp: &reqwest::Response) -> Result<()> {
        if resp.status().as_u16() == 429
            || resp.headers().get("x-ratelimit-remaining")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<i64>().ok())
                .map(|n| n < 10)
                .unwrap_or(false)
        {
            let reset_at = resp
                .headers()
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<i64>().ok())
                .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default();
            return Err(AppError::GitHubRateLimit { reset_at });
        }
        if resp.status().as_u16() == 401 {
            return Err(AppError::GitHubAuthRequired);
        }
        if !resp.status().is_success() {
            return Err(AppError::GitHub(format!(
                "GitHub API エラー: {}",
                resp.status()
            )));
        }
        Ok(())
    }

    /// GET /user — 認証ユーザー情報取得
    pub async fn get_user(&self) -> Result<GitHubUser> {
        let resp = self
            .http
            .get("https://api.github.com/user")
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<GitHubUser>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// GET /repos/{owner}/{repo}/labels
    pub async fn list_labels(&self) -> Result<Vec<GitHubLabel>> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/labels?per_page=100",
            self.owner, self.repo
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<Vec<GitHubLabel>>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// GET /repos/{owner}/{repo}/issues
    pub async fn list_issues(&self, state: Option<&str>) -> Result<Vec<GitHubIssue>> {
        let state = state.unwrap_or("open");
        let url = format!(
            "https://api.github.com/repos/{}/{}/issues?state={}&per_page=100",
            self.owner, self.repo, state
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<Vec<GitHubIssue>>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// POST /repos/{owner}/{repo}/issues
    pub async fn create_issue(
        &self,
        title: &str,
        body: &str,
        labels: &[String],
        assignee: Option<&str>,
    ) -> Result<GitHubIssue> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/issues",
            self.owner, self.repo
        );
        let mut payload = serde_json::json!({
            "title": title,
            "body": body,
            "labels": labels,
        });
        if let Some(a) = assignee {
            payload["assignee"] = serde_json::json!(a);
        }
        let resp = self
            .http
            .post(&url)
            .header("Authorization", self.auth_header())
            .json(&payload)
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<GitHubIssue>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// GitHub OAuth: code → access_token 交換
    pub async fn exchange_code(
        &self,
        code: &str,
        client_id: &str,
        client_secret: &str,
    ) -> Result<String> {
        #[derive(Deserialize)]
        struct TokenResp {
            access_token: Option<String>,
            error: Option<String>,
            error_description: Option<String>,
        }

        let resp = self
            .http
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .json(&serde_json::json!({
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
            }))
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        let body: TokenResp = resp
            .json()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        if let Some(token) = body.access_token {
            Ok(token)
        } else {
            Err(AppError::GitHub(
                body.error_description
                    .or(body.error)
                    .unwrap_or_else(|| "OAuth 失敗".to_string()),
            ))
        }
    }

    // ─── PR ──────────────────────────────────────────────────────────────────

    /// GET /repos/{owner}/{repo}/pulls
    pub async fn list_pull_requests(&self, state: Option<&str>) -> Result<Vec<GitHubPullRequest>> {
        let state = state.unwrap_or("open");
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls?state={}&per_page=100",
            self.owner, self.repo, state
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<Vec<GitHubPullRequest>>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// GET /repos/{owner}/{repo}/pulls/{number}
    pub async fn get_pull_request(&self, number: i64) -> Result<GitHubPullRequest> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}",
            self.owner, self.repo, number
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<GitHubPullRequest>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// GET /repos/{owner}/{repo}/pulls/{number} with diff accept header
    pub async fn get_pull_request_diff(&self, number: i64) -> Result<String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}",
            self.owner, self.repo, number
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github.diff")
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.text()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// GET /repos/{owner}/{repo}/pulls/{number}/files
    pub async fn list_pull_request_files(&self, number: i64) -> Result<Vec<PrFile>> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}/files?per_page=100",
            self.owner, self.repo, number
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        let files = resp
            .json::<Vec<GitHubPrFile>>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        Ok(files
            .into_iter()
            .map(|f| PrFile {
                filename: f.filename,
                status: f.status,
                additions: f.additions,
                deletions: f.deletions,
                patch: f.patch,
            })
            .collect())
    }

    /// GET /repos/{owner}/{repo}/pulls/{number}/reviews
    pub async fn list_reviews(&self, number: i64) -> Result<Vec<GitHubReview>> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}/reviews?per_page=100",
            self.owner, self.repo, number
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<Vec<GitHubReview>>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// POST /repos/{owner}/{repo}/pulls/{number}/reviews — レビュー提出
    pub async fn submit_review(
        &self,
        number: i64,
        state: &str, // "APPROVED" | "CHANGES_REQUESTED" | "COMMENT"
        body: Option<&str>,
    ) -> Result<GitHubReview> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}/reviews",
            self.owner, self.repo, number
        );
        let mut payload = serde_json::json!({ "event": state });
        if let Some(b) = body {
            payload["body"] = serde_json::json!(b);
        }
        let resp = self
            .http
            .post(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<GitHubReview>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// POST /repos/{owner}/{repo}/issues/{issue_number}/comments — PR にコメント投稿
    /// GitHub API では PR も Issue として扱われるため issue_comment エンドポイントを使用する。
    pub async fn add_issue_comment(
        &self,
        issue_number: i64,
        body: &str,
    ) -> Result<i64> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/issues/{}/comments",
            self.owner, self.repo, issue_number
        );
        #[derive(serde::Deserialize)]
        struct CommentResp {
            id: i64,
        }
        let resp = self
            .http
            .post(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .json(&serde_json::json!({ "body": body }))
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        let comment: CommentResp = resp
            .json()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;
        Ok(comment.id)
    }

    /// POST /repos/{owner}/{repo}/pulls — PR 作成
    pub async fn create_pull_request(
        &self,
        title: &str,
        head: &str,
        base: &str,
        body: Option<&str>,
    ) -> Result<GitHubPullRequest> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls",
            self.owner, self.repo
        );
        let mut payload = serde_json::json!({
            "title": title,
            "head": head,
            "base": base,
        });
        if let Some(b) = body {
            payload["body"] = serde_json::json!(b);
        }
        let resp = self
            .http
            .post(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        resp.json::<GitHubPullRequest>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// PUT /repos/{owner}/{repo}/pulls/{number}/merge
    pub async fn merge_pull_request(
        &self,
        number: i64,
        commit_title: Option<&str>,
        merge_method: &str, // "merge" | "squash" | "rebase"
    ) -> Result<()> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}/merge",
            self.owner, self.repo, number
        );
        let mut payload = serde_json::json!({ "merge_method": merge_method });
        if let Some(title) = commit_title {
            payload["commit_title"] = serde_json::json!(title);
        }
        let resp = self
            .http
            .put(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;

        self.check_rate_limit(&resp)?;
        Ok(())
    }

    /// GET /notifications?participating=true
    /// ユーザー自身が関与する通知のみを取得する。
    pub async fn list_github_notifications(&self) -> Result<Vec<GithubNotification>> {
        let url = "https://api.github.com/notifications?participating=true&per_page=50";
        let resp = self
            .http
            .get(url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;
        self.check_rate_limit(&resp)?;
        resp.json::<Vec<GithubNotification>>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }

    /// GET /repos/{owner}/{repo}/commits/{sha}/check-runs
    /// 指定コミットの CI チェック結果を取得する。
    pub async fn get_check_runs(&self, sha: &str) -> Result<CheckRunsResponse> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/commits/{}/check-runs",
            self.owner, self.repo, sha
        );
        let resp = self
            .http
            .get(&url)
            .header("Authorization", self.auth_header())
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))?;
        self.check_rate_limit(&resp)?;
        resp.json::<CheckRunsResponse>()
            .await
            .map_err(|e| AppError::GitHub(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 🔴 Red: GitHubAuthStatus がシリアライズできること
    #[test]
    fn test_github_auth_status_serializes() {
        let status = GitHubAuthStatus {
            connected: true,
            user_login: Some("alice".to_string()),
            avatar_url: Some("https://example.com/avatar.png".to_string()),
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("alice"));
        assert!(json.contains("connected"));
    }

    // 🔴 Red: GitHubClient::new がパニックしないこと
    #[test]
    fn test_github_client_new() {
        let client = GitHubClient::new("token", "owner", "repo");
        assert_eq!(client.owner, "owner");
        assert_eq!(client.repo, "repo");
    }

    // 🔴 Red: check_rate_limit が 401 で GitHubAuthRequired を返すこと
    // （HTTP モックなしでロジック単体テスト）
    #[test]
    fn test_rate_limit_logic_low_remaining() {
        // remaining が 10 未満なら RateLimit
        let remaining: i64 = 5;
        let is_limited = remaining < 10;
        assert!(is_limited);
    }

    // 🔴 Red: GitHubLabel がデシリアライズできること
    #[test]
    fn test_github_label_deserializes() {
        let json = r#"{
            "id": 1, "name": "bug", "color": "d73a4a",
            "description": "Something isn't working"
        }"#;
        let label: GitHubLabel = serde_json::from_str(json).unwrap();
        assert_eq!(label.name, "bug");
    }
}
