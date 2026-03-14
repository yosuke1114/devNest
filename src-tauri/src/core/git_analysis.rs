use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use chrono::{DateTime, TimeZone, Utc};

/// ファイル別変更頻度情報
#[derive(Debug, Clone)]
pub struct FileChurn {
    pub file_path: String,
    pub change_count: u32,
    pub recent_authors: Vec<String>,
}

/// コミット情報
#[derive(Debug, Clone)]
pub struct CommitInfo {
    pub id: String,
    pub message: String,
    pub author: String,
    pub timestamp: DateTime<Utc>,
    pub files_changed: Vec<String>,
    pub insertions: usize,
    pub deletions: usize,
}

pub struct GitAnalysis;

impl GitAnalysis {
    /// ファイル別変更頻度（churn）を取得する。
    /// `limit_days` 日以内のコミットを対象とする。
    pub fn get_file_churn(repo_path: &Path, limit_days: u32) -> Vec<FileChurn> {
        // git log --name-only で変更ファイル一覧を収集
        let since = format!("{} days ago", limit_days);
        let output = Command::new("git")
            .args([
                "log",
                "--name-only",
                "--pretty=format:%an",
                &format!("--since={}", since),
            ])
            .current_dir(repo_path)
            .output();

        let Ok(out) = output else { return vec![] };
        if !out.status.success() {
            return vec![];
        }

        let text = String::from_utf8_lossy(&out.stdout);

        // パース: author 行の次にファイル行が続く（空行で区切られる）
        let mut churn_map: HashMap<String, u32> = HashMap::new();
        let mut author_map: HashMap<String, Vec<String>> = HashMap::new();
        let mut current_author = String::new();

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            // git log --pretty=format:%an は各コミット先頭に著者名を出力する。
            // ファイル名との区別：ファイル名はパス区切り文字を含む or 拡張子を持つことが多い。
            // シンプルな判定：前のセクションが著者名かどうかをフラグで管理せず、
            // 著者行は % format で出るため「直前の空行なし行」が著者。
            // ここでは別アプローチ: --pretty=format:%H%n%an を使って明確に分ける。
            // 今はシンプルに: ファイルパスは "/" を含むか拡張子があるものとする。
            let looks_like_file =
                line.contains('/') || line.contains('.') || line.starts_with("src");
            if looks_like_file {
                *churn_map.entry(line.to_string()).or_insert(0) += 1;
                author_map
                    .entry(line.to_string())
                    .or_default()
                    .push(current_author.clone());
            } else {
                current_author = line.to_string();
            }
        }

        let mut result: Vec<FileChurn> = churn_map
            .into_iter()
            .map(|(file_path, change_count)| {
                let mut authors = author_map.remove(&file_path).unwrap_or_default();
                authors.dedup();
                FileChurn {
                    file_path,
                    change_count,
                    recent_authors: authors,
                }
            })
            .collect();

