// src-tauri/src/swarm/knowledge_store.rs

use crate::services::anthropic::AnthropicClient;
use chrono::{NaiveDate, Utc};
use std::fmt;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, serde::Deserialize)]
pub enum KnowledgeCategory {
    ErrorPattern,
    ProjectConstraint,
    TemporaryNote,
}

impl fmt::Display for KnowledgeCategory {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            KnowledgeCategory::ErrorPattern => write!(f, "Error Pattern"),
            KnowledgeCategory::ProjectConstraint => write!(f, "Project Constraint"),
            KnowledgeCategory::TemporaryNote => write!(f, "Temporary Note"),
        }
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct KnowledgeEntry {
    pub category: KnowledgeCategory,
    pub content: String,
    #[serde(default = "default_created_at")]
    pub created_at: String,
    pub expires_at: Option<String>,
    #[serde(default = "default_occurrence_count")]
    pub occurrence_count: u32,
}

fn default_created_at() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

fn default_occurrence_count() -> u32 {
    1
}

pub struct KnowledgeStore {
    knowledge_path: std::path::PathBuf,
}

impl KnowledgeStore {
    pub fn new(project_root: &Path) -> Self {
        Self {
            knowledge_path: project_root.join(".devnest/knowledge.md"),
        }
    }

    /// セッション完了時にClaude APIで知識を抽出して追記
    pub async fn extract_and_append(
        &self,
        session_log: &str,
        api_key: &str,
    ) -> Result<(), String> {
        let extracted = self.call_extraction_api(session_log, api_key).await?;
        if extracted.is_empty() {
            return Ok(());
        }
        self.append_entries(&extracted)?;
        Ok(())
    }

    /// Worker起動時に関連知識を取得
    pub fn get_relevant_knowledge(&self, _task: &str) -> String {
        let content = fs::read_to_string(&self.knowledge_path).unwrap_or_default();
        if content.is_empty() {
            String::new()
        } else {
            format!("\n\n# このプロジェクトの注意事項\n{}", content)
        }
    }

    /// 期限切れの一時メモを削除
    pub fn purge_expired(&self) -> Result<u32, String> {
        let content = match fs::read_to_string(&self.knowledge_path) {
            Ok(c) if !c.is_empty() => c,
            _ => return Ok(0),
        };

        let today = Utc::now().date_naive();
        let mut purged_count: u32 = 0;
        let mut output_lines: Vec<&str> = Vec::new();
        let mut skip_until_next_entry = false;

        for line in content.lines() {
            // Detect entry header: "- **[category]** ..."
            if line.starts_with("- **") {
                // Check for expires_at marker
                if let Some(expires_str) = extract_expires(line) {
                    if let Ok(expires_date) = NaiveDate::parse_from_str(expires_str, "%Y-%m-%d") {
                        if expires_date < today {
                            purged_count += 1;
                            skip_until_next_entry = true;
                            continue;
                        }
                    }
                }
                skip_until_next_entry = false;
                output_lines.push(line);
            } else if skip_until_next_entry {
                // Skip continuation lines of expired entry
                if line.starts_with("  ") || line.is_empty() {
                    continue;
                }
                // Non-indented, non-empty line = section header or new section
                skip_until_next_entry = false;
                output_lines.push(line);
            } else {
                output_lines.push(line);
            }
        }

        if purged_count > 0 {
            let new_content = output_lines.join("\n");
            fs::write(&self.knowledge_path, new_content)
                .map_err(|e| format!("Failed to write knowledge file: {}", e))?;
        }

        Ok(purged_count)
    }

    async fn call_extraction_api(
        &self,
        session_log: &str,
        api_key: &str,
    ) -> Result<Vec<KnowledgeEntry>, String> {
        // Truncate very long logs to stay within token limits
        let truncated_log = if session_log.len() > 50_000 {
            &session_log[session_log.len() - 50_000..]
        } else {
            session_log
        };

        let client = AnthropicClient::new(api_key);

        let system_prompt = r#"You are a knowledge extraction assistant for a development project.
Analyze the given session log and extract reusable knowledge entries.

Return a JSON array of knowledge entries. Each entry has:
- "category": one of "ErrorPattern", "ProjectConstraint", "TemporaryNote"
- "content": a concise, actionable description (1-2 sentences)
- "expires_at": null for permanent knowledge, or "YYYY-MM-DD" for temporary notes (set 30 days from now)

Categories:
- ErrorPattern: Errors encountered and their solutions (e.g., "sqlx compile error when X → fix by Y")
- ProjectConstraint: Project rules or constraints discovered (e.g., "Must use connect_for_test in DB tests")
- TemporaryNote: Context-specific notes that may expire (e.g., "Branch X has WIP changes for feature Y")

Rules:
- Only extract genuinely useful, reusable knowledge
- Skip trivial or obvious information
- If nothing useful is found, return an empty array []
- Maximum 5 entries per session
- Write content in the same language as the session log

Return ONLY the JSON array, no other text."#;

        let user_message = format!("Session log:\n\n{}", truncated_log);

        let response = client
            .complete(system_prompt, &user_message)
            .await
            .map_err(|e| format!("Knowledge extraction API error: {}", e))?;

        // Parse JSON response
        let trimmed = response.trim();
        // Handle markdown code blocks wrapping
        let json_str = if trimmed.starts_with("```") {
            trimmed
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim()
        } else {
            trimmed
        };

        let entries: Vec<KnowledgeEntry> = serde_json::from_str(json_str)
            .map_err(|e| format!("Failed to parse knowledge entries: {} — raw: {}", e, json_str))?;

        Ok(entries)
    }

    fn append_entries(&self, entries: &[KnowledgeEntry]) -> Result<(), String> {
        // Ensure parent directory exists
        if let Some(parent) = self.knowledge_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create .devnest directory: {}", e))?;
        }

