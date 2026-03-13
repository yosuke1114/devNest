use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTaskMetrics {
    pub total_executed: u32,
    pub by_type: HashMap<String, u32>,
    pub success_rate: f64,
    pub approval_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiCodeContribution {
    pub lines_generated: u32,
    pub lines_accepted: u32,
    pub acceptance_rate: f64,
    pub tests_generated: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSavings {
    pub estimated_manual_hours: f64,
    pub actual_ai_minutes: f64,
    pub savings_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiDocMaintenance {
    pub docs_auto_updated: u32,
    pub avg_staleness_before: f64,
    pub avg_staleness_after: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiImpactMetrics {
    pub period: super::velocity::DateRange,
    pub agent_tasks: AgentTaskMetrics,
    pub code_contribution: AiCodeContribution,
    pub time_savings: TimeSavings,
    pub doc_maintenance: AiDocMaintenance,
}

/// AI インパクトメトリクスを計算する
/// Phase 6 の実行ログ（.devnest/ai-log.jsonl）があれば読み込む
pub fn compute_ai_impact(project_path: &std::path::Path, period: &super::velocity::DateRange) -> AiImpactMetrics {
    let log_path = project_path.join(".devnest").join("ai-log.jsonl");
    let (total, by_type, success) = parse_ai_log(&log_path);

    AiImpactMetrics {
        period: period.clone(),
        agent_tasks: AgentTaskMetrics {
            total_executed: total,
            by_type,
            success_rate: if total > 0 { success as f64 / total as f64 } else { 0.0 },
            approval_rate: 1.0,
        },
        code_contribution: AiCodeContribution {
            lines_generated: 0,
            lines_accepted: 0,
            acceptance_rate: 0.0,
            tests_generated: 0,
        },
        time_savings: TimeSavings {
            estimated_manual_hours: total as f64 * 0.5,
            actual_ai_minutes: total as f64 * 2.0,
            savings_ratio: if total > 0 { 0.93 } else { 0.0 },
        },
        doc_maintenance: AiDocMaintenance {
            docs_auto_updated: 0,
            avg_staleness_before: 0.0,
            avg_staleness_after: 0.0,
        },
    }
}

fn parse_ai_log(path: &std::path::Path) -> (u32, HashMap<String, u32>, u32) {
    let Ok(content) = std::fs::read_to_string(path) else {
        return (0, HashMap::new(), 0);
    };
    let mut total = 0u32;
    let mut by_type: HashMap<String, u32> = HashMap::new();
    let mut success = 0u32;
    for line in content.lines() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            total += 1;
            if let Some(t) = v.get("type").and_then(|t| t.as_str()) {
                *by_type.entry(t.to_string()).or_insert(0) += 1;
            }
            if v.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
                success += 1;
            }
        }
    }
    (total, by_type, success)
}
