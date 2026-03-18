use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use super::settings::SwarmSettings;
use super::subtask::SubTask;
use super::wave::{compute_waves, GateOverall, Wave, WaveGateResult, WaveStatus};
use super::worker::{
    ExecutionState, OrchestratorTaskConfig, RunStatus, SpawnRequest, WorkerAssignment, WorkerStatus,
};

pub type SharedOrchestrator = Arc<Mutex<Orchestrator>>;

/// Orchestrator: ワーカーレベルの並列タスク実行を管理する。
/// 依存グラフに基づいてタスクを Ready 状態にし、ワーカーの起動・完了を追跡する。
/// Wave モード時は全 Wave のタスクを1つの Run で管理し、
/// Wave 境界でのタスク昇格は advance_wave() で明示的に行う。
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
    /// フロントエンドの doneCount と対応（camelCase で "doneCount" に変換）
    #[serde(rename = "doneCount")]
    pub completed: u32,
    pub failed: u32,
    pub status: RunStatus,

    /// Wave 構造（Wave モード時のみ Some、None は [] としてシリアライズ）
    #[serde(default)]
    pub waves: Option<Vec<Wave>>,

    /// 現在実行中の Wave 番号（1-indexed、Wave モード時のみ Some）
    #[serde(default)]
    pub current_wave: Option<u32>,

    /// 各 Wave の Gate 結果（Wave モード時のみ Some）
    #[serde(default)]
    pub gate_results: Option<Vec<WaveGateResult>>,
}

impl Orchestrator {
    pub fn new() -> Self {
        Self { current_run: None }
    }
}

pub fn create_orchestrator() -> SharedOrchestrator {
    std::sync::Arc::new(std::sync::Mutex::new(Orchestrator::new()))
}

impl Orchestrator {

