use serde::{Deserialize, Serialize};

/// Claude API が生成するサブタスクの単位
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubTask {
    pub id: u32,
    pub title: String,
    /// 操作対象ファイル（競合チェック用）
    pub files: Vec<String>,
    /// Worker に渡す具体的な指示（claude "..." の引数）
    pub instruction: String,
    /// 依存タスク ID 一覧（このタスクが開始できるのはすべての依存タスクが Done になった後）
    #[serde(default)]
    pub depends_on: Vec<u32>,
}

/// split_task コマンドへのリクエスト
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitTaskRequest {
    pub prompt: String,
    pub project_path: String,
    /// 文脈として渡すファイルパス一覧（省略可）
    #[serde(default)]
    pub context_files: Vec<String>,
}

/// split_task コマンドのレスポンス
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitTaskResult {
    pub tasks: Vec<SubTask>,
    /// 同一ファイルに複数タスクが触れる競合警告
    pub conflict_warnings: Vec<String>,
    /// 循環依存エラー（存在する場合）
    pub cycle_error: Option<String>,
}

/// 同一ファイルへの複数 Worker 割り当てを検出してウォーニングを生成する
pub fn detect_file_conflicts(tasks: &[SubTask]) -> Vec<String> {
    use std::collections::HashMap;

    let mut file_owners: HashMap<String, Vec<u32>> = HashMap::new();
    for task in tasks {
        for f in &task.files {
            file_owners.entry(f.clone()).or_default().push(task.id);
        }
    }

    file_owners
        .into_iter()
        .filter(|(_, ids)| ids.len() > 1)
        .map(|(file, ids)| {
            let id_strs: Vec<String> = ids.iter().map(|i| format!("Task {}", i)).collect();
            format!("{} は {} に割り当てられています", file, id_strs.join(", "))
        })
        .collect()
}

/// 依存グラフの循環依存を検出する（Kahn のトポロジカルソート）
/// 循環がある場合は Err(詳細メッセージ) を返す
pub fn detect_circular_deps(tasks: &[SubTask]) -> Result<(), String> {
    use std::collections::{HashMap, HashSet, VecDeque};

    let ids: HashSet<u32> = tasks.iter().map(|t| t.id).collect();

    // 依存先が存在しない ID を参照していないか確認
    for task in tasks {
        for dep_id in &task.depends_on {
            if !ids.contains(dep_id) {
                return Err(format!(
                    "Task {} は存在しない Task {} に依存しています",
                    task.id, dep_id
                ));
            }
        }
    }

    // 入次数マップと隣接リストを構築
    let mut in_degree: HashMap<u32, usize> = tasks.iter().map(|t| (t.id, 0)).collect();
    let mut adj: HashMap<u32, Vec<u32>> = tasks.iter().map(|t| (t.id, vec![])).collect();

    for task in tasks {
        for &dep_id in &task.depends_on {
            // dep_id → task.id のエッジ（dep_id が完了すると task が解放される）
            adj.entry(dep_id).or_default().push(task.id);
            *in_degree.entry(task.id).or_insert(0) += 1;
        }
    }

    // 入次数 0 のノードをキューに追加
    let mut queue: VecDeque<u32> = in_degree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(&id, _)| id)
        .collect();

    let mut processed = 0;

    while let Some(id) = queue.pop_front() {
        processed += 1;
        if let Some(neighbors) = adj.get(&id) {
            for &next in neighbors {
                let deg = in_degree.entry(next).or_insert(0);
                *deg -= 1;
                if *deg == 0 {
                    queue.push_back(next);
                }
            }
        }
    }

    if processed < tasks.len() {
        Err("依存グラフに循環依存が検出されました。依存関係を見直してください。".to_string())
    } else {
        Ok(())
    }
}

/// ID→タスクのルックアップマップを構築する
pub fn build_task_map(tasks: &[SubTask]) -> std::collections::HashMap<u32, &SubTask> {
    tasks.iter().map(|t| (t.id, t)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(id: u32, files: Vec<&str>, depends_on: Vec<u32>) -> SubTask {
        SubTask {
            id,
            title: format!("Task {}", id),
            files: files.into_iter().map(|s| s.to_string()).collect(),
            instruction: "do it".into(),
            depends_on,
        }
    }

    #[test]
    fn no_conflict_when_files_distinct() {
        let tasks = vec![
            make_task(1, vec!["a.rs"], vec![]),
            make_task(2, vec!["b.rs"], vec![]),
        ];
        assert!(detect_file_conflicts(&tasks).is_empty());
    }

    #[test]
    fn detects_conflict_on_same_file() {
        let tasks = vec![
            make_task(1, vec!["shared.rs"], vec![]),
            make_task(2, vec!["shared.rs"], vec![]),
        ];
        let warnings = detect_file_conflicts(&tasks);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("shared.rs"));
    }

    #[test]
    fn no_cycle_linear_chain() {
        let tasks = vec![
            make_task(1, vec![], vec![]),
            make_task(2, vec![], vec![1]),
            make_task(3, vec![], vec![2]),
        ];
        assert!(detect_circular_deps(&tasks).is_ok());
    }

    #[test]
    fn detects_simple_cycle() {
        let tasks = vec![
            make_task(1, vec![], vec![2]),
            make_task(2, vec![], vec![1]),
        ];
        assert!(detect_circular_deps(&tasks).is_err());
    }

    #[test]
    fn detects_self_loop() {
        let tasks = vec![make_task(1, vec![], vec![1])];
        assert!(detect_circular_deps(&tasks).is_err());
    }

    #[test]
    fn detects_three_node_cycle() {
        let tasks = vec![
            make_task(1, vec![], vec![3]),
            make_task(2, vec![], vec![1]),
            make_task(3, vec![], vec![2]),
        ];
        assert!(detect_circular_deps(&tasks).is_err());
    }

    #[test]
    fn detects_nonexistent_dep() {
        let tasks = vec![make_task(1, vec![], vec![99])];
        assert!(detect_circular_deps(&tasks).is_err());
    }

    #[test]
    fn diamond_dag_no_cycle() {
        // 1 → 2, 1 → 3, 2 → 4, 3 → 4
        let tasks = vec![
            make_task(1, vec![], vec![]),
            make_task(2, vec![], vec![1]),
            make_task(3, vec![], vec![1]),
            make_task(4, vec![], vec![2, 3]),
        ];
        assert!(detect_circular_deps(&tasks).is_ok());
    }
}
