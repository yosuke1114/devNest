/// TaskSplitter — Claude API でユーザーのタスクをサブタスクに分解する
use crate::doc_mapping::{index::find_docs_for_source, types::DocIndex};
use crate::error::{AppError, Result};
use crate::services::anthropic::AnthropicClient;

use super::subtask::{SubTask, TaskRole};

const SYSTEM_PROMPT: &str = r#"あなたはタスク分解の専門家です。
ユーザーのタスクを並列・直列実行可能なサブタスクに分割し、各タスクに最適なロールを割り当ててください。

## ロール定義

各タスクには以下のロールのいずれかを割り当てること:

| role      | 担当                                         | 向いているタスク例                                   |
|-----------|----------------------------------------------|-----------------------------------------------------|
| builder   | コードの実装・追加・修正                     | 新機能の実装、バグ修正、リファクタリング             |
| designer  | UIコンポーネントのデザイン・スタイリング      | 画面レイアウト、CSS/スタイル変更、アニメーション追加 |
| reviewer  | コードのレビューと品質改善                   | セキュリティ確認、パフォーマンス改善、型安全性確認   |
| scout     | コードベースの調査・分析                     | 依存関係調査、影響範囲確認、仕様の読み解き          |
| merger    | 複数ブランチの統合・コンフリクト解消・PR作成  | マージ作業、衝突解消、後処理統合、PR発行            |
| tester    | テストコードの作成・実行・カバレッジ向上      | ユニットテスト追加、E2Eテスト、テスト修正           |

## 制約

- 各サブタスクには対象ファイル/ディレクトリを明記すること
- 分割数は最大8つまで
- 独立して実行できるタスクは depends_on を空配列にすること
- 依存関係がある場合のみ depends_on に依存先タスクの id を列挙すること（循環依存禁止）
- instruction はそのロールが実際に行うべき作業を具体的・詳細に記述すること（あいまいな指示は禁止）
- JSON形式のみで返すこと（説明文や前置きは不要）

## 出力形式

{
  "tasks": [
    {
      "id": 1,
      "title": "短いタイトル（20文字以内）",
      "role": "scout",
      "files": ["path/to/file"],
      "instruction": "Workerへの具体的な指示。何を調べ・実装し・確認すべきかを明記する。",
      "depends_on": []
    },
    {
      "id": 2,
      "title": "依存タスクの例",
      "role": "builder",
      "files": ["path/to/other"],
      "instruction": "Task 1の調査結果を踏まえて〇〇を実装する。具体的には...",
      "depends_on": [1]
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
        self.split_inner(prompt, project_path, context_files, None).await
    }

    /// doc-mapping インデックスを活用してタスク分解する（設計書コンテキスト注入）
    pub async fn split_with_docs(
        &self,
        prompt: &str,
        project_path: &str,
        context_files: &[String],
        doc_index: &DocIndex,
    ) -> Result<Vec<SubTask>> {
        self.split_inner(prompt, project_path, context_files, Some(doc_index)).await
    }

    async fn split_inner(
        &self,
        prompt: &str,
        project_path: &str,
        context_files: &[String],
        doc_index: Option<&DocIndex>,
    ) -> Result<Vec<SubTask>> {
        let context_section = if context_files.is_empty() {
            String::new()
        } else {
            format!(
                "\n\nプロジェクトのファイル構成（参考）:\n{}",
                context_files.join("\n")
            )
        };

        // doc-mapping が利用可能な場合、関連設計書コンテキストを注入する
        let doc_context_section = if let Some(index) = doc_index {
            let related_docs: Vec<String> = context_files
                .iter()
                .flat_map(|f| find_docs_for_source(index, f))
                .map(|e| e.doc.clone())
                .collect::<std::collections::HashSet<_>>()
                .into_iter()
                .collect();

            if related_docs.is_empty() {
                String::new()
            } else {
                format!(
                    "\n\n関連設計書（実装との整合性を維持してください）:\n{}\n各サブタスクの instruction に設計書の参照パスを含め、実装完了後に frontmatter の last_synced_commit と version を更新するよう指示してください。",
                    related_docs.iter().map(|d| format!("- {}", d)).collect::<Vec<_>>().join("\n")
                )
            }
        } else {
            String::new()
        };

        let user_message = format!(
            "プロジェクト: {}\n\nタスク:\n{}{}{}",
            project_path, prompt, doc_context_section, context_section
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

            let depends_on = v
                .get("depends_on")
                .and_then(|x| x.as_array())
                .map(|arr| arr.iter().filter_map(|d| d.as_u64().map(|n| n as u32)).collect())
                .unwrap_or_default();

            let role = v
                .get("role")
                .and_then(|x| x.as_str())
                .map(TaskRole::from)
                .unwrap_or_default();

            if instruction.is_empty() {
                return None;
            }
            Some(SubTask { id, title, role, files, instruction, depends_on })
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
