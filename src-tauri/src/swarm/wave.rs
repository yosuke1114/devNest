use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use super::subtask::SubTask;

/// Wave: 同時実行可能なタスク群の単位
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
    Pending,
    Running,
    Gating,
    Passed,
    PassedWithWarnings,
    Failed,
}

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
    Passed,
    PassedWithWarnings,
    Blocked,
}

/// depends_on から Wave 構造を自動算出する（トポロジカルソートベース）
pub fn compute_waves(tasks: &[SubTask]) -> Vec<Wave> {
    let mut waves: Vec<Wave> = Vec::new();
    let mut assigned: HashSet<u32> = HashSet::new();

    loop {
        // 依存がすべて assigned 済みのタスクを収集
        let wave_tasks: Vec<u32> = tasks
            .iter()
            .filter(|t| !assigned.contains(&t.id))
            .filter(|t| t.depends_on.iter().all(|dep| assigned.contains(dep)))
            .map(|t| t.id)
            .collect();

        if wave_tasks.is_empty() {
            // 循環依存等で残ったタスクがある場合、強制的に最終 Wave に入れる
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
                for id in &remaining {
                    assigned.insert(*id);
                }
            }
            break;
        }

        waves.push(Wave {
            wave_number: waves.len() as u32 + 1,
            task_ids: wave_tasks.clone(),
            status: WaveStatus::Pending,
            gate_result: None,
        });

        for id in &wave_tasks {
            assigned.insert(*id);
        }
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
        let waves = compute_waves(&[task(1, vec![]), task(2, vec![]), task(3, vec![])]);
        assert_eq!(waves.len(), 1);
        assert_eq!(waves[0].task_ids.len(), 3);
        assert_eq!(waves[0].wave_number, 1);
    }

    #[test]
    fn linear_chain_produces_n_waves() {
        let waves = compute_waves(&[task(1, vec![]), task(2, vec![1]), task(3, vec![2])]);
        assert_eq!(waves.len(), 3);
        assert_eq!(waves[0].task_ids, vec![1]);
        assert_eq!(waves[1].task_ids, vec![2]);
        assert_eq!(waves[2].task_ids, vec![3]);
    }

    #[test]
    fn diamond_dependency() {
        let waves = compute_waves(&[
            task(1, vec![]),
            task(2, vec![1]),
            task(3, vec![1]),
            task(4, vec![2, 3]),
        ]);
        assert_eq!(waves.len(), 3);
        assert_eq!(waves[0].task_ids, vec![1]);
        assert!(waves[1].task_ids.contains(&2) && waves[1].task_ids.contains(&3));
        assert_eq!(waves[2].task_ids, vec![4]);
    }

    #[test]
    fn mixed_independent_and_dependent() {
        let waves = compute_waves(&[
            task(1, vec![]),
            task(2, vec![]),
            task(3, vec![1]),
            task(4, vec![]),
            task(5, vec![3, 4]),
        ]);
        assert_eq!(waves.len(), 3);
        // Wave 1: 1, 2, 4（依存なし）
        assert_eq!(waves[0].task_ids.len(), 3);
        // Wave 2: 3（1に依存）
        assert_eq!(waves[1].task_ids, vec![3]);
        // Wave 3: 5（3,4に依存）
        assert_eq!(waves[2].task_ids, vec![5]);
    }

    #[test]
    fn empty_tasks() {
        let waves = compute_waves(&[]);
        assert!(waves.is_empty());
    }
}
