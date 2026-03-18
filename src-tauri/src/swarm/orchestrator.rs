use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use super::settings::SwarmSettings;
use super::subtask::SubTask;
use super::worker::{
    ExecutionState, RunStatus, SpawnRequest, WorkerAssignment, WorkerConfig, WorkerStatus,
};

pub type SharedOrchestrator = Arc<Mutex<Orchestrator>>;

/// Orchestrator: ワーカーレベルの並列タスク実行を管理する。
/// 依存グラフに基づいてタスクを Ready 状態にし、ワーカーの起動・完了を追跡する。
/// Wave のことは知らない — 渡されたタスク群を並列実行するだけ。
#[derive(Debug)]
pub struct Orchestrator {
    pub current_run: Option<OrchestratorRun>,
}

/// 1回の Orchestrator 実行（タスク群の管理状態）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorRun {
    pub run_id: String,
    pub assignments: Vec<WorkerAssignment>,
    pub settings: SwarmSettings,
    pub project_path: String,
    pub base_branch: String,
    pub total: u32,
    pub completed: u32,
    pub failed: u32,
    pub status: RunStatus,
}

impl Orchestrator {
    pub fn new() -> Self {
        Self { current_run: None }
    }

    /// タスク群を受け取り、依存解決済みのタスクを Ready にして実行を開始する。
    /// 戻り値の SpawnRequest を使ってワーカーを起動する。
    pub fn start_run(
        &mut self,
        tasks: Vec<SubTask>,
        settings: SwarmSettings,
        project_path: String,
    ) -> Result<(OrchestratorRun, Vec<SpawnRequest>), String> {
        if self.current_run.is_some() {
            return Err("既に実行中の Run があります".into());
        }

        let run_id = uuid::Uuid::new_v4().to_string();
        let total = tasks.len() as u32;

        // 全タスクを WorkerAssignment に変換
        let assignments: Vec<WorkerAssignment> = tasks
            .iter()
            .map(|task| {
                let branch_name = format!("{}{}", settings.branch_prefix, task.id);
                let has_deps = !task.depends_on.is_empty();
                WorkerAssignment {
                    worker_id: String::new(),
                    task: task.clone(),
                    branch_name,
                    status: WorkerStatus::Idle,
                    execution_state: if has_deps {
                        ExecutionState::Waiting
                    } else {
                        ExecutionState::Ready
                    },
                    retry_count: 0,
                }
            })
            .collect();

        let mut run = OrchestratorRun {
            run_id: run_id.clone(),
            assignments,
            settings: settings.clone(),
            project_path: project_path.clone(),
            base_branch: settings.base_branch.clone(),
            total,
            completed: 0,
            failed: 0,
            status: RunStatus::Running,
        };

        // Ready なタスクから max_workers 分だけ SpawnRequest を作成
        let spawns = collect_spawn_requests(&mut run);

        self.current_run = Some(run.clone());
        Ok((run, spawns))
    }

