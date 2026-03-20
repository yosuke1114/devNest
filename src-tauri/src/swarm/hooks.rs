/// Claude Code フックによる Swarm Worker 完了検知モジュール。
///
/// # 設計方針
/// 複数 Worker が同一プロジェクトの `.claude/settings.json` を上書き合う競合を避けるため、
/// グローバル設定 `~/.claude/settings.json` に Stop フックを1回だけ書き込む。
/// 各 Worker は起動時に `SWARM_WORKER_ID` 環境変数を持ち、
/// Stop フックは `/tmp/devnest-done-<worker-id>` ファイルを作成する。
/// Monitor Thread がこのファイルをポーリングして完了を検出する。
use std::path::PathBuf;

// ─── グローバルフック設定 ──────────────────────────────────────

/// グローバル `~/.claude/settings.json` に Swarm Stop フックを設定する。
/// Stop フック: claude が処理を完了したとき `SWARM_WORKER_ID` ファイルを /tmp に作成する。
/// 既存の設定は保持し、hooks.Stop のみを上書きする。
pub fn install_global_stop_hook() -> Result<(), String> {
    let settings_path = global_settings_path()?;

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create ~/.claude dir: {e}"))?;
    }

    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path)
            .map_err(|e| format!("read settings.json: {e}"))?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Stop フック: SWARM_WORKER_ID がセットされている場合のみ実行
    // (通常の claude 利用時は SWARM_WORKER_ID が未設定なので何もしない)
    let hook_cmd = r#"[ -n "$SWARM_WORKER_ID" ] && touch /tmp/devnest-done-"$SWARM_WORKER_ID" || true"#;

    settings["hooks"] = serde_json::json!({
        "Stop": [{
            "hooks": [{
                "type": "command",
                "command": hook_cmd
            }]
        }]
    });

    let json_str = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&settings_path, json_str)
        .map_err(|e| format!("write settings.json: {e}"))?;

    eprintln!("[Hooks] グローバル Stop フックを設定しました: {:?}", settings_path);
    Ok(())
}

/// グローバルフックを削除する（アプリ終了時などに呼ぶ）
pub fn uninstall_global_stop_hook() {
    if let Ok(settings_path) = global_settings_path() {
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
}

// ─── Worker 完了ファイル管理 ───────────────────────────────────

/// Worker 完了を示す /tmp ファイルパスを返す
pub fn done_file_path(worker_id: &str) -> PathBuf {
    PathBuf::from(format!("/tmp/devnest-done-{}", worker_id))
}

/// Worker 完了ファイルが存在するか確認する（Monitor Thread がポーリングに使う）
pub fn is_done_file_present(worker_id: &str) -> bool {
    done_file_path(worker_id).exists()
}

/// Worker 完了ファイルを削除する（次回実行に備えてクリーンアップ）
pub fn cleanup_done_file(worker_id: &str) {
    let _ = std::fs::remove_file(done_file_path(worker_id));
}

// ─── ヘルパー ─────────────────────────────────────────────────

fn global_settings_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .ok_or_else(|| "ホームディレクトリが取得できません".to_string())
        .map(|h| h.join(".claude").join("settings.json"))
}

// ─── 旧 API 互換（setup_claude_hooks / teardown_claude_hooks）────
// 旧来の per-project フック設定（現在は使用しないが他モジュールからの参照用に残す）

/// @deprecated グローバルフック方式に移行済み。使用しないこと。
#[allow(dead_code)]
pub fn setup_claude_hooks(_project_path: &std::path::Path, _worker_id: &str) -> Result<(), String> {
    Ok(()) // no-op
}

/// @deprecated グローバルフック方式に移行済み。使用しないこと。
#[allow(dead_code)]
pub fn teardown_claude_hooks(_project_path: &std::path::Path) {
    // no-op
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn done_file_path_contains_worker_id() {
        let path = done_file_path("test-worker-123");
        assert!(path.to_string_lossy().contains("test-worker-123"));
        assert!(path.to_string_lossy().contains("devnest-done"));
    }

    #[test]
    fn is_done_file_absent_when_not_created() {
        assert!(!is_done_file_present("nonexistent-worker-xyz"));
    }

    #[test]
    fn cleanup_is_noop_when_file_missing() {
        cleanup_done_file("no-such-worker"); // パニックしないこと
    }
}
