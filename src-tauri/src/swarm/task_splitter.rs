/// TaskSplitter — Claude API でユーザーのタスクをサブタスクに分解する
use crate::error::{AppError, Result};
use crate::services::anthropic::AnthropicClient;

use super::subtask::SubTask;

const SYSTEM_PROMPT: &str = r#"あなたはタスク分解の専門家です。
ユーザーのタスクを独立して並列実行可能なサブタスクに分割してください。

制約:
- 各サブタスクは他のサブタスクの結果に依存しないこと
- 各サブタスクには対象ファイル/ディレクトリを明記すること
- 分割数は最大8つまで
- JSON形式のみで返すこと（説明文や前置きは不要）

出力形式:
{
  "tasks": [
    {
      "id": 1,
      "title": "短いタイトル（20文字以内）",
      "files": ["path/to/file"],
      "instruction": "Workerへの具体的な指示（claude コマンドに渡すプロンプト）"
    }
  ]
}"#;

pub struct TaskSplitter {
    client: AnthropicClient,
}

impl TaskSplitter {
    pub fn new(api_key: &str) -> Self {
        Self {
            client: AnthropicClient::new(api_key),
        }
    }

    /// ユーザープロンプトと文脈ファイルからサブタスクリストを生成する
    pub async fn split(
        &self,
        prompt: &str,
        project_path: &str,
        context_files: &[String],
    ) -> Result<Vec<SubTask>> {
        let context_section = if context_files.is_empty() {
            String::new()
        } else {
            format!(
                "\n\nプロジェクトのファイル構成（参考）:\n{}",
                context_files.join("\n")
            )
        };

        let user_message = format!(
            "プロジェクト: {}\n\nタスク:\n{}{}",
            project_path, prompt, context_section
        );

        let raw = self
            .client
            .complete(SYSTEM_PROMPT, &user_message)
            .await?;

        parse_subtasks(&raw)
    }
}

/// Claude のレスポンスから JSON を抽出してパースする
fn parse_subtasks(raw: &str) -> Result<Vec<SubTask>> {
    // コードブロック（```json ... ``` など）を除去
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let json: serde_json::Value = serde_json::from_str(cleaned)
        .map_err(|e| AppError::Validation(format!("TaskSplitter JSON parse error: {}", e)))?;

    let tasks_arr = json
        .get("tasks")
        .and_then(|v| v.as_array())
        .ok_or_else(|| AppError::Validation("TaskSplitter: 'tasks' フィールドが見つかりません".into()))?;

    let tasks: Vec<SubTask> = tasks_arr
        .iter()
        .enumerate()
        .filter_map(|(i, v)| {
            let id = v.get("id").and_then(|x| x.as_u64()).unwrap_or(i as u64 + 1) as u32;
            let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let instruction = v.get("instruction").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let files = v
                .get("files")
                .and_then(|x| x.as_array())
                .map(|arr| arr.iter().filter_map(|f| f.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            if instruction.is_empty() {
                return None;
            }
            Some(SubTask { id, title, files, instruction })
        })
        .collect();

    if tasks.is_empty() {
        return Err(AppError::Validation("タスク分解結果が空です".into()));
    }

    Ok(tasks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_json_returns_subtasks() {
        let raw = r#"{"tasks":[{"id":1,"title":"Fix A","files":["a.rs"],"instruction":"Fix the bug in a.rs"}]}"#;
        let tasks = parse_subtasks(raw).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Fix A");
        assert_eq!(tasks[0].files, vec!["a.rs"]);
    }

    #[test]
    fn parse_strips_code_fence() {
        let raw = "```json\n{\"tasks\":[{\"id\":1,\"title\":\"T\",\"files\":[],\"instruction\":\"do it\"}]}\n```";
        let tasks = parse_subtasks(raw).unwrap();
        assert_eq!(tasks.len(), 1);
    }

    #[test]
    fn parse_empty_tasks_returns_error() {
        let raw = r#"{"tasks":[]}"#;
        assert!(parse_subtasks(raw).is_err());
    }

    #[test]
    fn parse_missing_tasks_field_returns_error() {
        let raw = r#"{"result":[]}"#;
        assert!(parse_subtasks(raw).is_err());
    }

    #[test]
    fn parse_multiple_tasks() {
        let raw = r#"{
            "tasks": [
                {"id":1,"title":"A","files":["a.ts"],"instruction":"Fix A"},
                {"id":2,"title":"B","files":["b.ts"],"instruction":"Fix B"},
                {"id":3,"title":"C","files":["c.ts"],"instruction":"Fix C"}
            ]
        }"#;
        let tasks = parse_subtasks(raw).unwrap();
        assert_eq!(tasks.len(), 3);
        assert_eq!(tasks[2].id, 3);
    }
}
