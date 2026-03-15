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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_conflict_when_files_distinct() {
        let tasks = vec![
            SubTask { id: 1, title: "A".into(), files: vec!["a.rs".into()], instruction: "".into() },
            SubTask { id: 2, title: "B".into(), files: vec!["b.rs".into()], instruction: "".into() },
        ];
        assert!(detect_file_conflicts(&tasks).is_empty());
    }

    #[test]
    fn detects_conflict_on_same_file() {
        let tasks = vec![
            SubTask { id: 1, title: "A".into(), files: vec!["shared.rs".into()], instruction: "".into() },
            SubTask { id: 2, title: "B".into(), files: vec!["shared.rs".into()], instruction: "".into() },
        ];
        let warnings = detect_file_conflicts(&tasks);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("shared.rs"));
    }
}
