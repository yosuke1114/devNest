/// Phase 6: AI開発アシスタント — Tauri コマンドハンドラ
use tauri::State;

use crate::ai::{
    codegen::{CodegenRequest, CodegenResult, CodeGenerator},
    context_engine::{AiContext, ContextEngine},
    review_agent::{ReviewAgent, ReviewRequest, ReviewResult},
};
use crate::error::{AppError, Result};
use crate::state::AppState;

// ─── コンテキスト取得 ──────────────────────────────

/// 指定ファイル（省略時はプロジェクト全体）の AI コンテキストを返す
#[tauri::command]
pub async fn ai_get_context(
    project_path: String,
    file_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<AiContext> {
    let _ = &state.db; // suppress unused warning
    let engine = ContextEngine::new(std::path::Path::new(&project_path));

    let ctx = if let Some(fp) = file_path {
        engine
            .build_context_for_file(std::path::Path::new(&fp))
            .await?
    } else {
        engine
            .build_context_for_doc(std::path::Path::new(&project_path))
            .await?
    };

    Ok(ctx)
}

// ─── コードレビュー ───────────────────────────────

/// ローカル diff / PR に対して AI レビューを実行する
#[tauri::command]
pub async fn ai_review_changes(
    project_path: String,
    request: ReviewRequest,
    state: State<'_, AppState>,
) -> Result<ReviewResult> {
    let api_key = load_anthropic_key(&state).await?;
    let agent = ReviewAgent::new(&api_key, std::path::Path::new(&project_path));
    agent.review_changes(&request).await
}

// ─── コード生成 ───────────────────────────────────

/// 設計書からコードを生成する
#[tauri::command]
pub async fn ai_generate_code(
    project_path: String,
    request: CodegenRequest,
    state: State<'_, AppState>,
) -> Result<CodegenResult> {
    let api_key = load_anthropic_key(&state).await?;
    let generator = CodeGenerator::new(&api_key, std::path::Path::new(&project_path));
    generator.generate(&request).await
}

// ─── ヘルパー ─────────────────────────────────────

async fn load_anthropic_key(state: &State<'_, AppState>) -> Result<String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = 'anthropic.api_key'")
            .fetch_optional(&state.db)
            .await?;

    let key = row
        .map(|(v,)| v.trim_matches('"').to_string())
        .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
        .unwrap_or_default();

    if key.is_empty() {
        return Err(AppError::Validation(
            "Anthropic API キーが設定されていません。Settings で API キーを設定してください。"
                .to_string(),
        ));
    }
    Ok(key)
}
