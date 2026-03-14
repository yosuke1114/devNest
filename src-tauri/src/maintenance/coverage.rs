use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileCoverage {
    pub path: String,
    pub covered_lines: u32,
    pub total_lines: u32,
    pub coverage_pct: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CoverageReport {
    pub overall_pct: f64,
    pub files: Vec<FileCoverage>,
    pub rust_available: bool,
    pub node_available: bool,
}

// ─── cargo tarpaulin ─────────────────────────────────────────────────────────

/// tarpaulin JSON フォーマット（簡易）
#[derive(Deserialize)]
struct TarpaulinOutput {
    files: Vec<TarpaulinFile>,
}

#[derive(Deserialize)]
struct TarpaulinFile {
    path: String,
    covered: u32,
    coverable: u32,
}

/// .devnest/tarpaulin-report.json を読み取る（存在する場合のみ）。
/// 自動実行はしない。生成コマンド:
///   cargo tarpaulin --out Json --skip-clean > .devnest/tarpaulin-report.json
fn run_tarpaulin(project_path: &Path) -> Option<Vec<FileCoverage>> {
    let report_path = project_path.join(".devnest").join("tarpaulin-report.json");
    if !report_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&report_path).ok()?;
    let parsed: TarpaulinOutput = serde_json::from_str(&content).ok()?;
    let files: Vec<FileCoverage> = parsed
        .files
        .into_iter()
        .map(|f| {
            let pct = if f.coverable > 0 {
                f.covered as f64 / f.coverable as f64 * 100.0
            } else {
                100.0
            };
            FileCoverage {
                path: f.path,
                covered_lines: f.covered,
                total_lines: f.coverable,
                coverage_pct: pct,
            }
        })
        .collect();
    if files.is_empty() { None } else { Some(files) }
}

// ─── vitest / jest coverage ───────────────────────────────────────────────────

fn parse_coverage_summary(summary_path: &Path) -> Option<Vec<FileCoverage>> {
    let content = std::fs::read_to_string(summary_path).ok()?;
    let val: serde_json::Value = serde_json::from_str(&content).ok()?;
    let mut files = Vec::new();
    if let Some(obj) = val.as_object() {
        for (path, info) in obj {
            if path == "total" {
                continue;
            }
            let pct = info["lines"]["pct"].as_f64().unwrap_or(0.0);
            let covered = info["lines"]["covered"].as_u64().unwrap_or(0) as u32;
            let total = info["lines"]["total"].as_u64().unwrap_or(0) as u32;
            files.push(FileCoverage {
                path: path.clone(),
                covered_lines: covered,
                total_lines: total,
                coverage_pct: pct,
            });
        }
    }
    if files.is_empty() { None } else { Some(files) }
}

/// coverage/coverage-summary.json を読み取る（存在する場合のみ）。
/// 自動実行はしない。生成コマンド: npm run test:coverage
fn run_node_coverage(project_path: &Path) -> Option<Vec<FileCoverage>> {
    let summary = project_path.join("coverage").join("coverage-summary.json");
    if summary.exists() {
        parse_coverage_summary(&summary)
    } else {
        None
    }
}

// ─── 公開 API ──────────────────────────────────────────────────────────────────

pub fn run_coverage_scan(project_path: &Path) -> CoverageReport {
    let rust_files = run_tarpaulin(project_path);
    let node_files = run_node_coverage(project_path);

    let rust_available = rust_files.is_some();
    let node_available = node_files.is_some();

    let mut all_files: Vec<FileCoverage> = Vec::new();
    if let Some(f) = rust_files {
        all_files.extend(f);
    }
    if let Some(f) = node_files {
        all_files.extend(f);
    }

    let overall_pct = if all_files.is_empty() {
        0.0
    } else {
        let total: u32 = all_files.iter().map(|f| f.total_lines).sum();
        let covered: u32 = all_files.iter().map(|f| f.covered_lines).sum();
        if total > 0 {
            covered as f64 / total as f64 * 100.0
        } else {
            0.0
        }
    };

    CoverageReport {
        overall_pct,
        files: all_files,
        rust_available,
        node_available,
    }
}
