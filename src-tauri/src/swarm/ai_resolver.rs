/// AiConflictResolver — Claude API でコンフリクトを自動解決する（Feature 12-2）
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::services::anthropic::AnthropicClient;

// ─── 公開型 ────────────────────────────────────────────────────

/// AI による解決案の信頼度
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Confidence {
    /// 明確に統合可能（import 追加同士など）
    High,
    /// 論理的に統合可能だが動作確認を推奨
    Medium,
    /// 競合が深く人間の判断が必要
    Low,
}

/// AI によるコンフリクト解決案
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResolution {
    /// 解決済みコード（コンフリクトマーカーなし）
    pub resolved_code: String,
    /// 信頼度スコア
    pub confidence: Confidence,
    /// 解決の根拠（1〜2文）
    pub reason: String,
}

const SYSTEM_PROMPT: &str = r#"あなたはマージコンフリクト解決の専門家です。
提示されたコンフリクトブロックを分析し、最善の統合コードを生成してください。

HEAD側（ours）とWorkerブランチ側（theirs）の変更意図を理解した上で、
両者の変更を適切に統合してください。

以下のJSON形式のみで返してください（説明文や前置きは一切不要）:
{
  "resolved_code": "解決済みのコード（コンフリクトマーカーを含まない）",
  "confidence": "high",
  "reason": "解決の理由（1〜2文）"
}

confidence の基準:
- "high": 変更が明確に独立しており機械的に統合可能（import の追加同士、別関数の追加など）
- "medium": 論理的に統合可能だが動作確認を推奨（同じ関数の異なる部分の変更など）
- "low": 変更が競合しており人間の判断が必要（ロジックの根本的な変更など）"#;

// ─── AiConflictResolver ────────────────────────────────────────

pub struct AiConflictResolver {
    client: AnthropicClient,
}

impl AiConflictResolver {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: AnthropicClient::new(api_key),
        }
    }

    /// コンフリクトブロックを Claude API に渡して解決案を生成する
    pub async fn resolve(
        &self,
        file_path: &str,
        ours: &str,
        theirs: &str,
        context_before: &str,
    ) -> Result<AiResolution> {
        let user_message = format!(
            "ファイル: {file_path}\n\nコンテキスト（コンフリクト前のコード）:\n{context_before}\n\n<<<<<<< HEAD（現在のブランチ）\n{ours}\n=======\n{theirs}\n>>>>>>> Worker ブランチ"
        );

        let raw = self.client.complete(SYSTEM_PROMPT, &user_message).await?;
        parse_ai_resolution(&raw)
    }
}

/// Claude のレスポンスから JSON をパースする
fn parse_ai_resolution(raw: &str) -> Result<AiResolution> {
    // コードブロックのフェンスを除去
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let json: serde_json::Value = serde_json::from_str(cleaned)
        .map_err(|e| AppError::Validation(format!("AI解決レスポンスのパースエラー: {}", e)))?;

    let resolved_code = json
        .get("resolved_code")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Validation("AI解決: 'resolved_code' フィールドがありません".into()))?
        .to_string();

    let confidence_str = json
        .get("confidence")
        .and_then(|v| v.as_str())
        .unwrap_or("low");

    let confidence = match confidence_str.to_lowercase().as_str() {
        "high" => Confidence::High,
        "medium" => Confidence::Medium,
        _ => Confidence::Low,
    };

    let reason = json
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("AI が解決案を生成しました")
        .to_string();

    Ok(AiResolution {
        resolved_code,
        confidence,
        reason,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_high_confidence_resolution() {
        let raw = r#"{"resolved_code":"import { A, B } from 'mod';","confidence":"high","reason":"両者が独立した import を追加しているため統合可能"}"#;
        let res = parse_ai_resolution(raw).unwrap();
        assert_eq!(res.confidence, Confidence::High);
        assert!(res.resolved_code.contains("import"));
        assert!(!res.reason.is_empty());
    }

    #[test]
    fn parse_medium_confidence() {
        let raw = r#"{"resolved_code":"merged code","confidence":"medium","reason":"同じ関数の修正"}"#;
        let res = parse_ai_resolution(raw).unwrap();
        assert_eq!(res.confidence, Confidence::Medium);
    }

    #[test]
    fn parse_low_confidence() {
        let raw = r#"{"resolved_code":"code","confidence":"low","reason":"ロジックが競合"}"#;
        let res = parse_ai_resolution(raw).unwrap();
        assert_eq!(res.confidence, Confidence::Low);
    }

    #[test]
    fn unknown_confidence_defaults_to_low() {
        let raw = r#"{"resolved_code":"code","confidence":"unknown","reason":"?"}"#;
        let res = parse_ai_resolution(raw).unwrap();
        assert_eq!(res.confidence, Confidence::Low);
    }

    #[test]
    fn strips_code_fence() {
        let raw = "```json\n{\"resolved_code\":\"x\",\"confidence\":\"high\",\"reason\":\"ok\"}\n```";
        let res = parse_ai_resolution(raw).unwrap();
        assert_eq!(res.resolved_code, "x");
    }

    #[test]
    fn missing_resolved_code_returns_error() {
        let raw = r#"{"confidence":"high","reason":"ok"}"#;
        assert!(parse_ai_resolution(raw).is_err());
    }
}
