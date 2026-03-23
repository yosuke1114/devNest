// src-tauri/src/swarm/context_store.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerArtifact {
    pub role: String,
    pub completed_at: String,
    pub modified_files: Vec<PathBuf>,
    pub git_diff_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SwarmContext {
    pub session_id: String,
    pub artifacts: HashMap<String, WorkerArtifact>,
}

impl SwarmContext {
    pub fn load(context_path: &Path) -> Self {
        std::fs::read_to_string(context_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, context_path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| e.to_string())?;
        std::fs::write(context_path, json).map_err(|e| e.to_string())
    }

    /// Worker完了時に成果物を記録する
    pub fn record_artifact(
        &mut self,
        worker_id: &str,
        role: &str,
        modified_files: Vec<PathBuf>,
        git_diff_summary: String,
    ) {
        self.artifacts.insert(worker_id.to_string(), WorkerArtifact {
            role: role.to_string(),
            completed_at: chrono::Utc::now().to_rfc3339(),
            modified_files,
            git_diff_summary,
        });
    }

    /// 依存Workerのコンテキストをプロンプトに注入する文字列を生成
    pub fn build_context_prompt(&self, depends_on: &[String]) -> String {
        let contexts: Vec<String> = depends_on.iter()
            .filter_map(|id| self.artifacts.get(id))
            .map(|a| format!(
                "## 前のWorkerの変更内容\n\
                 役割: {}\n\
                 変更ファイル: {}\n\
                 変更サマリー: {}",
                a.role,
                a.modified_files.iter()
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
                a.git_diff_summary,
            ))
            .collect();

        if contexts.is_empty() {
            String::new()
        } else {
            format!(
                "\n\n# 依存タスクのコンテキスト\n{}",
                contexts.join("\n\n")
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    // ITa-13-35: record_artifactで成果物が記録される
    #[test]
    fn test_record_artifact() {
        let mut ctx = SwarmContext::default();
        ctx.record_artifact(
            "worker-1",
            "builder",
            vec![PathBuf::from("src/main.rs")],
            "Added feature".to_string(),
        );
        assert!(ctx.artifacts.contains_key("worker-1"));
        let artifact = &ctx.artifacts["worker-1"];
        assert_eq!(artifact.role, "builder");
        assert_eq!(artifact.modified_files, vec![PathBuf::from("src/main.rs")]);
        assert_eq!(artifact.git_diff_summary, "Added feature");
    }

    // ITa-13-36: saveとloadで内容が一致する
    #[test]
    fn test_save_and_load() {
        let dir = TempDir::new().unwrap();
        let context_path = dir.path().join("context.json");

        let mut ctx = SwarmContext {
            session_id: "session-123".to_string(),
            artifacts: HashMap::new(),
        };
        ctx.record_artifact(
            "worker-1",
            "scout",
            vec![PathBuf::from("src/lib.rs")],
            "Investigated code".to_string(),
        );
        ctx.save(&context_path).unwrap();

        let loaded = SwarmContext::load(&context_path);
        assert_eq!(loaded.session_id, "session-123");
        assert!(loaded.artifacts.contains_key("worker-1"));
        assert_eq!(loaded.artifacts["worker-1"].role, "scout");
    }

    // ITa-13-37: build_context_promptで依存Workerの情報が含まれる
    #[test]
    fn test_build_context_prompt_includes_dependency() {
        let mut ctx = SwarmContext::default();
        ctx.record_artifact(
            "worker-scout",
            "scout",
            vec![PathBuf::from("src/a.rs")],
            "Found bug in module X".to_string(),
        );

        let depends_on = vec!["worker-scout".to_string()];
        let prompt = ctx.build_context_prompt(&depends_on);
        assert!(prompt.contains("scout"));
        assert!(prompt.contains("Found bug in module X"));
        assert!(prompt.contains("依存タスクのコンテキスト"));
    }

    // ITa-13-38: depends_onが空の場合は空文字列を返す
    #[test]
    fn test_build_context_prompt_empty_depends_on() {
        let ctx = SwarmContext::default();
        let prompt = ctx.build_context_prompt(&[]);
        assert_eq!(prompt, "");
    }

    // ITa-13-39: 存在しないWorker IDはbuild_context_promptで無視される
    #[test]
    fn test_build_context_prompt_ignores_missing_worker() {
        let ctx = SwarmContext::default();
        let depends_on = vec!["nonexistent-worker".to_string()];
        let prompt = ctx.build_context_prompt(&depends_on);
        assert_eq!(prompt, "");
    }
}
