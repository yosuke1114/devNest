/// レビュー結果の型定義
///
/// `ai/review_agent.rs` から型を抽出して集約する。
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum FindingSeverity {
    /// 情報・提案（最低）
    Low,
    /// 中程度：修正を検討
    Medium,
    /// 警告：修正を強く推奨
    High,
    /// 最も深刻：即時修正が必要（最高）
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FindingCategory {
    DesignConsistency,
    Security,
    Performance,
    TestCoverage,
    CodeQuality,
    Naming,
    Documentation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFinding {
    pub file: String,
    pub line_start: Option<u32>,
    pub line_end: Option<u32>,
    pub severity: FindingSeverity,
    pub category: FindingCategory,
    pub message: String,
    pub suggested_fix: Option<String>,
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_severity_ordering() {
        // Critical > High > Medium > Low（Ord derive による昇順: Low < Medium < High < Critical）
        assert!(FindingSeverity::Critical > FindingSeverity::High);
        assert!(FindingSeverity::High > FindingSeverity::Medium);
        assert!(FindingSeverity::Medium > FindingSeverity::Low);
    }
}
