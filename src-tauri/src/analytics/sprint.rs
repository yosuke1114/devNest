use serde::{Deserialize, Serialize};
use crate::error::Result;
use super::velocity::{DateRange, VelocityMetrics, compute_velocity};
use super::ai_impact::{AiImpactMetrics, compute_ai_impact};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SprintInfo {
    pub name: String,
    pub start: String,
    pub end: String,
    pub duration_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaintenanceDelta {
    pub debt_score_start: f64,
    pub debt_score_end: f64,
    pub coverage_start: f64,
    pub coverage_end: f64,
    pub stale_docs_start: u32,
    pub stale_docs_end: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum SprintHighlight {
    VelocityIncrease { percent: f64 },
    CoverageImproved { from: f64, to: f64 },
    DebtReduced { items: u32 },
    AiTasksEfficient { savings_hours: f64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum SprintConcern {
    VelocityDrop { percent: f64 },
    CoverageDrop { from: f64, to: f64 },
    DebtIncreased { items: u32 },
    StaleDocsIncreased { count: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SprintAnalysis {
    pub sprint: SprintInfo,
    pub velocity: VelocityMetrics,
    pub ai_impact: AiImpactMetrics,
    pub maintenance_delta: MaintenanceDelta,
    pub highlights: Vec<SprintHighlight>,
    pub concerns: Vec<SprintConcern>,
}

pub fn analyze_sprint(project_path: &std::path::Path, sprint: SprintInfo) -> Result<SprintAnalysis> {
    let period = DateRange { start: sprint.start.clone(), end: sprint.end.clone() };
    let velocity = compute_velocity(project_path, &period)?;
    let ai_impact = compute_ai_impact(project_path, &period);

    let delta = MaintenanceDelta {
        debt_score_start: 0.0,
        debt_score_end: 0.0,
        coverage_start: 0.0,
        coverage_end: 0.0,
        stale_docs_start: 0,
        stale_docs_end: 0,
    };

    let mut highlights = Vec::new();
    let mut concerns = Vec::new();

    if velocity.commits.average_per_day > 3.0 {
        highlights.push(SprintHighlight::VelocityIncrease { percent: 10.0 });
    }
    if ai_impact.time_savings.savings_ratio > 0.5 {
        highlights.push(SprintHighlight::AiTasksEfficient {
            savings_hours: ai_impact.time_savings.estimated_manual_hours,
        });
    }
    if velocity.commits.total == 0 {
        concerns.push(SprintConcern::VelocityDrop { percent: 100.0 });
    }

    Ok(SprintAnalysis {
        sprint,
        velocity,
        ai_impact,
        maintenance_delta: delta,
        highlights,
        concerns,
    })
}

/// 直近 N スプリントを自動算出（2週間ごとのスプリント）
pub fn recent_sprints(project_path: &std::path::Path, count: u32) -> Result<Vec<SprintAnalysis>> {
    let today = chrono::Utc::now().date_naive();
    let mut results = Vec::new();
    for i in 0..count {
        let end = today - chrono::Duration::weeks(i as i64 * 2);
        let start = end - chrono::Duration::weeks(2) + chrono::Duration::days(1);
        let sprint = SprintInfo {
            name: format!("Sprint -{}", i),
            start: start.format("%Y-%m-%d").to_string(),
            end: end.format("%Y-%m-%d").to_string(),
            duration_days: 14,
        };
        if let Ok(analysis) = analyze_sprint(project_path, sprint) {
            results.push(analysis);
        }
    }
    Ok(results)
}
