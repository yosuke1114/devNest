/// コードレビューエージェント
///
/// PRやローカル変更に対して、設計書の文脈を持ったAIレビューを実行する。
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::services::anthropic::AnthropicClient;

use super::context_engine::{
    AiContext, ContextBudget, ContextEngine, GitContext, MaintenanceSnapshot, PromptPurpose,
};

// ─────────────────────────────────────────────
//  データ型
// ─────────────────────────────────────────────

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
pub struct ReviewFinding {
    pub file: String,
    pub line_start: Option<u32>,
    pub line_end: Option<u32>,
    pub severity: FindingSeverity,
    pub category: FindingCategory,
    pub message: String,
    pub suggested_fix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FindingSeverity {
    Critical,
    Warning,
    Info,
    Suggestion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

// ─────────────────────────────────────────────
//  ReviewAgent
// ─────────────────────────────────────────────

pub struct ReviewAgent {
    anthropic: AnthropicClient,
    context_engine: ContextEngine,
}

impl ReviewAgent {
    pub fn new(api_key: &str, project_path: &Path) -> Self {
        Self {
            anthropic: AnthropicClient::new(api_key),
            context_engine: ContextEngine::new(project_path),
        }
    }

    /// ローカルの diff / changed files に対してレビューを実行する
    pub async fn review_changes(&self, request: &ReviewRequest) -> Result<ReviewResult> {
        let context = self.collect_context(&request.changed_files).await;

        let budget = ContextBudget {
            max_tokens: 6000,
            file_content_ratio: 0.20,
            doc_ratio: 0.40,
            metadata_ratio: 0.10,
        };
        let context = self.context_engine.compress_context(&context, &budget);
        let context_prompt = self
            .context_engine
            .to_prompt(&context, PromptPurpose::CodeReview);

        let scope_instruction = match request.review_scope {
            ReviewScope::Full => {
                "Review all aspects: code quality, design consistency, security, and test coverage."
            }
            ReviewScope::DesignConsistency => {
                "Focus specifically on design document consistency and architectural alignment."
            }
            ReviewScope::SecurityFocus => {
                "Focus specifically on security vulnerabilities, injection risks, and auth issues."
            }
            ReviewScope::TestCoverage => {
                "Focus specifically on test coverage, missing tests, and testing quality."
            }
        };

        let pr_desc = request.pr_description.as_deref().unwrap_or("N/A");
        let diff_excerpt: String = request.diff.chars().take(4000).collect();

        let user_message = format!(
            "{context_prompt}\n\n\
             ## Review Scope\n{scope_instruction}\n\n\
             ## PR Description\n{pr_desc}\n\n\
             ## Diff\n```diff\n{diff_excerpt}\n```\n\n\
             Respond with a single valid JSON object (no markdown, no extra text) with this exact structure:\n\
             {{\
               \"summary\": \"...\",\
               \"findings\": [{{\
                 \"file\": \"...\",\
                 \"line_start\": null,\
                 \"line_end\": null,\
                 \"severity\": \"critical|warning|info|suggestion\",\
                 \"category\": \"design_consistency|security|performance|test_coverage|code_quality|naming|documentation\",\
                 \"message\": \"...\",\
                 \"suggested_fix\": null\
               }}],\
               \"design_consistency\": {{\
                 \"checked_docs\": [],\
                 \"inconsistencies\": [],\
                 \"missing_doc_updates\": []\
               }},\
               \"suggested_doc_updates\": [],\
               \"overall_assessment\": \"approve|request_changes|comment\"\
             }}"
        );

        let system_prompt = "You are an expert code reviewer with deep Rust and TypeScript expertise. \
                             Respond with valid JSON only. No markdown fences, no explanation text outside JSON.";

        let raw = self.anthropic.complete(system_prompt, &user_message).await?;
        Ok(parse_review_result(&raw))
    }

    // ─── helpers ───

    async fn collect_context(&self, changed_files: &[String]) -> AiContext {
        if let Some(file) = changed_files.first() {
            let path = Path::new(file);
            if let Ok(ctx) = self.context_engine.build_context_for_file(path).await {
                return ctx;
            }
        }
        fallback_context(&self.context_engine)
    }
}

fn fallback_context(engine: &ContextEngine) -> AiContext {
    AiContext {
        file_context: None,
        doc_context: vec![],
        maintenance_context: MaintenanceSnapshot {
            coverage_pct: None,
            debt_score: None,
            outdated_deps_count: 0,
            stale_docs_count: 0,
        },
        git_context: GitContext {
            current_branch: "unknown".to_string(),
            recent_commits: vec![],
            recent_changed_files: vec![],
        },
        product_context: engine.build_product_context(),
    }
}

fn parse_review_result(raw: &str) -> ReviewResult {
    // JSON ブロックを抽出（AI がマークダウンで囲む場合に対応）
    let json_str = extract_json_object(raw).unwrap_or(raw);

    serde_json::from_str(json_str).unwrap_or_else(|_| ReviewResult {
        summary: raw.chars().take(500).collect(),
        findings: vec![],
        design_consistency: DesignConsistencyReport {
            checked_docs: vec![],
            inconsistencies: vec![],
            missing_doc_updates: vec![],
        },
        suggested_doc_updates: vec![],
        overall_assessment: Assessment::Comment,
    })
}

/// raw テキストから最初の JSON オブジェクト `{ ... }` を抽出する
fn extract_json_object(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end > start {
        Some(&s[start..=end])
    } else {
        None
    }
}
