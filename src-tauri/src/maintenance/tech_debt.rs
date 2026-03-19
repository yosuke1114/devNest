use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DebtCategory {
    TodoFixme,
    LargeFile,
    CodeDuplication,
    DeadCode,
    MissingTests,
    ManualEntry,
    DocDrift,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DebtSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TechDebtItem {
    pub id: String,
    pub category: DebtCategory,
    pub file_path: String,
    pub line: Option<u32>,
    pub severity: DebtSeverity,
    pub description: String,
    pub auto_detected: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TechDebtReport {
    pub scanned_at: String,
    pub items: Vec<TechDebtItem>,
    pub total_score: u32,
    pub by_category: HashMap<String, usize>,
}

// ─── スコア算出 ───────────────────────────────────────────────────────────────

fn severity_score(s: &DebtSeverity) -> u32 {
    match s {
        DebtSeverity::Low => 1,
        DebtSeverity::Medium => 3,
        DebtSeverity::High => 6,
        DebtSeverity::Critical => 10,
    }
}

// ─── TODO/FIXME スキャン ───────────────────────────────────────────────────────

const TODO_PATTERNS: &[&str] = &["TODO", "FIXME", "HACK", "XXX", "BUG"];
const SOURCE_EXTENSIONS: &[&str] = &["rs", "ts", "tsx", "js", "jsx"];
const LARGE_FILE_THRESHOLD: usize = 500; // 行数

fn scan_todos(root: &Path) -> Vec<TechDebtItem> {
    let mut items = Vec::new();

    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !SOURCE_EXTENSIONS.contains(&ext) {
            continue;
        }
        if is_ignored(path) {
            continue;
        }

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let rel = path.strip_prefix(root).unwrap_or(path).to_string_lossy().to_string();

        for (line_num, line) in content.lines().enumerate() {
            for pat in TODO_PATTERNS {
                if line.contains(pat) {
                    let desc = line.trim().to_string();
                    items.push(TechDebtItem {
                        id: format!("todo-{}-{}", rel.replace('/', "_"), line_num + 1),
                        category: DebtCategory::TodoFixme,
                        file_path: rel.clone(),
                        line: Some(line_num as u32 + 1),
                        severity: if *pat == "FIXME" || *pat == "BUG" {
                            DebtSeverity::Medium
                        } else {
                            DebtSeverity::Low
                        },
                        description: desc,
                        auto_detected: true,
                    });
                    break; // 1行1アイテム
                }
            }
        }
    }

    items
}

// ─── 大きなファイルの検出 ─────────────────────────────────────────────────────

fn scan_large_files(root: &Path) -> Vec<TechDebtItem> {
    let mut items = Vec::new();

    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !SOURCE_EXTENSIONS.contains(&ext) {
            continue;
        }
        if is_ignored(path) {
            continue;
        }

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let loc = content.lines().count();
        if loc > LARGE_FILE_THRESHOLD {
            let rel = path.strip_prefix(root).unwrap_or(path).to_string_lossy().to_string();
            let severity = if loc > 1500 {
                DebtSeverity::High
            } else if loc > 1000 {
                DebtSeverity::Medium
            } else {
                DebtSeverity::Low
            };
            items.push(TechDebtItem {
                id: format!("large-{}", rel.replace('/', "_")),
                category: DebtCategory::LargeFile,
                file_path: rel.clone(),
                line: None,
                severity,
                description: format!("{} 行（閾値: {}）", loc, LARGE_FILE_THRESHOLD),
                auto_detected: true,
            });
        }
    }

    items
}

// ─── ドキュメント乖離（DocDrift）スキャン ──────────────────────────────────────

