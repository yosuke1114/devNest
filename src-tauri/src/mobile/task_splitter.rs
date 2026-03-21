use super::message::SubTask;
use serde::Deserialize;

#[derive(Deserialize)]
struct SplitResponse {
    tasks: Vec<SubTask>,
}

pub async fn split_task(
    text: &str,
    api_key: &str,
) -> Result<Vec<SubTask>, Box<dyn std::error::Error + Send + Sync>> {
    let prompt = format!(
        r#"以下のタスクをScrum開発向けのサブタスクに分割してください。

タスク:
{}

要件:
- 1タスクは1〜3日で完了できる粒度にすること
- 最大8件まで
- 以下のJSON形式のみで返答すること（説明文・コードブロック不要）

{{
  "tasks": [
    {{
      "id": 1,
      "title": "タスクタイトル（40文字以内）",
      "tag": "backend | frontend | design | test | infra のいずれか",
      "points": 1から5の整数
    }}
  ]
}}"#,
        text
    );

    let client = reqwest::Client::new();
    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1024,
            "messages": [{ "role": "user", "content": prompt }]
        }))
        .send()
        .await?;

    let body: serde_json::Value = res.json().await?;
    let content = body["content"][0]["text"]
        .as_str()
        .ok_or("レスポンスのtextフィールドが見つかりません")?;

    // コードブロックを除去してパース
    let clean = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let parsed: SplitResponse = serde_json::from_str(clean)
        .map_err(|e| format!("JSONパース失敗: {}\n内容: {}", e, clean))?;

    Ok(parsed.tasks)
}
