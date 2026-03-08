use crate::error::{AppError, Result};
use keyring::Entry;

const SERVICE: &str = "devnest";

pub fn get_token(project_id: i64) -> Result<Option<String>> {
    let key = format!("github_token_{}", project_id);
    let entry = Entry::new(SERVICE, &key).map_err(|e| AppError::Keychain(e.to_string()))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    }
}

pub fn set_token(project_id: i64, token: &str) -> Result<()> {
    let key = format!("github_token_{}", project_id);
    let entry = Entry::new(SERVICE, &key).map_err(|e| AppError::Keychain(e.to_string()))?;
    entry
        .set_password(token)
        .map_err(|e| AppError::Keychain(e.to_string()))
}

pub fn delete_token(project_id: i64) -> Result<()> {
    let key = format!("github_token_{}", project_id);
    let entry = Entry::new(SERVICE, &key).map_err(|e| AppError::Keychain(e.to_string()))?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    }
}

pub fn require_token(project_id: i64) -> Result<String> {
    get_token(project_id)?.ok_or(AppError::GitHubAuthRequired)
}
