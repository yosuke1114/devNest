use std::collections::HashMap;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerKind {
    ClaudeCode,
    Shell,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerMode {
    Interactive,
    Batch,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerStatus {
    Idle,
    Running,
    Done,
    Error,
    Retrying,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConfig {
    pub kind: WorkerKind,
    pub mode: WorkerMode,
    pub label: String,
    pub working_dir: PathBuf,
    /// 将来の依存グラフ対応用（Step 11-A では未使用）
    pub depends_on: Vec<String>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerInfo {
    pub id: String,
    pub config: WorkerConfig,
    pub status: WorkerStatus,
}
