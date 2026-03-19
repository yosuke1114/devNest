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

// ─── Orchestrator 用型（Wave Orchestrator との統合） ────────────────────

use super::subtask::SubTask;

/// タスクの実行状態（Orchestrator が管理する論理状態）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionState {
    /// 依存タスク待ち（まだ実行不可）
    Waiting,
    /// 依存解決済み・実行可能
    Ready,
    /// ワーカーが実行中
    Running,
    /// 正常完了
    Done,
    /// エラー終了
    Error,
    /// スキップ（依存先がエラー等）
    Skipped,
}

/// ワーカーへのタスク割り当て（Orchestrator 管理用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerAssignment {
    pub worker_id: String,
    pub task: SubTask,
    pub branch_name: String,
    pub status: WorkerStatus,
    pub execution_state: ExecutionState,
    pub retry_count: u32,
}

/// Orchestrator タスク設定（起動時に渡す情報）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorTaskConfig {
    pub task: SubTask,
    pub branch_name: String,
    pub project_path: String,
    pub run_id: String,
    // Settings から引き継ぐフィールド（manager が参照）
    pub default_shell: String,
    pub claude_skip_permissions: bool,
    pub claude_no_stream: bool,
    pub claude_interactive: bool,
}

/// ワーカー起動リクエスト
#[derive(Debug, Clone)]
pub struct SpawnRequest {
    pub worker_config: OrchestratorTaskConfig,
    pub task_id: u32,
    pub is_retry: bool,
    pub old_worker_id: Option<String>,
}

/// Run 全体のステータス
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RunStatus {
    Running,
    Done,
    PartialDone,
    Cancelled,
}

impl From<OrchestratorTaskConfig> for WorkerConfig {
    fn from(cfg: OrchestratorTaskConfig) -> Self {
        let mut metadata = HashMap::new();
        metadata.insert("task_instruction".to_string(), cfg.task.instruction.clone());
        metadata.insert("task_branch".to_string(), cfg.branch_name.clone());
        metadata.insert("run_id".to_string(), cfg.run_id.clone());
        metadata.insert("default_shell".to_string(), cfg.default_shell.clone());
        if cfg.claude_skip_permissions {
            metadata.insert("claude_flag_skip_permissions".to_string(), "1".to_string());
        }
        if cfg.claude_no_stream {
            metadata.insert("claude_flag_no_stream".to_string(), "1".to_string());
        }
        if cfg.claude_interactive {
            metadata.insert("claude_interactive".to_string(), "1".to_string());
        }
        let mode = if cfg.claude_interactive { WorkerMode::Interactive } else { WorkerMode::Batch };
        WorkerConfig {
            kind: WorkerKind::ClaudeCode,
            mode,
            role: WorkerRole::Builder,
            label: cfg.task.title.clone(),
            working_dir: std::path::PathBuf::from(&cfg.project_path),
            assigned_files: cfg.task.files.iter().map(|f| std::path::PathBuf::from(f)).collect(),
            depends_on: vec![],
            metadata,
        }
    }
}
