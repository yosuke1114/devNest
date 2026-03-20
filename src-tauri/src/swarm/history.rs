/// Swarm 実行履歴の DB 操作
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::{AppError, Result};
use super::orchestrator::OrchestratorRun;
use super::worker::ExecutionState;

// ─── 型 ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResult {
    pub id: u32,
    pub title: String,
    pub role: String,
    pub execution_state: String,
    pub branch_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmRunRecord {
    pub id: i64,
    pub run_id: String,
    pub status: String,
    pub total_tasks: i64,
    pub done_count: i64,
    pub failed_count: i64,
    pub base_branch: String,
    pub project_path: String,
    pub tasks: Vec<TaskResult>,
    pub completed_at: String,
}

fn execution_state_str(s: &ExecutionState) -> &'static str {
    match s {
        ExecutionState::Waiting => "waiting",
        ExecutionState::Ready   => "ready",
        ExecutionState::Running => "running",
        ExecutionState::Done    => "done",
        ExecutionState::Error   => "error",
        ExecutionState::Skipped => "skipped",
    }
}

fn run_status_str(run: &OrchestratorRun) -> &'static str {
    use super::worker::RunStatus;
    match run.status {
        RunStatus::Done        => "done",
        RunStatus::PartialDone => "partialDone",
        RunStatus::Cancelled   => "cancelled",
        RunStatus::Running     => "done", // 念のためフォールバック
    }
}

// ─── DB 操作 ─────────────────────────────────────────────────

/// 実行結果を DB に保存する
pub async fn save(pool: &SqlitePool, run: &OrchestratorRun) -> Result<i64> {
    let tasks: Vec<TaskResult> = run
        .assignments
        .iter()
        .map(|a| TaskResult {
            id: a.task.id,
            title: a.task.title.clone(),
            role: a.task.role.as_str().to_string(),
            execution_state: execution_state_str(&a.execution_state).to_string(),
            branch_name: a.branch_name.clone(),
        })
        .collect();

    let tasks_json = serde_json::to_string(&tasks).unwrap_or_else(|_| "[]".to_string());

    let failed_count = run
        .assignments
        .iter()
        .filter(|a| a.execution_state == ExecutionState::Error)
        .count() as i64;

    let completed_at = Utc::now().to_rfc3339();
    let status = run_status_str(run);
    let total = run.total as i64;
    let done = run.completed as i64;

    let id = sqlx::query(
        r#"
        INSERT INTO swarm_runs
          (run_id, status, total_tasks, done_count, failed_count, base_branch, project_path, tasks_json, completed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(run_id) DO UPDATE SET
          status       = excluded.status,
          done_count   = excluded.done_count,
          failed_count = excluded.failed_count,
          tasks_json   = excluded.tasks_json,
          completed_at = excluded.completed_at
        "#,
    )
    .bind(&run.run_id)
    .bind(status)
    .bind(total)
    .bind(done)
    .bind(failed_count)
    .bind(&run.base_branch)
    .bind(&run.project_path)
    .bind(&tasks_json)
    .bind(&completed_at)
    .execute(pool)
    .await
    .map_err(|e| AppError::Db(e.to_string()))?
    .last_insert_rowid();

    Ok(id)
}

/// 履歴一覧を新しい順に取得する（最大 limit 件）
pub async fn list(pool: &SqlitePool, limit: i64) -> Result<Vec<SwarmRunRecord>> {
    let rows: Vec<(i64, String, String, i64, i64, i64, String, String, String, String)> =
        sqlx::query_as(
            r#"
            SELECT id, run_id, status, total_tasks, done_count, failed_count,
                   base_branch, project_path, tasks_json, completed_at
            FROM swarm_runs
            ORDER BY completed_at DESC
            LIMIT ?1
            "#,
        )
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| AppError::Db(e.to_string()))?;

    let records = rows
        .into_iter()
        .map(|(id, run_id, status, total_tasks, done_count, failed_count,
               base_branch, project_path, tasks_json, completed_at)| {
            let tasks: Vec<TaskResult> =
                serde_json::from_str(&tasks_json).unwrap_or_default();
            SwarmRunRecord {
                id,
                run_id,
                status,
                total_tasks,
                done_count,
                failed_count,
                base_branch,
                project_path,
                tasks,
                completed_at,
            }
        })
        .collect();

    Ok(records)
}

/// 指定した run_id の履歴を削除する
pub async fn delete(pool: &SqlitePool, run_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM swarm_runs WHERE run_id = ?1")
        .bind(run_id)
        .execute(pool)
        .await
        .map_err(|e| AppError::Db(e.to_string()))?;
    Ok(())
}
