/// Orchestrator エンジン — SubTask を Worker に割り当て、Git ブランチ分離で並列実行する
/// Feature 12-1: Worker依存グラフ（直列実行チェーン）対応済み
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use super::git_branch::{create_worker_branch, current_branch, merge_worker_branch, MergeOutcome};
use super::resource_monitor::can_spawn_worker;
use super::result_aggregator::{AggregatedResult, ResultAggregator};
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
    /// Feature 12-4: デフォルト Shell（"zsh" / "bash" / "fish" / カスタムパス）
    #[serde(default = "default_shell")]
    pub default_shell: String,
    /// Feature 12-4: プロンプトパターン（| 区切り、例 "$|%|❯|>"）
    #[serde(default = "default_prompt_patterns")]
    pub prompt_patterns: String,
    /// Feature 12-4: --dangerously-skip-permissions フラグ
    #[serde(default)]
    pub claude_skip_permissions: bool,
    /// Feature 12-4: --no-stream フラグ
    #[serde(default)]
    pub claude_no_stream: bool,
    /// Feature 12-4: 信頼度 High のコンフリクトを自動承認
    #[serde(default)]
    pub auto_approve_high_confidence: bool,
}

fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "zsh".to_string())
}

fn default_prompt_patterns() -> String {
    "$|%|❯|>|#|→".to_string()
}

