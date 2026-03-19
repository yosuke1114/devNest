use serde::{Deserialize, Serialize};
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub github_username: String,
    pub display_name: String,
    pub recent_commits: u32,
    pub open_prs: u32,
    pub review_requests: u32,
    pub active_cards: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingReview {
    pub pr_number: u32,
    pub title: String,
    pub author: String,
    pub requested_reviewers: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamDashboard {
    pub members: Vec<TeamMember>,
    pub pending_reviews: Vec<PendingReview>,
    pub total_open_prs: u32,
    pub total_open_issues: u32,
}

/// チームダッシュボードを構築する（GitHub API 呼び出し経由）
/// Phase 9 MCP 完成後に GitHubAdapter 経由に移行
pub async fn build_team_dashboard(
    _project_path: &std::path::Path,
    _github_token: Option<&str>,
) -> Result<TeamDashboard> {
    // GitHub API を使ってコントリビューター情報を取得
    // Phase 9 完成前は空データを返す
    Ok(TeamDashboard {
        members: vec![],
        pending_reviews: vec![],
        total_open_prs: 0,
        total_open_issues: 0,
    })
}
