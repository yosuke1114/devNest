use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPolicy {
    Allow,
    RequireApproval,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyConfig {
    pub default_policy: ToolPolicy,
    pub tool_overrides: HashMap<String, ToolPolicy>,
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            default_policy: ToolPolicy::RequireApproval,
            tool_overrides: HashMap::new(),
        }
    }
}

pub struct PolicyEngine {
    path: std::path::PathBuf,
}

impl PolicyEngine {
    pub fn new(project_path: &std::path::Path) -> Self {
        Self { path: project_path.join(".devnest").join("policy.json") }
    }

    pub fn load(&self) -> PolicyConfig {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, config: &PolicyConfig) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        std::fs::write(&self.path, json)?;
        Ok(())
    }

    pub fn check(&self, tool_name: &str) -> ToolPolicy {
        let config = self.load();
        config.tool_overrides
            .get(tool_name)
            .cloned()
            .unwrap_or(config.default_policy)
    }
}
