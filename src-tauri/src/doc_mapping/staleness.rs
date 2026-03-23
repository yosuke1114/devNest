use std::path::Path;

use thiserror::Error;

use super::parser::{parse_doc_file, scan_all_docs, ParseError};
use super::types::{DocIndex, DocStaleness, DocStatus};

#[derive(Debug, Error)]
pub enum StalenessError {
    #[error("パースエラー: {0}")]
    Parse(#[from] ParseError),
    #[error("Git エラー: {0}")]
    Git(#[from] git2::Error),
    #[error("IO エラー: {0}")]
    Io(#[from] std::io::Error),
}

// スコア算出の正規化上限
const MAX_DAYS: f64 = 90.0;
const MAX_COMMITS: f64 = 20.0;

/// 単一設計書の鮮度を算出する
pub fn calculate_staleness(
    repo_path: &Path,
    doc_path: &Path,
    index: &DocIndex,
) -> Result<DocStaleness, StalenessError> {
    let fm = parse_doc_file(doc_path)?;

    let rel_doc = doc_path
        .strip_prefix(repo_path)
        .unwrap_or(doc_path)
        .to_string_lossy()
        .to_string();

    let entry = index.doc_index.get(&rel_doc);
    let source_paths = entry
        .map(|e| e.sources.as_slice())
        .unwrap_or(&[]);

    // last_synced_commit が未設定の場合はリポジトリ不要で最高スコアを返す
    if fm.last_synced_commit.is_none() {
        let staleness_score = 1.0_f64 * 0.3 + 1.0_f64 * 0.5; // 0.8
        return Ok(DocStaleness {
            doc_path: rel_doc,
            current_status: fm.status.clone(),
            staleness_score,
            recommended_status: DocStatus::Outdated,
            days_since_sync: MAX_DAYS as u32,
            commits_since_sync: MAX_COMMITS as u32,
            lines_changed_in_sources: 0,
            total_source_lines: 0,
        });
    }

    // Git リポジトリを開く
    let repo = match git2::Repository::open(repo_path) {
        Ok(r) => r,
        Err(_) => {
            // リポジトリがない場合はスコア 0
            return Ok(DocStaleness {
                doc_path: rel_doc,
                current_status: fm.status.clone(),
                staleness_score: 0.0,
                recommended_status: DocStatus::Current,
                days_since_sync: 0,
                commits_since_sync: 0,
                lines_changed_in_sources: 0,
                total_source_lines: 0,
            });
        }
    };

    let (days_since_sync, commits_since_sync, lines_changed, total_lines) =
        compute_git_metrics(&repo, fm.last_synced_commit.as_deref(), source_paths, repo_path)?;

    // スコア算出（0.0〜1.0 に正規化）
    let day_factor = (days_since_sync as f64 / MAX_DAYS).min(1.0);
    let commit_factor = (commits_since_sync as f64 / MAX_COMMITS).min(1.0);
    let line_factor = if total_lines > 0 {
        (lines_changed as f64 / total_lines as f64).min(1.0)
    } else {
        0.0
    };

    let staleness_score = day_factor * 0.3 + commit_factor * 0.5 + line_factor * 0.2;

    let recommended_status = if staleness_score < 0.3 {
        DocStatus::Current
    } else if staleness_score < 0.7 {
        DocStatus::Outdated
    } else {
        // Stale → Outdated として報告（設計書の status enum にない）
        DocStatus::Outdated
    };

    Ok(DocStaleness {
        doc_path: rel_doc,
        current_status: fm.status,
        staleness_score,
        recommended_status,
        days_since_sync,
        commits_since_sync,
        lines_changed_in_sources: lines_changed,
        total_source_lines: total_lines,
    })
}

/// last_synced_commit 以降のコミット数・変更行数等を計算する
fn compute_git_metrics(
    repo: &git2::Repository,
    last_synced_commit: Option<&str>,
    source_paths: &[String],
    repo_root: &Path,
) -> Result<(u32, u32, u32, u32), StalenessError> {
    let head = repo.head()?.peel_to_commit()?;

    // last_synced_commit からの経過日数・コミット数
    let (days_since, commits_since) = if let Some(sha) = last_synced_commit {
        match repo.revparse_single(sha) {
            Ok(obj) => {
                let base_commit = obj.peel_to_commit()?;
                let base_time = base_commit.time().seconds();
                let head_time = head.time().seconds();
                let days = ((head_time - base_time).max(0) / 86400) as u32;

                // コミット数（簡易カウント）
                let mut count = 0u32;
                let mut walk = repo.revwalk()?;
                walk.push(head.id())?;
                for oid in walk {
                    let oid = oid?;
                    if oid == base_commit.id() {
                        break;
                    }
                    count += 1;
                    if count >= 100 {
                        break; // 上限設定
                    }
                }
                (days, count)
            }
            Err(_) => (0, 0), // コミットが見つからない場合
        }
    } else {
        (0, 0) // None は呼び出し元で処理済み
    };

    // ソースの変更行数とトータル行数
    let mut lines_changed = 0u32;
    let mut total_lines = 0u32;

    if !source_paths.is_empty() {
        if let Some(sha) = last_synced_commit {
            if let Ok(base_obj) = repo.revparse_single(sha) {
                if let Ok(base_commit) = base_obj.peel_to_commit() {
                    let from_tree = base_commit.tree()?;
                    let to_tree = head.tree()?;

                    if let Ok(diff) =
                        repo.diff_tree_to_tree(Some(&from_tree), Some(&to_tree), None)
                    {
                        let _ = diff.foreach(
                            &mut |_, _| true,
                            None,
                            None,
                            Some(&mut |delta, _hunk, line| {
                                let path = delta
                                    .new_file()
                                    .path()
                                    .map(|p| p.to_string_lossy().to_string())
                                    .unwrap_or_default();
                                let relevant = source_paths.iter().any(|sp| {
                                    if sp.ends_with('/') {
                                        path.starts_with(sp.as_str())
                                    } else {
                                        path == *sp
                                    }
                                });
                                if relevant {
                                    match line.origin() {
                                        '+' => lines_changed += 1,
                                        '-' => lines_changed += 1,
                                        _ => {}
                                    }
                                }
                                true
                            }),
                        );
                    }
                }
            }
        }

        // トータル行数（現在の HEAD）
        for sp in source_paths {
            let full_path = repo_root.join(sp.trim_start_matches('/'));
            if full_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&full_path) {
                    total_lines += content.lines().count() as u32;
                }
            } else if full_path.is_dir() {
                for entry in walkdir::WalkDir::new(&full_path)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    if entry.path().is_file() {
                        if let Ok(content) = std::fs::read_to_string(entry.path()) {
                            total_lines += content.lines().count() as u32;
                        }
                    }
                }
            }
        }
    }

