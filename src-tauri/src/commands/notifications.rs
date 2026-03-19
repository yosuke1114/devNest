use tauri::{Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;
use crate::error::{AppError, Result};
use crate::models::notifications::{NavigationTarget, NewNotification, Notification};
use crate::state::AppState;
use crate::db;

/// プロジェクトの通知一覧を返す
#[tauri::command]
pub async fn notification_list(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<Notification>> {
    db::notifications::list(&state.db, project_id).await
}

/// プロジェクトの未読数を返す
#[tauri::command]
pub async fn notification_unread_count(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<i64> {
    db::notifications::unread_count(&state.db, project_id).await
}

/// 指定 ID の通知を既読にする
#[tauri::command]
pub async fn notification_mark_read(
    notification_id: i64,
    state: State<'_, AppState>,
) -> Result<()> {
    db::notifications::mark_read(&state.db, notification_id).await
}

/// プロジェクトの全通知を既読にする
#[tauri::command]
pub async fn notification_mark_all_read(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<()> {
    db::notifications::mark_all_read(&state.db, project_id).await
}

/// 通知の遷移先画面情報を返す。
/// F-R02: ウィンドウをフォアグラウンドに浮上させる。
#[tauri::command]
pub async fn notification_navigate(
    notification_id: i64,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<NavigationTarget> {
    // ウィンドウをフォアグラウンドへ（F-R02）
    if let Some(window) = app.get_webview_window("main") {
        window.set_focus().ok();
    }
    db::notifications::navigate(&state.db, notification_id).await
}

/// テスト・デモ用：通知を手動作成する
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn notification_push(
    project_id: i64,
    event_type: String,
    title: String,
    body: Option<String>,
    dest_screen: Option<String>,
    dest_resource_id: Option<i64>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<i64> {
    let n = NewNotification {
        project_id,
        event_type,
        title: title.clone(),
        body,
        dest_screen,
        dest_resource_id,
    };
    let id = db::notifications::create(&state.db, &n).await?;
    // フロントに通知イベントを送信
    let _ = app.emit("notification_new", serde_json::json!({
        "notificationId": id,
        "title": title.clone(),
        "eventType": n.event_type,
    }));
    // OS 通知を発火（F-P02）
    let _ = app
        .notification()
        .builder()
        .title("DevNest")
        .body(&title)
        .show();
    Ok(id)
}

/// OS の通知権限をリクエストし、結果を文字列で返す
#[tauri::command]
pub async fn notification_permission_request(
    app: tauri::AppHandle,
) -> std::result::Result<String, AppError> {
    let status = app
        .notification()
        .request_permission()
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(format!("{:?}", status).to_lowercase())
}

#[cfg(test)]
mod tests {
    use crate::db::{connect, migrations};
    use crate::db::{project, notifications};
    use crate::models::notifications::NewNotification;
    use crate::state::AppState;
    use tempfile::TempDir;

    async fn setup() -> (AppState, TempDir, i64) {
        let dir = TempDir::new().unwrap();
        let pool = connect(&format!("sqlite:{}", dir.path().join("dev.db").display()))
            .await.unwrap();
        migrations::run(&pool).await.unwrap();
        let state = AppState::new(pool);
        let p = project::insert(&state.db, "P", "/tmp", "o", "r").await.unwrap();
        (state, dir, p.id)
    }

    fn new_notif(project_id: i64, event_type: &str, title: &str) -> NewNotification {
        NewNotification {
            project_id,
            event_type: event_type.to_string(),
            title: title.to_string(),
            body: None,
            dest_screen: Some("pr".to_string()),
            dest_resource_id: None,
        }
    }

    // 🔴 Red: 通知がないプロジェクトの一覧は空
    #[tokio::test]
    async fn test_notification_list_empty_on_new_project() {
        let (state, _dir, project_id) = setup().await;
        let list = notifications::list(&state.db, project_id).await.unwrap();
        assert!(list.is_empty());
    }

    // 🔴 Red: 通知を作成すると一覧に現れること
    #[tokio::test]
    async fn test_notification_push_appears_in_list() {
        let (state, _dir, project_id) = setup().await;
        let n = new_notif(project_id, "ci_pass", "CI passed");
        let id = notifications::create(&state.db, &n).await.unwrap();
        assert!(id > 0);

        let list = notifications::list(&state.db, project_id).await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "CI passed");
        assert_eq!(list[0].event_type, "ci_pass");
        assert!(!list[0].is_read, "作成直後は未読");
    }

    // 🔴 Red: 未読数が正しくカウントされること
    #[tokio::test]
    async fn test_unread_count_increments_with_new_notifications() {
        let (state, _dir, project_id) = setup().await;
        assert_eq!(notifications::unread_count(&state.db, project_id).await.unwrap(), 0);

        notifications::create(&state.db, &new_notif(project_id, "pr_comment", "Comment")).await.unwrap();
        assert_eq!(notifications::unread_count(&state.db, project_id).await.unwrap(), 1);

        notifications::create(&state.db, &new_notif(project_id, "ci_fail", "Fail")).await.unwrap();
        assert_eq!(notifications::unread_count(&state.db, project_id).await.unwrap(), 2);
    }

    // 🔴 Red: mark_read で未読数が減ること
    #[tokio::test]
    async fn test_mark_read_decrements_unread_count() {
        let (state, _dir, project_id) = setup().await;
        let id = notifications::create(&state.db, &new_notif(project_id, "pr_opened", "PR opened"))
            .await.unwrap();

        assert_eq!(notifications::unread_count(&state.db, project_id).await.unwrap(), 1);
        notifications::mark_read(&state.db, id).await.unwrap();
        assert_eq!(notifications::unread_count(&state.db, project_id).await.unwrap(), 0);

        // 既読フラグが立っていること
        let list = notifications::list(&state.db, project_id).await.unwrap();
        assert!(list[0].is_read);
    }

    // 🔴 Red: mark_all_read で全通知が既読になること
    #[tokio::test]
    async fn test_mark_all_read_clears_all_unread() {
        let (state, _dir, project_id) = setup().await;
        notifications::create(&state.db, &new_notif(project_id, "ci_pass", "A")).await.unwrap();
        notifications::create(&state.db, &new_notif(project_id, "ci_fail", "B")).await.unwrap();
        notifications::create(&state.db, &new_notif(project_id, "conflict", "C")).await.unwrap();

        assert_eq!(notifications::unread_count(&state.db, project_id).await.unwrap(), 3);
        notifications::mark_all_read(&state.db, project_id).await.unwrap();
        assert_eq!(notifications::unread_count(&state.db, project_id).await.unwrap(), 0);

        let list = notifications::list(&state.db, project_id).await.unwrap();
        assert!(list.iter().all(|n| n.is_read));
    }

    // 🔴 Red: navigate が正しい dest_screen を返すこと
    #[tokio::test]
    async fn test_notification_navigate_returns_correct_screen() {
        let (state, _dir, project_id) = setup().await;
        let mut n = new_notif(project_id, "conflict", "Conflicts detected");
        n.dest_screen = Some("conflict".to_string());
        n.dest_resource_id = Some(42);
        let id = notifications::create(&state.db, &n).await.unwrap();

        let target = notifications::navigate(&state.db, id).await.unwrap();
        assert_eq!(target.screen, "conflict");
        assert_eq!(target.resource_id, Some(42));
    }

    // 🔴 Red: 別プロジェクトの通知は一覧に出ないこと（プロジェクト分離）
    #[tokio::test]
    async fn test_notification_list_is_project_scoped() {
        let (state, _dir, project_id) = setup().await;
        let other = project::insert(&state.db, "Other", "/other", "o", "r").await.unwrap();

        notifications::create(&state.db, &new_notif(project_id, "ci_pass", "Mine")).await.unwrap();
        notifications::create(&state.db, &new_notif(other.id, "ci_fail", "Others")).await.unwrap();

        let mine = notifications::list(&state.db, project_id).await.unwrap();
        let theirs = notifications::list(&state.db, other.id).await.unwrap();
        assert_eq!(mine.len(), 1);
        assert_eq!(theirs.len(), 1);
        assert_eq!(mine[0].title, "Mine");
        assert_eq!(theirs[0].title, "Others");
    }
}
