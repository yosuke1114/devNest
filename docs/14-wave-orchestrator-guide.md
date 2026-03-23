# DevNest Wave × Orchestrator 統合 実装指示書

> **目的**: 既存のOrchestratorの依存グラフ制御にWave概念を上乗せし、
> Wave間に自動マージ・AIレビュー・テスト実行のゲートを挟む。
> **前提**: `swarm/orchestrator.rs` が依存グラフベースの並列実行を実装済み。
> **ブランチ**: `feature/swarm-wave-orchestrator`

---

## 1. 設計概要

```
【現状】
  depends_on ベースのフラット実行
  Task完了 → 即座に後続Task起動 → 全完了後にまとめてマージ

【統合後】
  depends_on → Wave構造を自動算出
  Wave 1: Orchestrator並列実行 → Wave Gate → Wave 2: Orchestrator並列実行 → ...

  Wave Gate = 自動マージ + AIレビュー + テスト実行
  全Gateパス → 次Wave自動開始
  Gateで問題検出 → 通知リング + UI表示（自動停止はしない、警告のみ）
```

### Wave内とWave間の責務分離

```
┌─ Wave 1 ──────────────────────────────────────┐
│  Orchestrator が担当（既存ロジック）              │
│                                                │
│  Task A ──┐                                    │
│  Task B ──┼── depends_on による細粒度制御        │
│  Task C ──┘   Ready→Running→Done の即座遷移     │
│               リトライ、スキップ、リソース監視    │
└────────────────────┬───────────────────────────┘
                     │
              ┌──────▼──────┐
              │  Wave Gate  │  ← 新規実装
              │             │
              │  1. マージ   │  成功ブランチをベースにマージ
              │  2. テスト   │  cargo test / npm test 実行
              │  3. レビュー │  review/engine でAIレビュー
              │  4. 判定    │  全パス → 次Wave / 問題 → 警告
              └──────┬──────┘
                     │
┌─ Wave 2 ──────────────────────────────────────┐
│  Orchestrator が担当（Wave 1 のマージ済みコードの上で）│
│                                                │
│  Task D (depends: [A]) ──┐                     │
│  Task E (depends: [B,C])─┘  並列実行            │
└────────────────────────────────────────────────┘
```

---

## 2. データモデル

### Wave 構造体

**ファイル作成先**: `src-tauri/src/swarm/wave.rs`

