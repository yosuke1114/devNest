use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeType {
    DesignDecision,
    RetroLearning,
    TechNote,
    Postmortem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: String,
    pub author: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEntry {
    pub id: String,
    pub entry_type: KnowledgeType,
    pub title: String,
    pub content: String,
    pub author: String,
    pub product_id: String,
    pub linked_docs: Vec<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub comments: Vec<Comment>,
}

pub struct KnowledgeStore {
    path: std::path::PathBuf,
}

impl KnowledgeStore {
    pub fn new(project_path: &std::path::Path) -> Self {
        Self { path: project_path.join(".devnest").join("knowledge.json") }
    }

    pub fn load_all(&self) -> Vec<KnowledgeEntry> {
        let content = std::fs::read_to_string(&self.path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    }

    pub fn save_all(&self, entries: &[KnowledgeEntry]) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(entries)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        std::fs::write(&self.path, json)?;
        Ok(())
    }

    pub fn add_entry(&self, entry: KnowledgeEntry) -> Result<KnowledgeEntry> {
        let mut entries = self.load_all();
        entries.push(entry.clone());
        self.save_all(&entries)?;
        Ok(entry)
    }

    pub fn add_comment(&self, entry_id: &str, author: &str, content: &str) -> Result<KnowledgeEntry> {
        let mut entries = self.load_all();
        let entry = entries.iter_mut().find(|e| e.id == entry_id)
            .ok_or_else(|| AppError::NotFound(format!("Knowledge entry {} not found", entry_id)))?;
        entry.comments.push(Comment {
            id: Uuid::new_v4().to_string(),
            author: author.to_string(),
            content: content.to_string(),
            created_at: Utc::now().to_rfc3339(),
        });
        let result = entry.clone();
        self.save_all(&entries)?;
        Ok(result)
    }

    pub fn search(&self, query: &str) -> Vec<KnowledgeEntry> {
        let q = query.to_lowercase();
        self.load_all().into_iter().filter(|e| {
            e.title.to_lowercase().contains(&q)
                || e.content.to_lowercase().contains(&q)
                || e.tags.iter().any(|t| t.to_lowercase().contains(&q))
        }).collect()
    }
}
