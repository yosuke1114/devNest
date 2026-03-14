/// レビューエンジン
///
/// `ai/review_agent.rs` の ReviewAgent ロジックを `review/` モジュールに移植する。
/// 現時点では ReviewAgent の薄いラッパーとして機能し、
/// 将来的に独立したエンジンに成長させる。
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

pub use super::findings::{FindingCategory, FindingSeverity, ReviewFinding};

// ─── データ型（ai/review_agent.rs から移植） ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewRequest {
    pub diff: String,
    pub changed_files: Vec<String>,
    pub pr_description: Option<String>,
    pub review_scope: ReviewScope,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewScope {
    Full,
    DesignConsistency,
    SecurityFocus,
    TestCoverage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewResult {
    pub summary: String,
    pub findings: Vec<ReviewFinding>,
    pub design_consistency: DesignConsistencyReport,
    pub suggested_doc_updates: Vec<DocUpdateSuggestion>,
    pub overall_assessment: Assessment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignConsistencyReport {
    pub checked_docs: Vec<String>,
    pub inconsistencies: Vec<DesignInconsistency>,
    pub missing_doc_updates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesignInconsistency {
    pub doc_path: String,
    pub description: String,
    pub severity: FindingSeverity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocUpdateSuggestion {
    pub doc_path: String,
    pub reason: String,
    pub suggested_change: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Assessment {
    Approve,
    RequestChanges,
    Comment,
}

// ─── ReviewEngine ─────────────────────────────────────────────────────────────

pub struct ReviewEngine {
    _project_path: std::path::PathBuf,
}

impl ReviewEngine {
    /// ReviewEngine を初期化する。
    pub fn new(project_path: &Path) -> Self {
        Self {
            _project_path: project_path.to_path_buf(),
        }
    }

    /// レビューを同期実行する（AI 呼び出しなし）。
    ///
    /// 実際の AI レビューは `ai::review_agent::ReviewAgent::review_changes()` を使用。
    /// このメソッドは構造バリデーションや基本的なチェックのみを行う。
    pub fn validate_request(request: &ReviewRequest) -> Result<()> {
        if request.diff.is_empty() {
            return Err(AppError::Validation("diff must not be empty".to_string()));
        }
        Ok(())
    }
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_review_engine_new() {
        let dir = tempdir().unwrap();
        let engine = ReviewEngine::new(dir.path());
        // インスタンス化できることを確認
        let _ = engine;
    }

    #[test]
    fn test_validate_request_empty_diff_fails() {
        let req = ReviewRequest {
            diff: String::new(),
            changed_files: vec![],
            pr_description: None,
            review_scope: ReviewScope::Full,
        };
        assert!(ReviewEngine::validate_request(&req).is_err());
    }

    #[test]
    fn test_validate_request_valid() {
        let req = ReviewRequest {
            diff: "diff --git a/foo.rs b/foo.rs\n+fn main() {}".to_string(),
            changed_files: vec!["foo.rs".to_string()],
            pr_description: Some("Add main fn".to_string()),
            review_scope: ReviewScope::Full,
        };
        assert!(ReviewEngine::validate_request(&req).is_ok());
    }
}
