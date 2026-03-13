use serde::{Deserialize, Serialize};
use chrono::NaiveDate;
use std::collections::HashMap;
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
    let repo = git2::Repository::open(project_path)
        .map_err(|e| AppError::Git(e.to_string()))?;

    let start = NaiveDate::parse_from_str(&period.start, "%Y-%m-%d")
        .map_err(|e| AppError::Validation(e.to_string()))?;
    let end = NaiveDate::parse_from_str(&period.end, "%Y-%m-%d")
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let mut revwalk = repo.revwalk().map_err(|e| AppError::Git(e.to_string()))?;
    revwalk.push_head().ok();

    let mut total_commits = 0u32;
    let mut by_author: HashMap<String, u32> = HashMap::new();
    let mut lines_added = 0u32;
    let mut lines_deleted = 0u32;
    let mut files_changed_set = std::collections::HashSet::new();
    let mut daily: HashMap<String, DailyMetrics> = HashMap::new();
    let mut commit_dates = std::collections::HashSet::new();

    for oid_result in revwalk {
        let Ok(oid) = oid_result else { continue };
        let Ok(commit) = repo.find_commit(oid) else { continue };

        let ts = commit.time().seconds();
        let dt = chrono::DateTime::from_timestamp(ts, 0)
            .unwrap_or_default()
            .naive_utc()
            .date();

        if dt < start || dt > end {
            continue;
        }

        total_commits += 1;
        let author = commit.author().name().unwrap_or("unknown").to_string();
        *by_author.entry(author).or_insert(0) += 1;

        let date_str = dt.format("%Y-%m-%d").to_string();
        commit_dates.insert(date_str.clone());

        // Diff stats
        let (added, deleted, files) = if let Ok(parent) = commit.parent(0) {
            if let (Ok(t1), Ok(t2)) = (commit.tree(), parent.tree()) {
                if let Ok(diff) = repo.diff_tree_to_tree(Some(&t2), Some(&t1), None) {
                    let (ins, del) = if let Ok(stats) = diff.stats() {
                        (stats.insertions() as u32, stats.deletions() as u32)
                    } else {
                        (0, 0)
                    };
                    let mut fset = std::collections::HashSet::new();
                    diff.foreach(
                        &mut |d, _| {
                            if let Some(p) = d.new_file().path() {
                                fset.insert(p.to_string_lossy().to_string());
                            }
                            true
                        },
                        None,
                        None,
                        None,
                    )
                    .ok();
                    (ins, del, fset)
                } else {
                    (0, 0, std::collections::HashSet::new())
                }
            } else {
                (0, 0, std::collections::HashSet::new())
            }
        } else {
            (0, 0, std::collections::HashSet::new())
        };

        lines_added += added;
        lines_deleted += deleted;
        files_changed_set.extend(files);

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

    // Streak: consecutive days with commits
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
