// src-tauri/src/swarm/role_manager.rs

use std::path::Path;
use std::fs;
use super::worker::WorkerRole;

/// デフォルトのロールテンプレートを初期化する
/// .devnest/roles/ がなければ作成してデフォルトを書き込む
pub fn init_role_templates(project_root: &Path) -> Result<(), String> {
    let roles_dir = project_root.join(".devnest/roles");
    fs::create_dir_all(&roles_dir).map_err(|e| e.to_string())?;

    let templates = [
        ("scout.md", SCOUT_TEMPLATE),
        ("builder.md", BUILDER_TEMPLATE),
        ("reviewer.md", REVIEWER_TEMPLATE),
        ("merger.md", MERGER_TEMPLATE),
    ];

    for (filename, content) in templates {
        let path = roles_dir.join(filename);
        // 既存ファイルは上書きしない（カスタマイズを保護）
        if !path.exists() {
            fs::write(&path, content).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// ロールテンプレートを読み込む
pub fn load_role_template(
    project_root: &Path,
    role: &WorkerRole,
) -> Option<String> {
    let path = role.template_path()?;
    let full_path = project_root.join(path);
    fs::read_to_string(full_path).ok()
}

// ─── デフォルトテンプレート ───

const SCOUT_TEMPLATE: &str = r#"
# Scout役割定義

あなたはコード調査の専門家です。

## 役割
- コードベースを読み込んで分析・調査することに特化してください
- ファイルへの書き込みは**一切行わない**でください
- 調査結果はJSONフォーマットで出力してください

## 出力フォーマット
```json
{
  "findings": ["発見事項1", "発見事項2"],
  "affected_files": ["src/a.ts", "src/b.ts"],
  "risks": ["リスク1"],
  "recommendation": "推奨アプローチ"
}
```

## 重要
- 不明な点は推測せず、Escalationメールを送信して停止してください
- スコープ外のファイルには触れないでください
"#;

const BUILDER_TEMPLATE: &str = r#"
# Builder役割定義

あなたは実装の専門家です。

## 役割
- 割り当てられたファイルのみ変更してください: {assigned_files}
- スコープ外のファイルには**触れない**でください
- 変更内容をコミットメッセージに詳細に記載してください

## 完了シグナル
作業完了時に必ず以下の形式で出力してください:
TASK_COMPLETE: {変更内容のサマリー}

## 重要
- テストが失敗した場合は自動修正を試みてください
- git pushは**禁止**です
- 判断できない場合はEscalationメールを送信して停止してください
"#;

const REVIEWER_TEMPLATE: &str = r#"
# Reviewer役割定義

あなたはコードレビューの専門家です。

## 役割
- ファイルへの書き込みは**一切行わない**でください
- 以下の観点でレビューしてください:
  1. バグ・エラーハンドリング
  2. パフォーマンス
  3. セキュリティ
  4. 設計の一貫性・可読性

## 出力フォーマット
```json
{
  "overall": "LGTM | NEEDS_CHANGES | BLOCKING",
  "comments": [
    {
      "file": "src/a.ts",
      "line": 42,
      "severity": "error | warning | suggestion",
      "message": "コメント内容"
    }
  ],
  "summary": "レビューサマリー"
}
```
"#;

const MERGER_TEMPLATE: &str = r#"
# Merger役割定義

あなたはマージの専門家です。

## 役割
- Workerのブランチをベースブランチにマージしてください
- コンフリクトが発生した場合はEscalationメールを送信してください
- マージ完了後にWorkDoneメールを送信してください

## 禁止事項
- rm -rf などの破壊的操作は禁止です
- git push --force は禁止です
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use crate::swarm::worker::WorkerRole;

    // ITa-13-01: init_role_templatesが.devnest/roles/を作成する
    #[test]
    fn test_init_role_templates_creates_directory() {
        let dir = TempDir::new().unwrap();
        init_role_templates(dir.path()).unwrap();
        assert!(dir.path().join(".devnest/roles/scout.md").exists());
        assert!(dir.path().join(".devnest/roles/builder.md").exists());
        assert!(dir.path().join(".devnest/roles/reviewer.md").exists());
        assert!(dir.path().join(".devnest/roles/merger.md").exists());
    }

    // ITa-13-02: 既存テンプレートは上書きしない
    #[test]
    fn test_init_role_templates_does_not_overwrite() {
        let dir = TempDir::new().unwrap();
        let roles_dir = dir.path().join(".devnest/roles");
        std::fs::create_dir_all(&roles_dir).unwrap();
        let scout_path = roles_dir.join("scout.md");
        std::fs::write(&scout_path, "custom content").unwrap();

        init_role_templates(dir.path()).unwrap();

        let content = std::fs::read_to_string(&scout_path).unwrap();
        assert_eq!(content, "custom content");
    }

    // ITa-13-03: Scout役割のテンプレートを読み込める
    #[test]
    fn test_load_role_template_scout() {
        let dir = TempDir::new().unwrap();
        init_role_templates(dir.path()).unwrap();
        let result = load_role_template(dir.path(), &WorkerRole::Scout);
        assert!(result.is_some());
        assert!(result.unwrap().contains("Scout"));
    }

    // ITa-13-04: 存在しないテンプレートはNoneを返す
    #[test]
    fn test_load_role_template_missing_returns_none() {
        let dir = TempDir::new().unwrap();
        // テンプレートを初期化しない
        let result = load_role_template(dir.path(), &WorkerRole::Scout);
        assert!(result.is_none());
    }

    // ITa-13-05: Scout役割のblocked_git_commandsにgit_pushが含まれる
    #[test]
    fn test_scout_blocks_git_push() {
        let blocked = WorkerRole::Scout.blocked_git_commands();
        assert!(blocked.contains(&"git push"));
    }

    // ITa-13-06: Shell役割のblocked_git_commandsは空
    #[test]
    fn test_shell_empty_blocked_commands() {
        let blocked = WorkerRole::Shell.blocked_git_commands();
        assert!(blocked.is_empty());
    }

    // ITa-13-07: Builder役割のblocked_commandsにgit_pushが含まれる
    #[test]
    fn test_builder_blocks_git_push() {
        let blocked = WorkerRole::Builder.blocked_git_commands();
        assert!(blocked.contains(&"git push"));
    }

    // ITa-13-08: Merger役割のblocked_commandsにrm_rfが含まれる
    #[test]
    fn test_merger_blocks_rm_rf() {
        let blocked = WorkerRole::Merger.blocked_git_commands();
        assert!(blocked.contains(&"rm -rf"));
    }
}