```rust
use serde::{Deserialize, Serialize};
use super::subtask::SubTask;

/// Wave: 並列実行可能なタスク群 + 完了後のゲート
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wave {
    pub wave_number: u32,          // 1-indexed
    pub task_ids: Vec<u32>,        // このWaveに属するタスクのID
    pub status: WaveStatus,
    pub gate_result: Option<WaveGateResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WaveStatus {
    /// 前のWaveが未完了
    Pending,
    /// Orchestrator が並列実行中
    Running,
    /// Wave内の全タスク完了、Gate実行中
    Gating,
    /// Gate通過、次Waveに進行可能
    Passed,
    /// Gate問題検出（警告あり、ただし次Wave開始は可能）
    PassedWithWarnings,
    /// Wave内タスクが全部失敗
    Failed,
}

/// Wave間ゲートの実行結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveGateResult {
    pub merge: GateStepResult,
    pub test: GateStepResult,
    pub review: GateStepResult,
    pub overall: GateOverall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GateStepResult {
    pub passed: bool,
    pub summary: String,
    pub details: Vec<String>,
    pub duration_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GateOverall {
    /// 全ステップ成功
    Passed,
    /// 警告あり（テスト失敗やレビュー指摘）だが続行可能
    PassedWithWarnings,
    /// マージ失敗（コンフリクト未解決）
    Blocked,
}

/// depends_on からWave構造を自動算出する
pub fn compute_waves(tasks: &[SubTask]) -> Vec<Wave> {
    let mut waves: Vec<Wave> = Vec::new();
    let mut assigned: std::collections::HashSet<u32> = std::collections::HashSet::new();
    let all_ids: std::collections::HashSet<u32> = tasks.iter().map(|t| t.id).collect();

    loop {
        // まだ未割り当てのタスクから、依存が全て割り当て済みのものを収集
        let wave_tasks: Vec<u32> = tasks
            .iter()
            .filter(|t| !assigned.contains(&t.id))
            .filter(|t| t.depends_on.iter().all(|dep| assigned.contains(dep)))
            .map(|t| t.id)
            .collect();

        if wave_tasks.is_empty() {
            // 残りは循環依存 → 強制的に最後のWaveに入れる
            let remaining: Vec<u32> = tasks
                .iter()
                .filter(|t| !assigned.contains(&t.id))
                .map(|t| t.id)
                .collect();
            if !remaining.is_empty() {
                waves.push(Wave {
                    wave_number: waves.len() as u32 + 1,
                    task_ids: remaining.clone(),
                    status: WaveStatus::Pending,
                    gate_result: None,
                });
                remaining.iter().for_each(|id| { assigned.insert(*id); });
            }
            break;
        }

        waves.push(Wave {
            wave_number: waves.len() as u32 + 1,
            task_ids: wave_tasks.clone(),
            status: if waves.is_empty() {
                WaveStatus::Pending // 最初のWaveもPending（start時にRunningに）
            } else {
                WaveStatus::Pending
            },
            gate_result: None,
        });

        wave_tasks.iter().for_each(|id| { assigned.insert(*id); });
    }

    waves
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::subtask::SubTask;

    fn task(id: u32, deps: Vec<u32>) -> SubTask {
        SubTask {
            id,
            title: format!("Task {}", id),
            files: vec![],
            instruction: format!("do {}", id),
            depends_on: deps,
        }
    }

    #[test]
    fn independent_tasks_single_wave() {
        let tasks = vec![task(1, vec![]), task(2, vec![]), task(3, vec![])];
        let waves = compute_waves(&tasks);
        assert_eq!(waves.len(), 1);
        assert_eq!(waves[0].task_ids.len(), 3);
    }

    #[test]
    fn linear_chain_one_per_wave() {
        let tasks = vec![task(1, vec![]), task(2, vec![1]), task(3, vec![2])];
        let waves = compute_waves(&tasks);
        assert_eq!(waves.len(), 3);
        assert_eq!(waves[0].task_ids, vec![1]);
        assert_eq!(waves[1].task_ids, vec![2]);
        assert_eq!(waves[2].task_ids, vec![3]);
    }

    #[test]
    fn diamond_dependency() {
        // 1 → 2, 1 → 3, 2+3 → 4
        let tasks = vec![
            task(1, vec![]),
            task(2, vec![1]),
            task(3, vec![1]),
            task(4, vec![2, 3]),
        ];
        let waves = compute_waves(&tasks);
        assert_eq!(waves.len(), 3);
        assert_eq!(waves[0].task_ids, vec![1]);
        assert!(waves[1].task_ids.contains(&2));
        assert!(waves[1].task_ids.contains(&3));
        assert_eq!(waves[2].task_ids, vec![4]);
    }

    #[test]
    fn mixed_independent_and_dependent() {
        let tasks = vec![
            task(1, vec![]),     // Wave 1
            task(2, vec![]),     // Wave 1
            task(3, vec![1]),    // Wave 2
            task(4, vec![]),     // Wave 1
            task(5, vec![3, 4]), // Wave 3
        ];
        let waves = compute_waves(&tasks);
        assert_eq!(waves.len(), 3);
        assert_eq!(waves[0].task_ids.len(), 3); // 1, 2, 4
        assert_eq!(waves[1].task_ids, vec![3]);
        assert_eq!(waves[2].task_ids, vec![5]);
    }
}
```

---

## 3. Wave Gate エンジン

**ファイル作成先**: `src-tauri/src/swarm/wave_gate.rs`

