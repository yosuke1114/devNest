use serde::{Deserialize, Serialize};
use super::subtask::SubTask;

/// ワーカーの動作状態
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerStatus {
    Idle,
    Running,
    Done,
    Error,
}

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

/// ワーカーへのタスク割り当て
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

/// ワーカー起動リクエスト
#[derive(Debug, Clone)]
pub struct SpawnRequest {
    pub worker_config: WorkerConfig,
    pub task_id: u32,
    pub is_retry: bool,
    pub old_worker_id: Option<String>,
}

/// ワーカー設定（起動時に渡す情報）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConfig {
    pub task: SubTask,
    pub branch_name: String,
    pub project_path: String,
    pub run_id: String,
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
