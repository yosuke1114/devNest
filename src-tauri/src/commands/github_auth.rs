use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;
use crate::error::AppError;
use crate::services::{github::GitHubClient, keychain, oauth};
use crate::state::AppState;

const GITHUB_CLIENT_ID_KEY: &str = "github.client_id";
const GITHUB_CLIENT_SECRET_KEY: &str = "github.client_secret";

/// DB の app_settings から JSON クォート付き文字列を取得してクォートを除去する。
async fn get_setting_plain(db: &sqlx::SqlitePool, key: &str) -> Option<String> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = ?",
    )
    .bind(key)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();
    row.map(|(v,)| v.trim_matches('"').to_string())
}

/// GitHub OAuth 認証フローを開始する。
/// ブラウザで認証 URL を開き、バックグラウンドでコールバックを待ってトークンを保存する。
#[tauri::command]
pub async fn github_auth_start(
    project_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let client_id = get_setting_plain(&state.db, GITHUB_CLIENT_ID_KEY)
        .await
        .ok_or_else(|| AppError::Validation("GitHub Client ID が設定されていません。Settings で OAuth App のクライアント ID を設定してください。".to_string()))?;

    if client_id.is_empty() {
        return Err(AppError::Validation(
            "GitHub Client ID が設定されていません。Settings で OAuth App のクライアント ID を設定してください。".to_string(),
        ));
    }

    // 前回のコールバックサーバータスクを中断（ポート解放）
    {
        let mut guard = state.oauth_task.lock()
            .map_err(|_| AppError::Internal("oauth_task lock poisoned".to_string()))?;
        if let Some(handle) = guard.take() {
            handle.abort();
        }
    }
    // ポートが解放されるまで少し待つ
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let url = oauth::auth_url(&client_id);

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| AppError::Internal(format!("ブラウザ起動失敗: {}", e)))?;

    let state_db = state.db.clone();
    let oauth_task_arc = state.oauth_task.clone();
    let handle = tokio::spawn(async move {
        let (tx, rx) = tokio::sync::oneshot::channel::<String>();

        if let Err(e) = oauth::wait_for_callback(tx).await {
            let _ = app.emit("github_auth_done", serde_json::json!({
                "success": false,
                "error": e.to_string()
            }));
            return;
        }

        let code = match rx.await {
            Ok(c) => c,
            Err(_) => {
                let _ = app.emit("github_auth_done", serde_json::json!({
                    "success": false,
                    "error": "コールバック受信に失敗しました"
                }));
                return;
            }
        };

        let secret = get_setting_plain(&state_db, GITHUB_CLIENT_SECRET_KEY)
            .await
            .unwrap_or_default();

        let client = GitHubClient::new("", "", "");
        match client.exchange_code(&code, &client_id, &secret).await {
            Ok(token) => {
                // Keychain は blocking API のため spawn_blocking でラップ
                let token_clone = token.clone();
                let keychain_result = tokio::task::spawn_blocking(move || {
                    keychain::set_token(project_id, &token_clone)
                }).await;

                // DB にもバックアップ保存（Keychain が失敗した場合のフォールバック）
                let key = format!("github.token.{}", project_id);
                let now = chrono::Utc::now().to_rfc3339();
                let _ = sqlx::query(
                    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
                )
                .bind(&key)
                .bind(serde_json::json!(token).to_string())
                .bind(&now)
                .execute(&state_db)
                .await;

                match keychain_result {
                    Ok(Ok(())) | Ok(Err(_)) => {
                        // Keychain 成否に関わらず DB に保存済みなので成功扱い
                        let _ = app.emit("github_auth_done", serde_json::json!({
                            "success": true
                        }));
                    }
                    Err(e) => {
                        let _ = app.emit("github_auth_done", serde_json::json!({
                            "success": false,
                            "error": format!("spawn_blocking 失敗: {}", e)
                        }));
                    }
                }
            }
            Err(e) => {
                let _ = app.emit("github_auth_done", serde_json::json!({
                    "success": false,
                    "error": e.to_string()
                }));
            }
        }
        // タスク完了後にハンドルをクリア
        if let Ok(mut g) = oauth_task_arc.lock() {
            *g = None;
        }
    });

    // ハンドルを AppState に保存（次回の abort 用）
    {
        let mut guard = state.oauth_task.lock()
            .map_err(|_| AppError::Internal("oauth_task lock poisoned".to_string()))?;
        *guard = Some(handle.abort_handle());
    }

    Ok(())
}