impl Default for SwarmSettings {
    fn default() -> Self {
        Self {
            max_workers: 4,
            timeout_minutes: 30,
            branch_prefix: "swarm/worker-".to_string(),
            default_shell: default_shell(),
            prompt_patterns: default_prompt_patterns(),
            claude_skip_permissions: false,
            claude_no_stream: false,
            auto_approve_high_confidence: false,
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

/// Worker タスクの実行状態（依存グラフ対応）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionState {
    /// 依存タスクが未完了（起動待ち）
    Waiting,
    /// 依存タスク全完了、起動可能
    Ready,
    /// Worker 起動中・実行中
    Running,
    /// 完了
    Done,
    /// エラー終了
    Error,
    /// 依存タスク失敗のためスキップ
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerAssignment {
    pub worker_id: String,
    pub task: SubTask,
    pub branch_name: String,
    pub status: WorkerStatus,
    pub execution_state: ExecutionState,
    /// Case A: 自動リトライ回数
    pub retry_count: u32,
}

/// update_worker_status が新たに起動すべき Worker を返す
pub struct SpawnRequest {
    pub worker_config: WorkerConfig,
    pub task_id: u32,
    pub is_retry: bool,
    pub old_worker_id: Option<String>, // リトライ時のみ Some
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
    pub settings: SwarmSettings,
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
    /// SubTask リストを受け取り、依存グラフを解析して即時実行可能な Worker を起動する
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
        let run_prefix = run_id.split('-').next().unwrap_or("0").to_string();

        // ベースブランチ取得
        let base_branch = current_branch(&repo).unwrap_or_else(|_| "main".to_string());

        // 全タスクの Assignment を事前作成（依存グラフ対応）
        let mut assignments: Vec<WorkerAssignment> = tasks
            .iter()
            .map(|task| {
                let branch_name = format!(
                    "{}{}-{}",
                    settings.branch_prefix, run_prefix, task.id
                );
                let is_ready = task.depends_on.is_empty();
                WorkerAssignment {
                    worker_id: String::new(), // 起動時に付与
                    task: task.clone(),
                    branch_name,
                    status: WorkerStatus::Idle,
                    execution_state: if is_ready {
                        ExecutionState::Ready
                    } else {
                        ExecutionState::Waiting
                    },
                    retry_count: 0,
                }
            })
            .collect();

        // Git ブランチを全タスク分あらかじめ作成
        for assign in &assignments {
            if let Err(e) = create_worker_branch(&repo, &assign.branch_name) {
                eprintln!("[Orchestrator] branch create failed: {}", e);
            }
        }

        // Ready 状態のタスクを max_workers 上限内で起動
        let mut running_count = 0usize;
        let mut to_spawn: Vec<(usize, WorkerConfig)> = Vec::new(); // (index, config)

        for (idx, assign) in assignments.iter().enumerate() {
            if assign.execution_state == ExecutionState::Ready
                && running_count < settings.max_workers as usize
            {
                let config = make_worker_config(assign, &repo, &run_id, &settings);
                to_spawn.push((idx, config));
                running_count += 1;
            }
        }

        for (idx, config) in to_spawn {
            match {
                let mut mgr = worker_manager.lock().map_err(|e| e.to_string())?;
                mgr.spawn_worker(config, app.clone())
            } {
                Ok(worker_id) => {
                    assignments[idx].worker_id = worker_id;
                    assignments[idx].execution_state = ExecutionState::Running;
                }
                Err(e) => {
                    eprintln!("[Orchestrator] spawn failed: {}", e);
                    assignments[idx].execution_state = ExecutionState::Error;
                }
            }
        }

        let total = assignments.len() as u32;
        let run = OrchestratorRun {
            run_id: run_id.clone(),
            status: RunStatus::Running,
            assignments,
            base_branch,
            project_path: project_path.clone(),
            merge_results: vec![],
            total,
            done_count: 0,
            settings: settings.clone(),
        };

        self.current_run = Some(run.clone());
        let _ = app.emit("orchestrator-status-changed", &run);

        Ok(run)
    }

    /// Worker のステータスを更新し、依存チェーンを解決して次の Worker を起動する準備をする。
    /// 戻り値: 新たに起動すべき Worker 設定のリスト
    pub fn update_worker_status(
        &mut self,
        worker_id: &str,
        status: WorkerStatus,
        app: &AppHandle,
    ) -> Vec<SpawnRequest> {
        let run = match self.current_run.as_mut() {
            Some(r) => r,
            None => return vec![],
        };

        let mut spawn_requests: Vec<SpawnRequest> = Vec::new();

        // 対象 Worker を特定して状態を更新
        let mut completed_task_id: Option<u32> = None;
        let mut is_error = false;

        for assign in &mut run.assignments {
            if assign.worker_id != worker_id {
                continue;
            }

            if status == WorkerStatus::Error && assign.retry_count < 1 {
                // Case A: 自動リトライ（1回のみ）
                assign.retry_count += 1;
                assign.status = WorkerStatus::Retrying;
                assign.execution_state = ExecutionState::Running;
                let config = make_worker_config(assign, &PathBuf::from(&run.project_path), &run.run_id, &run.settings);
                spawn_requests.push(SpawnRequest {
                    worker_config: config,
                    task_id: assign.task.id,
                    is_retry: true,
                    old_worker_id: Some(worker_id.to_string()),
                });
            } else {
                assign.status = status.clone();
                assign.execution_state = match status {
                    WorkerStatus::Done => ExecutionState::Done,
                    WorkerStatus::Error => ExecutionState::Error,
                    _ => assign.execution_state.clone(),
                };
                if status == WorkerStatus::Done {
                    completed_task_id = Some(assign.task.id);
                } else if status == WorkerStatus::Error {
                    is_error = true;
                    // エラー時: このタスクに依存するタスクをスキップ
                    let error_task_id = assign.task.id;
                    skip_dependents(run, error_task_id);
                }
            }
            break;
        }

        // 依存解決: Done になったタスクがある場合、待機中タスクをチェック
        if let Some(done_task_id) = completed_task_id {
            let _ = done_task_id; // 依存チェックは全 Waiting タスクに対して行う
            let repo = PathBuf::from(&run.project_path);
            let run_id = run.run_id.clone();

            // 完了タスク ID セットを収集（借用衝突を避けるため先に収集）
            let done_ids: std::collections::HashSet<u32> = run
                .assignments
                .iter()
                .filter(|a| a.execution_state == ExecutionState::Done)
                .map(|a| a.task.id)
                .collect();

            // 現在 Running/Waiting の数を数える
            let running_count = run
                .assignments
                .iter()
                .filter(|a| a.execution_state == ExecutionState::Running)
                .count();

            // Waiting タスクで依存がすべて Done になったものを Ready にして起動
            let mut new_spawns: Vec<(usize, WorkerConfig)> = Vec::new();
            for (idx, assign) in run.assignments.iter().enumerate() {
                if assign.execution_state != ExecutionState::Waiting {
                    continue;
                }
                let all_deps_done = assign.task.depends_on.iter().all(|dep| done_ids.contains(dep));
                if all_deps_done
                    && running_count + new_spawns.len() < run.settings.max_workers as usize
                    && can_spawn_worker()
                {
                    let config = make_worker_config(assign, &repo, &run_id, &run.settings);
                    new_spawns.push((idx, config));
                }
            }

            for (idx, config) in new_spawns {
                run.assignments[idx].execution_state = ExecutionState::Ready;
                spawn_requests.push(SpawnRequest {
                    worker_config: config,
                    task_id: run.assignments[idx].task.id,
                    is_retry: false,
                    old_worker_id: None,
                });
            }
        }

        // 全体完了チェック（Waiting/Running がないこと）
        run.done_count = run
            .assignments
            .iter()
            .filter(|a| matches!(a.execution_state, ExecutionState::Done | ExecutionState::Error | ExecutionState::Skipped))
            .count() as u32;

        let all_finished = run.assignments.iter().all(|a| {
            matches!(
                a.execution_state,
                ExecutionState::Done | ExecutionState::Error | ExecutionState::Skipped
            )
        });

        let pending_spawns = spawn_requests.iter().filter(|r| !r.is_retry).count();
        if all_finished && pending_spawns == 0 && spawn_requests.iter().all(|r| r.is_retry) {
            // リトライ中は「まだ実行中」
        } else if all_finished && pending_spawns == 0 {
            run.status = RunStatus::Merging;
            let _ = app.emit("orchestrator-merge-ready", &run);
        } else {
            let _ = app.emit("orchestrator-status-changed", &run);
        }

        if is_error {
            // エラー後にスキップ完了で全終了することがあるので再チェック
            let all_finished2 = run.assignments.iter().all(|a| {
                matches!(
                    a.execution_state,
                    ExecutionState::Done | ExecutionState::Error | ExecutionState::Skipped
                )
            });
            if all_finished2 && spawn_requests.is_empty() {
                run.status = RunStatus::Merging;
                let _ = app.emit("orchestrator-merge-ready", &run);
            }
        }

        spawn_requests
    }

    /// リトライ Worker の worker_id を更新する（spawn 後に旧 ID → 新 ID）
    pub fn update_worker_id_for_task(&mut self, task_id: u32, new_worker_id: String) {
        if let Some(run) = self.current_run.as_mut() {
            for assign in &mut run.assignments {
                if assign.task.id == task_id {
                    assign.worker_id = new_worker_id;
                    assign.execution_state = ExecutionState::Running;
                    break;
                }
            }
        }
    }

    /// 集約結果を取得する（マージ完了後）
    pub fn get_aggregated_result(&self) -> Option<AggregatedResult> {
        let run = self.current_run.as_ref()?;
        let repo = PathBuf::from(&run.project_path);

        let assignments_info: Vec<(&str, &str, bool)> = run
            .assignments
            .iter()
            .map(|a| {
                let succeeded = matches!(a.execution_state, ExecutionState::Done);
                (a.worker_id.as_str(), a.branch_name.as_str(), succeeded)
            })
            .collect();

        Some(ResultAggregator::aggregate(&repo, &run.base_branch, &assignments_info))
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
            .filter(|a| matches!(a.execution_state, ExecutionState::Done))
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
                if !assign.worker_id.is_empty() {
                    let _ = mgr.kill_worker(&assign.worker_id, app.clone());
                }
            }
        }

        let _ = app.emit("orchestrator-status-changed", &run);
    }
}

