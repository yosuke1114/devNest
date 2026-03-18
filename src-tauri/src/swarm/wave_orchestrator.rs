use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use super::orchestrator::Orchestrator;
use super::settings::SwarmSettings;
use super::subtask::SubTask;
use super::wave::{compute_waves, Wave, WaveGateResult, WaveStatus};
use super::wave_gate::WaveGate;
use super::worker::{ExecutionState, RunStatus, SpawnRequest, WorkerStatus};

pub type SharedWaveOrchestrator = Arc<Mutex<WaveOrchestrator>>;

/// WaveOrchestrator: Wave レベルの進行を管理する上位レイヤー。
/// 各 Wave 内のワーカー管理は内部の Orchestrator に委譲する。
///
/// ```text
/// WaveOrchestrator
///   ├── Wave 1 → Orchestrator.start_run(wave1_tasks)
///   │     ├── Worker A (task 1)
///   │     └── Worker B (task 2)
///   │     → Gate check (merge + test + review)
///   ├── Wave 2 → Orchestrator.start_run(wave2_tasks)
///   │     └── Worker C (task 3)
///   │     → Gate check
///   └── Wave 3 → ...
/// ```
#[derive(Debug)]
pub struct WaveOrchestrator {
    /// 全タスク（Wave 分割前の元データ）
    all_tasks: Vec<SubTask>,
    /// 算出された Wave 構造
    waves: Vec<Wave>,
    /// 現在実行中の Wave 番号（1-indexed）
    current_wave: u32,
    /// Swarm 設定
    settings: SwarmSettings,
    /// プロジェクトパス
    project_path: String,
    /// 内部 Orchestrator（現在の Wave のワーカーを管理）
    orchestrator: Orchestrator,
    /// 各 Wave の Gate 結果
    gate_results: Vec<WaveGateResult>,
    /// 全体ステータス
    status: WaveOrchestratorStatus,
}

/// WaveOrchestrator 全体のステータス
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WaveOrchestratorStatus {
    /// 未開始
    Idle,
    /// Wave 実行中
    Running,
    /// Gate チェック中
    Gating,
    /// 全 Wave 完了
    Done,
    /// Gate 失敗で停止
    Blocked,
    /// キャンセル済み
    Cancelled,
}

/// WaveOrchestrator の状態スナップショット（フロントエンド送信用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveOrchestratorSnapshot {
    pub waves: Vec<Wave>,
    pub current_wave: u32,
    pub status: WaveOrchestratorStatus,
    pub gate_results: Vec<WaveGateResult>,
    pub total_tasks: u32,
    pub completed_tasks: u32,
    pub failed_tasks: u32,
}

impl WaveOrchestrator {
    /// 新しい WaveOrchestrator を作成し、Wave 構造を算出する。
    /// Wave が 1 つしかない場合もそのまま動作する（フラット実行と同等）。
    pub fn new(
        tasks: Vec<SubTask>,
        settings: SwarmSettings,
        project_path: String,
    ) -> Self {
        let waves = compute_waves(&tasks);
        Self {
            all_tasks: tasks,
            waves,
            current_wave: 0,
            settings,
            project_path,
            orchestrator: Orchestrator::new(),
            gate_results: vec![],
            status: WaveOrchestratorStatus::Idle,
        }
    }

    /// Wave 1 を開始する。戻り値の SpawnRequest でワーカーを起動する。
    pub fn start(&mut self) -> Result<Vec<SpawnRequest>, String> {
        if self.waves.is_empty() {
            return Err("タスクがありません".into());
        }
        if self.status != WaveOrchestratorStatus::Idle {
            return Err("既に実行中です".into());
        }

        self.current_wave = 1;
        self.status = WaveOrchestratorStatus::Running;
        self.waves[0].status = WaveStatus::Running;

        let wave1_tasks = self.tasks_for_wave(1);
        let (_, spawns) = self.orchestrator.start_run(
            wave1_tasks,
            self.settings.clone(),
            self.project_path.clone(),
        )?;

        Ok(spawns)
    }