```rust
use std::path::Path;
use std::process::Command;
use std::time::Instant;

use tauri::AppHandle;

use super::wave::{GateOverall, GateStepResult, WaveGateResult};
use super::git_branch::merge_worker_branch;
use crate::review::engine::ReviewEngine;

/// Wave間ゲート: マージ → テスト → AIレビュー を順次実行
pub struct WaveGate {
    project_path: String,
    base_branch: String,
}

impl WaveGate {
    pub fn new(project_path: &str, base_branch: &str) -> Self {
        Self {
            project_path: project_path.to_string(),
            base_branch: base_branch.to_string(),
        }
    }

    /// Wave完了後のゲート処理を一括実行
    pub async fn execute(
        &self,
        succeeded_branches: &[String],
        app: &AppHandle,
    ) -> WaveGateResult {
        // Step 1: マージ
        let merge_result = self.run_merge_step(succeeded_branches, app).await;

        // Step 2: テスト（マージ成功時のみ）
        let test_result = if merge_result.passed {
            self.run_test_step().await
        } else {
            GateStepResult {
                passed: false,
                summary: "マージ失敗のためスキップ".to_string(),
                details: vec![],
                duration_secs: 0,
            }
        };

        // Step 3: AIレビュー（マージ成功時のみ）
        let review_result = if merge_result.passed {
            self.run_review_step(app).await
        } else {
            GateStepResult {
                passed: false,
                summary: "マージ失敗のためスキップ".to_string(),
                details: vec![],
                duration_secs: 0,
            }
        };

        // 総合判定
        let overall = if !merge_result.passed {
            GateOverall::Blocked
        } else if !test_result.passed || !review_result.passed {
            GateOverall::PassedWithWarnings
        } else {
            GateOverall::Passed
        };

        // 通知リング発火
        let urgency = match &overall {
            GateOverall::Passed => crate::notification::ring::RingUrgency::Info,
            GateOverall::PassedWithWarnings => crate::notification::ring::RingUrgency::Warning,
            GateOverall::Blocked => crate::notification::ring::RingUrgency::Critical,
        };

        crate::notification::ring::emit_ring_event(
            app,
            crate::notification::ring::RingEvent::SwarmWaveGate {
                wave_number: 0, // 呼び出し元で設定
                overall: format!("{:?}", overall),
                urgency,
            },
        );

        WaveGateResult {
            merge: merge_result,
            test: test_result,
            review: review_result,
            overall,
        }
    }

    /// Step 1: 成功ブランチをベースにマージ
    async fn run_merge_step(
        &self,
        branches: &[String],
        _app: &AppHandle,
    ) -> GateStepResult {
        let start = Instant::now();
        let repo = Path::new(&self.project_path);
        let mut details = Vec::new();
        let mut all_success = true;

        for branch in branches {
            let outcome = merge_worker_branch(repo, branch, &self.base_branch);
            if outcome.success {
                details.push(format!("✅ {} → マージ成功", branch));
            } else if !outcome.conflict_files.is_empty() {
                details.push(format!(
                    "❌ {} → コンフリクト: {}",
                    branch,
                    outcome.conflict_files.join(", ")
                ));
                all_success = false;
            } else {
                details.push(format!("❌ {} → マージ失敗: {}", branch, outcome.message));
                all_success = false;
            }
        }

        GateStepResult {
            passed: all_success,
            summary: if all_success {
                format!("{}件のブランチを正常にマージ", branches.len())
            } else {
                "マージにコンフリクトがあります".to_string()
            },
            details,
            duration_secs: start.elapsed().as_secs(),
        }
    }

    /// Step 2: テスト実行（cargo test + npm test）
    async fn run_test_step(&self) -> GateStepResult {
        let start = Instant::now();
        let mut details = Vec::new();
        let mut all_passed = true;

        // Rust テスト
        let cargo_result = Command::new("cargo")
            .args(["test", "--", "--test-threads=1"])
            .current_dir(&self.project_path)
            .output();

        match cargo_result {
            Ok(output) if output.status.success() => {
                details.push("✅ cargo test: PASS".to_string());
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let failure_summary = stderr
                    .lines()
                    .filter(|l| l.contains("FAILED") || l.contains("test result"))
                    .take(5)
                    .collect::<Vec<_>>()
                    .join("\n");
                details.push(format!("❌ cargo test: FAIL\n{}", failure_summary));
                all_passed = false;
            }
            Err(e) => {
                details.push(format!("⚠️ cargo test: 実行不可 ({})", e));
                // テスト実行不可は警告だが通過扱い
            }
        }

        // Node テスト（package.json があれば）
        let pkg_json = Path::new(&self.project_path).join("package.json");
        if pkg_json.exists() {
            let npm_result = Command::new("npm")
                .args(["test", "--", "--passWithNoTests"])
                .current_dir(&self.project_path)
                .output();

            match npm_result {
                Ok(output) if output.status.success() => {
                    details.push("✅ npm test: PASS".to_string());
                }
                Ok(output) => {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    let failure_summary = stderr.lines().take(5).collect::<Vec<_>>().join("\n");
                    details.push(format!("❌ npm test: FAIL\n{}", failure_summary));
                    all_passed = false;
                }
                Err(e) => {
                    details.push(format!("⚠️ npm test: 実行不可 ({})", e));
                }
            }
        }

        GateStepResult {
            passed: all_passed,
            summary: if all_passed {
                "全テスト通過".to_string()
            } else {
                "テスト失敗があります".to_string()
            },
            details,
            duration_secs: start.elapsed().as_secs(),
        }
    }

    /// Step 3: AIレビュー（Wave内の全変更に対して）
    async fn run_review_step(&self, app: &AppHandle) -> GateStepResult {
        let start = Instant::now();

        // review/engine を使ってdiffのAIレビューを実行
        // ReviewEngine は core/claude_gateway 経由
        match crate::review::engine::quick_review(
            &self.project_path,
            &self.base_branch,
        ).await {
            Ok(review_result) => {
                let has_critical = review_result.findings.iter()
                    .any(|f| f.severity == crate::review::findings::Severity::Critical);

                let finding_summary: Vec<String> = review_result.findings.iter()
                    .take(5)
                    .map(|f| format!("{:?} [{}]: {}", f.severity, f.file, f.message))
                    .collect();

                GateStepResult {
                    passed: !has_critical,
                    summary: format!(
                        "{}: {}件の指摘",
                        review_result.assessment,
                        review_result.findings.len()
                    ),
                    details: finding_summary,
                    duration_secs: start.elapsed().as_secs(),
                }
            }
            Err(e) => {
                GateStepResult {
                    passed: true, // レビュー失敗は通過扱い（ブロックしない）
                    summary: format!("AIレビュー実行エラー: {}", e),
                    details: vec![],
                    duration_secs: start.elapsed().as_secs(),
                }
            }
        }
    }
}
```

