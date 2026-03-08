use tauri::State;
use crate::error::AppError;
use crate::models::settings::SettingValue;
use crate::state::AppState;
use chrono::Utc;

#[tauri::command]
pub async fn settings_get(
    key: String,
    state: State<'_, AppState>,
) -> std::result::Result<Option<String>, AppError> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM app_settings WHERE key = ?"
    )
    .bind(&key)
    .fetch_optional(&state.db)
    .await?;
    Ok(row.map(|(v,)| v))
}

#[tauri::command]
pub async fn settings_set(
    setting: SettingValue,
    state: State<'_, AppState>,
) -> std::result::Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        "#,
    )
    .bind(&setting.key)
    .bind(&setting.value)
    .bind(&now)
    .execute(&state.db)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::{connect, migrations};
    use crate::models::settings::AppSettingKey;
    use tempfile::TempDir;
    use super::*;
    use crate::state::AppState;

    async fn setup() -> (AppState, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let url = format!("sqlite:{}", db_path.display());
        let pool = connect(&url).await.unwrap();
        migrations::run(&pool).await.unwrap();
        (AppState::new(pool), dir)
    }

    // 🔴 Red: migration 後に app.theme が取得できること
    #[tokio::test]
    async fn test_settings_get_default_theme() {
        let (state, _dir) = setup().await;
        let val: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM app_settings WHERE key = ?"
        )
        .bind(AppSettingKey::THEME)
        .fetch_optional(&state.db)
        .await
        .unwrap();
        assert!(val.is_some());
        assert_eq!(val.unwrap().0, r#""system""#);
    }

    // 🔴 Red: settings_set で upsert できること
    #[tokio::test]
    async fn test_settings_upsert() {
        let (state, _dir) = setup().await;
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
        )
        .bind("app.theme")
        .bind(r#""dark""#)
        .bind(&now)
        .execute(&state.db)
        .await
        .unwrap();

        let val: (String,) = sqlx::query_as(
            "SELECT value FROM app_settings WHERE key = 'app.theme'"
        )
        .fetch_one(&state.db)
        .await
        .unwrap();
        assert_eq!(val.0, r#""dark""#);
    }
}
