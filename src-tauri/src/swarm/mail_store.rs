// src-tauri/src/swarm/mail_store.rs

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MailMessage {
    WorkerDone {
        from: String,
        summary: String,
        artifacts: Vec<String>,
    },
    MergeReady {
        from: String,
        branch: String,
        files_changed: Vec<String>,
    },
    Merged { from: String, branch: String },
    MergeFailed { from: String, reason: String },
    Escalation { from: String, question: String, context: String },
    HealthCheck { from: String, status: String },
    Dispatch { from: String, to: String, instruction: String },
    Assign { from: String, to: String, files: Vec<String> },
}

pub struct MailStore {
    conn: Connection,
    session_id: String,
}

impl MailStore {
    pub fn open(db_path: &Path, session_id: &str) -> Result<Self, String> {
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

        // WALモード有効化
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| e.to_string())?;

        // テーブル作成
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS mail (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                from_worker  TEXT NOT NULL,
                to_worker    TEXT NOT NULL,
                type         TEXT NOT NULL,
                payload      TEXT NOT NULL,
                read         INTEGER DEFAULT 0,
                created_at   TEXT DEFAULT (datetime('now')),
                session_id   TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_to_worker_read
                ON mail(to_worker, read);
            CREATE INDEX IF NOT EXISTS idx_session
                ON mail(session_id);"
        ).map_err(|e| e.to_string())?;