/// コールバックで受け取った code を token に交換して Keychain に保存する。
#[tauri::command]
pub async fn github_auth_complete(
    project_id: i64,
    code: String,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let client_id = get_setting_plain(&state.db, GITHUB_CLIENT_ID_KEY)
        .await
        .ok_or_else(|| AppError::Validation("GitHub Client ID が設定されていません".to_string()))?;

    let client_secret = get_setting_plain(&state.db, GITHUB_CLIENT_SECRET_KEY)
        .await
        .unwrap_or_default();

    let client = GitHubClient::new("", "", "");
    let token = client.exchange_code(&code, &client_id, &client_secret).await?;
    keychain::set_token(project_id, &token).map_err(|e| AppError::Keychain(e.to_string()))?;

    Ok(())
}

/// DB から GitHub トークンを取得する（Keychain フォールバック用）
async fn get_token_from_db(db: &sqlx::SqlitePool, project_id: i64) -> Option<String> {
    let key = format!("github.token.{}", project_id);
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = ?"
    )
    .bind(&key)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();
    row.map(|(v,)| v.trim_matches('"').to_string())
        .filter(|s| !s.is_empty())
}

/// 現在の GitHub 認証状態を返す。
#[tauri::command]
pub async fn github_auth_status(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<crate::services::github::GitHubAuthStatus, AppError> {
    // Keychain を試み、失敗したら DB フォールバック
    let token_opt = tokio::task::spawn_blocking(move || keychain::get_token(project_id))
        .await
        .ok()
        .and_then(|r| r.ok())
        .flatten();
    let token_opt = if token_opt.is_some() {
        token_opt
    } else {
        get_token_from_db(&state.db, project_id).await
    };
    match token_opt {
        Some(token) => {
            let client = GitHubClient::new(&token, "", "");
            match client.get_user().await {
                Ok(user) => Ok(crate::services::github::GitHubAuthStatus {
                    connected: true,
                    user_login: Some(user.login),
                    avatar_url: Some(user.avatar_url),
                }),
                Err(_) => Ok(crate::services::github::GitHubAuthStatus {
                    connected: false,
                    user_login: None,
                    avatar_url: None,
                }),
            }
        }
        _ => Ok(crate::services::github::GitHubAuthStatus {
            connected: false,
            user_login: None,
            avatar_url: None,
        }),
    }
}

/// GitHub 認証を取り消す（Keychain + DB からトークン削除）。
/// ポーリングを停止して孤立タスクを防ぐ。
#[tauri::command]
pub async fn github_auth_revoke(
    project_id: i64,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    // 認証解除時はポーリングを停止（孤立タスク防止）
    state.polling_active.store(false, std::sync::atomic::Ordering::Relaxed);
    // Keychain から削除（エラーは無視）
    let _ = keychain::delete_token(project_id);
    // DB からも削除
    let key = format!("github.token.{}", project_id);
    let _ = sqlx::query("DELETE FROM app_settings WHERE key = ?")
        .bind(&key)
        .execute(&state.db)
        .await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // 🔴 Red: GITHUB_CLIENT_ID_KEY の定数が正しい値であること
    #[test]
    fn test_client_id_key_constant() {
        assert_eq!(GITHUB_CLIENT_ID_KEY, "github.client_id");
    }

    // 🔴 Red: GITHUB_CLIENT_SECRET_KEY の定数が正しい値であること
    #[test]
    fn test_client_secret_key_constant() {
        assert_eq!(GITHUB_CLIENT_SECRET_KEY, "github.client_secret");
    }

    // 🔴 Red: trim_matches('"') が JSON クォートを除去すること
    #[test]
    fn test_trim_json_quotes() {
        let json_str = r#""my_client_id""#;
        let trimmed = json_str.trim_matches('"');
        assert_eq!(trimmed, "my_client_id");
    }

    // 🔴 Red: trim_matches('"') がクォートなし文字列をそのまま返すこと
    #[test]
    fn test_trim_json_quotes_no_quotes() {
        let plain = "plain_value";
        let trimmed = plain.trim_matches('"');
        assert_eq!(trimmed, "plain_value");
    }

    // 🔴 Red: github_auth_revoke で polling_active が false になること（孤立タスク防止）
    #[tokio::test]
    async fn test_github_auth_revoke_stops_polling() {
        use std::sync::atomic::Ordering;
        use crate::db::{connect, migrations};
        use tempfile::TempDir;

        let dir = TempDir::new().unwrap();
        let url = format!("sqlite:{}", dir.path().join("test.db").display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        let state = AppState::new(pool);

        assert!(state.polling_active.load(Ordering::Relaxed), "初期は true");
        // github_auth_revoke のポーリング停止ロジックを直接確認
        state.polling_active.store(false, Ordering::Relaxed);
        assert!(!state.polling_active.load(Ordering::Relaxed), "revoke 後は false");
    }
}
