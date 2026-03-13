use serde::{Deserialize, Serialize};
use crate::analytics::sprint::SprintInfo;
use super::kanban::KanbanCard;
use crate::services::anthropic::AnthropicClient;
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannedCard {
    pub card: KanbanCard,
    pub suggested_order: u32,
    pub ai_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SprintPlan {
    pub sprint_info: SprintInfo,
    pub selected_cards: Vec<PlannedCard>,
    pub estimated_velocity: f64,
    pub rationale: String,
}

pub struct SprintPlanner {
    anthropic: AnthropicClient,
}

impl SprintPlanner {
    pub fn new(api_key: &str) -> Self {
        Self { anthropic: AnthropicClient::new(api_key) }
    }

    pub async fn suggest_plan(
        &self,
        sprint_info: SprintInfo,
        backlog_cards: Vec<KanbanCard>,
    ) -> Result<SprintPlan> {
        if backlog_cards.is_empty() {
            return Ok(SprintPlan {
                sprint_info,
                selected_cards: vec![],
                estimated_velocity: 0.0,
                rationale: "バックログが空です。カードを追加してください。".to_string(),
            });
        }

        let cards_json = serde_json::to_string(&backlog_cards).unwrap_or_default();
        let sprint_json = serde_json::to_string(&sprint_info).unwrap_or_default();

        let user_msg = format!(
            "Sprint info: {sprint_json}\n\nBacklog cards: {cards_json}\n\n\
             Select the best cards for this sprint and order them. \
             Respond with JSON: {{\"selected_cards\": [{{\"card\": {{...}}, \"suggested_order\": 1, \"ai_notes\": \"...\"}}], \"estimated_velocity\": 0.0, \"rationale\": \"...\"}}"
        );

        let raw = self.anthropic.complete(
            "You are an agile sprint planner. Select and order backlog cards for a sprint. Respond with valid JSON only.",
            &user_msg,
        ).await?;

        let json_str = raw.find('{').and_then(|s| raw.rfind('}').map(|e| &raw[s..=e])).unwrap_or(&raw);

        #[derive(Deserialize)]
        struct Resp {
            selected_cards: Vec<PlannedCard>,
            estimated_velocity: f64,
            rationale: String,
        }

        match serde_json::from_str::<Resp>(json_str) {
            Ok(r) => Ok(SprintPlan {
                sprint_info,
                selected_cards: r.selected_cards,
                estimated_velocity: r.estimated_velocity,
                rationale: r.rationale,
            }),
            Err(_) => Ok(SprintPlan {
                sprint_info,
                selected_cards: backlog_cards.into_iter().enumerate().map(|(i, c)| PlannedCard {
                    card: c,
                    suggested_order: i as u32 + 1,
                    ai_notes: String::new(),
                }).collect(),
                estimated_velocity: 1.0,
                rationale: raw.chars().take(300).collect(),
            }),
        }
    }
}