    /// タスク群を受け取り、依存解決済みのタスクを Ready にして実行を開始する。
    /// 戻り値の SpawnRequest を使ってワーカーを起動する。
    /// 既存ロジック変更なし — Wave のことは知らない。
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
            waves: None,
            current_wave: None,
            gate_results: None,
        };

        // Ready なタスクから max_workers 分だけ SpawnRequest を作成
        let spawns = collect_spawn_requests(&mut run);

        self.current_run = Some(run.clone());
        Ok((run, spawns))
    }

    /// Wave モードで実行を開始する。
    /// 全タスクを1つの Run に格納し、Wave 1 のタスクのみ Ready にする。
    /// Wave が1つしかない場合はフラット実行（start_run）にフォールバックする。
    pub fn start_run_with_waves(
        &mut self,
        tasks: Vec<SubTask>,
        settings: SwarmSettings,
        project_path: String,
    ) -> Result<(OrchestratorRun, Vec<SpawnRequest>), String> {
        let mut waves = compute_waves(&tasks);

        // Wave 1つ以下 → フラット実行と同じ
        if waves.len() <= 1 {
            return self.start_run(tasks, settings, project_path);
        }

        if self.current_run.is_some() {
            return Err("既に実行中の Run があります".into());
        }

        // Wave 1 のタスク ID を取得
        let wave1_ids: HashSet<u32> = waves[0].task_ids.iter().cloned().collect();
        waves[0].status = WaveStatus::Running;

        let run_id = uuid::Uuid::new_v4().to_string();
        let total = tasks.len() as u32;

        // 全タスクを WorkerAssignment に変換
        // Wave 1 のタスクは依存なしなら Ready、それ以外は Waiting
        let assignments: Vec<WorkerAssignment> = tasks
            .iter()
            .map(|task| {
                let branch_name = format!("{}{}", settings.branch_prefix, task.id);
                let in_wave1 = wave1_ids.contains(&task.id);
                let execution_state = if in_wave1 && task.depends_on.is_empty() {
                    ExecutionState::Ready
                } else {
                    ExecutionState::Waiting
                };
                WorkerAssignment {
                    worker_id: String::new(),
                    task: task.clone(),
                    branch_name,
                    status: WorkerStatus::Idle,
                    execution_state,
                    retry_count: 0,
                }
            })
            .collect();

        let mut run = OrchestratorRun {
            run_id,
            assignments,
            settings: settings.clone(),
            project_path,
            base_branch: settings.base_branch.clone(),
            total,
            completed: 0,
            failed: 0,
            status: RunStatus::Running,
            waves: Some(waves),
            current_wave: Some(1),
            gate_results: Some(vec![]),
        };

        let spawns = collect_spawn_requests(&mut run);
        self.current_run = Some(run.clone());
        Ok((run, spawns))
    }

    /// ワーカーの状態更新を受け取り、依存解決で新たに Ready になったタスクを返す。
    /// Wave モード時は現在 Wave 内のタスクのみ依存解決する（Wave 境界は越えない）。
    pub fn update_worker_status(
        &mut self,
        worker_id: &str,
        new_status: WorkerStatus,
    ) -> Vec<SpawnRequest> {
        let is_wave_mode = self.is_wave_mode();
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
        // Wave モード時は現在 Wave 内のタスクのみ対象（Wave 境界を越えない）
        if new_status == WorkerStatus::Done {
            let done_ids: HashSet<u32> = run
                .assignments
                .iter()
                .filter(|a| a.execution_state == ExecutionState::Done)
                .map(|a| a.task.id)
                .collect();

            // Wave モード時、現在 Wave のタスク ID を取得
            let current_wave_task_ids: Option<HashSet<u32>> =
                run.waves.as_ref().and_then(|waves| {
                    run.current_wave.and_then(|cw| {
                        waves
                            .iter()
                            .find(|w| w.wave_number == cw)
                            .map(|w| w.task_ids.iter().cloned().collect())
                    })
                });

            for assign in &mut run.assignments {
                if assign.execution_state == ExecutionState::Waiting
                    && assign.task.depends_on.iter().all(|d| done_ids.contains(d))
                {
                    // Wave モード時、現在 Wave 外のタスクは昇格しない
                    if let Some(ref wave_ids) = current_wave_task_ids {
                        if !wave_ids.contains(&assign.task.id) {
                            continue;
                        }
                    }
                    assign.execution_state = ExecutionState::Ready;
                }
            }

        }

        // エラーになったタスクに依存するタスクをスキップ
        {
            // Wave モード時、現在 Wave のタスク ID を取得
            let current_wave_task_ids: Option<HashSet<u32>> =
                run.waves.as_ref().and_then(|waves| {
                    run.current_wave.and_then(|cw| {
                        waves
                            .iter()
                            .find(|w| w.wave_number == cw)
                            .map(|w| w.task_ids.iter().cloned().collect())
                    })
                });

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
                    // Wave モード時、現在 Wave 外のタスクはスキップしない（Gate で判断）
                    if let Some(ref wave_ids) = current_wave_task_ids {
                        if !wave_ids.contains(&assign.task.id) {
                            continue;
                        }
                    }
                    assign.execution_state = ExecutionState::Skipped;
                }
            }
        }

        // 全体完了チェック（非 Wave モード時のみ RunStatus を更新）
        if !is_wave_mode {
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

    /// 指定 Wave の完了タスクのブランチ名リストを返す
    pub fn completed_branches_for_wave(&self, wave_number: u32) -> Vec<String> {
        let run = match &self.current_run {
            Some(r) => r,
            None => return vec![],
        };
        let wave_task_ids: HashSet<u32> = run
            .waves
            .as_ref()
            .and_then(|ws| ws.iter().find(|w| w.wave_number == wave_number))
            .map(|w| w.task_ids.iter().cloned().collect())
            .unwrap_or_default();

        run.assignments
            .iter()
            .filter(|a| {
                wave_task_ids.contains(&a.task.id) && a.execution_state == ExecutionState::Done
            })
            .map(|a| a.branch_name.clone())
            .collect()
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

    /// 現在の Wave 内の全タスクが終端状態か判定
    pub fn is_current_wave_complete(&self) -> bool {
        let run = match &self.current_run {
            Some(r) => r,
            None => return false,
        };
        let (waves, current) = match (&run.waves, run.current_wave) {
            (Some(w), Some(c)) => (w, c),
            _ => return false,
        };
        let wave = match waves.iter().find(|w| w.wave_number == current) {
            Some(w) => w,
            None => return false,
        };
        wave.task_ids.iter().all(|tid| {
            run.assignments
                .iter()
                .find(|a| a.task.id == *tid)
                .map(|a| {
                    matches!(
                        a.execution_state,
                        ExecutionState::Done | ExecutionState::Error | ExecutionState::Skipped
                    )
                })
                .unwrap_or(true)
        })
    }

    /// Gate 完了後に次 Wave のタスクを起動する。
    /// 現在 Wave の Gate 結果を記録し、次 Wave のタスクを Ready に昇格して SpawnRequest を返す。
    pub fn advance_wave(&mut self, gate_result: WaveGateResult) -> Vec<SpawnRequest> {
        let run = match self.current_run.as_mut() {
            Some(r) => r,
            None => return vec![],
        };
        let current = match run.current_wave {
            Some(c) => c,
            None => return vec![],
        };

        // 現在 Wave の状態を更新
        if let Some(waves) = &mut run.waves {
            if let Some(wave) = waves.iter_mut().find(|w| w.wave_number == current) {
                wave.gate_result = Some(gate_result.clone());
                wave.status = match gate_result.overall {
                    GateOverall::Passed => WaveStatus::Passed,
                    GateOverall::PassedWithWarnings => WaveStatus::PassedWithWarnings,
                    GateOverall::Blocked => WaveStatus::Failed,
                };
            }
        }
        if let Some(results) = &mut run.gate_results {
            results.push(gate_result.clone());
        }

        // Blocked → 停止
        if gate_result.overall == GateOverall::Blocked {
            run.status = RunStatus::PartialDone;
            return vec![];
        }

        // 次 Wave に進む
        let next = current + 1;
        run.current_wave = Some(next);

        let next_task_ids: Vec<u32> = run
            .waves
            .as_ref()
            .and_then(|ws| ws.iter().find(|w| w.wave_number == next))
            .map(|w| w.task_ids.clone())
            .unwrap_or_default();

        if next_task_ids.is_empty() {
            run.status = RunStatus::Done;
            return vec![];
        }

        // 次 Wave を Running に
        if let Some(waves) = &mut run.waves {
            if let Some(wave) = waves.iter_mut().find(|w| w.wave_number == next) {
                wave.status = WaveStatus::Running;
            }
        }

        // 次 Wave のタスクを Ready に昇格（依存が全て Done のもの）
        let done_ids: HashSet<u32> = run
            .assignments
            .iter()
            .filter(|a| a.execution_state == ExecutionState::Done)
            .map(|a| a.task.id)
            .collect();

        for assign in &mut run.assignments {
            if !next_task_ids.contains(&assign.task.id) {
                continue;
            }
            let all_deps_done = assign.task.depends_on.iter().all(|d| done_ids.contains(d));
            if all_deps_done && assign.execution_state == ExecutionState::Waiting {
                assign.execution_state = ExecutionState::Ready;
            }
        }

        collect_spawn_requests(run)
    }

    /// Wave モードか判定（Wave が2つ以上ある場合）
    pub fn is_wave_mode(&self) -> bool {
        self.current_run
            .as_ref()
            .and_then(|r| r.waves.as_ref())
            .map(|w| w.len() > 1)
            .unwrap_or(false)
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
            worker_config: OrchestratorTaskConfig {
                task: assign.task.clone(),
                branch_name: assign.branch_name.clone(),
                project_path: run.project_path.clone(),
                run_id: run.run_id.clone(),
                default_shell: run.settings.default_shell.clone(),
                claude_skip_permissions: run.settings.claude_skip_permissions,
                claude_no_stream: run.settings.claude_no_stream,
                claude_interactive: run.settings.claude_interactive,
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

    // ===== 既存テスト（変更なし） =====

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
        assert_eq!(run.assignments[2].execution_state, ExecutionState::Waiting);
        // max_workers=3 だが Ready は 2 つだけ
        assert_eq!(spawns.len(), 2);
        // Wave フィールドは None
        assert!(run.waves.is_none());
        assert!(run.current_wave.is_none());
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
        assert_eq!(run.assignments[1].execution_state, ExecutionState::Skipped);
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

    // ===== Wave モード追加テスト =====

    #[test]
    fn start_run_with_waves_creates_multi_wave() {
        let mut orch = Orchestrator::new();
        let tasks = vec![
            task(1, vec![]),
            task(2, vec![]),
            task(3, vec![1]),
            task(4, vec![2, 3]),
        ];
        let (run, spawns) = orch
            .start_run_with_waves(tasks, default_settings(), "/tmp".into())
            .unwrap();

        // Wave 構造: [1,2] → [3] → [4]
        assert_eq!(run.total, 4);
        assert!(run.waves.is_some());
        let waves = run.waves.as_ref().unwrap();
        assert_eq!(waves.len(), 3);
        assert_eq!(waves[0].status, WaveStatus::Running);
        assert_eq!(waves[1].status, WaveStatus::Pending);
        assert_eq!(run.current_wave, Some(1));

        // Wave 1 のタスク (1,2) のみ Ready → spawn
        assert_eq!(spawns.len(), 2);
        assert!(orch.is_wave_mode());

        // Wave 2,3 のタスクは Waiting
        let run = orch.current_run.as_ref().unwrap();
        let task3 = run.assignments.iter().find(|a| a.task.id == 3).unwrap();
        assert_eq!(task3.execution_state, ExecutionState::Waiting);
        let task4 = run.assignments.iter().find(|a| a.task.id == 4).unwrap();
        assert_eq!(task4.execution_state, ExecutionState::Waiting);
    }

    #[test]
    fn start_run_with_waves_single_wave_falls_back() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![]), task(3, vec![])];
        let (run, spawns) = orch
            .start_run_with_waves(tasks, default_settings(), "/tmp".into())
            .unwrap();

        // 全独立タスク → Wave 1つ → フラット実行にフォールバック
        assert!(run.waves.is_none());
        assert!(!orch.is_wave_mode());
        assert_eq!(spawns.len(), 3);
    }

    #[test]
    fn wave_mode_does_not_promote_across_boundary() {
        let mut orch = Orchestrator::new();
        // Task 1 (Wave 1) → Task 2 (Wave 2)
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let (_, spawns) = orch
            .start_run_with_waves(tasks, default_settings(), "/tmp".into())
            .unwrap();

        assert_eq!(spawns.len(), 1); // Task 1 のみ
        orch.assign_worker_id(1, "w1".into());

        // Task 1 完了 → Task 2 は Wave 2 なので Ready にならない
        let new_spawns = orch.update_worker_status("w1", WorkerStatus::Done);
        assert!(new_spawns.is_empty());

        // Task 2 はまだ Waiting
        let run = orch.current_run.as_ref().unwrap();
        let task2 = run.assignments.iter().find(|a| a.task.id == 2).unwrap();
        assert_eq!(task2.execution_state, ExecutionState::Waiting);

        // Wave 1 は完了状態
        assert!(orch.is_current_wave_complete());
    }

    #[test]
    fn advance_wave_promotes_next_wave_tasks() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![1]), task(3, vec![2])];
        let (_, spawns) = orch
            .start_run_with_waves(tasks, default_settings(), "/tmp".into())
            .unwrap();

        // Wave 1: Task 1
        assert_eq!(spawns.len(), 1);
        orch.assign_worker_id(1, "w1".into());
        orch.update_worker_status("w1", WorkerStatus::Done);
        assert!(orch.is_current_wave_complete());

        // Gate パス → Wave 2 へ
        let gate_result = super::super::wave_gate::make_passed_result();
        let wave2_spawns = orch.advance_wave(gate_result);

        // Task 2 が Ready → spawn
        assert_eq!(wave2_spawns.len(), 1);
        assert_eq!(wave2_spawns[0].task_id, 2);

        let run = orch.current_run.as_ref().unwrap();
        assert_eq!(run.current_wave, Some(2));
        let waves = run.waves.as_ref().unwrap();
        assert_eq!(waves[0].status, WaveStatus::Passed);
        assert_eq!(waves[1].status, WaveStatus::Running);

        // Task 3 はまだ Waiting (Wave 3)
        let task3 = run.assignments.iter().find(|a| a.task.id == 3).unwrap();
        assert_eq!(task3.execution_state, ExecutionState::Waiting);
    }

    #[test]
    fn advance_wave_blocked_stops() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let (_, _) = orch
            .start_run_with_waves(tasks, default_settings(), "/tmp".into())
            .unwrap();
        orch.assign_worker_id(1, "w1".into());
        orch.update_worker_status("w1", WorkerStatus::Done);

        // Gate ブロック
        let gate_result = super::super::wave_gate::make_blocked_result();
        let spawns = orch.advance_wave(gate_result);

        assert!(spawns.is_empty());
        let run = orch.current_run.as_ref().unwrap();
        assert_eq!(run.status, RunStatus::PartialDone);
        let waves = run.waves.as_ref().unwrap();
        assert_eq!(waves[0].status, WaveStatus::Failed);
    }

    #[test]
    fn advance_wave_last_wave_sets_done() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let (_, _) = orch
            .start_run_with_waves(tasks, default_settings(), "/tmp".into())
            .unwrap();

        // Wave 1 完了
        orch.assign_worker_id(1, "w1".into());
        orch.update_worker_status("w1", WorkerStatus::Done);

        let wave2_spawns = orch.advance_wave(super::super::wave_gate::make_passed_result());
        assert_eq!(wave2_spawns.len(), 1);

        // Wave 2 完了
        orch.assign_worker_id(2, "w2".into());
        orch.update_worker_status("w2", WorkerStatus::Done);
        assert!(orch.is_current_wave_complete());

        // 最終 Wave → Done
        let spawns = orch.advance_wave(super::super::wave_gate::make_passed_result());
        assert!(spawns.is_empty());

        let run = orch.current_run.as_ref().unwrap();
        assert_eq!(run.status, RunStatus::Done);
        assert_eq!(run.completed, 2);
    }

    #[test]
    fn is_wave_mode_false_for_flat_run() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![])];
        let (_, _) = orch
            .start_run(tasks, default_settings(), "/tmp".into())
            .unwrap();

        assert!(!orch.is_wave_mode());
        assert!(!orch.is_current_wave_complete());
    }

    #[test]
    fn completed_branches_for_wave_scoped() {
        let mut orch = Orchestrator::new();
        let tasks = vec![task(1, vec![]), task(2, vec![]), task(3, vec![1])];
        let (_, _) = orch
            .start_run_with_waves(tasks, default_settings(), "/tmp".into())
            .unwrap();

        orch.assign_worker_id(1, "w1".into());
        orch.assign_worker_id(2, "w2".into());
        orch.update_worker_status("w1", WorkerStatus::Done);
        orch.update_worker_status("w2", WorkerStatus::Done);

        // Wave 1 のブランチのみ返す
        let branches = orch.completed_branches_for_wave(1);
        assert_eq!(branches.len(), 2);

        // Wave 2 のブランチはまだない
        let branches2 = orch.completed_branches_for_wave(2);
        assert!(branches2.is_empty());

        // 全ブランチ（Wave 問わず）
        let all_branches = orch.completed_branches();
        assert_eq!(all_branches.len(), 2);
    }
}
