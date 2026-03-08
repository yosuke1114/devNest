use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("DB エラー: {0}")]
    Db(String),

    #[error("git エラー: {0}")]
    Git(String),

    #[error("GitHub API エラー: {0}")]
    GitHub(String),

    #[error("GitHub 認証が必要です")]
    GitHubAuthRequired,

    #[error("GitHub API レート制限超過。リセット: {reset_at}")]
    GitHubRateLimit { reset_at: String },

    #[error("Anthropic API エラー: {0}")]
    Anthropic(String),

    #[error("ファイル操作エラー: {0}")]
    Io(String),

    #[error("入力エラー: {0}")]
    Validation(String),

    #[error("Keychain エラー: {0}")]
    Keychain(String),

    #[error("見つかりません: {0}")]
    NotFound(String),

    #[error("内部エラー: {0}")]
    Internal(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self {
        AppError::Git(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<sqlx::migrate::MigrateError> for AppError {
    fn from(e: sqlx::migrate::MigrateError) -> Self {
        AppError::Db(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    // Red: AppError が { "code": "Db", "message": "..." } の形で JSON シリアライズされること
    #[test]
    fn test_serialize_db_error() {
        let err = AppError::Db("connection failed".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains(r#""code":"Db""#), "got: {json}");
        assert!(json.contains("connection failed"), "got: {json}");
    }

    #[test]
    fn test_serialize_github_auth_required() {
        let err = AppError::GitHubAuthRequired;
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains(r#""code":"GitHubAuthRequired""#), "got: {json}");
    }

    #[test]
    fn test_serialize_github_rate_limit() {
        let err = AppError::GitHubRateLimit {
            reset_at: "2026-03-08T13:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains(r#""code":"GitHubRateLimit""#), "got: {json}");
        assert!(json.contains("2026-03-08T13:00:00Z"), "got: {json}");
    }

    #[test]
    fn test_from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_err: AppError = io_err.into();
        assert!(matches!(app_err, AppError::Io(_)));
    }

    #[test]
    fn test_display_message() {
        let err = AppError::Validation("名前は必須です".to_string());
        assert_eq!(err.to_string(), "入力エラー: 名前は必須です");
    }
}
