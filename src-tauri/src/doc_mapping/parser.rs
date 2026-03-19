use std::fs;
use std::path::{Path, PathBuf};

use super::types::DocFrontmatter;
use thiserror::Error;
use walkdir::WalkDir;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("frontmatterが見つかりません: {0}")]
    NotFound(String),
    #[error("YAMLパースエラー: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("ファイル読み込みエラー: {0}")]
    Io(#[from] std::io::Error),
}

/// Markdown の先頭 `---` ブロックから YAML 文字列を抽出する
fn extract_yaml_block(content: &str) -> Option<&str> {
    let content = content.trim_start();
    if !content.starts_with("---") {
        return None;
    }
    // 1行目の `---` の後ろを探す
    let after_first = content.get(3..)?.trim_start_matches('\n').trim_start_matches('\r');
    // 次の `---` または `...` を終端として探す
    for end_marker in ["---", "..."] {
        if let Some(pos) = after_first.find(&format!("\n{}", end_marker)) {
            return Some(&after_first[..pos]);
        }
    }
    None
}

/// Markdown 文字列から frontmatter をパースする
pub fn parse_frontmatter(content: &str) -> Result<DocFrontmatter, ParseError> {
    let yaml = extract_yaml_block(content)
        .ok_or_else(|| ParseError::NotFound("frontmatter ブロックが存在しません".to_string()))?;
    let fm: DocFrontmatter = serde_yaml::from_str(yaml)?;
    Ok(fm)
}

/// ファイルパスから frontmatter をパースする
pub fn parse_doc_file(path: &Path) -> Result<DocFrontmatter, ParseError> {
    let content = fs::read_to_string(path)?;
    parse_frontmatter(&content)
}

/// docs ディレクトリ配下の全 .md ファイルをスキャンして frontmatter を収集する。
/// frontmatter がないファイルはスキップする。
pub fn scan_all_docs(docs_dir: &Path) -> Result<Vec<(PathBuf, DocFrontmatter)>, ParseError> {
    let mut results = Vec::new();
    for entry in WalkDir::new(docs_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        match parse_doc_file(path) {
            Ok(fm) => results.push((path.to_owned(), fm)),
            Err(ParseError::NotFound(_)) => {} // frontmatter なし → スキップ
            Err(e) => {
                tracing::warn!("frontmatter パース失敗 {}: {}", path.display(), e);
            }
        }
    }
    Ok(results)
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc_mapping::types::{DocStatus, DocType};

    const VALID_FM: &str = r#"---
title: "テスト設計書"
doc_type: screen_design
version: "1.0.0"
last_synced_commit: "abc1234"
status: current
tags: [test, rust]
mapping:
  sources:
    - path: "src/test.rs"
      scope: file
      description: "テストファイル"
---

# 本文
"#;

    const NO_FM: &str = "# frontmatter なし\n本文のみ。";

    const INCOMPLETE_FM: &str = "---\ntitle: タイトルのみ\n---\n# 本文";

    #[test]
    fn test_parse_valid_frontmatter() {
        let fm = parse_frontmatter(VALID_FM).expect("パース成功");
        assert_eq!(fm.title, "テスト設計書");
        assert_eq!(fm.doc_type, DocType::ScreenDesign);
        assert_eq!(fm.version, "1.0.0");
        assert_eq!(fm.last_synced_commit, Some("abc1234".to_string()));
        assert_eq!(fm.status, DocStatus::Current);
        let mapping = fm.mapping.expect("mapping あり");
        assert_eq!(mapping.sources.len(), 1);
        assert_eq!(mapping.sources[0].path, "src/test.rs");
    }

    #[test]
    fn test_parse_no_frontmatter() {
        let result = parse_frontmatter(NO_FM);
        assert!(matches!(result, Err(ParseError::NotFound(_))));
    }

    #[test]
    fn test_parse_incomplete_frontmatter() {
        // title しかない不完全な frontmatter は doc_type 等が必須フィールドなのでエラーになる
        let result = parse_frontmatter(INCOMPLETE_FM);
        assert!(result.is_err());
    }

    #[test]
    fn test_scan_all_docs_empty_dir() {
        let tmpdir = tempfile::tempdir().unwrap();
        let results = scan_all_docs(tmpdir.path()).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_scan_all_docs_with_files() {
        let tmpdir = tempfile::tempdir().unwrap();
        std::fs::write(tmpdir.path().join("a.md"), VALID_FM).unwrap();
        std::fs::write(tmpdir.path().join("b.md"), NO_FM).unwrap();

        let results = scan_all_docs(tmpdir.path()).unwrap();
        // b.md は frontmatter なしでスキップされる
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].1.title, "テスト設計書");
    }
}
