use tauri::State;
use crate::agile::{
    kanban::{KanbanBoard, KanbanCard, KanbanStore, NewCard},
    sprint_planner::{SprintPlan, SprintPlanner},
    retrospective::{Retrospective, RetroGenerator},
    story_map::{StoryMap, StoryMapStore},
    flow::{FlowAnalysis, analyze_flow},
};
use crate::analytics::sprint::{SprintInfo, analyze_sprint};
use crate::error::{AppError, Result};
use crate::state::AppState;

#[tauri::command]
pub async fn kanban_get_board(
    project_path: String,
    product_id: String,
    _state: State<'_, AppState>,
) -> Result<KanbanBoard> {
    Ok(KanbanStore::new(std::path::Path::new(&project_path)).load(&product_id))
}

#[tauri::command]
pub async fn kanban_move_card(
    project_path: String,
    product_id: String,
    card_id: String,
    to_column: String,
    _state: State<'_, AppState>,
) -> Result<KanbanBoard> {
    KanbanStore::new(std::path::Path::new(&project_path)).move_card(&product_id, &card_id, &to_column)
}

#[tauri::command]
pub async fn kanban_create_card(
    project_path: String,
    product_id: String,
    card: NewCard,
    _state: State<'_, AppState>,
) -> Result<KanbanCard> {
    let (card, _) = KanbanStore::new(std::path::Path::new(&project_path)).create_card(&product_id, card)?;
    Ok(card)
}

#[tauri::command]
pub async fn kanban_delete_card(
    project_path: String,
    product_id: String,
    card_id: String,
    _state: State<'_, AppState>,
) -> Result<KanbanBoard> {
    KanbanStore::new(std::path::Path::new(&project_path)).delete_card(&product_id, &card_id)
}

#[tauri::command]
pub async fn sprint_suggest_plan(
    project_path: String,
    sprint_info: SprintInfo,
    state: State<'_, AppState>,
) -> Result<SprintPlan> {
    let api_key = load_anthropic_key(&state).await?;
    let store = KanbanStore::new(std::path::Path::new(&project_path));
    let board = store.load(&project_path);
    let backlog: Vec<_> = board.cards.into_iter().filter(|c| c.column_id == "backlog").collect();
    SprintPlanner::new(&api_key).suggest_plan(sprint_info, backlog).await
}

#[tauri::command]
pub async fn sprint_generate_retro(
    project_path: String,
    sprint_info: SprintInfo,
    state: State<'_, AppState>,
) -> Result<Retrospective> {
    let api_key = load_anthropic_key(&state).await?;
    let analysis = analyze_sprint(std::path::Path::new(&project_path), sprint_info)?;
    RetroGenerator::new(&api_key).generate(&analysis).await
}

#[tauri::command]
pub async fn story_map_get(
    project_path: String,
    product_id: String,
    _state: State<'_, AppState>,
) -> Result<StoryMap> {
    Ok(StoryMapStore::new(std::path::Path::new(&project_path)).load(&product_id))
}

#[tauri::command]
pub async fn story_map_save(
    project_path: String,
    map: StoryMap,
    _state: State<'_, AppState>,
) -> Result<()> {
    StoryMapStore::new(std::path::Path::new(&project_path)).save(&map)
}

#[tauri::command]
pub async fn flow_analyze(
    project_path: String,
    product_id: String,
    _state: State<'_, AppState>,
) -> Result<FlowAnalysis> {
    analyze_flow(std::path::Path::new(&project_path), &product_id)
}

async fn load_anthropic_key(state: &State<'_, AppState>) -> Result<String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_settings WHERE key = 'anthropic.api_key'")
            .fetch_optional(&state.db)
            .await?;
    let key = row
        .map(|(v,)| v.trim_matches('"').to_string())
        .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
        .unwrap_or_default();
    if key.is_empty() {
        return Err(AppError::Validation("Anthropic API キーが未設定です".to_string()));
    }
    Ok(key)
}
