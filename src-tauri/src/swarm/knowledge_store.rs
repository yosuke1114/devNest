// src-tauri/src/swarm/knowledge_store.rs

use std::path::Path;
use std::fs;

#[derive(Debug, Clone)]
pub enum KnowledgeCategory {
    ErrorPattern,
    ProjectConstraint,
    TemporaryNote,
}

pub struct KnowledgeEntry {
    pub category: KnowledgeCategory,
    pub content: String,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub occurrence_count: u32,
}

pub struct KnowledgeStore {
    knowledge_path: std::path::PathBuf,
}

impl KnowledgeStore {
    pub fn new(project_root: &Path) -> Self {
        Self {
            knowledge_path: project_root.join(".devnest/knowledge.md"),
        }
    }

    /// セッション完了時にClaude APIで知識を抽出して追記
    pub async fn extract_and_append(
        &self,
        session_log: &str,
        api_key: &str,
    ) -> Result<(), String> {
        let extracted = self.call_extraction_api(session_log, api_key).await?;
        self.append_entries(&extracted)?;
        Ok(())
    }

    /// Worker起動時に関連知識を取得
    pub fn get_relevant_knowledge(&self, _task: &str) -> String {
        let content = fs::read_to_string(&self.knowledge_path)
            .unwrap_or_default();
        if content.is_empty() {
            String::new()
        } else {
            format!("\n\n# このプロジェクトの注意事項\n{}", content)
        }
    }

    /// 期限切れの一時メモを削除
    pub fn purge_expired(&self) -> Result<u32, String> {
        // TODO: Markdownパーサーで expires_at を確認して削除
        Ok(0)
    }

    async fn call_extraction_api(
        &self,
        _session_log: &str,
        _api_key: &str,
    ) -> Result<Vec<KnowledgeEntry>, String> {
        unimplemented!("Claude API呼び出し実装")
    }

    fn append_entries(&self, _entries: &[KnowledgeEntry]) -> Result<(), String> {
        unimplemented!("Markdown追記実装")
    }
}
