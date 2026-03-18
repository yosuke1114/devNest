use serde::{Deserialize, Serialize};

/// Swarm 実行の最小単位タスク
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubTask {
    pub id: u32,
    pub title: String,
    pub files: Vec<String>,
    pub instruction: String,
    pub depends_on: Vec<u32>,
}
