/// Agentic Bridge — 保守スキャン結果から Swarm タスクを自動生成するブリッジ
///
/// # 役割
/// - 保守スキャン（カバレッジ低下・技術的負債）から Swarm 実行用タスクを生成
/// - AgentTask の TaskType として SwarmExecution を定義
/// - ワークフロー YAML の `swarm_execution` アクションをサポート

use serde::{Deserialize, Serialize};

use super::settings::SwarmSettings;
use super::subtask::SubTask;

// ─── TaskType 拡張 ────────────────────────────────────────────

/// Agentic Flow で使用するタスク種別（Swarm 拡張）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SwarmTaskType {
    /// Swarm 並列実行（複数サブタスクを同時進行）
    SwarmExecution {
        prompt: String,
        settings: SwarmSettings,
    },
}

/// 保守スキャン結果の概要（Agentic Bridge 用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaintenanceScanSummary {
    /// カバレッジ低下率 (%)
    pub coverage_drop: f64,
    /// 技術的負債スコア
    pub debt_score: f64,
    /// ホットパス（変更頻度が高いファイル）
    pub hot_paths: Vec<HotPath>,
    /// リファクタリング候補
    pub refactor_candidates: Vec<RefactorCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotPath {
    pub file_path: String,
    pub change_frequency: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefactorCandidate {
    pub file_path: String,
    pub score: f64,
}

/// Swarm 実行タスクの生成リクエスト
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmTaskRequest {
    pub task_type: SwarmTaskType,
    pub product_id: String,
    pub priority: TaskPriority,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum TaskPriority {
    High,
    Medium,
    Low,
}

// ─── 保守スキャン → Swarm タスク変換 ─────────────────────────

/// 保守スキャン結果から Swarm タスクリストを自動生成する
pub fn create_swarm_tasks_from_maintenance(
    scan: &MaintenanceScanSummary,
    product_id: &str,
) -> Vec<SwarmTaskRequest> {
    let mut tasks = Vec::new();

    // カバレッジ低下 → テスト追加 Swarm
    if scan.coverage_drop > 2.0 {
        let hot_paths: Vec<String> = scan.hot_paths.iter()
            .take(5)
            .map(|p| format!("- {}", p.file_path))
            .collect();

        tasks.push(SwarmTaskRequest {
            task_type: SwarmTaskType::SwarmExecution {
                prompt: format!(
                    "以下のファイルにユニットテストを追加してください（カバレッジが {:.1}% 低下しています）:\n{}",
                    scan.coverage_drop,
                    hot_paths.join("\n")
                ),
                settings: SwarmSettings::default(),
            },
            product_id: product_id.to_string(),
            priority: TaskPriority::Medium,
        });
    }

    // 技術的負債が閾値超過 → リファクタリング Swarm
    if scan.debt_score > 70.0 {
        let candidates: Vec<String> = scan.refactor_candidates.iter()
            .take(3)
            .map(|c| format!("- {} (スコア: {:.2})", c.file_path, c.score))
            .collect();

        if !candidates.is_empty() {
            tasks.push(SwarmTaskRequest {
                task_type: SwarmTaskType::SwarmExecution {
                    prompt: format!(
                        "以下のファイルをリファクタリングしてください（技術的負債スコア: {:.1}）:\n{}",
                        scan.debt_score,
                        candidates.join("\n")
                    ),
                    settings: SwarmSettings {
                        max_workers: 3,
                        ..Default::default()
                    },
                },
                product_id: product_id.to_string(),
                priority: TaskPriority::Low,
            });
        }
    }

    tasks
}

/// Swarm タスクを SubTask に変換（直接実行時に使用）
pub fn swarm_task_to_subtasks(task_type: &SwarmTaskType) -> Vec<SubTask> {
    match task_type {
        SwarmTaskType::SwarmExecution { prompt, .. } => {
            // 単一のサブタスクとして扱う（TaskSplitter による分解は呼び出し側で行う）
            vec![SubTask {
                id: 1,
                title: "Swarm 自動実行".to_string(),
                files: vec![],
                instruction: prompt.clone(),
                depends_on: vec![],
            }]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_scan(coverage_drop: f64, debt_score: f64) -> MaintenanceScanSummary {
        MaintenanceScanSummary {
            coverage_drop,
            debt_score,
            hot_paths: vec![
                HotPath { file_path: "src/auth.rs".into(), change_frequency: 0.9 },
                HotPath { file_path: "src/db.rs".into(), change_frequency: 0.7 },
            ],
            refactor_candidates: vec![
                RefactorCandidate { file_path: "src/big.rs".into(), score: 0.95 },
            ],
        }
    }

    #[test]
    fn no_tasks_when_coverage_ok_and_debt_ok() {
        let scan = make_scan(0.5, 50.0);
        let tasks = create_swarm_tasks_from_maintenance(&scan, "product-1");
        assert!(tasks.is_empty());
    }

    #[test]
    fn creates_test_task_when_coverage_drops() {
        let scan = make_scan(3.0, 50.0);
        let tasks = create_swarm_tasks_from_maintenance(&scan, "product-1");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].priority, TaskPriority::Medium);
        if let SwarmTaskType::SwarmExecution { prompt, .. } = &tasks[0].task_type {
            assert!(prompt.contains("ユニットテスト"));
            assert!(prompt.contains("3.0%"));
        } else {
            panic!("Expected SwarmExecution");
        }
    }

    #[test]
    fn creates_refactor_task_when_debt_high() {
        let scan = make_scan(0.5, 80.0);
        let tasks = create_swarm_tasks_from_maintenance(&scan, "product-1");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].priority, TaskPriority::Low);
        if let SwarmTaskType::SwarmExecution { prompt, .. } = &tasks[0].task_type {
            assert!(prompt.contains("リファクタリング"));
            assert!(prompt.contains("80.0"));
        } else {
            panic!("Expected SwarmExecution");
        }
    }

    #[test]
    fn creates_both_tasks_when_both_thresholds_exceeded() {
        let scan = make_scan(5.0, 80.0);
        let tasks = create_swarm_tasks_from_maintenance(&scan, "product-1");
        assert_eq!(tasks.len(), 2);
    }

    #[test]
    fn swarm_task_to_subtasks_returns_single_task() {
        let task_type = SwarmTaskType::SwarmExecution {
            prompt: "テストを追加".to_string(),
            settings: SwarmSettings::default(),
        };
        let subtasks = swarm_task_to_subtasks(&task_type);
        assert_eq!(subtasks.len(), 1);
        assert_eq!(subtasks[0].instruction, "テストを追加");
    }
}
