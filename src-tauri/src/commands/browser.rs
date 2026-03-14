use tauri::State;
use crate::browser::{BrowserContext, BrowserPanelInfo, SharedBrowser, InAppBrowser};

#[tauri::command]
pub async fn open_browser_panel(
    url: String,
    title: Option<String>,
    browser: State<'_, SharedBrowser>,
) -> Result<String, String> {
    let mut b = browser.lock().map_err(|e| e.to_string())?;
    Ok(b.open_panel(url, title))
}

#[tauri::command]
pub async fn navigate_browser(
    panel_id: String,
    url: String,
    browser: State<'_, SharedBrowser>,
) -> Result<(), String> {
    let mut b = browser.lock().map_err(|e| e.to_string())?;
    b.navigate(&panel_id, url)
}

#[tauri::command]
pub async fn close_browser_panel(
    panel_id: String,
    browser: State<'_, SharedBrowser>,
) -> Result<(), String> {
    let mut b = browser.lock().map_err(|e| e.to_string())?;
    b.close_panel(&panel_id)
}

#[tauri::command]
pub async fn get_browser_panels(
    browser: State<'_, SharedBrowser>,
) -> Result<Vec<BrowserPanelInfo>, String> {
    let b = browser.lock().map_err(|e| e.to_string())?;
    Ok(b.get_open_panels())
}

#[tauri::command]
pub async fn analyze_browser_context(url: String) -> Result<Option<BrowserContext>, String> {
    Ok(InAppBrowser::analyze_url(&url))
}
