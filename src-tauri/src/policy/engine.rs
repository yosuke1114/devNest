/// ポリシーエンジン
///
/// `mcp/policy.rs` の `PolicyEngine` を `policy/` モジュールに移植する。
/// `mcp/policy.rs` は後方互換のため re-export のみに変更する。
use crate::error::Result;

pub use super::rules::{PolicyConfig, RiskLevel, ToolPolicy};

pub struct PolicyEngine {
    path: std::path::PathBuf,
}

impl PolicyEngine {
    /// project_path に紐づく PolicyEngine を初期化する。
    pub fn new(project_path: &std::path::Path) -> Self {
        Self {
            path: project_path.join(".devnest").join("policy.json"),
        }
    }

    /// ポリシー設定をファイルから読み込む。
    /// ファイルが存在しない場合はデフォルト設定を返す。
    pub fn load(&self) -> PolicyConfig {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// ポリシー設定をファイルに保存する。
    pub fn save(&self, config: &PolicyConfig) -> Result<()> {
        use crate::error::AppError;
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        std::fs::write(&self.path, json)?;
        Ok(())
    }

    /// 指定ツールに対するポリシーを確認する。
    /// tool_overrides に登録されていれば override を、なければ default_policy を返す。
    pub fn check(&self, tool_name: &str) -> ToolPolicy {
        let config = self.load();
        config
            .tool_overrides
            .get(tool_name)
            .cloned()
            .unwrap_or(config.default_policy)
    }
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_policy_engine_new() {
        let dir = tempdir().unwrap();
        let engine = PolicyEngine::new(dir.path());
        // インスタンス化できることを確認
        let _ = engine;
    }

    #[test]
    fn test_load_default_when_no_file() {
        let dir = tempdir().unwrap();
        let engine = PolicyEngine::new(dir.path());
        let config = engine.load();
        // ファイルが存在しない場合はデフォルト（RequireApproval）
        assert_eq!(config.default_policy, ToolPolicy::RequireApproval);
    }

    #[test]
    fn test_check_returns_default_for_unknown_tool() {
        let dir = tempdir().unwrap();
        let engine = PolicyEngine::new(dir.path());
        let policy = engine.check("unknown_tool");
        assert_eq!(policy, ToolPolicy::RequireApproval);
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let dir = tempdir().unwrap();
        let engine = PolicyEngine::new(dir.path());

        let mut config = PolicyConfig::default();
        config
            .tool_overrides
            .insert("bash".to_string(), ToolPolicy::Allow);

        engine.save(&config).unwrap();
        let loaded = engine.load();
        assert_eq!(
            loaded.tool_overrides.get("bash"),
            Some(&ToolPolicy::Allow)
        );
    }

    #[test]
    fn test_check_tool_override() {
        let dir = tempdir().unwrap();
        let engine = PolicyEngine::new(dir.path());

        let mut config = PolicyConfig::default();
        config
            .tool_overrides
            .insert("read_file".to_string(), ToolPolicy::Allow);
        engine.save(&config).unwrap();

        assert_eq!(engine.check("read_file"), ToolPolicy::Allow);
        assert_eq!(engine.check("write_file"), ToolPolicy::RequireApproval);
    }
}
