use serde::{Deserialize, Serialize};
use crate::analytics::sprint::{SprintInfo, SprintAnalysis};
use crate::services::anthropic::AnthropicClient;
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetroItem {
    pub category: String,
    pub description: String,
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionItem {
    pub description: String,
    pub priority: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YearRingEntry {
    pub sprint_name: String,
    pub theme: String,
    pub growth_areas: Vec<String>,
    pub ring_width: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Retrospective {
    pub sprint: SprintInfo,
    pub went_well: Vec<RetroItem>,
    pub could_improve: Vec<RetroItem>,
    pub action_items: Vec<ActionItem>,
    pub year_ring: Option<YearRingEntry>,
}

pub struct RetroGenerator {
    anthropic: AnthropicClient,
}

impl RetroGenerator {
    pub fn new(api_key: &str) -> Self {
        Self { anthropic: AnthropicClient::new(api_key) }
    }

    pub async fn generate(&self, analysis: &SprintAnalysis) -> Result<Retrospective> {
        let analysis_json = serde_json::to_string(analysis).unwrap_or_default();

        let user_msg = format!(
            "Sprint analysis: {analysis_json}\n\n\
             Generate a retrospective. Respond with JSON: \
             {{\"went_well\": [{{\"category\": \"...\", \"description\": \"...\", \"evidence\": \"...\"}}], \
             \"could_improve\": [...], \
             \"action_items\": [{{\"description\": \"...\", \"priority\": \"high|medium|low\"}}], \
             \"year_ring\": {{\"sprint_name\": \"...\", \"theme\": \"...\", \"growth_areas\": [], \"ring_width\": 1.0}}}}"
        );

        let raw = self.anthropic.complete(
            "You are an agile retrospective facilitator. Generate insights from sprint data. Respond with valid JSON only.",
            &user_msg,
        ).await?;

        let json_str = raw.find('{').and_then(|s| raw.rfind('}').map(|e| &raw[s..=e])).unwrap_or(&raw);

        #[derive(Deserialize)]
        struct Resp {
            went_well: Vec<RetroItem>,
            could_improve: Vec<RetroItem>,
            action_items: Vec<ActionItem>,
            year_ring: Option<YearRingEntry>,
        }

        match serde_json::from_str::<Resp>(json_str) {
            Ok(r) => Ok(Retrospective {
                sprint: analysis.sprint.clone(),
                went_well: r.went_well,
                could_improve: r.could_improve,
                action_items: r.action_items,
                year_ring: r.year_ring,
            }),
            Err(_) => Ok(Retrospective {
                sprint: analysis.sprint.clone(),
                went_well: vec![],
                could_improve: vec![RetroItem {
                    category: "Process".to_string(),
                    description: "AI response could not be parsed".to_string(),
                    evidence: raw.chars().take(100).collect(),
                }],
                action_items: vec![],
                year_ring: None,
            }),
        }
    }
}
