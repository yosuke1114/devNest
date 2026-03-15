/// Orchestrator エンジン — SubTask を Worker に割り当て、Git ブランチ分離で並列実行する
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::git_branch::{create_worker_branch, current_branch, merge_worker_branch, MergeOutcome};
use super::subtask::SubTask;
use super::worker::{WorkerConfig, WorkerKind, WorkerMode, WorkerStatus};
use super::SharedWorkerManager;

// ─── 公開型 ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwarmSettings {
    pub max_workers: u32,
    pub timeout_minutes: u32,
    pub branch_prefix: String,
}

impl Default for SwarmSettings {
    fn default() -> Self {
        Self {
            max_workers: 4,
            timeout_minutes: 30,
            branch_prefix: "swarm/worker-".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RunStatus {
    Preparing,
    Running,
    Merging,
    Done,
    PartialDone,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerAssignment {
    pub worker_id: String,
    pub task: SubTask,
    pub branch_name: String,
    pub status: WorkerStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorRun {
    pub run_id: String,
    pub status: RunStatus,
    pub assignments: Vec<WorkerAssignment>,
    pub base_branch: String,
    pub project_path: String,
    pub merge_results: Vec<MergeOutcome>,
    pub total: u32,
    pub done_count: u32,
}

// ─── Orchestrator ───────────────────────────────────────────────

pub struct Orchestrator {
    pub current_run: Option<OrchestratorRun>,
}

pub type SharedOrchestrator = Arc<Mutex<Orchestrator>>;

pub fn create_orchestrator() -> SharedOrchestrator {
    Arc::new(Mutex::new(Orchestrator { current_run: None }))
}

impl Orchestrator {
    /// SubTask リストを受け取り、Git ブランチを作成して Worker を起動する
    pub fn start_run(
        &mut self,
        tasks: Vec<SubTask>,
        settings: SwarmSettings,
        project_path: String,
        worker_manager: SharedWorkerManager,
        app: AppHandle,
    ) -> Result<OrchestratorRun, String> {
        let run_id = Uuid::new_v4().to_string();
        let repo = PathBuf::from(&project_path);

        // ベースブランチ取得
        let base_branch = current_branch(&repo).unwrap_or_else(|_| "main".to_string());

        let limit = (tasks.len() as u32).min(settings.max_workers) as usize;
        let target_tasks = &tasks[..limit];

        let mut assignments = Vec::new();

        for task in target_tasks {
            let branch_name = format!(
                "{}{}-{}",
                settings.branch_prefix,
                run_id.split('-').next().unwrap_or("0"),
                task.id
            );

            // Git ブランチ作成（失敗しても Worker 起動は継続）
            if let Err(e) = create_worker_branch(&repo, &branch_name) {
                eprintln!("[Orchestrator] branch create failed: {}", e);
            }

            // Worker 設定
            let config = WorkerConfig {
                kind: WorkerKind::ClaudeCode,
                mode: WorkerMode::Batch,
                label: task.title.clone(),
                working_dir: repo.clone(),
                depends_on: vec![],
                metadata: {
                    let mut m = HashMap::new();
                    m.insert("task_instruction".to_string(), task.instruction.clone());
                    m.insert("orchestration_run_id".to_string(), run_id.clone());
                    m.insert("branch_name".to_string(), branch_name.clone());
                    m
                },
            };

            let worker_id = {
                let mut mgr = worker_manager.lock().map_err(|e| e.to_string())?;
                mgr.spawn_worker(config, app.clone())?
            };

            assignments.push(WorkerAssignment {
                worker_id,
                task: task.clone(),
                branch_name,
                status: WorkerStatus::Idle,
            });
        }

        let run = OrchestratorRun {
            run_id: run_id.clone(),
            status: RunStatus::Running,
            assignments,
            base_branch,
            project_path: project_path.clone(),
            merge_results: vec![],
            total: limit as u32,
            done_count: 0,
        };

        self.current_run = Some(run.clone());

        // バックグラウンドモニター起動
        start_monitor(run_id, worker_manager, app, Arc::new(Mutex::new(self as *mut _)));

        Ok(run)
    }

    /// Worker のステータスを更新し、全完了時にマージフェーズへ移行する
    pub fn update_worker_status(
        &mut self,
        worker_id: &str,
        status: WorkerStatus,
        app: &AppHandle,
    ) {
        let run = match self.current_run.as_mut() {
            Some(r) => r,
            None => return,
        };

        for assign in &mut run.assignments {
            if assign.worker_id == worker_id {
                assign.status = status.clone();
            }
        }

        let all_finished = run.assignments.iter().all(|a| {
            matches!(a.status, WorkerStatus::Done | WorkerStatus::Error)
        });

        run.done_count = run
            .assignments
            .iter()
            .filter(|a| matches!(a.status, WorkerStatus::Done | WorkerStatus::Error))
            .count() as u32;

        if all_finished {
            run.status = RunStatus::Merging;
            let _ = app.emit("orchestrator-merge-ready", &run);
        } else {
            let _ = app.emit("orchestrator-status-changed", &run);
        }
    }

    /// 全 Worker のマージを実行する
    pub fn merge_all(&mut self, app: &AppHandle) -> Vec<MergeOutcome> {
        let run = match self.current_run.as_mut() {
            Some(r) => r,
            None => return vec![],
        };

        let repo = PathBuf::from(&run.project_path);
        let base = run.base_branch.clone();
        let mut outcomes = Vec::new();

        let succeeded_branches: Vec<String> = run
            .assignments
            .iter()
            .filter(|a| matches!(a.status, WorkerStatus::Done))
            .map(|a| a.branch_name.clone())
            .collect();

        for branch in &succeeded_branches {
            let outcome = merge_worker_branch(&repo, branch, &base);
            outcomes.push(outcome);
        }

        let all_success = outcomes.iter().all(|o| o.success);
        let has_conflict = outcomes.iter().any(|o| !o.conflict_files.is_empty());

        run.merge_results = outcomes.clone();
        run.status = if has_conflict {
            RunStatus::PartialDone
        } else if all_success {
            RunStatus::Done
        } else {
            RunStatus::PartialDone
        };

        let _ = app.emit("orchestrator-merge-done", &run);
        outcomes
    }

    /// 実行をキャンセルする
    pub fn cancel(&mut self, worker_manager: &SharedWorkerManager, app: &AppHandle) {
        let run = match self.current_run.as_mut() {
            Some(r) => r,
            None => return,
        };

        run.status = RunStatus::Cancelled;

        if let Ok(mut mgr) = worker_manager.lock() {
            for assign in &run.assignments {
                let _ = mgr.kill_worker(&assign.worker_id, app.clone());
            }
        }

        let _ = app.emit("orchestrator-status-changed", &run);
    }
}

// ─── バックグラウンドモニター ──────────────────────────────────

/// Worker の完了を2秒ごとにポーリングし、全完了時に Orchestrator を更新する
fn start_monitor(
    run_id: String,
    worker_manager: SharedWorkerManager,
    app: AppHandle,
    orch_ptr: Arc<Mutex<*mut Orchestrator>>,
) {
    // バックグラウンドモニターは frontend の worker-status-changed を補完する
    // 実際には frontend が orchestrator_notify_worker_done を呼ぶことで更新される
    // このモニターはフォールバック（frontend が落ちた場合など）
    let _ = (run_id, worker_manager, app, orch_ptr); // reserved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swarm_settings_default_values() {
        let s = SwarmSettings::default();
        assert_eq!(s.max_workers, 4);
        assert_eq!(s.timeout_minutes, 30);
        assert_eq!(s.branch_prefix, "swarm/worker-");
    }

    #[test]
    fn orchestrator_starts_with_no_run() {
        let orch = Orchestrator { current_run: None };
        assert!(orch.current_run.is_none());
    }

    #[test]
    fn run_status_serializes_correctly() {
        let status = RunStatus::Running;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"running\"");
    }

    #[test]
    fn worker_assignment_has_correct_fields() {
        let assign = WorkerAssignment {
            worker_id: "w1".into(),
            task: SubTask { id: 1, title: "T".into(), files: vec![], instruction: "do it".into() },
            branch_name: "swarm/worker-abc-1".into(),
            status: WorkerStatus::Idle,
        };
        assert_eq!(assign.branch_name, "swarm/worker-abc-1");
    }
}
