/// Wave Orchestrator — depends_on グラフから Wave 構造を自動算出し、
/// Wave 間にマージ・テスト・AIレビューのゲートを挟む。
use serde::{Deserialize, Serialize};

use super::subtask::SubTask;

// ─── データモデル ────────────────────────────────────────────────

/// Wave: 並列実行可能なタスク群 + 完了後のゲート
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Wave {
    pub wave_number: u32,
    pub task_ids: Vec<u32>,
    pub status: WaveStatus,
    pub gate_result: Option<WaveGateResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WaveStatus {
    /// 前の Wave が未完了
    Pending,
    /// Orchestrator が並列実行中
    Running,
    /// Wave 内の全タスク完了、Gate 実行中
    Gating,
    /// Gate 通過
    Passed,
    /// Gate 問題検出（警告あり、次 Wave は続行可能）
    PassedWithWarnings,
    /// Wave 内タスクが全部失敗
    Failed,
}

/// Wave 間ゲートの実行結果
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
    /// 警告あり（テスト失敗 / レビュー指摘）だが続行可能
    PassedWithWarnings,
    /// マージ失敗（コンフリクト未解決）— 次 Wave に進まない
    Blocked,
}

// ─── Wave 算出 ───────────────────────────────────────────────────

/// depends_on グラフから Wave 構造を自動算出する（トポロジカルレイヤ分割）。
///
/// アルゴリズム:
///   - 全依存が「前の Wave までに割り当て済み」のタスクを今 Wave に割り当てる。
///   - 依存がないタスクはすべて Wave 1 に入る。
///   - 循環依存があるタスクは最後の Wave に強制追加する。
pub fn compute_waves(tasks: &[SubTask]) -> Vec<Wave> {
    let mut waves: Vec<Wave> = Vec::new();
    let mut assigned: std::collections::HashSet<u32> = std::collections::HashSet::new();

    loop {
        // まだ未割り当てで、依存がすべて割り当て済みのタスクを収集
        let wave_tasks: Vec<u32> = tasks
            .iter()
            .filter(|t| !assigned.contains(&t.id))
            .filter(|t| t.depends_on.iter().all(|dep| assigned.contains(dep)))
            .map(|t| t.id)
            .collect();

        if wave_tasks.is_empty() {
            // 残りは循環依存 → 最後の Wave に強制追加
            let remaining: Vec<u32> = tasks
                .iter()
                .filter(|t| !assigned.contains(&t.id))
                .map(|t| t.id)
                .collect();
            if !remaining.is_empty() {
                remaining.iter().for_each(|id| {
                    assigned.insert(*id);
                });
                waves.push(Wave {
                    wave_number: waves.len() as u32 + 1,
                    task_ids: remaining,
                    status: WaveStatus::Pending,
                    gate_result: None,
                });
            }
            break;
        }

        wave_tasks.iter().for_each(|id| {
            assigned.insert(*id);
        });
        waves.push(Wave {
            wave_number: waves.len() as u32 + 1,
            task_ids: wave_tasks,
            status: WaveStatus::Pending,
            gate_result: None,
        });
    }

    waves
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

    #[test]
    fn independent_tasks_single_wave() {
        let tasks = vec![task(1, vec![]), task(2, vec![]), task(3, vec![])];
        let waves = compute_waves(&tasks);
        assert_eq!(waves.len(), 1);
        assert_eq!(waves[0].task_ids.len(), 3);
        assert_eq!(waves[0].wave_number, 1);
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

    #[test]
    fn empty_tasks_returns_empty_waves() {
        let waves = compute_waves(&[]);
        assert!(waves.is_empty());
    }

    #[test]
    fn wave_status_serializes_correctly() {
        let s = WaveStatus::Running;
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(json, "\"running\"");
    }

    #[test]
    fn gate_overall_serializes_correctly() {
        assert_eq!(
            serde_json::to_string(&GateOverall::PassedWithWarnings).unwrap(),
            "\"passedWithWarnings\""
        );
        assert_eq!(
            serde_json::to_string(&GateOverall::Blocked).unwrap(),
            "\"blocked\""
        );
    }
}