---

## 4. Orchestrator のWave統合

**ファイル変更**: `src-tauri/src/swarm/orchestrator.rs`

### OrchestratorRun にWave情報を追加

```rust
// OrchestratorRun に追加
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestratorRun {
    // ... 既存フィールド ...

    /// Wave構造（自動算出）
    pub waves: Vec<Wave>,
    /// 現在実行中のWave番号
    pub current_wave: u32,
    /// Wave Gate の実行結果履歴
    pub gate_results: Vec<WaveGateResult>,
}
```

### start_run の変更

```rust
impl Orchestrator {
    pub fn start_run(
        &mut self,
        tasks: Vec<SubTask>,
        settings: SwarmSettings,
        project_path: String,
        worker_manager: SharedWorkerManager,
        app: AppHandle,
    ) -> Result<OrchestratorRun, String> {
        // ... 既存の初期化処理 ...

        // Wave構造を自動算出（NEW）
        let mut waves = wave::compute_waves(&tasks);
        if !waves.is_empty() {
            waves[0].status = WaveStatus::Running;
        }
        let current_wave = 1;

        // Wave 1 のタスクIDだけを Ready にする（NEW）
        let wave1_ids: std::collections::HashSet<u32> = waves
            .first()
            .map(|w| w.task_ids.iter().cloned().collect())
            .unwrap_or_default();

        for assign in &mut assignments {
            if wave1_ids.contains(&assign.task.id) {
                if assign.task.depends_on.is_empty() {
                    assign.execution_state = ExecutionState::Ready;
                }
                // Wave1内のdepends_onは既存ロジックで処理
            } else {
                // Wave 2以降のタスクは Waiting のまま
                assign.execution_state = ExecutionState::Waiting;
            }
        }

        // Ready のタスクを起動（既存ロジック）
        // ...

        let run = OrchestratorRun {
            // ... 既存フィールド ...
            waves,
            current_wave,
            gate_results: vec![],
        };

        // ...
    }
}
```

