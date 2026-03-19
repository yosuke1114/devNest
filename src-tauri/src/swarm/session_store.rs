// src-tauri/src/swarm/session_store.rs

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionWorker {
    pub worker_id: String,
    pub role: String,
    pub subtask_id: u32,
    pub status: String,
    pub branch: String,
    pub has_commits: bool,
}

pub struct SessionStore {
    conn: Connection,
}

impl SessionStore {
    pub fn open(db_path: &Path) -> Result<Self, String> {
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS sessions (
                id                TEXT PRIMARY KEY,
                task_input        TEXT,
                status            TEXT DEFAULT 'running',
                created_at        TEXT DEFAULT (datetime('now')),
                last_heartbeat_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS session_workers (
                session_id    TEXT,
                worker_id     TEXT,
                role          TEXT,
                subtask_id    INTEGER,
                status        TEXT DEFAULT 'waiting',
                branch        TEXT,
                has_commits   INTEGER DEFAULT 0,
                started_at    TEXT,
                completed_at  TEXT,
                PRIMARY KEY (session_id, worker_id)
            );"
        ).map_err(|e| e.to_string())?;
        Ok(Self { conn })
    }

    /// セッションを作成する
    pub fn create_session(&self, session_id: &str, task_input: &str) -> Result<(), String> {
        self.conn.execute(
            "INSERT INTO sessions (id, task_input) VALUES (?1, ?2)",
            params![session_id, task_input],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// ハートビートを更新（Watchdogの30秒ポーリングと連動）
    pub fn update_heartbeat(&self, session_id: &str) -> Result<(), String> {
        self.conn.execute(
            "UPDATE sessions SET last_heartbeat_at = datetime('now')
             WHERE id = ?1",
            params![session_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// クラッシュしたセッションを検出（5分以上古いハートビート）
    pub fn find_crashed_sessions(&self) -> Result<Vec<String>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM sessions
             WHERE status = 'running'
             AND last_heartbeat_at < datetime('now', '-5 minutes')"
        ).map_err(|e| e.to_string())?;

        let ids: Vec<String> = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ids)
    }

    /// セッションのステータスを更新する
    pub fn update_session_status(&self, session_id: &str, status: &str) -> Result<(), String> {
        self.conn.execute(
            "UPDATE sessions SET status = ?1 WHERE id = ?2",
            params![status, session_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// 再開時のブランチ判断（コミット有無で切り替え）
    pub fn determine_resume_branch(
        &self,
        worker: &SessionWorker,
        repo_path: &Path,
    ) -> ResumeBranch {
        let has_commits = std::process::Command::new("git")
            .args(["log", &worker.branch, "^HEAD", "--oneline"])
            .current_dir(repo_path)
            .output()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);

        if has_commits {
            ResumeBranch::Existing(worker.branch.clone())
        } else {
            ResumeBranch::New(format!("{}-retry", worker.branch))
        }
    }
}

pub enum ResumeBranch {
    Existing(String),
    New(String),
}
