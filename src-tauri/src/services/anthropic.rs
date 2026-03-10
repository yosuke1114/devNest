use crate::error::{AppError, Result};
use reqwest::Client;
use tauri::{AppHandle, Emitter};

pub struct AnthropicClient {
    api_key: String,
    http: Client,
}

impl AnthropicClient {
    pub fn new(api_key: &str) -> Self {
        Self {
            api_key: api_key.to_string(),
            http: Client::new(),
        }
    }

    /// Anthropic Messages API をストリーミングで呼び出し、
    /// テキストデルタごとに `issue_draft_chunk` イベントを emit する。
    /// 最終的に連結した全文を返す。
    pub async fn complete_stream(
        &self,
        system_prompt: &str,
        user_message: &str,
        app: &AppHandle,
        draft_id: i64,
    ) -> Result<String> {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 4096,
            "stream": true,
            "system": system_prompt,
            "messages": [
                { "role": "user", "content": user_message }
            ]
        });

        let resp = self
            .http
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Anthropic(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown".to_string());
            return Err(AppError::Anthropic(format!(
                "Anthropic API returned {}: {}",
                status, text
            )));
        }

        let mut full_text = String::new();
        let mut stream = resp.bytes_stream();

        use futures_util::StreamExt;
        let mut buf = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| AppError::Anthropic(e.to_string()))?;
            buf.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE lines from the buffer
            while let Some(newline_pos) = buf.find('\n') {
                let line = buf[..newline_pos].to_string();
                buf = buf[newline_pos + 1..].to_string();

                let line = line.trim();
                if !line.starts_with("data: ") {
                    continue;
                }
                let data = &line[6..];
                if data == "[DONE]" {
                    continue;
                }

                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if parsed.get("type").and_then(|t| t.as_str()) == Some("content_block_delta")
                    {
                        if let Some(delta_text) = parsed
                            .get("delta")
                            .and_then(|d| d.get("text"))
                            .and_then(|t| t.as_str())
                        {
                            full_text.push_str(delta_text);
                            let _ = app.emit(
                                "issue_draft_chunk",
                                serde_json::json!({
                                    "draft_id": draft_id,
                                    "delta": delta_text,
                                }),
                            );
                        }
                    }
                }
            }
        }

        Ok(full_text)
    }
}
