use std::path::Path;

use thiserror::Error;

use crate::core::git_analysis::GitAnalysis;
use super::index::find_docs_for_source;
use super::types::{AffectedDoc, ChangeSeverity, ChangedSource, ChangeType, DocIndex};

#[derive(Debug, Error)]
pub enum DiffError {
    #[error("Git エラー: {0}")]
    Git(#[from] git2::Error),
    #[error("リポジトリが見つかりません: {0}")]
    NotFound(String),
}

/// git2 の Delta ステータスを ChangeType に変換する
fn delta_to_change_type(status: git2::Delta) -> Option<ChangeType> {
    match status {
        git2::Delta::Added => Some(ChangeType::Added),
        git2::Delta::Modified => Some(ChangeType::Modified),
        git2::Delta::Deleted => Some(ChangeType::Deleted),
        git2::Delta::Renamed => Some(ChangeType::Renamed),
        _ => None,
    }
}

/// diff から変更ファイル一覧を抽出して AffectedDoc リストにまとめる
fn analyze_diff(diff: &git2::Diff, index: &DocIndex, repo_path: &Path) -> Vec<AffectedDoc> {
    use std::collections::HashMap;

    // ファイルごとの変更情報を収集
    let mut changed: HashMap<String, ChangedSource> = HashMap::new();
    for delta in diff.deltas() {
        let change_type = match delta_to_change_type(delta.status()) {
            Some(ct) => ct,
            None => continue,
        };
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        if path.is_empty() {
            continue;
        }
        changed.insert(
            path.clone(),
            ChangedSource {
                path,
                change_type,
                lines_added: 0,
                lines_deleted: 0,
            },
        );
    }

    // stat 情報（追加/削除行数）を補完
    if let Ok(stats) = diff.stats() {
        // 行数は全体統計のみ取得可能なため、ファイル単位は delta からパッチで取得
        let _ = stats; // 全体統計は使わない
    }

    // パッチで行数を補完
    let _ = diff.foreach(
        &mut |_delta, _progress| true,
        None,
        Some(&mut |delta, _hunk| {
            let path = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            let _ = path;
            true
        }),
        Some(&mut |delta, _hunk, line| {
            let path = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            if let Some(cs) = changed.get_mut(&path) {
                match line.origin() {
                    '+' => cs.lines_added += 1,
                    '-' => cs.lines_deleted += 1,
                    _ => {}
                }
            }
            true
        }),
    );

    // core::git_analysis で高チャーンファイルを特定し、重大度を補正する
    let churn_map: std::collections::HashMap<String, u32> = GitAnalysis::get_file_churn(repo_path, 90)
        .into_iter()
        .map(|fc| (fc.file_path, fc.change_count))
        .collect();
    let max_churn = churn_map.values().copied().max().unwrap_or(1) as f64;

    // 変更ファイル → 影響設計書の逆引き
    let mut affected = aggregate_affected_docs(changed.into_values().collect(), index);

    // 高チャーンファイルに関連する設計書は Medium → High に引き上げ
    for ad in &mut affected {
        if ad.change_severity == ChangeSeverity::Medium {
            let is_high_churn = ad.changed_sources.iter().any(|cs| {
                let c = *churn_map.get(&cs.path).unwrap_or(&0) as f64;
                c / max_churn > 0.6
            });
            if is_high_churn {
                ad.change_severity = ChangeSeverity::High;
            }
        }
    }

    affected
}

/// 変更ファイルリストから影響設計書リストを組み立てる
fn aggregate_affected_docs(
    changed_sources: Vec<ChangedSource>,
    index: &DocIndex,
) -> Vec<AffectedDoc> {
    use std::collections::HashMap;

    // doc_path → AffectedDoc
    let mut affected: HashMap<String, AffectedDoc> = HashMap::new();

    for cs in &changed_sources {
        let entries = find_docs_for_source(index, &cs.path);
        for entry in entries {
            let ad = affected
                .entry(entry.doc.clone())
                .or_insert_with(|| AffectedDoc {
                    doc_path: entry.doc.clone(),
                    affected_sections: vec![],
                    changed_sources: vec![],
                    change_severity: ChangeSeverity::Low,
                });

            for sec in &entry.sections {
                if !ad.affected_sections.contains(sec) {
                    ad.affected_sections.push(sec.clone());
                }
            }
            ad.changed_sources.push(cs.clone());
        }
    }

    // 重大度を決定（最も高い変更タイプで決まる）
    for ad in affected.values_mut() {
        let severity = ad.changed_sources.iter().fold(ChangeSeverity::Low, |acc, cs| {
            match cs.change_type {
                ChangeType::Added | ChangeType::Deleted | ChangeType::Renamed => ChangeSeverity::High,
                ChangeType::Modified => {
                    if acc == ChangeSeverity::High {
                        ChangeSeverity::High
                    } else {
                        ChangeSeverity::Medium
                    }
                }
            }
        });
        ad.change_severity = severity;
    }

    affected.into_values().collect()
}

/// 指定コミット範囲で影響を受ける設計書を返す
///
/// `from_commit`: 起点コミット（例: "a1b2c3d"）
/// `to_commit`: None の場合は HEAD
pub fn find_affected_docs(
    repo_path: &Path,
    index: &DocIndex,
    from_commit: &str,
    to_commit: Option<&str>,
) -> Result<Vec<AffectedDoc>, DiffError> {
    let repo = git2::Repository::open(repo_path)?;

    let from_oid = repo.revparse_single(from_commit)?.peel_to_commit()?.id();
    let to_oid = {
        let spec = to_commit.unwrap_or("HEAD");
        repo.revparse_single(spec)?.peel_to_commit()?.id()
    };

    let from_tree = repo.find_commit(from_oid)?.tree()?;
    let to_tree = repo.find_commit(to_oid)?.tree()?;

    let diff = repo.diff_tree_to_tree(Some(&from_tree), Some(&to_tree), None)?;
    Ok(analyze_diff(&diff, index, repo_path))
}

/// ワーキングディレクトリの未コミット変更で影響を受ける設計書を返す
pub fn find_affected_docs_unstaged(
    repo_path: &Path,
    index: &DocIndex,
) -> Result<Vec<AffectedDoc>, DiffError> {
    let repo = git2::Repository::open(repo_path)?;

    // HEAD ツリーを取得
    let head_tree = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_tree().ok());

    let diff = repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), None)?;
    Ok(analyze_diff(&diff, index, repo_path))
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc_mapping::index::build_index;
    use tempfile::tempdir;

    #[test]
    fn test_aggregate_no_change() {
        let tmpdir = tempdir().unwrap();
        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();
        let result = aggregate_affected_docs(vec![], &index);
        assert!(result.is_empty());
    }

    #[test]
    fn test_change_severity_high_for_added() {
        let tmpdir = tempdir().unwrap();
        let doc_md = r#"---
title: "テスト"
doc_type: screen_design
version: "1.0.0"
status: current
mapping:
  sources:
    - path: "src/new_feature/"
      scope: directory
---
"#;
        std::fs::write(tmpdir.path().join("doc.md"), doc_md).unwrap();
        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();

        let changed = vec![ChangedSource {
            path: "src/new_feature/mod.rs".to_string(),
            change_type: ChangeType::Added,
            lines_added: 50,
            lines_deleted: 0,
        }];
        let result = aggregate_affected_docs(changed, &index);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].change_severity, ChangeSeverity::High);
    }
}
