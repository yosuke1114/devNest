use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use thiserror::Error;

use super::parser;
use super::types::{DocIndex, DocIndexEntry, SourceIndexEntry};

#[derive(Debug, Error)]
pub enum IndexError {
    #[error("パースエラー: {0}")]
    Parse(#[from] parser::ParseError),
    #[error("YAMLシリアライズエラー: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("IO エラー: {0}")]
    Io(#[from] std::io::Error),
    #[error("Git エラー: {0}")]
    Git(String),
}

/// 現在の HEAD コミットハッシュを取得する（7 桁）
fn head_commit(repo_root: &Path) -> String {
    let Ok(repo) = git2::Repository::open(repo_root) else {
        return "unknown".to_string();
    };
    let Ok(head) = repo.head() else {
        return "unknown".to_string();
    };
    let Ok(commit) = head.peel_to_commit() else {
        return "unknown".to_string();
    };
    commit.id().to_string()[..7].to_string()
}

/// `docs_dir` 配下の全設計書をスキャンしてインデックスを生成する
pub fn build_index(docs_dir: &Path, repo_root: &Path) -> Result<DocIndex, IndexError> {
    let all_docs = parser::scan_all_docs(docs_dir)?;
    let commit = head_commit(repo_root);

    let mut source_index: HashMap<String, Vec<SourceIndexEntry>> = HashMap::new();
    let mut doc_index: HashMap<String, DocIndexEntry> = HashMap::new();

    for (doc_path, fm) in &all_docs {
        // docs_dir からの相対パスを key にする
        let rel_doc = doc_path
            .strip_prefix(repo_root)
            .unwrap_or(doc_path)
            .to_string_lossy()
            .to_string();

        let mapping = match &fm.mapping {
            Some(m) => m,
            None => {
                doc_index.entry(rel_doc).or_insert_with(|| DocIndexEntry {
                    sources: vec![],
                    depends_on: vec![],
                });
                continue;
            }
        };

        // ソースパス → この設計書 のマッピングを構築
        let mut source_paths = Vec::new();
        for src in &mapping.sources {
            source_paths.push(src.path.clone());

            // セクション情報を収集
            let sections = {
                let mut s = vec!["全体".to_string()];
                if let Some(secs) = &mapping.sections {
                    for sec in secs {
                        let matches = sec.sources.iter().any(|sm| sm.path == src.path);
                        if matches {
                            s.push(sec.heading.clone());
                        }
                    }
                }
                s
            };

            source_index
                .entry(src.path.clone())
                .or_default()
                .push(SourceIndexEntry {
                    doc: rel_doc.clone(),
                    sections,
                });
        }

        // depends_on を収集
        let depends_on = mapping
            .depends_on
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .map(|d| d.doc.clone())
            .collect();

        doc_index.insert(
            rel_doc.clone(),
            DocIndexEntry {
                sources: source_paths,
                depends_on,
            },
        );
    }

    Ok(DocIndex {
        generated_at: Utc::now(),
        generated_from_commit: commit,
        source_index,
        doc_index,
    })
}

/// インデックスを YAML ファイルに書き出す
pub fn write_index(index: &DocIndex, output_path: &Path) -> Result<(), IndexError> {
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let yaml = serde_yaml::to_string(index)?;
    let header = "# 自動生成 - 手動編集禁止\n";
    fs::write(output_path, format!("{}{}", header, yaml))?;
    Ok(())
}

/// インデックスファイルを読み込む
pub fn load_index(index_path: &Path) -> Result<DocIndex, IndexError> {
    let content = fs::read_to_string(index_path)?;
    let index: DocIndex = serde_yaml::from_str(&content)?;
    Ok(index)
}

/// ソースパスから関連設計書を検索する（ディレクトリ前方一致も対応）
pub fn find_docs_for_source(index: &DocIndex, source_path: &str) -> Vec<SourceIndexEntry> {
    let mut results: HashMap<String, SourceIndexEntry> = HashMap::new();

    for (indexed_path, entries) in &index.source_index {
        let matches = if indexed_path.ends_with('/') {
            // ディレクトリスコープ: 前方一致
            source_path.starts_with(indexed_path.as_str())
        } else {
            source_path == indexed_path.as_str()
        };

        if matches {
            for entry in entries {
                let existing = results.entry(entry.doc.clone()).or_insert_with(|| {
                    SourceIndexEntry {
                        doc: entry.doc.clone(),
                        sections: vec![],
                    }
                });
                for sec in &entry.sections {
                    if !existing.sections.contains(sec) {
                        existing.sections.push(sec.clone());
                    }
                }
            }
        }
    }

    results.into_values().collect()
}

/// インデックスの全ソースパスをリストアップする
pub fn all_source_paths(index: &DocIndex) -> Vec<&str> {
    index.source_index.keys().map(|s| s.as_str()).collect()
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const DOC_WITH_MAPPING: &str = r#"---
title: "エディタ設計"
doc_type: screen_design
version: "1.0.0"
status: current
mapping:
  sources:
    - path: "src/editor/"
      scope: directory
    - path: "src/commands/editor.rs"
      scope: file
---
# 本文
"#;

    #[test]
    fn test_build_index_and_find() {
        let tmpdir = tempdir().unwrap();
        std::fs::write(tmpdir.path().join("editor.md"), DOC_WITH_MAPPING).unwrap();

        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();

        // doc_index に含まれている
        assert!(!index.doc_index.is_empty());

        // source_index に src/editor/ が含まれる
        assert!(index.source_index.contains_key("src/editor/"));
        assert!(index.source_index.contains_key("src/commands/editor.rs"));
    }

    #[test]
    fn test_find_docs_for_source_directory_match() {
        let tmpdir = tempdir().unwrap();
        std::fs::write(tmpdir.path().join("editor.md"), DOC_WITH_MAPPING).unwrap();

        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();

        // ディレクトリ前方一致
        let results = find_docs_for_source(&index, "src/editor/state.rs");
        assert!(!results.is_empty(), "src/editor/ のディレクトリマッチが効いていない");
    }

    #[test]
    fn test_find_docs_for_source_exact_match() {
        let tmpdir = tempdir().unwrap();
        std::fs::write(tmpdir.path().join("editor.md"), DOC_WITH_MAPPING).unwrap();

        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();

        let results = find_docs_for_source(&index, "src/commands/editor.rs");
        assert!(!results.is_empty());
    }

    #[test]
    fn test_write_and_load_index() {
        let tmpdir = tempdir().unwrap();
        std::fs::write(tmpdir.path().join("editor.md"), DOC_WITH_MAPPING).unwrap();

        let index = build_index(tmpdir.path(), tmpdir.path()).unwrap();
        let out = tmpdir.path().join(".doc-map.yaml");
        write_index(&index, &out).unwrap();

        let loaded = load_index(&out).unwrap();
        assert_eq!(
            loaded.source_index.len(),
            index.source_index.len()
        );
    }
}