    /// ワーカーの状態更新を内部 Orchestrator に委譲する。
    /// 現在の Wave が全完了した場合、Gate Ready 状態を返す。
    pub fn update_worker_status(
        &mut self,
        worker_id: &str,
        new_status: WorkerStatus,
    ) -> WorkerUpdateResult {
        let new_spawns = self.orchestrator.update_worker_status(worker_id, new_status);

        if self.orchestrator.is_all_terminal() {
            // 現在の Wave の全タスクが終端状態
            if let Some(wave) = self
                .waves
                .iter_mut()
                .find(|w| w.wave_number == self.current_wave)
            {
                wave.status = WaveStatus::Gating;
            }
            self.status = WaveOrchestratorStatus::Gating;

            WorkerUpdateResult {
                new_spawns: vec![],
                wave_gate_ready: true,
            }
        } else {
            WorkerUpdateResult {
                new_spawns,
                wave_gate_ready: false,
            }
        }
    }

    /// ワーカーID をタスクに紐付ける（Orchestrator に委譲）
    pub fn assign_worker_id(&mut self, task_id: u32, worker_id: String) {
        self.orchestrator.assign_worker_id(task_id, worker_id);
    }

    /// Gate チェックを実行する
    pub async fn run_gate(&mut self) -> Result<WaveGateResult, String> {
        if self.status != WaveOrchestratorStatus::Gating {
            return Err("Gate 実行可能な状態ではありません".into());
        }

        let branches = self.orchestrator.completed_branches();
        let gate = WaveGate::new(&self.project_path, &self.settings.base_branch);
        let result = gate.execute(&branches).await;

        self.apply_gate_result(result.clone());
        Ok(result)
    }

    /// Gate 結果を適用し、次の Wave に進むか判定する。
    /// 外部から Gate 結果を渡す場合に使用（テスト等）。
    pub fn apply_gate_result(&mut self, result: WaveGateResult) -> Vec<SpawnRequest> {
        // 現在 Wave の状態を更新
        if let Some(wave) = self
            .waves
            .iter_mut()
            .find(|w| w.wave_number == self.current_wave)
        {
            wave.gate_result = Some(result.clone());
            wave.status = match result.overall {
                super::wave::GateOverall::Passed => WaveStatus::Passed,
                super::wave::GateOverall::PassedWithWarnings => WaveStatus::PassedWithWarnings,
                super::wave::GateOverall::Blocked => WaveStatus::Failed,
            };
        }
        self.gate_results.push(result.clone());

        // Blocked → 停止
        if result.overall == super::wave::GateOverall::Blocked {
            self.status = WaveOrchestratorStatus::Blocked;
            return vec![];
        }

        // 次 Wave に進む
        self.advance_to_next_wave()
    }

    /// 次 Wave のタスクを Orchestrator に渡して実行開始する
    fn advance_to_next_wave(&mut self) -> Vec<SpawnRequest> {
        let next = self.current_wave + 1;

        // 次 Wave が存在するか
        let next_exists = self.waves.iter().any(|w| w.wave_number == next);
        if !next_exists {
            self.status = WaveOrchestratorStatus::Done;
            return vec![];
        }

        // Orchestrator をリセットして次 Wave のタスクを投入
        self.orchestrator.clear_run();
        self.current_wave = next;
        self.status = WaveOrchestratorStatus::Running;

        if let Some(wave) = self.waves.iter_mut().find(|w| w.wave_number == next) {
            wave.status = WaveStatus::Running;
        }

        let next_tasks = self.tasks_for_wave(next);
        match self.orchestrator.start_run(
            next_tasks,
            self.settings.clone(),
            self.project_path.clone(),
        ) {
            Ok((_, spawns)) => spawns,
            Err(_) => vec![],
        }
    }

    /// Wave 番号に該当するタスクを取得する
    fn tasks_for_wave(&self, wave_number: u32) -> Vec<SubTask> {
        let task_ids: Vec<u32> = self
            .waves
            .iter()
            .find(|w| w.wave_number == wave_number)
            .map(|w| w.task_ids.clone())
            .unwrap_or_default();

        self.all_tasks
            .iter()
            .filter(|t| task_ids.contains(&t.id))
            .cloned()
            .collect()
    }

