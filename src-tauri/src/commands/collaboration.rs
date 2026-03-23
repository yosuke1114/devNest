use tauri::State;
use crate::collaboration::{
    team::{TeamDashboard, build_team_dashboard},
    knowledge::{KnowledgeEntry, KnowledgeStore, KnowledgeType},
};
use crate::error::Result;
use crate::state::AppState;
use uuid::Uuid;
use chrono::Utc;

#[tauri::command]
pub async fn team_get_dashboard(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<TeamDashboard> {
    build_team_dashboard(std::path::Path::new(&project_path), None).await
}

#[tauri::command]
pub async fn knowledge_list(
    project_path: String,
    _state: State<'_, AppState>,
) -> Result<Vec<KnowledgeEntry>> {
    Ok(KnowledgeStore::new(std::path::Path::new(&project_path)).load_all())
}

#[tauri::command]
pub async fn knowledge_search(
    project_path: String,
    query: String,
    _state: State<'_, AppState>,
) -> Result<Vec<KnowledgeEntry>> {
    Ok(KnowledgeStore::new(std::path::Path::new(&project_path)).search(&query))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn knowledge_add(
    project_path: String,
    title: String,
    content: String,
    entry_type: String,
    tags: Vec<String>,
    linked_docs: Vec<String>,
    author: String,
    _state: State<'_, AppState>,
) -> Result<KnowledgeEntry> {
    let k_type = match entry_type.as_str() {
        "retro_learning" => KnowledgeType::RetroLearning,
        "tech_note" => KnowledgeType::TechNote,
        "postmortem" => KnowledgeType::Postmortem,
        _ => KnowledgeType::DesignDecision,
    };
    let entry = KnowledgeEntry {
        id: Uuid::new_v4().to_string(),
        entry_type: k_type,
        title,
        content,
        author,
        product_id: project_path.clone(),
        linked_docs,
        tags,
        created_at: Utc::now().to_rfc3339(),
        comments: vec![],
    };
    KnowledgeStore::new(std::path::Path::new(&project_path)).add_entry(entry)
}

#[tauri::command]
pub async fn knowledge_add_comment(
    project_path: String,
    entry_id: String,
    author: String,
    content: String,
    _state: State<'_, AppState>,
) -> Result<KnowledgeEntry> {
    KnowledgeStore::new(std::path::Path::new(&project_path)).add_comment(&entry_id, &author, &content)
}
