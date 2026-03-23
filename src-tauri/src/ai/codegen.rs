/// 設計書駆動コード生成
///
/// 設計書（Markdown + frontmatter）の内容からコードの骨格・実装・テストを生成する。
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::services::anthropic::AnthropicClient;

use super::context_engine::{ContextBudget, ContextEngine, PromptPurpose};

// ─────────────────────────────────────────────
//  データ型
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodegenRequest {
    pub doc_path: String,
    /// 特定セクションのみ対象にする場合（省略時は全セクション）
    pub target_sections: Option<Vec<String>>,
    pub generation_mode: GenerationMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GenerationMode {
    /// 型定義 + 関数シグネチャのみ（実装なし）
    Scaffold,
    /// 完全実装
    Implementation,
    /// テストコードのみ
    TestOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodegenResult {
    pub generated_files: Vec<GeneratedFile>,
    /// doc-mapping frontmatter に追加すべきマッピング情報
    pub mapping_updates: Vec<MappingUpdate>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedFile {
    pub path: String,
    pub content: String,
    pub language: String,
    /// "new" | "update"
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MappingUpdate {
    pub doc_path: String,
    pub source_path: String,
}

// ─────────────────────────────────────────────
//  CodeGenerator
// ─────────────────────────────────────────────

pub struct CodeGenerator {
    anthropic: AnthropicClient,
    context_engine: ContextEngine,
}

impl CodeGenerator {
    pub fn new(api_key: &str, project_path: &Path) -> Self {
        Self {
            anthropic: AnthropicClient::new(api_key),
            context_engine: ContextEngine::new(project_path),
        }
    }

    /// 設計書からコードを生成する
    pub async fn generate(&self, request: &CodegenRequest) -> Result<CodegenResult> {
        let doc_path = Path::new(&request.doc_path);
        let context = self
            .context_engine
            .build_context_for_doc(doc_path)
            .await?;

        let budget = ContextBudget {
            max_tokens: 6000,
            file_content_ratio: 0.60,
            doc_ratio: 0.25,
            metadata_ratio: 0.15,
        };
        let context = self.context_engine.compress_context(&context, &budget);
        let context_prompt = self
            .context_engine
            .to_prompt(&context, PromptPurpose::CodeGeneration);

        let mode_instruction = match request.generation_mode {
            GenerationMode::Scaffold => {
                "Generate ONLY type definitions and function/method signatures. \
                 Do NOT include function bodies—use `todo!()` or `unimplemented!()` as placeholders. \
                 Include all necessary imports."
            }
            GenerationMode::Implementation => {
                "Generate complete, working implementation code with all function bodies filled in."
            }
            GenerationMode::TestOnly => {
                "Generate comprehensive unit tests and integration tests only. \
                 Cover happy paths, error paths, and edge cases."
            }
        };

        let sections_note = request
            .target_sections
            .as_ref()
            .map(|s| format!("\nFocus only on these sections: {}", s.join(", ")))
            .unwrap_or_default();

        let user_message = format!(
            "{context_prompt}\n\n\
             ## Generation Mode\n{mode_instruction}{sections_note}\n\n\
             Analyze the design document and generate code. \
             Respond with a single valid JSON object (no markdown, no extra text):\n\
             {{\
               \"generated_files\": [{{\
                 \"path\": \"src-tauri/src/...\",\
                 \"content\": \"...\",\
                 \"language\": \"rust\",\
                 \"file_type\": \"new\"\
               }}],\
               \"mapping_updates\": [{{\
                 \"doc_path\": \"docs/...\",\
                 \"source_path\": \"src-tauri/src/...\"\
               }}],\
               \"warnings\": []\
             }}"
        );

        let system_prompt = "You are an expert software architect generating idiomatic Rust and TypeScript code \
                             from design documents. Respond with valid JSON only. No markdown fences, no explanation.";

        let raw = self.anthropic.complete(system_prompt, &user_message).await?;
        Ok(parse_codegen_result(&raw))
    }
}

// ─────────────────────────────────────────────
//  ユーティリティ
// ─────────────────────────────────────────────

fn parse_codegen_result(raw: &str) -> CodegenResult {
    let json_str = extract_json_object(raw).unwrap_or(raw);

    serde_json::from_str(json_str).unwrap_or_else(|_| CodegenResult {
        generated_files: vec![],
        mapping_updates: vec![],
        warnings: vec![format!(
            "AI response could not be parsed as JSON: {}",
            raw.chars().take(200).collect::<String>()
        )],
    })
}

fn extract_json_object(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let end = s.rfind('}')?;
    if end > start {
        Some(&s[start..=end])
    } else {
        None
    }
}
