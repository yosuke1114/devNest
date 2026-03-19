use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryMap {
    pub id: String,
    pub product_id: String,
    pub activities: Vec<Activity>,
    pub releases: Vec<Release>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Activity {
    pub id: String,
    pub name: String,
    pub order: u32,
    pub stories: Vec<UserStory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Release {
    pub id: String,
    pub name: String,
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserStory {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub release_id: String,
    pub linked_kanban_card: Option<String>,
    pub linked_docs: Vec<String>,
    pub acceptance_criteria: Vec<String>,
    pub estimated_points: Option<u32>,
}

pub struct StoryMapStore {
    path: std::path::PathBuf,
}

impl StoryMapStore {
    pub fn new(project_path: &std::path::Path) -> Self {
        Self { path: project_path.join(".devnest").join("story-map.json") }
    }

    pub fn load(&self, product_id: &str) -> StoryMap {
        let content = std::fs::read_to_string(&self.path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|_| StoryMap {
            id: Uuid::new_v4().to_string(),
            product_id: product_id.to_string(),
            activities: vec![],
            releases: vec![
                Release { id: "v1".to_string(), name: "v1.0".to_string(), order: 0 },
                Release { id: "v2".to_string(), name: "v2.0".to_string(), order: 1 },
            ],
        })
    }

    pub fn save(&self, map: &StoryMap) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(map)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        std::fs::write(&self.path, json)?;
        Ok(())
    }
}
