use serde::{Deserialize, Serialize};

/// 承認リクエストの状態
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    Pending,
    Approved,
    Rejected,
    Expired,
}

impl std::fmt::Display for ApprovalStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Approved => write!(f, "approved"),
            Self::Rejected => write!(f, "rejected"),
            Self::Expired => write!(f, "expired"),
        }
    }
}

/// 承認リクエスト（DB 行とフロントエンド共用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    pub id: i64,
    pub request_id: String,
    pub worker_id: Option<String>,
    pub tool_name: String,
    pub tool_input: String,
    pub risk_level: String,
    pub status: String,
    pub decision_reason: Option<String>,
    pub created_at: String,
    pub decided_at: Option<String>,
}

/// 承認/拒否の判定結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalDecision {
    pub request_id: String,
    pub approved: bool,
    pub reason: Option<String>,
}
