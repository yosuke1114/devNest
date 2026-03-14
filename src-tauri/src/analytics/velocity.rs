use serde::{Deserialize, Serialize};
use chrono::{NaiveDate, TimeZone, Utc};
use std::collections::HashMap;
use crate::core::git_analysis::GitAnalysis;
use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    pub start: String, // ISO date "2026-01-01"
    pub end: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitMetrics {
    pub total: u32,
    pub by_author: HashMap<String, u32>,
    pub average_per_day: f64,
    pub streak_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeChangeMetrics {
    pub lines_added: u32,
    pub lines_deleted: u32,
    pub files_changed: u32,
    pub net_growth: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VelocityMetrics {
    pub period: DateRange,
    pub commits: CommitMetrics,
    pub code_changes: CodeChangeMetrics,
    pub daily_breakdown: Vec<DailyMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyMetrics {
    pub date: String,
    pub commits: u32,
    pub lines_added: u32,
    pub lines_deleted: u32,
}

pub fn compute_velocity(project_path: &std::path::Path, period: &DateRange) -> Result<VelocityMetrics> {
    let start = NaiveDate::parse_from_str(&period.start, "%Y-%m-%d")
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let end = NaiveDate::parse_from_str(&period.end, "%Y-%m-%d")
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let since_dt = Utc.from_utc_datetime(&start.and_hms_opt(0, 0, 0).unwrap_or_default());
    let until_dt = Utc.from_utc_datetime(&end.and_hms_opt(23, 59, 59).unwrap_or_default());

    // core::git_analysis 経由でコミット情報を取得
    let commit_infos = GitAnalysis::get_commit_metrics(project_path, since_dt, until_dt);

    let mut total_commits = 0u32;
    let mut by_author: HashMap<String, u32> = HashMap::new();
    let mut lines_added = 0u32;
    let mut lines_deleted = 0u32;
    let mut files_changed_set = std::collections::HashSet::new();
    let mut daily: HashMap<String, DailyMetrics> = HashMap::new();
    let mut commit_dates = std::collections::HashSet::new();

    for info in &commit_infos {
        total_commits += 1;
        *by_author.entry(info.author.clone()).or_insert(0) += 1;

        let added = info.insertions as u32;
        let deleted = info.deletions as u32;
        lines_added += added;
        lines_deleted += deleted;
        for f in &info.files_changed {
            files_changed_set.insert(f.clone());
        }

        let date_str = info.timestamp.format("%Y-%m-%d").to_string();
        commit_dates.insert(date_str.clone());

        let entry = daily.entry(date_str.clone()).or_insert(DailyMetrics {
            date: date_str,
            commits: 0,
            lines_added: 0,
            lines_deleted: 0,
        });
        entry.commits += 1;
        entry.lines_added += added;
        entry.lines_deleted += deleted;
    }

    let streak_days = compute_streak(&commit_dates, &end);
    let days = ((end - start).num_days() + 1).max(1) as f64;
    let avg_per_day = total_commits as f64 / days;

    let mut daily_vec: Vec<DailyMetrics> = daily.into_values().collect();
    daily_vec.sort_by(|a, b| a.date.cmp(&b.date));

    Ok(VelocityMetrics {
        period: period.clone(),
        commits: CommitMetrics {
            total: total_commits,
            by_author,
            average_per_day: avg_per_day,
            streak_days,
        },
        code_changes: CodeChangeMetrics {
            lines_added,
            lines_deleted,
            files_changed: files_changed_set.len() as u32,
            net_growth: lines_added as i32 - lines_deleted as i32,
        },
        daily_breakdown: daily_vec,
    })
}

fn compute_streak(commit_dates: &std::collections::HashSet<String>, end: &NaiveDate) -> u32 {
    let mut streak = 0u32;
    let mut current = *end;
    loop {
        let s = current.format("%Y-%m-%d").to_string();
        if commit_dates.contains(&s) {
            streak += 1;
            if let Some(prev) = current.pred_opt() {
                current = prev;
            } else {
                break;
            }
        } else {
            break;
        }
    }
    streak
}
