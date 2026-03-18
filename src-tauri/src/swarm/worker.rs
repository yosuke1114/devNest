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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerRole {
    Scout,
    Builder,
    Reviewer,
    Merger,
    Shell,
}

impl WorkerRole {
    pub fn icon(&self) -> &str {
        match self {
            WorkerRole::Scout    => "🔍",
            WorkerRole::Builder  => "🔨",
            WorkerRole::Reviewer => "👁️",
            WorkerRole::Merger   => "🔀",
            WorkerRole::Shell    => "🐚",
        }
    }

    pub fn blocked_git_commands(&self) -> Vec<&str> {
        match self {
            WorkerRole::Scout | WorkerRole::Reviewer => vec![
                "git push", "git reset --hard", "git clean -f", "git rm",
            ],
            WorkerRole::Builder => vec![
                "git push", "git reset --hard", "git clean -f",
            ],
            WorkerRole::Merger => vec!["rm -rf"],
            WorkerRole::Shell => vec![],
        }
    }

    pub fn template_path(&self) -> Option<&str> {
        match self {
            WorkerRole::Scout    => Some(".devnest/roles/scout.md"),
            WorkerRole::Builder  => Some(".devnest/roles/builder.md"),
            WorkerRole::Reviewer => Some(".devnest/roles/reviewer.md"),
            WorkerRole::Merger   => Some(".devnest/roles/merger.md"),
            WorkerRole::Shell    => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConfig {
    pub kind: WorkerKind,
    pub mode: WorkerMode,
    pub role: WorkerRole,
    pub label: String,
    pub working_dir: PathBuf,
    pub assigned_files: Vec<PathBuf>,
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
