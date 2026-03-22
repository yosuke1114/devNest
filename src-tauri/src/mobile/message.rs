use serde::{Deserialize, Serialize};

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
    Pong,
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

/// Worker 単体のスナップショット
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkerSnapshot {
    pub id: String,
    pub label: String,
    pub status: String,
}