    /// キャンセルする
    pub fn cancel(&mut self) {
        self.orchestrator.cancel();
        self.status = WaveOrchestratorStatus::Cancelled;
        for wave in &mut self.waves {
            if wave.status == WaveStatus::Pending || wave.status == WaveStatus::Running {
                wave.status = WaveStatus::Failed;
            }
        }
    }

    /// 状態スナップショットを生成する
    pub fn snapshot(&self) -> WaveOrchestratorSnapshot {
        let (completed, failed) = self.count_tasks();
        WaveOrchestratorSnapshot {
            waves: self.waves.clone(),
            current_wave: self.current_wave,
            status: self.status.clone(),
            gate_results: self.gate_results.clone(),
            total_tasks: self.all_tasks.len() as u32,
            completed_tasks: completed,
            failed_tasks: failed,
        }
    }

    /// Wave モードか判定（Wave が 2 つ以上ある場合）
    pub fn is_wave_mode(&self) -> bool {
        self.waves.len() > 1
    }

    /// Wave 数を返す
    pub fn wave_count(&self) -> usize {
        self.waves.len()
    }

    /// 完了・失敗タスク数をカウントする
    fn count_tasks(&self) -> (u32, u32) {
        if let Some(run) = &self.orchestrator.current_run {
            (run.completed, run.failed)
        } else {
            // 過去の Wave の合計を含めるには別途追跡が必要
            // 現時点では現在 Wave のみ
            (0, 0)
        }
    }
}

/// update_worker_status の戻り値
#[derive(Debug)]
pub struct WorkerUpdateResult {
    /// 新たに起動すべきワーカー
    pub new_spawns: Vec<SpawnRequest>,
    /// 現在 Wave の全タスクが完了し、Gate チェックが必要か
    pub wave_gate_ready: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::wave_gate::{make_blocked_result, make_passed_result, make_warning_result};

    fn task(id: u32, deps: Vec<u32>) -> SubTask {
        SubTask {
            id,
            title: format!("Task {}", id),
            files: vec![],
            instruction: format!("do {}", id),
            depends_on: deps,
        }
    }

    fn settings() -> SwarmSettings {
        SwarmSettings {
            max_workers: 4,
            branch_prefix: "swarm/task-".into(),
            base_branch: "main".into(),
            max_retries: 0,
        }
    }

    #[test]
    fn single_wave_flow() {
        let tasks = vec![task(1, vec![]), task(2, vec![]), task(3, vec![])];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());

        assert!(!wo.is_wave_mode()); // 全独立 = 1 Wave
        assert_eq!(wo.wave_count(), 1);

        let spawns = wo.start().unwrap();
        assert_eq!(spawns.len(), 3);
        assert_eq!(wo.status, WaveOrchestratorStatus::Running);

        // 全ワーカー完了
        for (i, spawn) in spawns.iter().enumerate() {
            wo.assign_worker_id(spawn.task_id, format!("w{}", i));
        }
        wo.update_worker_status("w0", WorkerStatus::Done);
        wo.update_worker_status("w1", WorkerStatus::Done);
        let result = wo.update_worker_status("w2", WorkerStatus::Done);

        assert!(result.wave_gate_ready);
        assert_eq!(wo.status, WaveOrchestratorStatus::Gating);

