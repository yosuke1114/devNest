use serde::{Deserialize, Serialize};

use crate::swarm::history::SwarmRunRecord;
use crate::swarm::settings::SwarmSettings;
use crate::swarm::subtask::SubTask;

// ────────────────────────────────────────
//  クライアント → サーバー
// ────────────────────────────────────────
#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    /// タスク分割リクエスト（既存 TaskSplitter 使用）
    TaskSplit {
        prompt: String,
        project_path: String,
    },
    /// Swarm 開始（Wave モード）
    SwarmStart {
        tasks: Vec<SubTask>,
        settings: SwarmSettings,
        project_path: String,
    },
    /// Swarm 停止
    SwarmStop,
    /// Worker への stdin 入力
    WorkerInput {
        worker_id: String,
        data: String,
    },
    /// Wave Gate 実行
    RunGate,
    /// 部分完了した Swarm を履歴から再実行
    HistoryResume {
        run_id: String,
        settings: SwarmSettings,
    },
    /// 現在の状態取得
    Sync,
    Ping,
}

// ────────────────────────────────────────
//  サーバー → クライアント
// ────────────────────────────────────────
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    /// Swarm 全体のスナップショット
    SwarmStatus(SwarmSnapshot),
    /// 個別 Worker のステータス変更
    WorkerStatus {
        worker_id: String,
        status: String,
    },
    /// Worker の PTY 出力（ストリーミング）
    WorkerOutput {
        worker_id: String,
        data: String,
    },
    /// Worker 一覧
    Workers(Vec<WorkerSnapshot>),
    /// タスク分割中
    Splitting,
    /// タスク分割結果
    SplitResult {
        tasks: Vec<SubTask>,
        conflict_warnings: Vec<String>,
    },
    /// Wave Gate 結果
    GateResult {
        wave_number: u32,
        overall: String,
    },
    /// Gate 実行可能通知
    GateReady {
        wave_number: u32,
    },
    /// エラー
    Error {
        message: String,
    },
    /// プロジェクト一覧
    Projects(Vec<ProjectInfo>),
    /// タスク実行状態一覧
    TasksUpdate(Vec<TaskSnapshot>),
    /// Swarm 実行履歴一覧
    HistoryList(Vec<SwarmRunRecord>),
    Pong,
}

/// プロジェクト情報
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub id: i64,
    pub name: String,
    pub local_path: String,
}

/// Swarm 全体のスナップショット
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SwarmSnapshot {
    pub status: String,
    pub current_wave: u32,
    pub total_tasks: u32,
    pub completed_tasks: u32,
    pub failed_tasks: u32,
}

/// タスク単体の実行状態スナップショット
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskSnapshot {
    pub task_id: u32,
    pub title: String,
    pub wave_number: u32,
    pub execution_state: String,
    pub worker_id: Option<String>,
    pub depends_on: Vec<u32>,
}

/// Worker 単体のスナップショット
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkerSnapshot {
    pub id: String,
    pub label: String,
    pub status: String,
}
