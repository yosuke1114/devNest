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
    pub base_branch: String,
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
        // ロール別指示前文 + コミット・プッシュ（・PR作成）指示を末尾に付与
        let commit_msg = cfg.task.title.replace('\'', "\\'");
        let branch = cfg.branch_name.replace('\'', "\\'");
        let base = cfg.base_branch.replace('\'', "\\'");

        let completion_steps = if cfg.task.role == crate::swarm::subtask::TaskRole::Merger {
            format!(
                "作業が完了したら必ず以下を順番に実行してください:\n\
                1. git add -A && git commit -m 'feat: {commit_msg}'\n\
                2. git push origin {branch}\n\
                3. gh pr create --title 'feat: {commit_msg}' --body '## 変更概要\n\nSwarm Merger による統合・コンフリクト解消\n\n## 確認事項\n- [ ] コンフリクト解消済み\n- [ ] テスト通過確認済み' --head {branch} --base {base}\n\
                ※ gh コマンドが使えない場合は `gh auth login` で認証してから再実行してください。",
                commit_msg = commit_msg,
                branch = branch,
                base = base,
            )
        } else {
            format!(
                "作業が完了したら必ず以下を実行してください:\ngit add -A && git commit -m 'feat: {commit_msg}' && git push origin {branch}",
                commit_msg = commit_msg,
                branch = branch,
            )
        };

        let instruction = format!(
            "{}{}\n\n---\n{}",
            cfg.task.role.system_context(),
            cfg.task.instruction,
            completion_steps,
        );
        metadata.insert("task_instruction".to_string(), instruction);
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
        let worker_role = match cfg.task.role {
            crate::swarm::subtask::TaskRole::Designer => WorkerRole::Builder,
            crate::swarm::subtask::TaskRole::Reviewer => WorkerRole::Reviewer,
            crate::swarm::subtask::TaskRole::Scout    => WorkerRole::Scout,
            crate::swarm::subtask::TaskRole::Merger   => WorkerRole::Merger,
            crate::swarm::subtask::TaskRole::Tester   => WorkerRole::Builder,
            _                                         => WorkerRole::Builder,
        };
        WorkerConfig {
            kind: WorkerKind::ClaudeCode,
            mode,
            role: worker_role,
            label: cfg.task.title.clone(),
            working_dir: std::path::PathBuf::from(&cfg.project_path),
            assigned_files: cfg.task.files.iter().map(std::path::PathBuf::from).collect(),
            depends_on: vec![],
            metadata,
        }
    }
}