        // Gate パス → Done
        wo.apply_gate_result(make_passed_result());
        assert_eq!(wo.status, WaveOrchestratorStatus::Done);
    }

    #[test]
    fn multi_wave_flow() {
        // Task 1,2 → Wave 1, Task 3(deps=[1]) → Wave 2
        let tasks = vec![task(1, vec![]), task(2, vec![]), task(3, vec![1])];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());

        assert!(wo.is_wave_mode());
        assert_eq!(wo.wave_count(), 2);

        // Wave 1 開始
        let spawns = wo.start().unwrap();
        assert_eq!(spawns.len(), 2); // Task 1, 2

        for (i, spawn) in spawns.iter().enumerate() {
            wo.assign_worker_id(spawn.task_id, format!("w{}", i));
        }
        wo.update_worker_status("w0", WorkerStatus::Done);
        let result = wo.update_worker_status("w1", WorkerStatus::Done);
        assert!(result.wave_gate_ready);

        // Gate パス → Wave 2 開始
        let wave2_spawns = wo.apply_gate_result(make_passed_result());
        assert_eq!(wo.status, WaveOrchestratorStatus::Running);
        assert_eq!(wo.current_wave, 2);
        assert_eq!(wave2_spawns.len(), 1); // Task 3

        // Wave 2 完了
        wo.assign_worker_id(wave2_spawns[0].task_id, "w3".into());
        let result = wo.update_worker_status("w3", WorkerStatus::Done);
        assert!(result.wave_gate_ready);

        // Gate パス → Done
        wo.apply_gate_result(make_passed_result());
        assert_eq!(wo.status, WaveOrchestratorStatus::Done);
    }

    #[test]
    fn gate_blocked_stops_execution() {
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());

        let spawns = wo.start().unwrap();
        wo.assign_worker_id(spawns[0].task_id, "w0".into());
        wo.update_worker_status("w0", WorkerStatus::Done);

        // Gate ブロック
        let next_spawns = wo.apply_gate_result(make_blocked_result());
        assert!(next_spawns.is_empty());
        assert_eq!(wo.status, WaveOrchestratorStatus::Blocked);
    }

    #[test]
    fn gate_warning_continues() {
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());

        let spawns = wo.start().unwrap();
        wo.assign_worker_id(spawns[0].task_id, "w0".into());
        wo.update_worker_status("w0", WorkerStatus::Done);

        // Gate 警告あり → 次 Wave に進む
        let next_spawns = wo.apply_gate_result(make_warning_result());
        assert_eq!(next_spawns.len(), 1);
        assert_eq!(wo.status, WaveOrchestratorStatus::Running);
    }

    #[test]
    fn cancel_stops_all() {
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());
        wo.start().unwrap();

        wo.cancel();
        assert_eq!(wo.status, WaveOrchestratorStatus::Cancelled);
    }

    #[test]
    fn snapshot_reflects_state() {
        let tasks = vec![task(1, vec![]), task(2, vec![])];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());
        wo.start().unwrap();

        let snap = wo.snapshot();
        assert_eq!(snap.total_tasks, 2);
        assert_eq!(snap.current_wave, 1);
        assert_eq!(snap.status, WaveOrchestratorStatus::Running);
    }

    #[test]
    fn three_wave_diamond() {
        // 1 → 2,3 → 4(deps=[2,3])
        let tasks = vec![
            task(1, vec![]),
            task(2, vec![1]),
            task(3, vec![1]),
            task(4, vec![2, 3]),
        ];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());
        assert_eq!(wo.wave_count(), 3);

        // Wave 1
        let spawns = wo.start().unwrap();
        assert_eq!(spawns.len(), 1);
        wo.assign_worker_id(1, "w1".into());
        wo.update_worker_status("w1", WorkerStatus::Done);
        let wave2 = wo.apply_gate_result(make_passed_result());

        // Wave 2
        assert_eq!(wave2.len(), 2);
        for s in &wave2 {
            wo.assign_worker_id(s.task_id, format!("w{}", s.task_id));
        }
        wo.update_worker_status("w2", WorkerStatus::Done);
        wo.update_worker_status("w3", WorkerStatus::Done);
        let wave3 = wo.apply_gate_result(make_passed_result());

        // Wave 3
        assert_eq!(wave3.len(), 1);
        assert_eq!(wave3[0].task_id, 4);
        wo.assign_worker_id(4, "w4".into());
        wo.update_worker_status("w4", WorkerStatus::Done);
        wo.apply_gate_result(make_passed_result());

        assert_eq!(wo.status, WaveOrchestratorStatus::Done);
    }
}
