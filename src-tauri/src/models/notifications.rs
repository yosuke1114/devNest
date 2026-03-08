use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Notification {
    pub id: i64,
    pub project_id: i64,
    pub event_type: String,
    pub title: String,
    pub body: Option<String>,
    pub dest_screen: Option<String>,
    pub dest_resource_id: Option<i64>,
    pub is_read: bool,
    pub os_notified: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewNotification {
    pub project_id: i64,
    pub event_type: String,
    pub title: String,
    pub body: Option<String>,
    pub dest_screen: Option<String>,
    pub dest_resource_id: Option<i64>,
}

/// notification_navigate コマンドの戻り値
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationTarget {
    pub screen: String,
    pub resource_id: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Red: NewNotification が正しく構築されること
    #[test]
    fn test_new_notification_fields() {
        let n = NewNotification {
            project_id: 1,
            event_type: "ci_pass".to_string(),
            title: "CI passed".to_string(),
            body: Some("All checks passed".to_string()),
            dest_screen: Some("pr".to_string()),
            dest_resource_id: Some(42),
        };
        assert_eq!(n.project_id, 1);
        assert_eq!(n.event_type, "ci_pass");
        assert!(n.body.is_some());
    }

    // Red: NavigationTarget が正しく構築されること
    #[test]
    fn test_navigation_target_fields() {
        let t = NavigationTarget {
            screen: "pr".to_string(),
            resource_id: Some(10),
        };
        assert_eq!(t.screen, "pr");
        assert_eq!(t.resource_id, Some(10));
    }
}