### update_worker_status の変更

Wave内の全タスク完了時にWave Gateを発動する。

```rust
impl Orchestrator {
    pub fn update_worker_status(
        &mut self,
        worker_id: &str,
        status: WorkerStatus,
        app: &AppHandle,
    ) -> Vec<SpawnRequest> {
        // ... 既存のステータス更新・依存解決ロジック ...

        // Wave完了チェック（NEW）
        let current_wave_complete = self.check_current_wave_complete();
        if current_wave_complete {
            // Wave Gate 発動のシグナルを返す
            // （実際のGate実行はasyncなのでイベントで通知）
            let _ = app.emit("wave-gate-ready", &serde_json::json!({
                "runId": run.run_id,
                "waveNumber": run.current_wave,
            }));
        }

        spawn_requests
    }

    /// 現在のWave内の全タスクが完了（Done/Error/Skipped）しているか
    fn check_current_wave_complete(&self) -> bool {
        let run = match &self.current_run {
            Some(r) => r,
            None => return false,
        };

        let current_wave = run.waves.iter()
            .find(|w| w.wave_number == run.current_wave);

        match current_wave {
            Some(wave) => {
                wave.task_ids.iter().all(|task_id| {
                    run.assignments.iter()
                        .find(|a| a.task.id == *task_id)
                        .map(|a| matches!(
                            a.execution_state,
                            ExecutionState::Done | ExecutionState::Error | ExecutionState::Skipped
                        ))
                        .unwrap_or(true)
                })
            }
            None => false,
        }
    }

    /// Wave Gate 完了後に次のWaveを開始する
    pub fn advance_to_next_wave(
        &mut self,
        gate_result: WaveGateResult,
        worker_manager: SharedWorkerManager,
        app: AppHandle,
    ) -> Vec<SpawnRequest> {
        let run = match self.current_run.as_mut() {
            Some(r) => r,
            None => return vec![],
        };

        // Gate結果を記録
        run.gate_results.push(gate_result.clone());

        // 現在のWaveステータスを更新
        if let Some(wave) = run.waves.iter_mut()
            .find(|w| w.wave_number == run.current_wave)
        {
            wave.gate_result = Some(gate_result.clone());
            wave.status = match gate_result.overall {
                GateOverall::Passed => WaveStatus::Passed,
                GateOverall::PassedWithWarnings => WaveStatus::PassedWithWarnings,
                GateOverall::Blocked => WaveStatus::Failed,
            };
        }

        // Blocked の場合は次Waveに進まない
        if gate_result.overall == GateOverall::Blocked {
            run.status = RunStatus::PartialDone;
            let _ = app.emit("orchestrator-status-changed", &run);
            return vec![];
        }

        // 次のWaveに進む
        run.current_wave += 1;
        let next_wave = run.waves.iter_mut()
            .find(|w| w.wave_number == run.current_wave);

        match next_wave {
            Some(wave) => {
                wave.status = WaveStatus::Running;

                // 次Wave のタスクを Ready にして起動
                let wave_task_ids = wave.task_ids.clone();
                let repo = PathBuf::from(&run.project_path);
                let run_id = run.run_id.clone();
                let mut spawn_requests = Vec::new();

                // 完了済みタスクIDを収集
                let done_ids: std::collections::HashSet<u32> = run.assignments.iter()
                    .filter(|a| a.execution_state == ExecutionState::Done)
                    .map(|a| a.task.id)
                    .collect();

                let mut running = 0usize;

                for (idx, assign) in run.assignments.iter_mut().enumerate() {
                    if !wave_task_ids.contains(&assign.task.id) {
                        continue;
                    }

                    // Wave内のdepends_onチェック
                    let all_deps_done = assign.task.depends_on.iter()
                        .all(|dep| done_ids.contains(dep));

                    if all_deps_done && running < run.settings.max_workers as usize {
                        assign.execution_state = ExecutionState::Ready;
                        let config = make_worker_config(
                            assign, &repo, &run_id, &run.settings
                        );
                        spawn_requests.push(SpawnRequest {
                            worker_config: config,
                            task_id: assign.task.id,
                            is_retry: false,
                            old_worker_id: None,
                        });
                        running += 1;
                    }
                }

                let _ = app.emit("orchestrator-status-changed", &run);
                spawn_requests
            }
            None => {
                // 全Wave完了
                run.status = RunStatus::Done;
                let _ = app.emit("orchestrator-status-changed", &run);
                vec![]
            }
        }
    }
}
```

