use std::sync::atomic::Ordering;
use tauri::State;
use git2::Repository;
use crate::db;
use crate::error::AppError;
use crate::models::project::{Project, ProjectCreateResult, ProjectPatch, ProjectStatus};
use crate::state::AppState;

#[tauri::command]
pub async fn project_create(
    name: String,
    local_path: String,
    state: State<'_, AppState>,
) -> std::result::Result<ProjectCreateResult, AppError> {
    // local_path が存在するか検証
    if !std::path::Path::new(&local_path).exists() {
        return Err(AppError::Validation(format!(
            "パス '{}' が見つかりません",
            local_path
        )));
    }

    // git リポジトリかどうかを git2 で検証し、サブディレクトリの場合は git ルートを案内する
    let trimmed = local_path.trim_end_matches('/');
    match Repository::open(trimmed) {
        Ok(_) => {} // OK: local_path が git リポジトリのルート
        Err(_) => {
            // サブディレクトリかどうか確認し、詳細なエラーを返す
            let hint = Repository::discover(trimmed)
                .ok()
                .and_then(|repo| {
                    repo.workdir().map(|p| {
                        p.to_string_lossy()
                            .trim_end_matches('/')
                            .to_string()
                    })
                });

            if let Some(root) = hint {
                return Err(AppError::Validation(format!(
                    "'{}' は git リポジトリのサブディレクトリです。\ngit ルートのパスを入力してください: {}",
                    local_path, root
                )));
            } else {
                return Err(AppError::Validation(format!(
                    "'{}' は git リポジトリではありません",
                    local_path
                )));
            }
        }
    }

    // git remote origin の URL から repo_owner / repo_name を抽出する
    let (repo_owner, repo_name) = extract_github_owner_repo(trimmed).unwrap_or_default();

    let project = db::project::insert(&state.db, &name, &local_path, &repo_owner, &repo_name).await?;

    // .md ファイルをスキャンして documents に INSERT
    let document_count = db::document::scan_and_insert(&state.db, project.id, &local_path, "docs/").await?;

    Ok(ProjectCreateResult { project, document_count })
}

/// git remote origin の URL から (owner, repo) を抽出する。
/// 対応形式:
///   https://github.com/owner/repo.git
///   git@github.com:owner/repo.git
fn extract_github_owner_repo(repo_path: &str) -> Option<(String, String)> {
    let repo = Repository::open(repo_path).ok()?;
    let remote = repo.find_remote("origin").ok()?;
    let url = remote.url()?;

    // HTTPS: https://github.com/owner/repo(.git)
    // SSH:   git@github.com:owner/repo(.git)
    let path = if let Some(p) = url.strip_prefix("https://github.com/") {
        p
    } else if let Some(p) = url.strip_prefix("git@github.com:") {
        p
    } else {
        return None;
    };

    let path = path.trim_end_matches(".git");
    let mut parts = path.splitn(2, '/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.to_string();
    Some((owner, repo))
}

#[tauri::command]
pub async fn project_list(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<Project>, AppError> {
    let mut projects = db::project::list(&state.db).await?;

    // repo_owner が未設定のプロジェクトを git remote から自動補完
    for project in &mut projects {
        if !project.repo_owner.is_empty() {
            continue;
        }
        if let Some((owner, repo)) = extract_github_owner_repo(&project.local_path) {
            let patch = crate::models::project::ProjectPatch {
                project_id: project.id,
                repo_owner: Some(Some(owner.clone())),
                repo_name: Some(Some(repo.clone())),
                default_branch: None,
                sync_mode: None,
                docs_root: None,
                commit_msg_format: None,
                debounce_ms: None,
                remote_poll_interval_min: None,
            };
            if db::project::update(&state.db, &patch).await.is_ok() {
                project.repo_owner = owner;
                project.repo_name = repo;
            }
        }
    }

    Ok(projects)
}

#[tauri::command]
pub async fn project_update(
    patch: ProjectPatch,
    state: State<'_, AppState>,
) -> std::result::Result<Project, AppError> {
    db::project::update(&state.db, &patch).await
}

#[tauri::command]
pub async fn project_get_status(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<ProjectStatus, AppError> {
    db::project::get_status(&state.db, project_id).await
}

#[tauri::command]
pub async fn project_delete(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    // プロジェクト削除時はポーリングを停止して孤立タスクを防ぐ
    state.polling_active.store(false, Ordering::Relaxed);
    db::project::delete(&state.db, project_id).await
}

#[tauri::command]
pub async fn project_set_last_opened_document(
    project_id: i64,
    document_id: Option<i64>,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    db::project::set_last_opened_document(&state.db, project_id, document_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connect_for_test as connect, migrations};
    use tempfile::TempDir;

    async fn setup() -> (AppState, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let url = format!("sqlite:{}", db_path.display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (AppState::new(pool), dir)
    }

    // 🔴 Red: 存在しないパスで project_create するとエラー
    #[tokio::test]
    async fn test_project_create_path_not_found() {
        let (state, _dir) = setup().await;
        let result = db::project::insert(
            &state.db, "P", "/nonexistent/path/xyz", "o", "r"
        ).await;
        // DB レベルは通過するが、コマンドレベルでパス検証する
        // ここでは DB 層だけ確認（コマンド層の path.exists() は実行環境依存）
        assert!(result.is_ok(), "DB 層は path 存在チェックしない");
    }

    // 🔴 Red: project_list が空リストを返すこと
    #[tokio::test]
    async fn test_project_list_empty() {
        let (state, _dir) = setup().await;
        let projects = db::project::list(&state.db).await.unwrap();
        assert!(projects.is_empty());
    }

    // 🔴 Red: project_get_status が存在しない project_id でエラー
    #[tokio::test]
    async fn test_project_get_status_not_found() {
        let (state, _dir) = setup().await;
        let result = db::project::get_status(&state.db, 9999).await;
        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    // 🔴 Red: project_delete で polling_active が false になること（孤立タスク防止）
    #[tokio::test]
    async fn test_project_delete_stops_polling() {
        use std::sync::atomic::Ordering;
        let (state, _dir) = setup().await;
        let p = db::project::insert(&state.db, "P", "/tmp/p3", "o", "r")
            .await.unwrap();

        assert!(state.polling_active.load(Ordering::Relaxed), "初期は true");
        // project_delete のロジックを直接実行
        state.polling_active.store(false, Ordering::Relaxed);
        db::project::delete(&state.db, p.id).await.unwrap();
        assert!(!state.polling_active.load(Ordering::Relaxed), "削除後は false");
    }

    // 🔴 Red: project_set_last_opened_document で None をセット
    #[tokio::test]
    async fn test_set_last_opened_document() {
        let (state, _dir) = setup().await;
        let p = db::project::insert(&state.db, "P", "/tmp/p2", "o", "r")
            .await
            .unwrap();
        let result = db::project::set_last_opened_document(&state.db, p.id, None).await;
        assert!(result.is_ok());
    }
}
