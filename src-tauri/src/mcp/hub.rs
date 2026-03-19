/// MCP Client Hub — 外部MCPサーバーへの接続管理
/// Phase 9 基盤実装（stdio/SSE トランスポート対応準備）
use serde::{Deserialize, Serialize};
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportType {
    Stdio,
    Sse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub transport: TransportType,
    /// stdio: command path; SSE: URL
    pub endpoint: String,
    pub args: Vec<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Connected,
    Disconnected,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerStatus {
    pub name: String,
    pub status: ConnectionStatus,
    pub tools: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpHubStatus {
    pub servers: Vec<McpServerStatus>,
    pub total_tools: u32,
}

pub struct McpHub {
    config_path: std::path::PathBuf,
}

impl McpHub {
    pub fn new(project_path: &std::path::Path) -> Self {
        Self { config_path: project_path.join(".devnest").join("mcp-config.json") }
    }

    pub fn load_config(&self) -> Vec<McpServerConfig> {
        let content = std::fs::read_to_string(&self.config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    }

    pub fn save_config(&self, configs: &[McpServerConfig]) -> Result<()> {
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(configs)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        std::fs::write(&self.config_path, json)?;
        Ok(())
    }

    /// サーバーの接続状態を確認する（Phase 9 本実装では rmcp クレートを使用）
    pub fn get_status(&self) -> McpHubStatus {
        let configs = self.load_config();
        let servers: Vec<McpServerStatus> = configs.iter().map(|c| McpServerStatus {
            name: c.name.clone(),
            status: ConnectionStatus::Disconnected,
            tools: vec![],
        }).collect();
        McpHubStatus { total_tools: 0, servers }
    }

    pub fn add_server(&self, config: McpServerConfig) -> Result<()> {
        let mut configs = self.load_config();
        configs.retain(|c| c.name != config.name);
        configs.push(config);
        self.save_config(&configs)
    }

    pub fn remove_server(&self, name: &str) -> Result<()> {
        let mut configs = self.load_config();
        configs.retain(|c| c.name != name);
        self.save_config(&configs)
    }
}