    /// ワーカーの状態更新を受け取り、依存解決で新たに Ready になったタスクを返す。
    pub fn update_worker_status(
        &mut self,
        worker_id: &str,
        new_status: WorkerStatus,
    ) -> Vec<SpawnRequest> {
        let run = match self.current_run.as_mut() {
            Some(r) => r,
            None => return vec![],
        };

        // 該当ワーカーを見つけて状態更新
        let task_id = {
            let assign = match run
                .assignments
                .iter_mut()
                .find(|a| a.worker_id == worker_id)
            {
                Some(a) => a,
                None => return vec![],
            };

            assign.status = new_status.clone();
            match new_status {
                WorkerStatus::Done => {
                    assign.execution_state = ExecutionState::Done;
                    run.completed += 1;
                }
                WorkerStatus::Error => {
                    if assign.retry_count < run.settings.max_retries {
                        assign.retry_count += 1;
                        assign.execution_state = ExecutionState::Ready;
                        assign.worker_id = String::new();
                    } else {
                        assign.execution_state = ExecutionState::Error;
                        run.failed += 1;
                    }
                }
                WorkerStatus::Running => {
                    assign.execution_state = ExecutionState::Running;
                }
                _ => {}
            }
            assign.task.id
        };

        // 依存解決: Done になったタスクに依存していた Waiting タスクを Ready に
        if new_status == WorkerStatus::Done {
            let done_ids: HashSet<u32> = run
                .assignments
                .iter()
                .filter(|a| a.execution_state == ExecutionState::Done)
                .map(|a| a.task.id)
                .collect();

            for assign in &mut run.assignments {
                if assign.execution_state == ExecutionState::Waiting
                    && assign.task.depends_on.iter().all(|d| done_ids.contains(d))
                {
                    assign.execution_state = ExecutionState::Ready;
                }
            }

            // エラーになったタスクに依存するタスクをスキップ
            let error_ids: HashSet<u32> = run
                .assignments
                .iter()
                .filter(|a| a.execution_state == ExecutionState::Error)
                .map(|a| a.task.id)
                .collect();

            for assign in &mut run.assignments {
                if assign.execution_state == ExecutionState::Waiting
                    && assign.task.depends_on.iter().any(|d| error_ids.contains(d))
                {
                    assign.execution_state = ExecutionState::Skipped;
                }
            }
        }

        // 全体完了チェック
        let all_terminal = run.assignments.iter().all(|a| {
            matches!(
                a.execution_state,
                ExecutionState::Done | ExecutionState::Error | ExecutionState::Skipped
            )
        });
        if all_terminal {
            run.status = if run.failed > 0 {
                RunStatus::PartialDone
            } else {
                RunStatus::Done
            };
        }

        // 新たに起動可能なタスクの SpawnRequest を生成
        let _ = task_id; // suppress unused warning
        collect_spawn_requests(run)
    }

    /// ワーカーID をタスクに紐付ける
    pub fn assign_worker_id(&mut self, task_id: u32, worker_id: String) {
        if let Some(run) = &mut self.current_run {
            if let Some(assign) = run.assignments.iter_mut().find(|a| a.task.id == task_id) {
                assign.worker_id = worker_id;
                assign.status = WorkerStatus::Running;
                assign.execution_state = ExecutionState::Running;
            }
        }
    }

    /// 実行をキャンセルする
    pub fn cancel(&mut self) {
        if let Some(run) = &mut self.current_run {
            run.status = RunStatus::Cancelled;
            for assign in &mut run.assignments {
                if matches!(
                    assign.execution_state,
                    ExecutionState::Waiting | ExecutionState::Ready
                ) {
                    assign.execution_state = ExecutionState::Skipped;
                }
            }
        }
    }

    /// 全完了タスクのブランチ名リストを返す
    pub fn completed_branches(&self) -> Vec<String> {
        self.current_run
            .as_ref()
            .map(|run| {
                run.assignments
                    .iter()
                    .filter(|a| a.execution_state == ExecutionState::Done)
                    .map(|a| a.branch_name.clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// 全タスクが終端状態（Done/Error/Skipped）か判定
    pub fn is_all_terminal(&self) -> bool {
        self.current_run
            .as_ref()
            .map(|run| {
                run.assignments.iter().all(|a| {
                    matches!(
                        a.execution_state,
                        ExecutionState::Done | ExecutionState::Error | ExecutionState::Skipped
                    )
                })
            })
            .unwrap_or(true)
    }

    /// Run をクリアする
    pub fn clear_run(&mut self) {
        self.current_run = None;
    }
}

/// Ready 状態のタスクから max_workers の上限まで SpawnRequest を生成する
fn collect_spawn_requests(run: &mut OrchestratorRun) -> Vec<SpawnRequest> {
    let running_count = run
        .assignments
        .iter()
        .filter(|a| a.execution_state == ExecutionState::Running)
        .count() as u32;

    let available = run.settings.max_workers.saturating_sub(running_count);
    let mut spawns = Vec::new();

    for assign in &mut run.assignments {
        if spawns.len() as u32 >= available {
            break;
        }
        if assign.execution_state != ExecutionState::Ready {
            continue;
        }
        let is_retry = assign.retry_count > 0;
        let old_worker_id = if is_retry {
            Some(assign.worker_id.clone())
        } else {
            None
        };

        spawns.push(SpawnRequest {
            worker_config: WorkerConfig {
                task: assign.task.clone(),
                branch_name: assign.branch_name.clone(),
                project_path: run.project_path.clone(),
                run_id: run.run_id.clone(),
            },
            task_id: assign.task.id,
            is_retry,
            old_worker_id,
        });
    }

    spawns
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: u32, deps: Vec<u32>) -> SubTask {
        SubTask {
            id,
            title: format!("Task {}", id),
            files: vec![],
            instruction: format!("do {}", id),
            depends_on: deps,
        }
    }

    fn default_settings() -> SwarmSettings {
        SwarmSettings {
            max_workers: 3,
            branch_prefix: "swarm/task-".into(),
            base_branch: "main".into(),
            max_retries: 1,
        }
    }

    #[test]
    fn start_run_creates_assignments() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![]), task(3, vec![1])];
        let (run, spawns) = orch
            .start_run(tasks, default_settings(), "/tmp/project".into())
            .unwrap();

        assert_eq!(run.total, 3);
        assert_eq!(run.assignments.len(), 3);
        // Task 1, 2 は Ready（依存なし）、Task 3 は Waiting
        assert_eq!(
            run.assignments[2].execution_state,
            ExecutionState::Waiting
        );
        // max_workers=3 だが Ready は 2 つだけ
        assert_eq!(spawns.len(), 2);
    }

