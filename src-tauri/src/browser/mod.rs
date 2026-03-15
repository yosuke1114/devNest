use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPanelInfo {
    pub id: String,
    pub url: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserContext {
    pub kind: String,          // "pull_request" | "issue" | "unknown"
    pub pr_number: Option<u64>,
    pub issue_number: Option<u64>,
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub affected_doc_paths: Vec<String>,
}

pub struct InAppBrowser {
    panels: HashMap<String, BrowserPanelInfo>,
}

impl Default for InAppBrowser {
    fn default() -> Self {
        Self::new()
    }
}

impl InAppBrowser {
    pub fn new() -> Self {
        Self {
            panels: HashMap::new(),
        }
    }

    pub fn open_panel(&mut self, url: String, title: Option<String>) -> String {
        let id = Uuid::new_v4().to_string();
        let title = title.unwrap_or_else(|| url.clone());
        self.panels.insert(id.clone(), BrowserPanelInfo {
            id: id.clone(),
            url,
            title,
        });
        id
    }

    pub fn navigate(&mut self, panel_id: &str, url: String) -> Result<(), String> {
        let panel = self.panels.get_mut(panel_id).ok_or("Panel not found")?;
        panel.url = url;
        Ok(())
    }

    pub fn close_panel(&mut self, panel_id: &str) -> Result<(), String> {
        self.panels.remove(panel_id).ok_or("Panel not found".to_string())?;
        Ok(())
    }

    pub fn get_open_panels(&self) -> Vec<BrowserPanelInfo> {
        self.panels.values().cloned().collect()
    }

    /// GitHub PR / Issue URL を解析してコンテキストを返す
    pub fn analyze_url(url: &str) -> Option<BrowserContext> {
        // https://github.com/{owner}/{repo}/pull/{number}
        // https://github.com/{owner}/{repo}/issues/{number}
        let url = url.trim_end_matches('/');
        if !url.starts_with("https://github.com/") {
            return None;
        }
        let path = url.trim_start_matches("https://github.com/");
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() < 4 {
            return None;
        }
        let owner = parts[0].to_string();
        let repo = parts[1].to_string();
        match parts[2] {
            "pull" => {
                let pr_number = parts[3].parse::<u64>().ok()?;
                Some(BrowserContext {
                    kind: "pull_request".into(),
                    pr_number: Some(pr_number),
                    issue_number: None,
                    owner: Some(owner),
                    repo: Some(repo),
                    affected_doc_paths: vec![],
                })
            }
            "issues" => {
                let issue_number = parts[3].parse::<u64>().ok()?;
                Some(BrowserContext {
                    kind: "issue".into(),
                    pr_number: None,
                    issue_number: Some(issue_number),
                    owner: Some(owner),
                    repo: Some(repo),
                    affected_doc_paths: vec![],
                })
            }
            _ => None,
        }
    }
}

pub type SharedBrowser = std::sync::Arc<std::sync::Mutex<InAppBrowser>>;

pub fn create_browser() -> SharedBrowser {
    std::sync::Arc::new(std::sync::Mutex::new(InAppBrowser::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_panel_returns_panel_id() {
        let mut browser = InAppBrowser::new();
        let id = browser.open_panel("https://example.com".into(), None);
        assert!(!id.is_empty());
        assert_eq!(browser.get_open_panels().len(), 1);
    }

    #[test]
    fn navigate_changes_url() {
        let mut browser = InAppBrowser::new();
        let id = browser.open_panel("https://example.com".into(), Some("Example".into()));
        browser.navigate(&id, "https://example.com/new".into()).unwrap();
        let panels = browser.get_open_panels();
        assert_eq!(panels[0].url, "https://example.com/new");
    }

    #[test]
    fn close_panel_removes_it() {
        let mut browser = InAppBrowser::new();
        let id = browser.open_panel("https://example.com".into(), None);
        browser.close_panel(&id).unwrap();
        assert!(browser.get_open_panels().is_empty());
    }

    #[test]
    fn get_browser_panels_returns_all() {
        let mut browser = InAppBrowser::new();
        browser.open_panel("https://a.com".into(), None);
        browser.open_panel("https://b.com".into(), None);
        assert_eq!(browser.get_open_panels().len(), 2);
    }

    #[test]
    fn close_nonexistent_panel_returns_error() {
        let mut browser = InAppBrowser::new();
        assert!(browser.close_panel("nonexistent").is_err());
    }

    #[test]
    fn multiple_panels_open_simultaneously() {
        let mut browser = InAppBrowser::new();
        let id1 = browser.open_panel("https://a.com".into(), None);
        let id2 = browser.open_panel("https://b.com".into(), None);
        assert_ne!(id1, id2);
        assert_eq!(browser.get_open_panels().len(), 2);
    }

    #[test]
    fn analyze_github_pr_url_returns_context() {
        let ctx = InAppBrowser::analyze_url("https://github.com/owner/repo/pull/42").unwrap();
        assert_eq!(ctx.kind, "pull_request");
        assert_eq!(ctx.pr_number, Some(42));
        assert_eq!(ctx.owner.as_deref(), Some("owner"));
        assert_eq!(ctx.repo.as_deref(), Some("repo"));
    }

    #[test]
    fn analyze_non_github_url_returns_none() {
        assert!(InAppBrowser::analyze_url("https://example.com/path").is_none());
    }
}
