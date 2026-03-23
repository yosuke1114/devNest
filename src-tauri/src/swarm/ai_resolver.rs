/// AiConflictResolver — Claude API でコンフリクトブロックを AI 解決する
use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};
use crate::services::anthropic::AnthropicClient;

const SYSTEM_PROMPT: &str = r#"あなたは Git マージコンフリクトの解決専門家です。
与えられたコンフリクトブロックを解析し、最善の解決案を JSON で返してください。

ルール:
- 両方の変更の意図を理解した上で、意味的に正しいコードを生成すること
- 構文エラーが発生しないよう注意すること
- JSON 以外の出力は禁止（説明文不要）

出力形式:
{
  "resolved_code": "解決後のコード（マーカーなし）",
  "confidence": "high|medium|low",
  "reason": "解決方針の簡潔な説明（日本語・50文字以内）"
}"#;

/// Tauri IPC から返す解決結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResolution {
    pub resolved_code: String,
    pub confidence: String,
    pub reason: String,
}

pub struct AiConflictResolver {
    client: AnthropicClient,
}

impl AiConflictResolver {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: AnthropicClient::new(api_key),
        }
    }

    pub async fn resolve(
        &self,
        file_path: &str,
        ours: &str,
        theirs: &str,
        context_before: &str,
    ) -> Result<AiResolution> {
        let user_message = format!(
            "ファイル: {}\n\n前の文脈:\n```\n{}\n```\n\n<<<<<<< ours\n{}\n=======\n{}\n>>>>>>> theirs",
            file_path, context_before, ours, theirs
        );

        let raw = self.client.complete(SYSTEM_PROMPT, &user_message).await?;
        parse_resolution(&raw)
    }
}

fn parse_resolution(raw: &str) -> Result<AiResolution> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: serde_json::Value = serde_json::from_str(cleaned)
        .map_err(|e| AppError::Validation(format!("AiResolver JSON parse error: {}", e)))?;

    let resolved_code = v
        .get("resolved_code")
        .and_then(|x| x.as_str())
        .ok_or_else(|| AppError::Validation("resolved_code フィールドが見つかりません".into()))?
        .to_string();

    let confidence = v
        .get("confidence")
        .and_then(|x| x.as_str())
        .unwrap_or("low")
        .to_string();

    let reason = v
        .get("reason")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    Ok(AiResolution { resolved_code, confidence, reason })
}
