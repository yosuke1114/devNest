use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use super::orchestrator::Orchestrator;
use super::settings::SwarmSettings;
use super::subtask::SubTask;
use super::wave::{compute_waves, Wave, WaveGateResult, WaveStatus};
use super::wave_gate::WaveGate;
use super::worker::{RunStatus, SpawnRequest, WorkerStatus};

pub type SharedWaveOrchestrator = Arc<Mutex<WaveOrchestrator>>;

/// WaveOrchestrator: Wave レベルの進行を管理する上位レイヤー。
/// 各 Wave 内のワーカー管理は内部の Orchestrator に委譲する。
///
/// ハイブリッド設計:
///   - Orchestrator が全 Wave のタスクを1つの Run で管理（start_run_with_waves）
///   - WaveOrchestrator が Wave 間遷移・Gate チェックを調整
///   - 単一 Run なので completed/failed カウントが Wave 横断で正確に累積
///
/// ```text
/// WaveOrchestrator (Wave 進行管理)
///   ├── Wave 1 → Orchestrator.start_run_with_waves(全タスク)
///   │     ├── Worker A (task 1)
///   │     └── Worker B (task 2)
///   │     → Gate check (merge + test + review)
///   │     → Orchestrator.advance_wave(gate_result)
///   ├── Wave 2 → タスク自動昇格
///   │     └── Worker C (task 3)
///   │     → Gate check
///   └── Wave 3 → ...
/// ```
#[derive(Debug)]
pub struct WaveOrchestrator {
    /// 全タスク（Wave 分割前の元データ）
    all_tasks: Vec<SubTask>,
    /// 算出された Wave 構造（初期表示用。開始後は orchestrator.current_run.waves が最新）
    waves: Vec<Wave>,
    /// Swarm 設定
    pub(crate) settings: SwarmSettings,
    /// プロジェクトパス
    pub(crate) project_path: String,
    /// 内部 Orchestrator（全 Wave のタスクを管理）
    pub(crate) orchestrator: Orchestrator,
    /// 全体ステータス
    pub(crate) status: WaveOrchestratorStatus,
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
    pub fn new(tasks: Vec<SubTask>, settings: SwarmSettings, project_path: String) -> Self {
        let waves = compute_waves(&tasks);
        Self {
            all_tasks: tasks,
            waves,
            settings,
            project_path,
            orchestrator: Orchestrator::new(),
            status: WaveOrchestratorStatus::Idle,
        }
    }

    /// Wave モードで実行を開始する。
    /// Orchestrator.start_run_with_waves() に全タスクを委譲し、Wave 1 の SpawnRequest を返す。
    pub fn start(&mut self) -> Result<Vec<SpawnRequest>, String> {
        if self.waves.is_empty() {
            return Err("タスクがありません".into());
        }
        if self.status != WaveOrchestratorStatus::Idle {
            return Err("既に実行中です".into());
        }

        self.status = WaveOrchestratorStatus::Running;

        let (_, spawns) = self.orchestrator.start_run_with_waves(
            self.all_tasks.clone(),
            self.settings.clone(),
            self.project_path.clone(),
        )?;

        // orchestrator が Wave 構造を持っているので、ローカルの waves を同期
        self.sync_waves_from_orchestrator();

        Ok(spawns)
    }

