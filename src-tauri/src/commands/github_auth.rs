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
        .ok_or_else(|| AppError::Validation("GitHub Client ID が設定されていません".to_string()))?;

    let url = oauth::auth_url(&client_id);

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| AppError::Internal(format!("ブラウザ起動失敗: {}", e)))?;

    let state_db = state.db.clone();
    tokio::spawn(async move {
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
                match keychain::set_token(project_id, &token) {
                    Ok(()) => {
                        let _ = app.emit("github_auth_done", serde_json::json!({
                            "success": true
                        }));
                    }
                    Err(e) => {
                        let _ = app.emit("github_auth_done", serde_json::json!({
                            "success": false,
                            "error": e.to_string()
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
    });

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

/// 現在の GitHub 認証状態を返す。
#[tauri::command]
pub async fn github_auth_status(
    project_id: i64,
    _state: State<'_, AppState>,
) -> std::result::Result<crate::services::github::GitHubAuthStatus, AppError> {
    match keychain::get_token(project_id) {
        Ok(Some(token)) => {
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

/// GitHub 認証を取り消す（Keychain からトークン削除）。
#[tauri::command]
pub async fn github_auth_revoke(
    project_id: i64,
    _state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    keychain::delete_token(project_id).map_err(|e| AppError::Keychain(e.to_string()))
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
}
