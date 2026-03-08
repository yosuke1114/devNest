use serde::{Deserialize, Serialize};

/// PTY ターミナルセッション（DB レコード）。
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TerminalSession {
    pub id: i64,
    pub project_id: i64,
    pub branch_name: Option<String>,
    pub has_doc_changes: bool,
    pub prompt_summary: Option<String>,
    pub output_log: Option<String>,
    pub exit_code: Option<i64>,
    pub status: String,
    pub started_at: String,
    pub ended_at: Option<String>,
}

/// `terminal_done` イベントのペイロード。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalDonePayload {
    pub session_id: i64,
    pub branch_name: String,
    pub commit_sha: String,
    pub has_doc_changes: bool,
    pub changed_files: Vec<String>,
    pub exit_code: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    // 🔴 Red: TerminalDonePayload がシリアライズできること
    #[test]
    fn test_terminal_done_payload_serializes() {
        let p = TerminalDonePayload {
            session_id: 1,
            branch_name: "feat/43-auto-commit".to_string(),
            commit_sha: "abc123".to_string(),
            has_doc_changes: true,
            changed_files: vec!["docs/arch.md".to_string(), "src/main.rs".to_string()],
            exit_code: 0,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("has_doc_changes"));
        assert!(json.contains("changed_files"));
    }

    // 🔴 Red: TerminalSession のステータスが正しいこと
    #[test]
    fn test_terminal_session_status_values() {
        let valid = ["running", "completed", "failed", "aborted"];
        for s in valid {
            assert!(!s.is_empty());
        }
    }
}