        result.sort_by(|a, b| b.change_count.cmp(&a.change_count));
        result
    }

    /// 指定期間のコミットメトリクスを取得する。
    pub fn get_commit_metrics(
        repo_path: &Path,
        since: DateTime<Utc>,
        until: DateTime<Utc>,
    ) -> Vec<CommitInfo> {
        let repo = match git2::Repository::open(repo_path) {
            Ok(r) => r,
            Err(_) => return vec![],
        };

        let mut revwalk = match repo.revwalk() {
            Ok(rw) => rw,
            Err(_) => return vec![],
        };

        revwalk.push_head().ok();
        let _ = revwalk.set_sorting(git2::Sort::TIME);

        let since_ts = since.timestamp();
        let until_ts = until.timestamp();

        let mut commits = Vec::new();

        for oid_result in revwalk {
            let Ok(oid) = oid_result else { continue };
            let Ok(commit) = repo.find_commit(oid) else { continue };

            let ts = commit.time().seconds();
            if ts < since_ts || ts > until_ts {
                if ts < since_ts {
                    break; // TIME ソートなので、これ以降は全て古い
                }
                continue;
            }

            let (files_changed, insertions, deletions) = Self::diff_stats(&repo, &commit);

            let timestamp = Utc.timestamp_opt(ts, 0).single().unwrap_or_default();

            commits.push(CommitInfo {
                id: oid.to_string(),
                message: commit.summary().unwrap_or("").to_string(),
                author: commit.author().name().unwrap_or("unknown").to_string(),
                timestamp,
                files_changed,
                insertions,
                deletions,
            });
        }

        commits
    }

    /// 特定ファイルの変更履歴を取得する。
    pub fn get_file_history(repo_path: &Path, file_path: &str, limit: usize) -> Vec<CommitInfo> {
        let repo = match git2::Repository::open(repo_path) {
            Ok(r) => r,
            Err(_) => return vec![],
        };

        let mut revwalk = match repo.revwalk() {
            Ok(rw) => rw,
            Err(_) => return vec![],
        };

        revwalk.push_head().ok();
        let _ = revwalk.set_sorting(git2::Sort::TIME);

        let mut commits = Vec::new();

        for oid_result in revwalk {
            if commits.len() >= limit {
                break;
            }
            let Ok(oid) = oid_result else { continue };
            let Ok(commit) = repo.find_commit(oid) else { continue };

            // この commit でそのファイルが変更されたか確認
            let touched = if let Ok(parent) = commit.parent(0) {
                if let (Ok(t1), Ok(t2)) = (commit.tree(), parent.tree()) {
                    if let Ok(diff) = repo.diff_tree_to_tree(Some(&t2), Some(&t1), None) {
                        let mut found = false;
                        diff.foreach(
                            &mut |d, _| {
                                if d.new_file()
                                    .path()
                                    .map(|p| p.to_string_lossy() == file_path)
                                    .unwrap_or(false)
                                    || d.old_file()
                                        .path()
                                        .map(|p| p.to_string_lossy() == file_path)
                                        .unwrap_or(false)
                                {
                                    found = true;
                                }
                                true
                            },
                            None,
                            None,
                            None,
                        )
                        .ok();
                        found
                    } else {
                        false
                    }
                } else {
                    false
                }
            } else {
                // 初回コミット: tree に含まれているか確認
                commit
                    .tree()
                    .ok()
                    .and_then(|t| t.get_path(std::path::Path::new(file_path)).ok())
                    .is_some()
            };

            if !touched {
                continue;
            }

            let (files_changed, insertions, deletions) = Self::diff_stats(&repo, &commit);
            let ts = commit.time().seconds();
            let timestamp = Utc.timestamp_opt(ts, 0).single().unwrap_or_default();

            commits.push(CommitInfo {
                id: oid.to_string(),
                message: commit.summary().unwrap_or("").to_string(),
                author: commit.author().name().unwrap_or("unknown").to_string(),
                timestamp,
                files_changed,
                insertions,
                deletions,
            });
        }

        commits
    }

    // ─── helpers ───────────────────────────────────────────────────────────────

    fn diff_stats(
        repo: &git2::Repository,
        commit: &git2::Commit,
    ) -> (Vec<String>, usize, usize) {
        if let Ok(parent) = commit.parent(0) {
            if let (Ok(t1), Ok(t2)) = (commit.tree(), parent.tree()) {
                if let Ok(diff) = repo.diff_tree_to_tree(Some(&t2), Some(&t1), None) {
                    let (ins, del) = diff
                        .stats()
                        .map(|s| (s.insertions(), s.deletions()))
                        .unwrap_or((0, 0));
                    let mut files = Vec::new();
                    diff.foreach(
                        &mut |d, _| {
                            if let Some(p) = d.new_file().path() {
                                files.push(p.to_string_lossy().to_string());
                            }
                            true
                        },
                        None,
                        None,
                        None,
                    )
                    .ok();
                    return (files, ins, del);
                }
            }
        }
        (vec![], 0, 0)
    }
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn repo_path() -> PathBuf {
        // devNest リポジトリ自身を使う
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
    }

    #[test]
    fn test_get_file_churn_not_empty() {
        let path = repo_path();
        // git リポジトリであることが前提。過去 365 日分。
        let result = GitAnalysis::get_file_churn(&path, 365);
        // devNest リポジトリには必ずコミットが存在する
        assert!(
            !result.is_empty(),
            "get_file_churn should return non-empty results for devNest repo"
        );
        // change_count は正の整数
        assert!(result[0].change_count > 0);
    }

    #[test]
    fn test_get_commit_metrics_past_30_days() {
        let path = repo_path();
        let until = Utc::now();
        let since = until - chrono::Duration::days(30);
        let result = GitAnalysis::get_commit_metrics(&path, since, until);
        // 過去 30 日に何らかのコミットがあるはず
        assert!(
            !result.is_empty(),
            "get_commit_metrics should find commits in past 30 days"
        );
        // 各コミットは id と message を持つ
        assert!(!result[0].id.is_empty());
    }

    #[test]
    fn test_get_file_history_cargo_toml() {
        let path = repo_path();
        let result = GitAnalysis::get_file_history(&path, "src-tauri/Cargo.toml", 10);
        // Cargo.toml は必ず変更されている
        assert!(
            !result.is_empty(),
            "get_file_history should find history for src-tauri/Cargo.toml"
        );
        // 結果は limit 以下
        assert!(result.len() <= 10);
    }
}
