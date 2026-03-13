use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanBoard {
    pub id: String,
    pub product_id: String,
    pub columns: Vec<KanbanColumn>,
    pub cards: Vec<KanbanCard>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanColumn {
    pub id: String,
    pub name: String,
    pub order: u32,
    pub wip_limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanCard {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub column_id: String,
    pub priority: Priority,
    pub labels: Vec<String>,
    pub linked_issue: Option<i64>,
    pub linked_doc: Option<String>,
    pub created_at: String,
    pub moved_at: String,
    pub estimated_effort_hours: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewCard {
    pub title: String,
    pub description: Option<String>,
    pub column_id: String,
    pub priority: Priority,
    pub labels: Vec<String>,
    pub linked_issue: Option<i64>,
    pub linked_doc: Option<String>,
    pub estimated_effort_hours: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    Critical,
    High,
    Medium,
    Low,
}

pub struct KanbanStore {
    path: std::path::PathBuf,
}

impl KanbanStore {
    pub fn new(project_path: &std::path::Path) -> Self {
        Self { path: project_path.join(".devnest").join("kanban.json") }
    }

    pub fn load(&self, product_id: &str) -> KanbanBoard {
        let content = std::fs::read_to_string(&self.path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|_| default_board(product_id))
    }

    pub fn save(&self, board: &KanbanBoard) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(board)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        std::fs::write(&self.path, json)?;
        Ok(())
    }

    pub fn move_card(&self, product_id: &str, card_id: &str, to_column: &str) -> Result<KanbanBoard> {
        let mut board = self.load(product_id);
        for card in &mut board.cards {
            if card.id == card_id {
                card.column_id = to_column.to_string();
                card.moved_at = Utc::now().to_rfc3339();
                break;
            }
        }
        self.save(&board)?;
        Ok(board)
    }

    pub fn create_card(&self, product_id: &str, new_card: NewCard) -> Result<(KanbanCard, KanbanBoard)> {
        let mut board = self.load(product_id);
        let now = Utc::now().to_rfc3339();
        let card = KanbanCard {
            id: Uuid::new_v4().to_string(),
            title: new_card.title,
            description: new_card.description,
            column_id: new_card.column_id,
            priority: new_card.priority,
            labels: new_card.labels,
            linked_issue: new_card.linked_issue,
            linked_doc: new_card.linked_doc,
            created_at: now.clone(),
            moved_at: now,
            estimated_effort_hours: new_card.estimated_effort_hours,
        };
        board.cards.push(card.clone());
        self.save(&board)?;
        Ok((card, board))
    }

    pub fn delete_card(&self, product_id: &str, card_id: &str) -> Result<KanbanBoard> {
        let mut board = self.load(product_id);
        board.cards.retain(|c| c.id != card_id);
        self.save(&board)?;
        Ok(board)
    }
}

fn default_board(product_id: &str) -> KanbanBoard {
    KanbanBoard {
        id: Uuid::new_v4().to_string(),
        product_id: product_id.to_string(),
        columns: vec![
            KanbanColumn { id: "backlog".to_string(), name: "Backlog".to_string(), order: 0, wip_limit: None },
            KanbanColumn { id: "in_progress".to_string(), name: "In Progress".to_string(), order: 1, wip_limit: Some(3) },
            KanbanColumn { id: "review".to_string(), name: "Review".to_string(), order: 2, wip_limit: Some(2) },
            KanbanColumn { id: "done".to_string(), name: "Done".to_string(), order: 3, wip_limit: None },
        ],
        cards: vec![],
    }
}
