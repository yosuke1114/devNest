use tauri::State;
use crate::analytics::{
    velocity::{DateRange, VelocityMetrics, compute_velocity},
    ai_impact::{AiImpactMetrics, compute_ai_impact},
    sprint::{SprintInfo, SprintAnalysis, analyze_sprint, recent_sprints},
};
use crate::error::Result;
use crate::state::AppState;

#[tauri::command]
pub async fn get_velocity_metrics(
    project_path: String,
    period: DateRange,
    _state: State<'_, AppState>,
) -> Result<VelocityMetrics> {
    compute_velocity(std::path::Path::new(&project_path), &period)
}

#[tauri::command]
pub async fn get_ai_impact(
    project_path: String,
    period: DateRange,
    _state: State<'_, AppState>,
) -> Result<AiImpactMetrics> {
    Ok(compute_ai_impact(std::path::Path::new(&project_path), &period))
}

#[tauri::command]
pub async fn get_sprint_analysis(
    project_path: String,
    sprint: SprintInfo,
    _state: State<'_, AppState>,
) -> Result<SprintAnalysis> {
    analyze_sprint(std::path::Path::new(&project_path), sprint)
}

#[tauri::command]
pub async fn get_sprint_history(
    project_path: String,
    count: u32,
    _state: State<'_, AppState>,
) -> Result<Vec<SprintAnalysis>> {
    recent_sprints(std::path::Path::new(&project_path), count)
}
