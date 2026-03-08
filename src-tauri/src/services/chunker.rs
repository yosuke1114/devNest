/// Markdown ドキュメントをセクション単位でチャンクに分割する。
/// `##`（level-2）見出しで区切り、最大 ~600 chars 程度を目安とする。

#[derive(Debug, Clone)]
pub struct Chunk {
    pub chunk_index: usize,
    pub section_heading: Option<String>,
    pub content: String,
    pub start_line: usize,
    pub end_line: usize,
}

/// Markdown コンテンツをチャンク配列に変換する。
pub fn chunk_document(content: &str) -> Vec<Chunk> {
    let mut chunks: Vec<Chunk> = Vec::new();
    let mut current_heading: Option<String> = None;
    let mut current_lines: Vec<&str> = Vec::new();
    let mut current_start: usize = 1;
    const MAX_CHARS: usize = 600;

    let lines: Vec<&str> = content.lines().collect();

    for (i, line) in lines.iter().enumerate() {
        let line_no = i + 1;
        let is_heading = line.starts_with("## ") || line.starts_with("# ");

        if is_heading {
            // 現在バッファを flush
            if !current_lines.is_empty() {
                flush_chunk(
                    &mut chunks,
                    &current_heading,
                    &current_lines,
                    current_start,
                    line_no - 1,
                    MAX_CHARS,
                );
                current_lines.clear();
            }
            current_heading = Some(line.to_string());
            current_start = line_no;
            current_lines.push(line);
        } else {
            current_lines.push(line);
        }
    }

    // 末尾 flush
    if !current_lines.is_empty() {
        flush_chunk(
            &mut chunks,
            &current_heading,
            &current_lines,
            current_start,
            lines.len(),
            MAX_CHARS,
        );
    }

    // chunk_index を振り直す
    for (i, c) in chunks.iter_mut().enumerate() {
        c.chunk_index = i;
    }

    chunks
}

/// バッファをチャンクに変換。MAX_CHARS を超える場合はさらに分割する。
fn flush_chunk(
    out: &mut Vec<Chunk>,
    heading: &Option<String>,
    lines: &[&str],
    start_line: usize,
    end_line: usize,
    max_chars: usize,
) {
    let full = lines.join("\n");
    if full.trim().is_empty() {
        return;
    }

    // chars が max_chars 以内なら 1 チャンク
    if full.len() <= max_chars {
        out.push(Chunk {
            chunk_index: 0,
            section_heading: heading.clone(),
            content: full,
            start_line,
            end_line,
        });
        return;
    }

    // 段落（空行）で分割してさらに細かくする
    let mut buf = String::new();
    let mut sub_start = start_line;
    let mut line_cursor = start_line;

    for line in lines {
        line_cursor += 1;
        if line.is_empty() && buf.len() >= max_chars {
            if !buf.trim().is_empty() {
                out.push(Chunk {
                    chunk_index: 0,
                    section_heading: heading.clone(),
                    content: buf.trim().to_string(),
                    start_line: sub_start,
                    end_line: line_cursor - 1,
                });
            }
            buf.clear();
            sub_start = line_cursor;
        } else {
            if !buf.is_empty() {
                buf.push('\n');
            }
            buf.push_str(line);
        }
    }
    if !buf.trim().is_empty() {
        out.push(Chunk {
            chunk_index: 0,
            section_heading: heading.clone(),
            content: buf.trim().to_string(),
            start_line: sub_start,
            end_line,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 🔴 Red: 空ドキュメントは 0 チャンクを返すこと
    #[test]
    fn test_empty_document_returns_no_chunks() {
        let chunks = chunk_document("");
        assert!(chunks.is_empty());
    }

    // 🔴 Red: 見出しなしドキュメントは 1 チャンクを返すこと
    #[test]
    fn test_no_heading_returns_one_chunk() {
        let md = "これはテキストです。\ngit2-rs を使います。";
        let chunks = chunk_document(md);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].content.contains("git2-rs"));
        assert_eq!(chunks[0].start_line, 1);
    }

    // 🔴 Red: ## 見出しで分割されること
    #[test]
    fn test_heading_splits_into_chunks() {
        let md = "## Section A\nContent A\n\n## Section B\nContent B";
        let chunks = chunk_document(md);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].section_heading.as_deref(), Some("## Section A"));
        assert_eq!(chunks[1].section_heading.as_deref(), Some("## Section B"));
    }

    // 🔴 Red: chunk_index が 0 から連番であること
    #[test]
    fn test_chunk_index_sequential() {
        let md = "## A\nfoo\n## B\nbar\n## C\nbaz";
        let chunks = chunk_document(md);
        for (i, c) in chunks.iter().enumerate() {
            assert_eq!(c.chunk_index, i);
        }
    }

    // 🔴 Red: start_line と end_line が正しいこと
    #[test]
    fn test_start_end_line() {
        let md = "## Intro\nLine 2\nLine 3";
        let chunks = chunk_document(md);
        assert_eq!(chunks[0].start_line, 1);
        assert_eq!(chunks[0].end_line, 3);
    }

    // 🔴 Red: 見出しがないとき section_heading は None になること
    #[test]
    fn test_no_heading_section_heading_is_none() {
        let md = "Some text without any heading.";
        let chunks = chunk_document(md);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].section_heading.is_none());
    }

    // 🔴 Red: 日本語見出しが正しく認識されること
    #[test]
    fn test_japanese_heading_recognized() {
        let md = "## アーキテクチャ\nこのドキュメントはシステム設計について説明します。";
        let chunks = chunk_document(md);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].section_heading.as_deref(), Some("## アーキテクチャ"));
        assert!(chunks[0].content.contains("アーキテクチャ"));
    }

    // 🔴 Red: 日本語と英語が混在するドキュメントが見出しで分割されること
    #[test]
    fn test_mixed_japanese_english_splits_by_heading() {
        let md = "## 概要\nOverview section.\n## 設計\nDesign details here.";
        let chunks = chunk_document(md);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].section_heading.as_deref(), Some("## 概要"));
        assert_eq!(chunks[1].section_heading.as_deref(), Some("## 設計"));
        assert!(chunks[0].content.contains("Overview"));
        assert!(chunks[1].content.contains("Design"));
    }

    // 🔴 Red: 大量の日本語テキストでもコンテンツが失われないこと
    // MAX_CHARS は byte 長で比較するため日本語では早めに超えるが、データは保持されること
    #[test]
    fn test_large_japanese_content_preserves_all_characters() {
        // 各文字 3 bytes × 220 文字 = 660 bytes (> MAX_CHARS=600)
        let jp_text = "あ".repeat(220);
        let md = format!("## テスト\n{}", jp_text);
        let chunks = chunk_document(&md);
        assert!(!chunks.is_empty());
        // 全 'あ' が保持されていること
        let all_content: String = chunks.iter().map(|c| c.content.as_str()).collect::<Vec<_>>().join(" ");
        let actual_count = all_content.chars().filter(|&c| c == 'あ').count();
        assert_eq!(actual_count, 220, "220 文字の 'あ' がすべて保持されること");
    }

    // 🔴 Red: # (level-1) 見出しも分割トリガーになること
    #[test]
    fn test_level1_heading_also_splits() {
        let md = "# Title\nIntro text.\n## Section\nSection content.";
        let chunks = chunk_document(md);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].section_heading.as_deref(), Some("# Title"));
        assert_eq!(chunks[1].section_heading.as_deref(), Some("## Section"));
    }
}