fn scan_doc_drift(project_path: &Path) -> Vec<TechDebtItem> {
    use crate::doc_mapping::{index::build_index, staleness::check_all_staleness};

    let docs_dir = project_path.join("docs");
    if !docs_dir.exists() {
        return vec![];
    }

    let index = match build_index(project_path, &docs_dir) {
        Ok(i) => i,
        Err(_) => return vec![],
    };

    let staleness_list = match check_all_staleness(project_path, &docs_dir, &index) {
        Ok(s) => s,
        Err(_) => return vec![],
    };

    staleness_list
        .into_iter()
        .filter(|s| s.staleness_score >= 0.5)
        .map(|s| {
            let severity = if s.staleness_score >= 0.8 {
                DebtSeverity::High
            } else {
                DebtSeverity::Medium
            };
            TechDebtItem {
                id: format!("docdrfit-{}", s.doc_path.replace('/', "_")),
                category: DebtCategory::DocDrift,
                file_path: s.doc_path.clone(),
                line: None,
                severity,
                description: format!(
                    "設計書が古い可能性（スコア {:.2}, 同期から {} 日）",
                    s.staleness_score, s.days_since_sync
                ),
                auto_detected: true,
            }
        })
        .collect()
}

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

fn is_ignored(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.contains("node_modules")
        || s.contains("/target/")
        || s.contains("/.git/")
        || s.contains("/dist/")
}

// ─── スナップショット保存 ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct DebtSnapshot {
    date: String,
    total_score: u32,
    items_count: usize,
    by_category: HashMap<String, usize>,
}

#[derive(Serialize, Deserialize, Default)]
struct DebtHistory {
    snapshots: Vec<DebtSnapshot>,
}

pub fn save_snapshot(project_path: &Path, report: &TechDebtReport) {
    let devnest_dir = project_path.join(".devnest");
    let _ = fs::create_dir_all(&devnest_dir);
    let history_path = devnest_dir.join("debt-history.yaml");

    let mut history: DebtHistory = fs::read_to_string(&history_path)
        .ok()
        .and_then(|s| serde_yaml::from_str(&s).ok())
        .unwrap_or_default();

    let today = Utc::now().format("%Y-%m-%d").to_string();
    // 同日のスナップショットがあれば更新
    if let Some(last) = history.snapshots.last() {
        if last.date == today {
            history.snapshots.pop();
        }
    }

    history.snapshots.push(DebtSnapshot {
        date: today,
        total_score: report.total_score,
        items_count: report.items.len(),
        by_category: report.by_category.clone(),
    });

    // 最大 52 週分を保持
    if history.snapshots.len() > 52 {
        history.snapshots.remove(0);
    }

    if let Ok(yaml) = serde_yaml::to_string(&history) {
        let _ = fs::write(history_path, yaml);
    }
}

// ─── 公開 API ──────────────────────────────────────────────────────────────────

pub fn scan_tech_debt(project_path: &Path) -> TechDebtReport {
    let search_root = project_path;
    let mut items = Vec::new();

    items.extend(scan_todos(search_root));
    items.extend(scan_large_files(search_root));
    items.extend(scan_doc_drift(project_path));

    // カテゴリ別集計
    let mut by_category: HashMap<String, usize> = HashMap::new();
    for item in &items {
        let key = format!("{:?}", item.category);
        *by_category.entry(key).or_insert(0) += 1;
    }

    let total_score: u32 = items.iter().map(|i| severity_score(&i.severity)).sum();

    TechDebtReport {
        scanned_at: Utc::now().to_rfc3339(),
        items,
        total_score,
        by_category,
    }
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_scan_todos() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join("foo.rs"),
            "fn main() {\n    // TODO: implement this\n    // FIXME: broken\n}\n",
        )
        .unwrap();
        let items = scan_todos(dir.path());
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn test_scan_large_files() {
        let dir = tempdir().unwrap();
        let big = (0..=LARGE_FILE_THRESHOLD + 10)
            .map(|i| format!("let x{} = {};", i, i))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(dir.path().join("big.rs"), big).unwrap();
        let items = scan_large_files(dir.path());
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn test_debt_report() {
        let dir = tempdir().unwrap();
        fs::write(
            dir.path().join("a.ts"),
            "// TODO: fix\nconst x = 1;\n",
        )
        .unwrap();
        let report = scan_tech_debt(dir.path());
        assert!(!report.items.is_empty());
        assert!(report.total_score > 0);
    }
}