    /// ワーカーの状態更新を内部 Orchestrator に委譲する。
    /// 現在の Wave が全完了した場合、Gate Ready 状態を返す。
    pub fn update_worker_status(
        &mut self,
        worker_id: &str,
        new_status: WorkerStatus,
    ) -> WorkerUpdateResult {
        let new_spawns = self
            .orchestrator
            .update_worker_status(worker_id, new_status);

        if self.orchestrator.is_current_wave_complete() {
            // 現在の Wave の全タスクが終端状態 → Gate チェックへ
            self.status = WaveOrchestratorStatus::Gating;
            self.sync_waves_from_orchestrator();

            // 現在 Wave を Gating に更新
            if let Some(run) = &mut self.orchestrator.current_run {
                let current = run.current_wave.unwrap_or(0);
                if let Some(waves) = &mut run.waves {
                    if let Some(wave) = waves.iter_mut().find(|w| w.wave_number == current) {
                        wave.status = WaveStatus::Gating;
                    }
                }
            }

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

        // 現在 Wave の完了ブランチのみ取得
        let current_wave = self
            .orchestrator
            .current_run
            .as_ref()
            .and_then(|r| r.current_wave)
            .unwrap_or(1);
        let branches = self.orchestrator.completed_branches_for_wave(current_wave);
        let gate_config = super::wave_gate::GateConfig::load(std::path::Path::new(&self.project_path));
        let gate = WaveGate::with_config(&self.project_path, &self.settings.base_branch, gate_config);
        let result = gate.execute(&branches).await;

        Ok(result)
    }

    /// Gate 結果を適用し、次の Wave に進むか判定する。
    /// Orchestrator.advance_wave() に委譲して Wave 遷移を行う。
    pub fn apply_gate_result(&mut self, result: WaveGateResult) -> Vec<SpawnRequest> {
        // Orchestrator に Gate 結果を渡して次 Wave に進む
        let spawns = self.orchestrator.advance_wave(result.clone());

        // WaveOrchestrator のステータスを更新
        if result.overall == super::wave::GateOverall::Blocked {
            self.status = WaveOrchestratorStatus::Blocked;
        } else {
            // 次 Wave があるか確認
            let has_next_wave = !spawns.is_empty();
            let run_done = self
                .orchestrator
                .current_run
                .as_ref()
                .map(|r| r.status == RunStatus::Done)
                .unwrap_or(false);

            if run_done || !has_next_wave {
                self.status = WaveOrchestratorStatus::Done;
            } else {
                self.status = WaveOrchestratorStatus::Running;
            }
        }

        // Wave 状態を同期
        self.sync_waves_from_orchestrator();

        spawns
    }

    /// キャンセルする
    pub fn cancel(&mut self) {
        self.orchestrator.cancel();
        self.status = WaveOrchestratorStatus::Cancelled;
        self.sync_waves_from_orchestrator();
    }

    /// 状態スナップショットを生成する
    pub fn snapshot(&self) -> WaveOrchestratorSnapshot {
        if let Some(run) = &self.orchestrator.current_run {
            WaveOrchestratorSnapshot {
                waves: run.waves.clone().unwrap_or_else(|| self.waves.clone()),
                current_wave: run.current_wave.unwrap_or(0),
                status: self.status.clone(),
                gate_results: run.gate_results.clone().unwrap_or_default(),
                total_tasks: run.total,
                completed_tasks: run.completed,
                failed_tasks: run.failed,
            }
        } else {
            WaveOrchestratorSnapshot {
                waves: self.waves.clone(),
                current_wave: 0,
                status: self.status.clone(),
                gate_results: vec![],
                total_tasks: self.all_tasks.len() as u32,
                completed_tasks: 0,
                failed_tasks: 0,
            }
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

    /// 内部 Orchestrator への参照（ハイブリッドアクセス用）
    pub fn orchestrator(&self) -> &Orchestrator {
        &self.orchestrator
    }

    /// 内部 Orchestrator への可変参照（ハイブリッドアクセス用）
    pub fn orchestrator_mut(&mut self) -> &mut Orchestrator {
        &mut self.orchestrator
    }

    /// Orchestrator の Wave 状態をローカルの waves フィールドに同期する
    fn sync_waves_from_orchestrator(&mut self) {
        if let Some(run) = &self.orchestrator.current_run {
            if let Some(waves) = &run.waves {
                self.waves = waves.clone();
            }
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
    use super::super::wave_gate::{make_blocked_result, make_passed_result, make_warning_result};
    use super::*;

    fn task(id: u32, deps: Vec<u32>) -> SubTask {
        SubTask {
            id,
            title: format!("Task {}", id),
            role: crate::swarm::subtask::TaskRole::Builder,
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
            timeout_minutes: 30,
            default_shell: "zsh".into(),
            prompt_patterns: "$|%|>".into(),
            claude_skip_permissions: false,
            claude_no_stream: false,
            auto_approve_high_confidence: false,
            claude_interactive: false,
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
        let _result = wo.update_worker_status("w2", WorkerStatus::Done);

        // 単一 Wave → フラット実行のため、is_current_wave_complete は false
        // (Wave フィールドが None なので)
        // ただし is_all_terminal は true
        assert!(wo.orchestrator().is_all_terminal());

        // フラット実行時は RunStatus::Done になる
        let snap = wo.snapshot();
        assert_eq!(snap.completed_tasks, 3);
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
        assert_eq!(wo.status, WaveOrchestratorStatus::Gating);

        // Gate パス → Wave 2 開始
        let wave2_spawns = wo.apply_gate_result(make_passed_result());
        assert_eq!(wo.status, WaveOrchestratorStatus::Running);
        assert_eq!(wave2_spawns.len(), 1); // Task 3

        let snap = wo.snapshot();
        assert_eq!(snap.current_wave, 2);
        assert_eq!(snap.completed_tasks, 2); // Wave 1 の2タスク

        // Wave 2 完了
        wo.assign_worker_id(wave2_spawns[0].task_id, "w3".into());
        let result = wo.update_worker_status("w3", WorkerStatus::Done);
        assert!(result.wave_gate_ready);

        // Gate パス → Done
        wo.apply_gate_result(make_passed_result());
        assert_eq!(wo.status, WaveOrchestratorStatus::Done);

        let snap = wo.snapshot();
        assert_eq!(snap.completed_tasks, 3);
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
        let snap = wo.snapshot();
        assert_eq!(snap.completed_tasks, 4);
    }

    #[test]
    fn gate_results_accumulate() {
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());

        let spawns = wo.start().unwrap();
        wo.assign_worker_id(spawns[0].task_id, "w0".into());
        wo.update_worker_status("w0", WorkerStatus::Done);

        // Wave 1 Gate
        let wave2 = wo.apply_gate_result(make_passed_result());
        wo.assign_worker_id(wave2[0].task_id, "w1".into());
        wo.update_worker_status("w1", WorkerStatus::Done);

        // Wave 2 Gate
        wo.apply_gate_result(make_warning_result());

        let snap = wo.snapshot();
        assert_eq!(snap.gate_results.len(), 2);
        assert_eq!(wo.status, WaveOrchestratorStatus::Done);
    }

    #[test]
    fn orchestrator_accessor() {
        let tasks = vec![task(1, vec![]), task(2, vec![1])];
        let mut wo = WaveOrchestrator::new(tasks, settings(), "/tmp".into());
        wo.start().unwrap();

        // ハイブリッドアクセス: Orchestrator の Wave メソッドに直接アクセス
        assert!(wo.orchestrator().is_wave_mode());
        assert!(!wo.orchestrator().is_current_wave_complete());

        wo.assign_worker_id(1, "w0".into());
        wo.orchestrator_mut()
            .update_worker_status("w0", WorkerStatus::Done);

        assert!(wo.orchestrator().is_current_wave_complete());
    }
}