---

## 5. Tauriコマンド追加

**ファイル変更**: `src-tauri/src/commands/swarm.rs`

```rust
/// Wave Gate を実行する（Wave完了時に自動呼び出し or 手動）
#[tauri::command]
pub async fn orchestrator_run_wave_gate(
    orchestrator: State<'_, SharedOrchestrator>,
    manager: State<'_, SharedWorkerManager>,
    app: tauri::AppHandle,
) -> Result<WaveGateResult, String> {
    let (project_path, base_branch, branches) = {
        let orch = orchestrator.lock().map_err(|e| e.to_string())?;
        let run = orch.current_run.as_ref().ok_or("No active run")?;

        let current_wave = run.waves.iter()
            .find(|w| w.wave_number == run.current_wave)
            .ok_or("Current wave not found")?;

        let succeeded_branches: Vec<String> = run.assignments.iter()
            .filter(|a| current_wave.task_ids.contains(&a.task.id))
            .filter(|a| a.execution_state == ExecutionState::Done)
            .map(|a| a.branch_name.clone())
            .collect();

        (run.project_path.clone(), run.base_branch.clone(), succeeded_branches)
    };

    // Gate実行（async）
    let gate = WaveGate::new(&project_path, &base_branch);
    let result = gate.execute(&branches, &app).await;

    // 次Waveに進む
    let spawn_requests = {
        let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
        orch.advance_to_next_wave(result.clone(), manager.inner().clone(), app.clone())
    };

    // 新Worker起動
    for req in spawn_requests {
        let new_id = {
            let mut mgr = manager.lock().map_err(|e| e.to_string())?;
            mgr.spawn_worker(req.worker_config, app.clone())?
        };
        let mut orch = orchestrator.lock().map_err(|e| e.to_string())?;
        orch.update_worker_id_for_task(req.task_id, new_id);
    }

    Ok(result)
}

/// Wave構造を取得する（UI表示用）
#[tauri::command]
pub async fn orchestrator_get_waves(
    orchestrator: State<'_, SharedOrchestrator>,
) -> Result<Vec<Wave>, String> {
    let orch = orchestrator.lock().map_err(|e| e.to_string())?;
    Ok(orch.current_run.as_ref()
        .map(|r| r.waves.clone())
        .unwrap_or_default())
}
```

---

## 6. フロントエンド: Wave可視化

**ファイル変更**: `SwarmRunningTab.tsx` に Wave表示を追加

