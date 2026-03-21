use serde::{Deserialize, Serialize};

/// クライアント → サーバー
#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    SwarmStart { tasks: Vec<SubTask> },
    SwarmStop,
    SwarmInput { text: String },
    TaskSplit { text: String },
    Sync,
    Ping,
}

/// サーバー → クライアント
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    Status {
        phase: SwarmPhase,
        agent: Option<String>,
        completed: u32,
        total: u32,
    },
    WaitingInput {
        prompt: String,
    },
    Log {
        text: String,
        level: LogLevel,
    },
    Splitting,
    SplitResult {
        tasks: Vec<SubTask>,
    },
    Error {
        message: String,
    },
    Pong,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SwarmPhase {
    Idle,
    Starting,
    Running,
    WaitingInput,
    Stopping,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Success,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubTask {
    pub id: u32,
    pub title: String,
    pub tag: String,
    pub points: u8,
}