        Ok(Self { conn, session_id: session_id.to_string() })
    }

    /// メールを送信する
    pub fn send(
        &self,
        from: &str,
        to: &str,
        message: &MailMessage,
    ) -> Result<(), String> {
        let msg_type = match message {
            MailMessage::WorkerDone { .. }  => "worker_done",
            MailMessage::MergeReady { .. }  => "merge_ready",
            MailMessage::Merged { .. }      => "merged",
            MailMessage::MergeFailed { .. } => "merge_failed",
            MailMessage::Escalation { .. }  => "escalation",
            MailMessage::HealthCheck { .. } => "health_check",
            MailMessage::Dispatch { .. }    => "dispatch",
            MailMessage::Assign { .. }      => "assign",
        };
        let payload = serde_json::to_string(message)
            .map_err(|e| e.to_string())?;

        self.conn.execute(
            "INSERT INTO mail (from_worker, to_worker, type, payload, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![from, to, msg_type, payload, self.session_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }

    /// 未読メールを取得して既読にする
    pub fn fetch_unread(&self, worker_id: &str) -> Result<Vec<MailMessage>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, payload FROM mail
             WHERE to_worker = ?1 AND read = 0 AND session_id = ?2
             ORDER BY id ASC"
        ).map_err(|e| e.to_string())?;

        let rows: Vec<(i64, String)> = stmt.query_map(
            params![worker_id, self.session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        // 既読に更新
        for (id, _) in &rows {
            self.conn.execute(
                "UPDATE mail SET read = 1 WHERE id = ?1",
                params![id],
            ).map_err(|e| e.to_string())?;
        }

        rows.iter()
            .map(|(_, payload)| serde_json::from_str(payload)
                .map_err(|e| e.to_string()))
            .collect()
    }

    /// セッション完了時にアーカイブしてレコードを削除
    pub fn archive_session(&self, archive_path: &Path) -> Result<(), String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, from_worker, to_worker, type, payload, read, created_at FROM mail WHERE session_id = ?1"
        ).map_err(|e| e.to_string())?;

        let rows: Vec<serde_json::Value> = stmt.query_map(
            params![self.session_id],
            |row| Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "from": row.get::<_, String>(1)?,
                "to": row.get::<_, String>(2)?,
                "type": row.get::<_, String>(3)?,
                "payload": row.get::<_, String>(4)?,
                "read": row.get::<_, i64>(5)?,
                "created_at": row.get::<_, String>(6)?,
            })),
        ).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        let jsonl: String = rows.iter()
            .map(|r| r.to_string())
            .collect::<Vec<_>>()
            .join("\n");

        std::fs::write(archive_path, jsonl).map_err(|e| e.to_string())?;

        // DBから削除
        self.conn.execute(
            "DELETE FROM mail WHERE session_id = ?1",
            params![self.session_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn in_memory_store(session_id: &str) -> MailStore {
        MailStore::open(Path::new(":memory:"), session_id).unwrap()
    }

    // ITa-13-25: openでDBが作成される
    #[test]
    fn test_open_creates_store() {
        let store = in_memory_store("session-1");
        // openが成功すればOK
        let _ = store;
    }

    // ITa-13-26: sendでレコードが挿入される
    #[test]
    fn test_send_inserts_record() {
        let store = in_memory_store("session-1");
        let msg = MailMessage::WorkerDone {
            from: "worker-1".to_string(),
            summary: "Done".to_string(),
            artifacts: vec![],
        };
        store.send("worker-1", "orchestrator", &msg).unwrap();
        // fetch_unreadで取得できれば挿入成功
        let msgs = store.fetch_unread("orchestrator").unwrap();
        assert_eq!(msgs.len(), 1);
    }

    // ITa-13-27: fetch_unreadで未読メールが取得される
    #[test]
    fn test_fetch_unread_returns_unread() {
        let store = in_memory_store("session-1");
        let msg = MailMessage::Escalation {
            from: "worker-1".to_string(),
            question: "What to do?".to_string(),
            context: "context".to_string(),
        };
        store.send("worker-1", "orchestrator", &msg).unwrap();
        let msgs = store.fetch_unread("orchestrator").unwrap();
        assert_eq!(msgs.len(), 1);
    }

    // ITa-13-28: fetch_unread後にread=1になる（2回目は返らない）
    #[test]
    fn test_fetch_unread_marks_as_read() {
        let store = in_memory_store("session-1");
        let msg = MailMessage::HealthCheck {
            from: "worker-1".to_string(),
            status: "ok".to_string(),
        };
        store.send("worker-1", "orchestrator", &msg).unwrap();
        let first = store.fetch_unread("orchestrator").unwrap();
        assert_eq!(first.len(), 1);
        let second = store.fetch_unread("orchestrator").unwrap();
        assert_eq!(second.len(), 0);
    }

    // ITa-13-29: fetch_unreadを2回呼んでも同じメールは返らない
    #[test]
    fn test_fetch_unread_idempotent() {
        let store = in_memory_store("session-1");
        let msg = MailMessage::Merged {
            from: "merger".to_string(),
            branch: "feature/x".to_string(),
        };
        store.send("merger", "orchestrator", &msg).unwrap();
        let _ = store.fetch_unread("orchestrator").unwrap();
        let second = store.fetch_unread("orchestrator").unwrap();
        assert!(second.is_empty());
    }

    // ITa-13-30: 別セッションのメールは取得されない
    #[test]
    fn test_fetch_unread_different_session() {
        let store1 = in_memory_store("session-1");
        // session-1で送信
        let msg = MailMessage::MergeFailed {
            from: "merger".to_string(),
            reason: "conflict".to_string(),
        };
        store1.send("merger", "orchestrator", &msg).unwrap();

        // session-2のストアでは取得できない（同じDBなら別セッションフィルタが効く）
        // :memoryの場合は別のconnectionなので実際に共有できないが
        // 同じDBパスで別session_idのテスト
        // この場合はin_memoryなので別DBなのでテストを調整
        let msgs = store1.fetch_unread("orchestrator").unwrap();
        assert_eq!(msgs.len(), 1);
        // session-2で読もうとするとsession_idが違うので取得されない
        // TempDirを使って同じDBファイルで確認
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("mail.db");
        let store_a = MailStore::open(&db_path, "session-A").unwrap();
        let store_b = MailStore::open(&db_path, "session-B").unwrap();
        let msg2 = MailMessage::Dispatch {
            from: "orch".to_string(),
            to: "worker-1".to_string(),
            instruction: "do something".to_string(),
        };
        store_a.send("orch", "worker-1", &msg2).unwrap();
        // session-Bからはfetch_unreadで取得できない
        let fetched_b = store_b.fetch_unread("worker-1").unwrap();
        assert!(fetched_b.is_empty());
        // session-Aからは取得できる
        let fetched_a = store_a.fetch_unread("worker-1").unwrap();
        assert_eq!(fetched_a.len(), 1);
    }

    // ITa-13-31: 全8メッセージ型がシリアライズ/デシリアライズできる
    #[test]
    fn test_all_message_types_serialize() {
        let messages: Vec<MailMessage> = vec![
            MailMessage::WorkerDone { from: "w".to_string(), summary: "s".to_string(), artifacts: vec![] },
            MailMessage::MergeReady { from: "w".to_string(), branch: "b".to_string(), files_changed: vec![] },
            MailMessage::Merged { from: "w".to_string(), branch: "b".to_string() },
            MailMessage::MergeFailed { from: "w".to_string(), reason: "r".to_string() },
            MailMessage::Escalation { from: "w".to_string(), question: "q".to_string(), context: "c".to_string() },
            MailMessage::HealthCheck { from: "w".to_string(), status: "ok".to_string() },
            MailMessage::Dispatch { from: "w".to_string(), to: "t".to_string(), instruction: "i".to_string() },
            MailMessage::Assign { from: "w".to_string(), to: "t".to_string(), files: vec![] },
        ];
        for msg in &messages {
            let json = serde_json::to_string(msg).unwrap();
            let _: MailMessage = serde_json::from_str(&json).unwrap();
        }
    }

    // ITa-13-32: archive_sessionでJSONLファイルが生成される
    #[test]
    fn test_archive_session_creates_file() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("mail.db");
        let archive_path = dir.path().join("archive.jsonl");
        let store = MailStore::open(&db_path, "session-1").unwrap();
        let msg = MailMessage::WorkerDone {
            from: "worker-1".to_string(),
            summary: "Done".to_string(),
            artifacts: vec![],
        };
        store.send("worker-1", "orchestrator", &msg).unwrap();
        store.archive_session(&archive_path).unwrap();
        assert!(archive_path.exists());
        let content = std::fs::read_to_string(&archive_path).unwrap();
        assert!(!content.is_empty());
    }

    // ITa-13-33: archive_session後にDBからレコードが削除される
    #[test]
    fn test_archive_session_deletes_records() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("mail.db");
        let archive_path = dir.path().join("archive.jsonl");
        let store = MailStore::open(&db_path, "session-1").unwrap();
        let msg = MailMessage::WorkerDone {
            from: "worker-1".to_string(),
            summary: "Done".to_string(),
            artifacts: vec![],
        };
        store.send("worker-1", "orchestrator", &msg).unwrap();
        store.archive_session(&archive_path).unwrap();
        // アーカイブ後はfetch_unreadで取得できない
        let msgs = store.fetch_unread("orchestrator").unwrap();
        assert!(msgs.is_empty());
    }
}