```typescript
// Wave進捗バー
function WaveProgressBar({ waves, currentWave }: {
  waves: Wave[];
  currentWave: number;
}) {
  return (
    <div className="wave-progress">
      {waves.map((wave) => (
        <div key={wave.waveNumber} className="wave-step">
          {/* Wave ノード */}
          <div className={`wave-node ${wave.status}`}>
            <span className="wave-number">W{wave.waveNumber}</span>
            <span className="wave-count">{wave.taskIds.length}タスク</span>
            {wave.status === 'running' && <span className="pulse" />}
          </div>

          {/* Wave Gate（最終Wave以外） */}
          {wave.waveNumber < waves.length && (
            <div className={`wave-gate ${wave.gateResult?.overall || 'pending'}`}>
              {wave.gateResult ? (
                <>
                  {wave.gateResult.merge.passed ? '✅' : '❌'} マージ
                  {wave.gateResult.test.passed ? '✅' : '❌'} テスト
                  {wave.gateResult.review.passed ? '✅' : '⚠️'} レビュー
                </>
              ) : (
                '⏳ Gate待ち'
              )}
            </div>
          )}

          {/* 矢印 */}
          {wave.waveNumber < waves.length && (
            <div className="wave-arrow">→</div>
          )}
        </div>
      ))}
    </div>
  );
}
```

```
UI表示イメージ:

Wave進捗:
[W1: 3タスク ✅] →  Gate ✅✅✅  → [W2: 2タスク 🔄] → Gate ⏳ → [W3: 1タスク ⏳]

Wave 1 詳細:
  ✅ #1 DBスキーマ     Done  2m30s
  ✅ #2 OAuth設定      Done  1m45s
  ✅ #3 設定ファイル    Done  0m55s

Wave Gate 1 結果:
  ✅ マージ: 3件のブランチを正常にマージ
  ✅ テスト: cargo test PASS, npm test PASS
  ✅ レビュー: Approve (0件の指摘)

Wave 2 詳細 (実行中):
  🔄 #4 認証ミドルウェア  Running  3m12s
  🔄 #5 テスト追加        Running  1m05s
```

---

## 7. 自動Wave Gate発動

Wave内の全タスク完了時に自動でGateを実行する。

**ファイル変更**: フロントエンド側で `wave-gate-ready` イベントをリッスン

```typescript
// SwarmRunningTab.tsx
useEffect(() => {
  const unlisten = listen('wave-gate-ready', async (event) => {
    const { runId, waveNumber } = event.payload;
    console.log(`Wave ${waveNumber} 完了 → Gate自動実行`);

    // Gate を自動実行
    const gateResult = await invoke('orchestrator_run_wave_gate');

    // 結果に応じて通知
    if (gateResult.overall === 'blocked') {
      // コンフリクト画面に遷移を促す
      toast.error('Wave Gate: マージにコンフリクトがあります');
    } else if (gateResult.overall === 'passedWithWarnings') {
      toast.warn('Wave Gate: 警告ありで次Waveに進行');
    } else {
      toast.success('Wave Gate: 全パス → 次Wave開始');
    }
  });

  return () => { unlisten.then(fn => fn()); };
}, []);
```

---

## 8. mod.rs更新 & 通知リングイベント追加

**ファイル変更**: `src-tauri/src/swarm/mod.rs`

```rust
pub mod wave;
pub mod wave_gate;
```

**ファイル変更**: `src-tauri/src/notification/ring.rs`

```rust
pub enum RingEvent {
    // ... 既存 ...

    /// Wave Gate の完了
    SwarmWaveGate {
        wave_number: u32,
        overall: String,    // "Passed" | "PassedWithWarnings" | "Blocked"
        urgency: RingUrgency,
    },
}
```

---

## 9. テストサマリー

| ファイル | テスト数 | 内容 |
|---------|---------|------|
| `wave.rs` | 4 | compute_waves: 独立/直列/ダイアモンド/混合 |
| `wave_gate.rs` | 3 | マージ成功/テスト失敗/レビュー警告 |
| `orchestrator.rs` (追加) | 3 | Wave完了検出/次Wave遷移/Gate Blocked停止 |
| **合計** | **10** | |

---

## 10. ドキュメント更新

- [ ] `docs/swarm/wave-orchestrator.md` を新規作成
- [ ] `12-swarm-completion-guide.md` にWave統合の参照を追加
- [ ] `08-ui-component-design.md` のSwarm画面にWave進捗バーを追記
