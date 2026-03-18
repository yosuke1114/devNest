use serde::{Deserialize, Serialize};

/// Swarm 実行設定
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmSettings {
    /// 最大同時ワーカー数
    pub max_workers: u32,
    /// ワーカーブランチの接頭辞（例: "swarm/run-1/task-"）
    pub branch_prefix: String,
    /// ベースブランチ（マージ先）
    pub base_branch: String,
    /// リトライ最大回数
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
}

fn default_max_retries() -> u32 {
    2
}

impl Default for SwarmSettings {
    fn default() -> Self {
        Self {
            max_workers: 3,
            branch_prefix: "swarm/task-".into(),
            base_branch: "main".into(),
            max_retries: 2,
        }
    }
}
