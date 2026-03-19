use tauri::State;
use crate::mcp::{
    hub::{McpHub, McpHubStatus, McpServerConfig},
    policy::{PolicyConfig, PolicyEngine},
};
use crate::error::Result;
use crate::state::AppState;

#[tauri::command]
pub async fn mcp_get_status(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<McpHubStatus> {
    Ok(McpHub::new(std::path::Path::new(&project_path)).get_status())
}

#[tauri::command]
pub async fn mcp_add_server(
    project_path: String,
    config: McpServerConfig,
    _state: State<'_, AppState>,
) -> Result<()> {
    McpHub::new(std::path::Path::new(&project_path)).add_server(config)
}

#[tauri::command]
pub async fn mcp_remove_server(
    project_path: String,
    name: String,
    _state: State<'_, AppState>,
) -> Result<()> {
    McpHub::new(std::path::Path::new(&project_path)).remove_server(&name)
}

#[tauri::command]
pub async fn mcp_list_servers(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<Vec<McpServerConfig>> {
    Ok(McpHub::new(std::path::Path::new(&project_path)).load_config())
}

#[tauri::command]
pub async fn mcp_get_policy(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<PolicyConfig> {
    Ok(PolicyEngine::new(std::path::Path::new(&project_path)).load())
}

#[tauri::command]
pub async fn mcp_save_policy(
    project_path: String,
    config: PolicyConfig,
    _state: State<'_, AppState>,
) -> Result<()> {
    PolicyEngine::new(std::path::Path::new(&project_path)).save(&config)
}
