use serde::{Deserialize, Serialize};

/// Swarm 実行設定（フロントエンドの SwarmSettings と対応）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmSettings {
    /// 最大同時ワーカー数
    #[serde(default = "default_max_workers")]
    pub max_workers: u32,
    /// ワーカーブランチの接頭辞
    #[serde(default = "default_branch_prefix")]
    pub branch_prefix: String,
    /// ベースブランチ（マージ先）
    #[serde(default = "default_base_branch")]
    pub base_branch: String,
    /// リトライ最大回数
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,

    // ─── フロントエンド互換フィールド ───────────────────────────
    #[serde(default = "default_timeout")]
    pub timeout_minutes: u32,
    #[serde(default = "default_shell")]
    pub default_shell: String,
    #[serde(default = "default_prompt_patterns")]
    pub prompt_patterns: String,
    #[serde(default)]
    pub claude_skip_permissions: bool,
    #[serde(default)]
    pub claude_no_stream: bool,
    #[serde(default)]
    pub auto_approve_high_confidence: bool,
    #[serde(default)]
    pub claude_interactive: bool,
}

fn default_max_workers() -> u32 { 4 }
fn default_branch_prefix() -> String { "swarm/worker-".into() }
fn default_base_branch() -> String { "main".into() }
fn default_max_retries() -> u32 { 2 }
fn default_timeout() -> u32 { 30 }
fn default_shell() -> String { "zsh".into() }
fn default_prompt_patterns() -> String { "$|%|❯|>|#|→".into() }

impl Default for SwarmSettings {
    fn default() -> Self {
        Self {
            max_workers: default_max_workers(),
            branch_prefix: default_branch_prefix(),
            base_branch: default_base_branch(),
            max_retries: default_max_retries(),
            timeout_minutes: default_timeout(),
            default_shell: default_shell(),
            prompt_patterns: default_prompt_patterns(),
            claude_skip_permissions: false,
            claude_no_stream: false,
            auto_approve_high_confidence: false,
            claude_interactive: false,
        }
    }
}
