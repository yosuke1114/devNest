use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// app_settings テーブルの 1 行
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AppSetting {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

/// 既定キーの定数定義
pub struct AppSettingKey;

impl AppSettingKey {
    pub const THEME: &'static str = "app.theme";
    pub const NOTIF_GRANTED: &'static str = "app.notif_granted";
    pub const LAST_PROJECT_ID: &'static str = "app.last_project_id";
    pub const ONBOARDING_DONE: &'static str = "app.onboarding_done";
    pub const GITHUB_USER_LOGIN: &'static str = "github.user_login";
    pub const GITHUB_RATE_LIMIT_REMAINING: &'static str = "github.rate_limit_remaining";
    pub const GITHUB_LABELS_CACHE: &'static str = "github.labels_cache";
}

/// settings_get / settings_set の共通型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingValue {
    pub key: String,
    /// JSON または文字列
    pub value: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Red: AppSettingKey 定数が設計書の既定キーと一致すること
    #[test]
    fn test_setting_keys_match_spec() {
        assert_eq!(AppSettingKey::THEME, "app.theme");
        assert_eq!(AppSettingKey::NOTIF_GRANTED, "app.notif_granted");
        assert_eq!(AppSettingKey::LAST_PROJECT_ID, "app.last_project_id");
        assert_eq!(AppSettingKey::ONBOARDING_DONE, "app.onboarding_done");
    }

    // Red: AppSetting が JSON に正しくシリアライズできること
    #[test]
    fn test_app_setting_serializes() {
        let setting = AppSetting {
            key: "app.theme".to_string(),
            value: r#""dark""#.to_string(),
            updated_at: "2026-03-08T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&setting).unwrap();
        assert!(json.contains("app.theme"));
        assert!(json.contains("dark"));
    }
}
