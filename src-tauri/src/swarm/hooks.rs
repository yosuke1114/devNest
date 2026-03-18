/// Claude Code フックをプロジェクトの .claude/settings.json に書き込むモジュール。
///
/// PostTask / TaskError フックとして `devnest worker done --worker-id <id>` を登録することで、
/// Claude Code がタスクを完了・エラー終了した直後に Socket API 経由で完了通知を受け取れる。
use std::path::Path;

/// 指定プロジェクトの .claude/settings.json に Swarm 完了フックを設定する。
///
/// 既存の settings.json がある場合は `hooks` キーだけ上書きし、他のフィールドは保持する。
pub fn setup_claude_hooks(project_path: &Path, worker_id: &str) -> Result<(), String> {
    let claude_dir = project_path.join(".claude");
    std::fs::create_dir_all(&claude_dir).map_err(|e| format!("create .claude dir: {e}"))?;

    let settings_path = claude_dir.join("settings.json");

    // 既存の settings.json を読み込む（または空オブジェクトで開始）
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("read settings.json: {e}"))?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // hooks セクションを書き込む
    // Claude Code hooks フォーマット:
    //   { "hooks": { "PostTask": [{ "hooks": [{"type":"command","command":"..."}] }] } }
    let hook_cmd = format!("devnest worker done --worker-id {}", worker_id);
    let hook_entry = serde_json::json!([{
        "hooks": [{ "type": "command", "command": hook_cmd }]
    }]);

    settings["hooks"] = serde_json::json!({
        "PostTask": hook_entry,
        "TaskError": hook_entry,
    });

    let json_str =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&settings_path, json_str)
        .map_err(|e| format!("write settings.json: {e}"))?;

    Ok(())
}

/// Swarm フックを削除する（hooks キーを取り除く）。
/// ワーカー終了後に呼び出してプロジェクトをクリーンな状態に戻す。
pub fn teardown_claude_hooks(project_path: &Path) {
    let settings_path = project_path.join(".claude").join("settings.json");
    if let Ok(content) = std::fs::read_to_string(&settings_path) {
        if let Ok(mut settings) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(obj) = settings.as_object_mut() {
                obj.remove("hooks");
            }
            if let Ok(json_str) = serde_json::to_string_pretty(&settings) {
                let _ = std::fs::write(&settings_path, json_str);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn setup_creates_claude_dir_and_settings() {
        let dir = TempDir::new().unwrap();
        let result = setup_claude_hooks(dir.path(), "worker-abc");
        assert!(result.is_ok(), "{:?}", result);

        let settings_path = dir.path().join(".claude").join("settings.json");
        assert!(settings_path.exists());

        let content = fs::read_to_string(&settings_path).unwrap();
        assert!(content.contains("worker-abc"));
        assert!(content.contains("PostTask"));
        assert!(content.contains("TaskError"));
        assert!(content.contains("devnest worker done"));
    }

    #[test]
    fn setup_preserves_existing_fields() {
        let dir = TempDir::new().unwrap();
        let claude_dir = dir.path().join(".claude");
        fs::create_dir_all(&claude_dir).unwrap();
        let settings_path = claude_dir.join("settings.json");
        fs::write(&settings_path, r#"{"model": "claude-opus-4-5"}"#).unwrap();

        setup_claude_hooks(dir.path(), "w1").unwrap();

        let content = fs::read_to_string(&settings_path).unwrap();
        let v: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(v["model"].as_str(), Some("claude-opus-4-5"));
        assert!(v["hooks"].is_object());
    }

    #[test]
    fn teardown_removes_hooks_key() {
        let dir = TempDir::new().unwrap();
        setup_claude_hooks(dir.path(), "w2").unwrap();
        teardown_claude_hooks(dir.path());

        let content =
            fs::read_to_string(dir.path().join(".claude").join("settings.json")).unwrap();
        let v: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert!(v.get("hooks").is_none());
    }

    #[test]
    fn teardown_is_noop_when_no_settings() {
        let dir = TempDir::new().unwrap();
        // ファイルが存在しなくてもパニックしない
        teardown_claude_hooks(dir.path());
    }
}
