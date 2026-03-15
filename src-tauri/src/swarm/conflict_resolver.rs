/// ConflictResolver — git マージコンフリクトのパース・解決
use std::path::Path;
use std::process::Command;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictBlock {
    pub file_path: String,
    /// <<<<<<< HEAD 側（ours / base branch）
    pub ours: String,
    /// >>>>>>> branch 側（theirs / worker branch）
    pub theirs: String,
    /// コンフリクトより前の文脈（最大5行）
    pub context_before: String,
    /// コンフリクト開始行番号（1-indexed）
    pub start_line: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictResolution {
    TakeOurs,
    TakeTheirs,
    TakeBoth,
    Manual(String),
}

/// ファイル内のコンフリクトマーカーを全てパースして返す
pub fn parse_conflict_blocks(file_path: &Path) -> Vec<ConflictBlock> {
    let content = match std::fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    parse_conflict_content(&content, file_path.to_string_lossy().as_ref())
}

fn parse_conflict_content(content: &str, file_path: &str) -> Vec<ConflictBlock> {
    let mut blocks = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    let mut i = 0;
    while i < lines.len() {
        if lines[i].starts_with("<<<<<<<") {
            let start_line = i + 1;
            let mut ours_lines = Vec::new();
            let mut theirs_lines = Vec::new();
            let mut in_ours = true;

            // context_before: 最大5行前まで
            let ctx_start = i.saturating_sub(5);
            let context_before = lines[ctx_start..i].join("\n");

            i += 1;
            while i < lines.len() {
                if lines[i].starts_with("=======") {
                    in_ours = false;
                } else if lines[i].starts_with(">>>>>>>") {
                    break;
                } else if in_ours {
                    ours_lines.push(lines[i]);
                } else {
                    theirs_lines.push(lines[i]);
                }
                i += 1;
            }

            blocks.push(ConflictBlock {
                file_path: file_path.to_string(),
                ours: ours_lines.join("\n"),
                theirs: theirs_lines.join("\n"),
                context_before,
                start_line: start_line as u32,
            });
        }
        i += 1;
    }
    blocks
}

/// コンフリクトを解決してファイルを上書き保存する
pub fn resolve_conflict_block(
    file_path: &Path,
    start_line: u32,
    resolution: ConflictResolution,
) -> Result<(), String> {
    let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let resolved = apply_resolution(&content, start_line, resolution)?;
    std::fs::write(file_path, resolved).map_err(|e| e.to_string())
}

fn apply_resolution(
    content: &str,
    target_start_line: u32,
    resolution: ConflictResolution,
) -> Result<String, String> {
    let lines: Vec<&str> = content.lines().collect();
    let mut result = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        if lines[i].starts_with("<<<<<<<") && (i + 1) as u32 == target_start_line {
            // このコンフリクトブロックを解決
            let mut ours_lines = Vec::new();
            let mut theirs_lines = Vec::new();
            let mut in_ours = true;

            i += 1;
            while i < lines.len() {
                if lines[i].starts_with("=======") {
                    in_ours = false;
                } else if lines[i].starts_with(">>>>>>>") {
                    i += 1;
                    break;
                } else if in_ours {
                    ours_lines.push(lines[i]);
                } else {
                    theirs_lines.push(lines[i]);
                }
                i += 1;
            }

            match &resolution {
                ConflictResolution::TakeOurs => {
                    result.extend(ours_lines);
                }
                ConflictResolution::TakeTheirs => {
                    result.extend(theirs_lines);
                }
                ConflictResolution::TakeBoth => {
                    result.extend(ours_lines);
                    result.extend(theirs_lines);
                }
                ConflictResolution::Manual(text) => {
                    result.push(text.as_str());
                }
            }
        } else {
            result.push(lines[i]);
            i += 1;
        }
    }

    Ok(result.join("\n"))
}

/// コンフリクト解決後に `git add` して `git commit` する
pub fn commit_conflict_resolution(
    repo_path: &Path,
    files: &[String],
    message: &str,
) -> Result<(), String> {
    // git add
    let mut add_cmd = Command::new("git");
    add_cmd.arg("add").args(files).current_dir(repo_path);
    let add_out = add_cmd.output().map_err(|e| e.to_string())?;
    if !add_out.status.success() {
        return Err(String::from_utf8_lossy(&add_out.stderr).into());
    }

    // git commit
    let commit_out = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(repo_path)
        .output()
        .map_err(|e| e.to_string())?;
    if !commit_out.status.success() {
        return Err(String::from_utf8_lossy(&commit_out.stderr).into());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_CONFLICT: &str = "\
line1
line2
<<<<<<< HEAD
ours content
=======
theirs content
>>>>>>> branch
line3";

    #[test]
    fn parses_single_conflict_block() {
        let blocks = parse_conflict_content(SAMPLE_CONFLICT, "test.rs");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].ours, "ours content");
        assert_eq!(blocks[0].theirs, "theirs content");
        assert_eq!(blocks[0].start_line, 3);
    }

    #[test]
    fn resolve_take_ours() {
        let resolved = apply_resolution(SAMPLE_CONFLICT, 3, ConflictResolution::TakeOurs).unwrap();
        assert!(resolved.contains("ours content"));
        assert!(!resolved.contains("theirs content"));
        assert!(!resolved.contains("<<<<<<<"));
    }

    #[test]
    fn resolve_take_theirs() {
        let resolved = apply_resolution(SAMPLE_CONFLICT, 3, ConflictResolution::TakeTheirs).unwrap();
        assert!(!resolved.contains("ours content"));
        assert!(resolved.contains("theirs content"));
    }

    #[test]
    fn resolve_take_both() {
        let resolved = apply_resolution(SAMPLE_CONFLICT, 3, ConflictResolution::TakeBoth).unwrap();
        assert!(resolved.contains("ours content"));
        assert!(resolved.contains("theirs content"));
    }

    #[test]
    fn resolve_manual() {
        let resolved = apply_resolution(
            SAMPLE_CONFLICT,
            3,
            ConflictResolution::Manual("manual content".to_string()),
        ).unwrap();
        assert!(resolved.contains("manual content"));
        assert!(!resolved.contains("<<<<<<<"));
    }

    #[test]
    fn no_blocks_in_clean_file() {
        let blocks = parse_conflict_content("no conflicts here\nclean content", "clean.rs");
        assert!(blocks.is_empty());
    }
}
