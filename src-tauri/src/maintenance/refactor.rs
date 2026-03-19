use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::core::git_analysis::GitAnalysis;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ImpactLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefactorFactors {
    /// git log による変更頻度（正規化 0.0〜1.0）
    pub change_frequency: f64,
    /// LOC ベースの複雑度代替（正規化 0.0〜1.0）
    pub complexity: f64,
    /// ファイルサイズ（行数）
    pub file_size: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefactorCandidate {
    pub file_path: String,
    pub score: f64,
    pub factors: RefactorFactors,
    pub estimated_impact: ImpactLevel,
}

// ─── churn 算出（core::git_analysis 経由） ────────────────────────────────────

/// ファイルパス → 変更回数（過去 365 日分）
fn compute_churn(repo_path: &Path, _max_commits: usize) -> HashMap<String, u32> {
    GitAnalysis::get_file_churn(repo_path, 365)
        .into_iter()
        .map(|fc| (fc.file_path, fc.change_count))
        .collect()
}

// ─── LOC 計測 ──────────────────────────────────────────────────────────────────

fn count_loc(path: &Path) -> usize {
    std::fs::read_to_string(path)
        .map(|s| s.lines().count())
        .unwrap_or(0)
}

fn is_ignored(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.contains("node_modules")
        || s.contains("/target/")
        || s.contains("/.git/")
        || s.contains("/dist/")
}

// ─── 公開 API ──────────────────────────────────────────────────────────────────

pub fn analyze_refactor_candidates(project_path: &Path, top_n: usize) -> Vec<RefactorCandidate> {
    let churn = compute_churn(project_path, 200);

    // churn の最大値で正規化
    let max_churn = churn.values().copied().max().unwrap_or(1) as f64;

    let source_extensions = ["rs", "ts", "tsx", "js", "jsx"];

    // 全ソースファイルの LOC を収集
    let mut loc_map: HashMap<String, usize> = HashMap::new();
    for entry in WalkDir::new(project_path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !source_extensions.contains(&ext) {
            continue;
        }
        if is_ignored(path) {
            continue;
        }
        let rel = path
            .strip_prefix(project_path)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        let loc = count_loc(path);
        loc_map.insert(rel, loc);
    }

    // LOC の最大値で正規化
    let max_loc = loc_map.values().copied().max().unwrap_or(1) as f64;

    let mut candidates: Vec<RefactorCandidate> = loc_map
        .iter()
        .filter_map(|(rel_path, &loc)| {
            // churn は git ではスラッシュ区切りのパス
            let churn_count = churn.get(rel_path).copied().unwrap_or(0) as f64;
            let change_freq = (churn_count / max_churn).min(1.0);
            let complexity = (loc as f64 / max_loc).min(1.0);
            let file_size_norm = (loc as f64 / max_loc).min(1.0);

            // スコア算出（設計書のロジックに準拠）
            let score = change_freq * 0.25
                + complexity * 0.20
                + 0.0 * 0.20  // test_coverage は未取得のため 0
                + 0.0 * 0.15  // coupling は未取得
                + 0.0 * 0.10  // debt_density は未取得
                + 0.0 * 0.10; // doc_staleness は未取得

            if score < 0.01 && loc < 50 {
                return None; // ほぼゼロスコアの小さなファイルは除外
            }

            let impact = if score >= 0.6 {
                ImpactLevel::High
            } else if score >= 0.3 {
                ImpactLevel::Medium
            } else {
                ImpactLevel::Low
            };

            Some(RefactorCandidate {
                file_path: rel_path.clone(),
                score,
                factors: RefactorFactors {
                    change_frequency: change_freq,
                    complexity,
                    file_size: file_size_norm,
                },
                estimated_impact: impact,
            })
        })
        .collect();

    candidates.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    candidates.truncate(top_n);
    candidates
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_analyze_empty_dir() {
        let dir = tempdir().unwrap();
        let result = analyze_refactor_candidates(dir.path(), 10);
        // ソースファイルがなければ空
        assert!(result.is_empty());
    }

    #[test]
    fn test_analyze_with_source() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("main.rs"), "fn main() {}\n".repeat(100)).unwrap();
        let result = analyze_refactor_candidates(dir.path(), 10);
        assert!(!result.is_empty());
        // スコアが 0〜1 の範囲
        assert!(result[0].score >= 0.0 && result[0].score <= 1.0);
    }
}
