/// コンテキスト認識 AI エンジン
///
/// DevNest 内の任意のファイル・設計書・タスクに対して、
/// doc-mapping / 保守データ / Git 履歴 / プロダクト情報を統合した
/// AiContext を構築する。
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::doc_mapping::index;
use crate::error::{AppError, Result};

// ─────────────────────────────────────────────
//  データ型
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiContext {
    pub file_context: Option<FileContext>,
    pub doc_context: Vec<DocContext>,
    pub maintenance_context: MaintenanceSnapshot,
    pub git_context: GitContext,
    pub product_context: ProductContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContext {
    pub path: String,
    pub language: String,
    pub content: String,
    pub line_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocContext {
    pub path: String,
    pub title: String,
    pub content_snippet: String,
    pub relevance_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaintenanceSnapshot {
    pub coverage_pct: Option<f64>,
    pub debt_score: Option<f64>,
    pub outdated_deps_count: u32,
    pub stale_docs_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitContext {
    pub current_branch: String,
    pub recent_commits: Vec<CommitSummary>,
    pub recent_changed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitSummary {
    pub sha: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductContext {
    pub name: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub default_branch: String,
    pub docs_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextBudget {
    /// 全体のトークン上限（1 トークン ≈ 4 文字で近似）
    pub max_tokens: usize,
    /// ファイル内容に割り当てる比率
    pub file_content_ratio: f32,
    /// 設計書に割り当てる比率
    pub doc_ratio: f32,
    /// メタデータ（保守・Git 等）に割り当てる比率
    pub metadata_ratio: f32,
}

impl Default for ContextBudget {
    fn default() -> Self {
        Self {
            max_tokens: 8000,
            file_content_ratio: 0.50,
            doc_ratio: 0.35,
            metadata_ratio: 0.15,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PromptPurpose {
    CodeGeneration,
    CodeReview,
    DocUpdate,
    TestGeneration,
    RefactorSuggestion,
    DebugAssist,
}

// ─────────────────────────────────────────────
//  ContextEngine
// ─────────────────────────────────────────────

pub struct ContextEngine {
    project_path: PathBuf,
}

impl ContextEngine {
    pub fn new(project_path: &Path) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
        }
    }

    /// ソースファイルのフルコンテキストを構築する
    pub async fn build_context_for_file(&self, file_path: &Path) -> Result<AiContext> {
        let file_ctx = self.build_file_context(file_path)?;
        let doc_ctx = self.find_related_docs(file_path);
        let git_ctx = self.build_git_context().unwrap_or_else(|_| GitContext {
            current_branch: "unknown".to_string(),
            recent_commits: vec![],
            recent_changed_files: vec![],
        });
        let maintenance_ctx = self.build_maintenance_snapshot();
        let product_ctx = self.build_product_context();

        Ok(AiContext {
            file_context: Some(file_ctx),
            doc_context: doc_ctx,
            maintenance_context: maintenance_ctx,
            git_context: git_ctx,
            product_context: product_ctx,
        })
    }

    /// 設計書のフルコンテキストを構築する
    pub async fn build_context_for_doc(&self, doc_path: &Path) -> Result<AiContext> {
        let file_ctx = self.build_file_context(doc_path).ok();
        let git_ctx = self.build_git_context().unwrap_or_else(|_| GitContext {
            current_branch: "unknown".to_string(),
            recent_commits: vec![],
            recent_changed_files: vec![],
        });
        let maintenance_ctx = self.build_maintenance_snapshot();
        let product_ctx = self.build_product_context();

        Ok(AiContext {
            file_context: file_ctx,
            doc_context: vec![],
            maintenance_context: maintenance_ctx,
            git_context: git_ctx,
            product_context: product_ctx,
        })
    }

    /// コンテキストをプロンプト文字列に変換する
    pub fn to_prompt(&self, context: &AiContext, purpose: PromptPurpose) -> String {
        let mut parts: Vec<String> = Vec::new();

        // プロダクト情報
        let p = &context.product_context;
        parts.push(format!(
            "## Project: {}/{}\nBranch: {}\nDocs root: {}",
            p.repo_owner, p.repo_name, p.default_branch, p.docs_root
        ));

        // タスク説明
        let purpose_str = match purpose {
            PromptPurpose::CodeGeneration => {
                "Generate code based on the design document provided below."
            }
            PromptPurpose::CodeReview => {
                "Review the code changes below for quality, design consistency, and best practices."
            }
            PromptPurpose::DocUpdate => {
                "Update the design document to reflect the code changes below."
            }
            PromptPurpose::TestGeneration => {
                "Generate comprehensive tests for the code provided below."
            }
            PromptPurpose::RefactorSuggestion => {
                "Suggest refactoring improvements for the code below."
            }
            PromptPurpose::DebugAssist => "Help debug the issue in the code below.",
        };
        parts.push(format!("## Task\n{}", purpose_str));

        // 保守スナップショット
        let m = &context.maintenance_context;
        let mut maint = Vec::new();
        if let Some(c) = m.coverage_pct {
            maint.push(format!("Test coverage: {:.1}%", c));
        }
        if let Some(d) = m.debt_score {
            maint.push(format!("Tech debt score: {:.2}", d));
        }
        if m.outdated_deps_count > 0 {
            maint.push(format!("Outdated deps: {}", m.outdated_deps_count));
        }
        if m.stale_docs_count > 0 {
            maint.push(format!("Stale docs: {}", m.stale_docs_count));
        }
        if !maint.is_empty() {
            parts.push(format!("## Project Health\n{}", maint.join("\n")));
        }

        // 関連設計書
        if !context.doc_context.is_empty() {
            let sections: Vec<String> = context
                .doc_context
                .iter()
                .map(|d| format!("### {}\n{}", d.title, d.content_snippet))
                .collect();
            parts.push(format!(
                "## Related Design Documents\n{}",
                sections.join("\n\n")
            ));
        }

        // Git 履歴
        if !context.git_context.recent_commits.is_empty() {
            let commits: Vec<String> = context
                .git_context
                .recent_commits
                .iter()
                .take(5)
                .map(|c| format!("- {} ({}): {}", &c.sha[..7.min(c.sha.len())], c.author, c.message))
                .collect();
            parts.push(format!("## Recent Commits\n{}", commits.join("\n")));
        }

        // ファイル内容
        if let Some(ref fc) = context.file_context {
            parts.push(format!(
                "## File: {} ({})\n```{}\n{}\n```",
                fc.path, fc.language, fc.language, fc.content
            ));
        }

        parts.join("\n\n")
    }

    /// トークン予算内にコンテキストを圧縮する
    pub fn compress_context(&self, context: &AiContext, budget: &ContextBudget) -> AiContext {
        let char_budget = budget.max_tokens * 4;
        let file_budget = (char_budget as f32 * budget.file_content_ratio) as usize;
        let doc_budget = (char_budget as f32 * budget.doc_ratio) as usize;

        let compressed_file = context.file_context.as_ref().map(|fc| {
            let truncated: String = fc.content.chars().take(file_budget).collect();
            let is_truncated = truncated.len() < fc.content.len();
            FileContext {
                content: if is_truncated {
                    format!("{}\n... (truncated)", truncated)
                } else {
                    truncated
                },
                ..fc.clone()
            }
        });

        let doc_budget_each = if context.doc_context.is_empty() {
            doc_budget
        } else {
            doc_budget / context.doc_context.len()
        };

        let compressed_docs: Vec<DocContext> = context
            .doc_context
            .iter()
            .map(|d| DocContext {
                content_snippet: d.content_snippet.chars().take(doc_budget_each).collect(),
                ..d.clone()
            })
            .collect();

        AiContext {
            file_context: compressed_file,
            doc_context: compressed_docs,
            ..context.clone()
        }
    }

    /// プロダクト情報を構築する（pub(crate) for testing）
    pub(crate) fn build_product_context(&self) -> ProductContext {
        let name = self
            .project_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let (repo_owner, repo_name) = parse_git_remote(&self.project_path)
            .unwrap_or_else(|| (String::new(), name.clone()));

        ProductContext {
            name,
            repo_owner,
            repo_name,
            default_branch: "main".to_string(),
            docs_root: "docs".to_string(),
        }
    }

    // ─── private helpers ───

    fn build_file_context(&self, file_path: &Path) -> Result<FileContext> {
        let abs_path = if file_path.is_absolute() {
            file_path.to_path_buf()
        } else {
            self.project_path.join(file_path)
        };

        let content = std::fs::read_to_string(&abs_path)
            .map_err(|e| AppError::Io(format!("Cannot read {:?}: {}", abs_path, e)))?;

        let rel_path = abs_path
            .strip_prefix(&self.project_path)
            .unwrap_or(&abs_path)
            .to_string_lossy()
            .to_string();

        let language = detect_language(&rel_path);
        let line_count = content.lines().count() as u32;

        Ok(FileContext {
            path: rel_path,
            language,
            content,
            line_count,
        })
    }

    fn find_related_docs(&self, file_path: &Path) -> Vec<DocContext> {
        let index_path = self.project_path.join(".doc-map.yaml");
        let Ok(idx) = index::load_index(&index_path) else {
            return vec![];
        };

        let rel_path = file_path
            .strip_prefix(&self.project_path)
            .unwrap_or(file_path)
            .to_string_lossy()
            .to_string();

        let entries = index::find_docs_for_source(&idx, &rel_path);

        entries
            .into_iter()
            .take(3)
            .filter_map(|e| {
                let doc_path = self.project_path.join(&e.doc);
                let content = std::fs::read_to_string(&doc_path).ok()?;
                let snippet: String = content.chars().take(600).collect();
                let title = extract_title(&content).unwrap_or_else(|| e.doc.clone());
                Some(DocContext {
                    path: e.doc,
                    title,
                    content_snippet: snippet,
                    relevance_score: 1.0,
                })
            })
            .collect()
    }

    fn build_git_context(&self) -> Result<GitContext> {
        let repo = git2::Repository::open(&self.project_path)
            .map_err(|e| AppError::Git(e.to_string()))?;

        let head = repo.head().map_err(|e| AppError::Git(e.to_string()))?;
        let branch = head.shorthand().unwrap_or("unknown").to_string();

        let mut revwalk = repo.revwalk().map_err(|e| AppError::Git(e.to_string()))?;
        revwalk.push_head().map_err(|e| AppError::Git(e.to_string()))?;

        let mut commits = Vec::new();
        let mut changed_files: HashSet<String> = HashSet::new();

        for (i, oid_result) in revwalk.enumerate() {
            if i >= 10 {
                break;
            }
            let Ok(oid) = oid_result else { continue };
            let Ok(commit) = repo.find_commit(oid) else { continue };

            let message = commit
                .message()
                .unwrap_or("")
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            let author = commit.author().name().unwrap_or("").to_string();
            let timestamp = commit.time().seconds().to_string();
            let sha = oid.to_string();

            if i < 5 {
                commits.push(CommitSummary {
                    sha: sha.clone(),
                    message,
                    author,
                    timestamp,
                });

                // 差分ファイルを収集
                if let Ok(parent) = commit.parent(0) {
                    if let (Ok(t1), Ok(t2)) = (commit.tree(), parent.tree()) {
                        if let Ok(diff) =
                            repo.diff_tree_to_tree(Some(&t2), Some(&t1), None)
                        {
                            diff.foreach(
                                &mut |delta, _| {
                                    if let Some(p) = delta.new_file().path() {
                                        changed_files
                                            .insert(p.to_string_lossy().to_string());
                                    }
                                    true
                                },
                                None,
                                None,
                                None,
                            )
                            .ok();
                        }
                    }
                }
            }
        }

        Ok(GitContext {
            current_branch: branch,
            recent_commits: commits,
            recent_changed_files: changed_files.into_iter().take(20).collect(),
        })
    }

    fn build_maintenance_snapshot(&self) -> MaintenanceSnapshot {
        let debt_path = self
            .project_path
            .join(".devnest")
            .join("debt-history.yaml");
        let debt_score = std::fs::read_to_string(&debt_path)
            .ok()
            .and_then(|c| parse_latest_debt_score(&c));

        MaintenanceSnapshot {
            coverage_pct: None,
            debt_score,
            outdated_deps_count: 0,
            stale_docs_count: 0,
        }
    }
}

// ─────────────────────────────────────────────
//  ユーティリティ関数
// ─────────────────────────────────────────────

fn detect_language(path: &str) -> String {
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "py" => "python",
        "go" => "go",
        "md" => "markdown",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "json" => "json",
        "sql" => "sql",
        _ => "text",
    }
    .to_string()
}

fn extract_title(content: &str) -> Option<String> {
    content
        .lines()
        .find(|l| l.starts_with("# "))
        .map(|l| l.trim_start_matches("# ").trim().to_string())
}

fn parse_latest_debt_score(yaml_content: &str) -> Option<f64> {
    yaml_content.lines().rev().find_map(|line| {
        let line = line.trim();
        if line.starts_with("total_score:") {
            line.split(':').nth(1)?.trim().parse().ok()
        } else {
            None
        }
    })
}

fn parse_git_remote(project_path: &Path) -> Option<(String, String)> {
    let repo = git2::Repository::open(project_path).ok()?;
    let remote = repo.find_remote("origin").ok()?;
    let url = remote.url()?.to_string();

    // HTTPS: https://github.com/owner/repo.git
    if url.starts_with("https://github.com/") {
        let trimmed = url
            .trim_end_matches(".git")
            .trim_start_matches("https://github.com/");
        let mut parts = trimmed.splitn(2, '/');
        let owner = parts.next()?.to_string();
        let repo_name = parts.next()?.to_string();
        return Some((owner, repo_name));
    }
    // SSH: git@github.com:owner/repo.git
    if url.starts_with("git@github.com:") {
        let trimmed = url
            .trim_end_matches(".git")
            .trim_start_matches("git@github.com:");
        let mut parts = trimmed.splitn(2, '/');
        let owner = parts.next()?.to_string();
        let repo_name = parts.next()?.to_string();
        return Some((owner, repo_name));
    }
    None
}