// ─── ヘルパー関数 ───────────────────────────────────────────────

/// WorkerAssignment から WorkerConfig を生成する
fn make_worker_config(
    assign: &WorkerAssignment,
    repo: &PathBuf,
    run_id: &str,
    settings: &SwarmSettings,
) -> WorkerConfig {
    let mut metadata = HashMap::new();
    metadata.insert("task_instruction".to_string(), assign.task.instruction.clone());
    metadata.insert("orchestration_run_id".to_string(), run_id.to_string());
    metadata.insert("branch_name".to_string(), assign.branch_name.clone());
    metadata.insert("task_id".to_string(), assign.task.id.to_string());
    // Feature 12-4: Shell / Claude Code 設定を metadata 経由で manager に伝達
    metadata.insert("default_shell".to_string(), settings.default_shell.clone());
    if settings.claude_skip_permissions {
        metadata.insert("claude_flag_skip_permissions".to_string(), "1".to_string());
    }
    if settings.claude_no_stream {
        metadata.insert("claude_flag_no_stream".to_string(), "1".to_string());
    }

    WorkerConfig {
        kind: WorkerKind::ClaudeCode,
        mode: WorkerMode::Batch,
        label: assign.task.title.clone(),
        working_dir: repo.clone(),
        depends_on: vec![],
        metadata,
    }
}