        let existing = fs::read_to_string(&self.knowledge_path).unwrap_or_default();

        let mut new_content = if existing.is_empty() {
            "# Knowledge Base\n\n".to_string()
        } else {
            existing
        };

        // Group entries by category and append under appropriate section
        for entry in entries {
            let section_header = format!("## {}\n", entry.category);

            // Add section header if it doesn't exist
            if !new_content.contains(&section_header) {
                new_content.push_str(&format!("\n{}\n", section_header));
            }

            // Build entry line
            let expires_suffix = match &entry.expires_at {
                Some(date) => format!(" _(expires: {})_", date),
                None => String::new(),
            };
            let entry_line = format!(
                "- **[{}]** {}{}\n",
                entry.created_at, entry.content, expires_suffix
            );

            // Check for duplicate content
            if new_content.contains(&entry.content) {
                // Update occurrence: find the line and note it
                continue;
            }

            // Insert entry after the section header
            if let Some(pos) = new_content.find(&section_header) {
                let insert_pos = pos + section_header.len();
                new_content.insert_str(insert_pos, &entry_line);
            }
        }

        fs::write(&self.knowledge_path, new_content)
            .map_err(|e| format!("Failed to write knowledge file: {}", e))?;

        Ok(())
    }
}

/// Extract expires date string from a knowledge entry line
/// Format: "_(expires: YYYY-MM-DD)_"
fn extract_expires(line: &str) -> Option<&str> {
    let marker = "_(expires: ";
    let start = line.find(marker)? + marker.len();
    let end = line[start..].find(")_")? + start;
    Some(&line[start..end])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup() -> (TempDir, KnowledgeStore) {
        let tmp = TempDir::new().unwrap();
        let store = KnowledgeStore::new(tmp.path());
        // Create .devnest directory
        fs::create_dir_all(tmp.path().join(".devnest")).unwrap();
        (tmp, store)
    }

    #[test]
    fn test_get_relevant_knowledge_empty() {
        let (_tmp, store) = setup();
        let result = store.get_relevant_knowledge("some task");
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_relevant_knowledge_with_content() {
        let (tmp, store) = setup();
        let knowledge_path = tmp.path().join(".devnest/knowledge.md");
        fs::write(&knowledge_path, "## Error Pattern\n- Fix X by Y\n").unwrap();

        let result = store.get_relevant_knowledge("some task");
        assert!(result.contains("このプロジェクトの注意事項"));
        assert!(result.contains("Fix X by Y"));
    }

    #[test]
    fn test_append_entries() {
        let (_tmp, store) = setup();

        let entries = vec![
            KnowledgeEntry {
                category: KnowledgeCategory::ErrorPattern,
                content: "Use connect_for_test for DB tests".to_string(),
                created_at: "2026-03-22".to_string(),
                expires_at: None,
                occurrence_count: 1,
            },
            KnowledgeEntry {
                category: KnowledgeCategory::TemporaryNote,
                content: "Branch X has WIP changes".to_string(),
                created_at: "2026-03-22".to_string(),
                expires_at: Some("2026-04-21".to_string()),
                occurrence_count: 1,
            },
        ];

        store.append_entries(&entries).unwrap();

        let content = fs::read_to_string(&store.knowledge_path).unwrap();
        assert!(content.contains("# Knowledge Base"));
        assert!(content.contains("## Error Pattern"));
        assert!(content.contains("Use connect_for_test for DB tests"));
        assert!(content.contains("## Temporary Note"));
        assert!(content.contains("Branch X has WIP changes"));
        assert!(content.contains("_(expires: 2026-04-21)_"));
    }

    #[test]
    fn test_append_entries_no_duplicates() {
        let (_tmp, store) = setup();

        let entries = vec![KnowledgeEntry {
            category: KnowledgeCategory::ErrorPattern,
            content: "Unique knowledge".to_string(),
            created_at: "2026-03-22".to_string(),
            expires_at: None,
            occurrence_count: 1,
        }];

        store.append_entries(&entries).unwrap();
        store.append_entries(&entries).unwrap(); // Append same entries again

        let content = fs::read_to_string(&store.knowledge_path).unwrap();
        let count = content.matches("Unique knowledge").count();
        assert_eq!(count, 1, "Duplicate entries should not be added");
    }

    #[test]
    fn test_purge_expired() {
        let (tmp, store) = setup();
        let knowledge_path = tmp.path().join(".devnest/knowledge.md");

        // Write content with an expired entry and a valid entry
        let content = "# Knowledge Base\n\n## Temporary Note\n\
            - **[2026-01-01]** Old expired note _(expires: 2026-01-15)_\n\
            - **[2026-03-22]** Still valid note _(expires: 2027-12-31)_\n\
            \n## Error Pattern\n\
            - **[2026-03-22]** Permanent error pattern\n";
        fs::write(&knowledge_path, content).unwrap();

        let purged = store.purge_expired().unwrap();
        assert_eq!(purged, 1);

        let updated = fs::read_to_string(&knowledge_path).unwrap();
        assert!(!updated.contains("Old expired note"));
        assert!(updated.contains("Still valid note"));
        assert!(updated.contains("Permanent error pattern"));
    }

    #[test]
    fn test_purge_expired_no_file() {
        let (_tmp, store) = setup();
        let purged = store.purge_expired().unwrap();
        assert_eq!(purged, 0);
    }

    #[test]
    fn test_extract_expires() {
        assert_eq!(
            extract_expires("- **[2026-03-22]** Some note _(expires: 2026-04-21)_"),
            Some("2026-04-21")
        );
        assert_eq!(
            extract_expires("- **[2026-03-22]** No expiry"),
            None
        );
    }
}
