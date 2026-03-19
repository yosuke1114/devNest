/// ポリシールール型定義
///
/// `mcp/policy.rs` の型定義を `policy/` モジュールに集約する。
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// ツールに対するポリシー判定
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ToolPolicy {
    /// 無条件に許可
    Allow,
    /// ユーザー承認が必要
    RequireApproval,
    /// 拒否
    Deny,
}

/// リスクレベル
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// ポリシー設定
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    pub default_policy: ToolPolicy,
    pub tool_overrides: HashMap<String, ToolPolicy>,
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            default_policy: ToolPolicy::RequireApproval,
            tool_overrides: HashMap::new(),
        }
    }
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tool_policy_allow_default_check() {
        // Allow ポリシーが正しく定義されている
        let policy = ToolPolicy::Allow;
        assert_eq!(policy, ToolPolicy::Allow);
    }

    #[test]
    fn test_policy_config_default_is_require_approval() {
        let config = PolicyConfig::default();
        assert_eq!(config.default_policy, ToolPolicy::RequireApproval);
        assert!(config.tool_overrides.is_empty());
    }

    #[test]
    fn test_risk_level_ordering() {
        assert!(RiskLevel::Critical > RiskLevel::High);
        assert!(RiskLevel::High > RiskLevel::Medium);
        assert!(RiskLevel::Medium > RiskLevel::Low);
    }
}