/// 指定タスク ID に依存するすべての Waiting タスクを Skipped にする（再帰的）
fn skip_dependents(run: &mut OrchestratorRun, failed_task_id: u32) {
    // 1パスで Waiting タスクの中から依存先が failed_task_id を含むものを探す
    let mut newly_skipped: Vec<u32> = Vec::new();

    for assign in &mut run.assignments {
        if assign.execution_state == ExecutionState::Waiting
            && assign.task.depends_on.contains(&failed_task_id)
        {
            assign.execution_state = ExecutionState::Skipped;
            newly_skipped.push(assign.task.id);
        }
    }

    // スキップされたタスクにさらに依存するタスクも再帰的にスキップ
    for skipped_id in newly_skipped {
        skip_dependents(run, skipped_id);
    }
}

// ─── バックグラウンドモニター ──────────────────────────────────

fn start_monitor(
    _run_id: String,
    _worker_manager: SharedWorkerManager,
    _app: AppHandle,
) {
    // Frontend の orchestrator_notify_worker_done が主系
    // このモニターはフォールバック用（現在は reserved）
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(id: u32, depends_on: Vec<u32>) -> SubTask {
        SubTask {
            id,
            title: format!("Task {}", id),
            files: vec![],
            instruction: format!("do task {}", id),
            depends_on,
        }
    }

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
    fn execution_state_serializes_correctly() {
        let state = ExecutionState::Waiting;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"waiting\"");
    }

    #[test]
    fn worker_assignment_has_all_fields() {
        let assign = WorkerAssignment {
            worker_id: "w1".into(),
            task: make_task(1, vec![]),
            branch_name: "swarm/worker-abc-1".into(),
            status: WorkerStatus::Idle,
            execution_state: ExecutionState::Ready,
            retry_count: 0,
        };
        assert_eq!(assign.branch_name, "swarm/worker-abc-1");
        assert_eq!(assign.execution_state, ExecutionState::Ready);
    }

    #[test]
    fn skip_dependents_marks_transitively() {
        let mut run = OrchestratorRun {
            run_id: "r1".into(),
            status: RunStatus::Running,
            assignments: vec![
                WorkerAssignment {
                    worker_id: "w1".into(), task: make_task(1, vec![]),
                    branch_name: "b1".into(), status: WorkerStatus::Error,
                    execution_state: ExecutionState::Error, retry_count: 0,
                },
                WorkerAssignment {
                    worker_id: "".into(), task: make_task(2, vec![1]),
                    branch_name: "b2".into(), status: WorkerStatus::Idle,
                    execution_state: ExecutionState::Waiting, retry_count: 0,
                },
                WorkerAssignment {
                    worker_id: "".into(), task: make_task(3, vec![2]),
                    branch_name: "b3".into(), status: WorkerStatus::Idle,
                    execution_state: ExecutionState::Waiting, retry_count: 0,
                },
            ],
            base_branch: "main".into(),
            project_path: "/tmp".into(),
            merge_results: vec![],
            total: 3,
            done_count: 0,
        };

        skip_dependents(&mut run, 1);
        assert_eq!(run.assignments[1].execution_state, ExecutionState::Skipped);
        assert_eq!(run.assignments[2].execution_state, ExecutionState::Skipped);
    }
}