    Ok((days_since, commits_since, lines_changed, total_lines))
}

/// docs ディレクトリ配下の全設計書の鮮度を一括チェックする
pub fn check_all_staleness(
    repo_path: &Path,
    docs_dir: &Path,
    index: &DocIndex,
) -> Result<Vec<DocStaleness>, StalenessError> {
    let all_docs = scan_all_docs(docs_dir)?;
    let mut results = Vec::new();

    for (doc_path, _fm) in all_docs {
        match calculate_staleness(repo_path, &doc_path, index) {
            Ok(s) => results.push(s),
            Err(e) => {
                tracing::warn!("鮮度算出失敗 {}: {}", doc_path.display(), e);
            }
        }
    }

    Ok(results)
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc_mapping::index::build_index;
    use tempfile::tempdir;

    const DOC: &str = r#"---
title: "鮮度テスト"
doc_type: screen_design
version: "1.0.0"
status: current
mapping:
  sources:
    - path: "src/editor.rs"
      scope: file
---
# 本文
"#;

    #[test]
    fn test_staleness_no_repo() {
        // git リポジトリがないディレクトリでもパニックしない
        let tmpdir = tempdir().unwrap();
        std::fs::write(tmpdir.path().join("doc.md"), DOC).unwrap();
        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();
        let result = calculate_staleness(tmpdir.path(), &tmpdir.path().join("doc.md"), &index);
        assert!(result.is_ok());
        let s = result.unwrap();
        assert!(s.staleness_score >= 0.0);
    }

    #[test]
    fn test_check_all_staleness_empty() {
        let tmpdir = tempdir().unwrap();
        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();
        let results = check_all_staleness(tmpdir.path(), tmpdir.path(), &index).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_staleness_no_last_synced_commit() {
        // last_synced_commit が None の場合、スコアが高くなる
        let no_sync_doc = r#"---
title: "未同期"
doc_type: screen_design
version: "1.0.0"
status: draft
mapping:
  sources: []
---
"#;
        let tmpdir = tempdir().unwrap();
        std::fs::write(tmpdir.path().join("unsync.md"), no_sync_doc).unwrap();
        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();
        let s = calculate_staleness(tmpdir.path(), &tmpdir.path().join("unsync.md"), &index)
            .unwrap();
        // last_synced_commit なし → 高スコア
        assert!(s.staleness_score >= 0.7);
    }
}
