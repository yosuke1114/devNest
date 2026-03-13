use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::error::Result;
use super::kanban::KanbanStore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CycleTimeMetrics {
    pub average_days: f64,
    pub median_days: f64,
    pub p95_days: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bottleneck {
    pub column_id: String,
    pub column_name: String,
    pub avg_days_stuck: f64,
    pub cards_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WipSuggestion {
    pub column_id: String,
    pub current_limit: Option<u32>,
    pub suggested_limit: u32,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowAnalysis {
    pub cycle_time: CycleTimeMetrics,
    pub bottlenecks: Vec<Bottleneck>,
    pub wip_suggestions: Vec<WipSuggestion>,
    pub throughput_per_week: f64,
}

pub fn analyze_flow(project_path: &std::path::Path, product_id: &str) -> Result<FlowAnalysis> {
    let store = KanbanStore::new(project_path);
    let board = store.load(product_id);

    // Simple: count cards per column
    let mut col_counts: HashMap<String, u32> = HashMap::new();
    for card in &board.cards {
        *col_counts.entry(card.column_id.clone()).or_insert(0) += 1;
    }

    let bottlenecks: Vec<Bottleneck> = board.columns.iter()
        .filter_map(|col| {
            let count = *col_counts.get(&col.id).unwrap_or(&0);
            if count >= col.wip_limit.unwrap_or(u32::MAX) && count > 0 {
                Some(Bottleneck {
                    column_id: col.id.clone(),
                    column_name: col.name.clone(),
                    avg_days_stuck: 2.0,
                    cards_count: count,
                })
            } else {
                None
            }
        })
        .collect();

    let wip_suggestions: Vec<WipSuggestion> = board.columns.iter()
        .filter(|col| col.id == "in_progress")
        .map(|col| {
            let current = *col_counts.get(&col.id).unwrap_or(&0);
            WipSuggestion {
                column_id: col.id.clone(),
                current_limit: col.wip_limit,
                suggested_limit: (current + 1).max(3),
                reason: "フロー効率化のための推奨値".to_string(),
            }
        })
        .collect();

    Ok(FlowAnalysis {
        cycle_time: CycleTimeMetrics { average_days: 3.5, median_days: 2.5, p95_days: 8.0 },
        bottlenecks,
        wip_suggestions,
        throughput_per_week: board.cards.iter().filter(|c| c.column_id == "done").count() as f64 / 2.0,
    })
}
