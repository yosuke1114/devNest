use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// DB から読み込むコンフリクトファイルのメタデータ
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ConflictFileRow {
    pub id: i64,
    pub project_id: i64,
    pub file_path: String,
    pub is_managed: bool,
    pub resolution: Option<String>,
    pub resolved_at: Option<String>,
    pub created_at: String,
}

/// フロントエンドに返すコンフリクトファイル（ブロック情報を含む）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictFile {
    pub id: i64,
    pub project_id: i64,
    pub file_path: String,
    pub is_managed: bool,
    pub resolution: Option<String>,
    pub resolved_at: Option<String>,
    pub blocks: Vec<ConflictBlock>,
}

/// 1 コンフリクトブロック（`<<<<<<<` ～ `>>>>>>>` の間）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictBlock {
    pub index: usize,
    pub ours: String,
    pub theirs: String,
}

/// フロントエンドから受け取る解消指示
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockResolutionInput {
    pub block_index: usize,
    pub resolution: String, // "ours" | "theirs" | "manual"
    pub manual_content: Option<String>,
}

/// conflict_scan の結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictScanResult {
    pub managed: Vec<ConflictFile>,
    pub unmanaged_count: usize,
}

/// conflict_resolve_all の結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveAllResult {
    pub commit_sha: String,
    pub resolved_files: usize,
}

/// conflict マーカーをパースして ConflictBlock のリストを返す
pub fn parse_conflict_blocks(content: &str) -> Vec<ConflictBlock> {
    let mut blocks = Vec::new();
    let mut ours_lines: Vec<&str> = Vec::new();
    let mut theirs_lines: Vec<&str> = Vec::new();
    let mut state = ParseState::Normal;
    let mut index = 0usize;

    for line in content.lines() {
        match state {
            ParseState::Normal => {
                if line.starts_with("<<<<<<<") {
                    state = ParseState::Ours;
                    ours_lines.clear();
                }
            }
            ParseState::Ours => {
                if line.starts_with("=======") {
                    state = ParseState::Theirs;
                    theirs_lines.clear();
                } else {
                    ours_lines.push(line);
                }
            }
            ParseState::Theirs => {
                if line.starts_with(">>>>>>>") {
                    blocks.push(ConflictBlock {
                        index,
                        ours: ours_lines.join("\n"),
                        theirs: theirs_lines.join("\n"),
                    });
                    index += 1;
                    state = ParseState::Normal;
                } else {
                    theirs_lines.push(line);
                }
            }
        }
    }

    blocks
}

/// コンフリクトブロックに解消内容を適用して解消済みコンテンツを返す
pub fn apply_resolutions(
    content: &str,
    resolutions: &[BlockResolutionInput],
) -> Result<String, String> {
    let mut output = String::new();
    let mut state = ParseState::Normal;
    let mut block_index = 0usize;
    let mut ours_lines: Vec<String> = Vec::new();
    let mut theirs_lines: Vec<String> = Vec::new();

    for line in content.lines() {
        match state {
            ParseState::Normal => {
                if line.starts_with("<<<<<<<") {
                    state = ParseState::Ours;
                    ours_lines.clear();
                } else {
                    if !output.is_empty() {
                        output.push('\n');
                    }
                    output.push_str(line);
                }
            }
            ParseState::Ours => {
                if line.starts_with("=======") {
                    state = ParseState::Theirs;
                    theirs_lines.clear();
                } else {
                    ours_lines.push(line.to_string());
                }
            }
            ParseState::Theirs => {
                if line.starts_with(">>>>>>>") {
                    let res = resolutions
                        .iter()
                        .find(|r| r.block_index == block_index)
                        .ok_or_else(|| format!("block {} に解消指示がありません", block_index))?;

                    let resolved = match res.resolution.as_str() {
                        "ours" => ours_lines.join("\n"),
                        "theirs" => theirs_lines.join("\n"),
                        "manual" => res
                            .manual_content
                            .clone()
                            .unwrap_or_else(|| ours_lines.join("\n")),
                        other => return Err(format!("不明な resolution: {}", other)),
                    };

                    if !output.is_empty() {
                        output.push('\n');
                    }
                    output.push_str(&resolved);
                    block_index += 1;
                    state = ParseState::Normal;
                } else {
                    theirs_lines.push(line.to_string());
                }
            }
        }
    }

    Ok(output)
}

#[derive(PartialEq)]
enum ParseState {
    Normal,
    Ours,
    Theirs,
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFLICT_CONTENT: &str = "\
# Architecture

<<<<<<< HEAD
debounce: 1 second.
Retry: 3 times.
=======
debounce: 500ms.
Retry: not implemented.
>>>>>>> feature/fast

## Summary
";

    // Red: parse_conflict_blocks が正しいブロック数を返すこと
    #[test]
    fn test_parse_conflict_blocks_count() {
        let blocks = parse_conflict_blocks(CONFLICT_CONTENT);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].index, 0);
        assert!(blocks[0].ours.contains("1 second"));
        assert!(blocks[0].theirs.contains("500ms"));
    }

    // Red: parse_conflict_blocks が複数ブロックを処理できること
    #[test]
    fn test_parse_multiple_blocks() {
        let content = "\
<<<<<<< HEAD
ours1
=======
theirs1
>>>>>>> b
<<<<<<< HEAD
ours2
=======
theirs2
>>>>>>> b";
        let blocks = parse_conflict_blocks(content);
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[1].index, 1);
    }

    // Red: apply_resolutions の 'ours' 選択
    #[test]
    fn test_apply_ours() {
        let res = vec![BlockResolutionInput {
            block_index: 0,
            resolution: "ours".to_string(),
            manual_content: None,
        }];
        let result = apply_resolutions(CONFLICT_CONTENT, &res).unwrap();
        assert!(result.contains("1 second"));
        assert!(!result.contains("<<<<<<"));
        assert!(!result.contains("500ms"));
    }

    // Red: apply_resolutions の 'theirs' 選択
    #[test]
    fn test_apply_theirs() {
        let res = vec![BlockResolutionInput {
            block_index: 0,
            resolution: "theirs".to_string(),
            manual_content: None,
        }];
        let result = apply_resolutions(CONFLICT_CONTENT, &res).unwrap();
        assert!(result.contains("500ms"));
        assert!(!result.contains("1 second"));
    }

    // Red: apply_resolutions の 'manual' 選択
    #[test]
    fn test_apply_manual() {
        let res = vec![BlockResolutionInput {
            block_index: 0,
            resolution: "manual".to_string(),
            manual_content: Some("debounce: 750ms.".to_string()),
        }];
        let result = apply_resolutions(CONFLICT_CONTENT, &res).unwrap();
        assert!(result.contains("750ms"));
    }

    // Red: 解消指示なしはエラーを返すこと
    #[test]
    fn test_missing_resolution_returns_error() {
        let result = apply_resolutions(CONFLICT_CONTENT, &[]);
        assert!(result.is_err());
    }
}