    #[test]
    fn update_worker_status_resolves_deps() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let (_, spawns) = orch
            .start_run(tasks, default_settings(), "/tmp".into())
            .unwrap();

        assert_eq!(spawns.len(), 1); // Task 1 のみ
        orch.assign_worker_id(1, "worker-1".into());

        // Task 1 完了 → Task 2 が Ready に
        let new_spawns = orch.update_worker_status("worker-1", WorkerStatus::Done);
        assert_eq!(new_spawns.len(), 1);
        assert_eq!(new_spawns[0].task_id, 2);
    }

    #[test]
    fn error_skips_dependents() {
        let mut orch = Orchestrator::new();
        let settings = SwarmSettings {
            max_retries: 0,
            ..default_settings()
        };
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let (_, _) = orch.start_run(tasks, settings, "/tmp".into()).unwrap();
        orch.assign_worker_id(1, "worker-1".into());

        // Task 1 エラー → Task 2 はスキップ
        let new_spawns = orch.update_worker_status("worker-1", WorkerStatus::Error);
        assert!(new_spawns.is_empty());

        let run = orch.current_run.as_ref().unwrap();
        assert_eq!(run.assignments[1].execution_state, ExecutionState::Skipped);
        assert_eq!(run.status, RunStatus::PartialDone);
    }

    #[test]
    fn retry_on_error() {
        let mut orch = Orchestrator::new();
        let settings = SwarmSettings {
            max_retries: 1,
            ..default_settings()
        };
        let tasks = vec![task(1, vec![])];
        let (_, _) = orch.start_run(tasks, settings, "/tmp".into()).unwrap();
        orch.assign_worker_id(1, "worker-1".into());

        // 1回目のエラー → リトライ
        let spawns = orch.update_worker_status("worker-1", WorkerStatus::Error);
        assert_eq!(spawns.len(), 1);
        assert!(spawns[0].is_retry);
    }

    #[test]
    fn cancel_stops_pending_tasks() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let (_, _) = orch
            .start_run(tasks, default_settings(), "/tmp".into())
            .unwrap();

        orch.cancel();

        let run = orch.current_run.as_ref().unwrap();
        assert_eq!(run.status, RunStatus::Cancelled);
        assert_eq!(
            run.assignments[1].execution_state,
            ExecutionState::Skipped
        );
    }

    #[test]
    fn all_done_sets_done_status() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![])];
        let (_, _) = orch
            .start_run(tasks, default_settings(), "/tmp".into())
            .unwrap();
        orch.assign_worker_id(1, "w1".into());
        orch.assign_worker_id(2, "w2".into());

        orch.update_worker_status("w1", WorkerStatus::Done);
        orch.update_worker_status("w2", WorkerStatus::Done);

        let run = orch.current_run.as_ref().unwrap();
        assert_eq!(run.status, RunStatus::Done);
        assert_eq!(run.completed, 2);
    }

    #[test]
    fn completed_branches_returns_done_only() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![])];
        let (_, _) = orch
            .start_run(tasks, default_settings(), "/tmp".into())
            .unwrap();
        orch.assign_worker_id(1, "w1".into());
        orch.update_worker_status("w1", WorkerStatus::Done);

        let branches = orch.completed_branches();
        assert_eq!(branches.len(), 1);
        assert!(branches[0].contains("task-1"));
    }
}
