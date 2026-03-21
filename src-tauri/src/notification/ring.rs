use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum RingUrgency {
    Info,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum AlertSeverity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RingEvent {
    AgentAttention {
        task_id: String,
        task_type: String,
        product_id: String,
        urgency: RingUrgency,
        message: String,
    },
    MaintenanceAlert {
        product_id: String,
        alert_type: String,
        severity: AlertSeverity,
        message: String,
    },
    DocStale {
        product_id: String,
        doc_path: String,
        staleness_score: f64,
    },
    GitHubEvent {
        product_id: String,
        event_type: String,
        title: String,
        url: Option<String>,
    },

    /// Swarm Worker の状態変化（done / error / retrying）
    SwarmWorkerUpdate {
        run_id: String,
        worker_id: String,
        task_title: String,
        /// "done" | "error" | "retrying"
        status: String,
        urgency: RingUrgency,
    },

    /// Swarm 実行全体の完了
    SwarmRunComplete {
        run_id: String,
        total: u32,
        done: u32,
        has_conflicts: bool,
        urgency: RingUrgency,
    },

    /// Wave Gate の完了通知（Wave間のマージ・テスト・レビュー結果）
    SwarmWaveGate {
        wave_number: u32,
        /// "Passed" | "PassedWithWarnings" | "Blocked"
        overall: String,
        urgency: RingUrgency,
    },
}

impl RingEvent {
    pub fn urgency(&self) -> &RingUrgency {
        match self {
            RingEvent::AgentAttention { urgency, .. } => urgency,
            RingEvent::MaintenanceAlert { severity, .. } => match severity {
                AlertSeverity::Critical | AlertSeverity::High => &RingUrgency::Critical,
                AlertSeverity::Medium => &RingUrgency::Warning,
                AlertSeverity::Low => &RingUrgency::Info,
            },
            RingEvent::DocStale { staleness_score, .. } => {
                if *staleness_score > 0.9 {
                    &RingUrgency::Warning
                } else {
                    &RingUrgency::Info
                }
            }
            RingEvent::GitHubEvent { .. } => &RingUrgency::Info,
            RingEvent::SwarmWorkerUpdate { urgency, .. } => urgency,
            RingEvent::SwarmRunComplete { urgency, .. } => urgency,
            RingEvent::SwarmWaveGate { urgency, .. } => urgency,
        }
    }

    pub fn is_native_notification_worthy(&self) -> bool {
        matches!(self.urgency(), RingUrgency::Critical | RingUrgency::Warning)
    }

    pub fn title(&self) -> &str {
        match self {
            RingEvent::AgentAttention { .. } => "エージェント通知",
            RingEvent::MaintenanceAlert { .. } => "保守アラート",
            RingEvent::DocStale { .. } => "設計書鮮度アラート",
            RingEvent::GitHubEvent { title, .. } => title,
            RingEvent::SwarmWorkerUpdate { .. } => "Swarm Worker 通知",
            RingEvent::SwarmRunComplete { .. } => "Swarm 完了",
            RingEvent::SwarmWaveGate { .. } => "Swarm Wave Gate",
        }
    }

    pub fn body(&self) -> String {
        match self {
            RingEvent::AgentAttention { message, .. } => message.clone(),
            RingEvent::MaintenanceAlert { message, .. } => message.clone(),
            RingEvent::DocStale { doc_path, staleness_score, .. } => {
                format!("{} の鮮度スコアが {:.2} です", doc_path, staleness_score)
            }
            RingEvent::GitHubEvent { event_type, title, .. } => {
                format!("{}: {}", event_type, title)
            }
            RingEvent::SwarmWorkerUpdate { task_title, status, .. } => {
                format!("タスク「{}」が {} になりました", task_title, status)
            }
            RingEvent::SwarmRunComplete { done, total, has_conflicts, .. } => {
                if *has_conflicts {
                    format!("{}/{} タスク完了（コンフリクトあり）", done, total)
                } else {
                    format!("{}/{} タスクが正常に完了しました", done, total)
                }
            }
            RingEvent::SwarmWaveGate { wave_number, overall, .. } => {
                format!("Wave {} Gate: {}", wave_number, overall)
            }
        }
    }
}

pub fn emit_ring_event(app: &AppHandle, event: RingEvent) {
    app.emit("ring-event", &event).ok();
    if event.is_native_notification_worthy() {
        send_native_notification(app, &event);
    }
}

fn send_native_notification(app: &AppHandle, event: &RingEvent) {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(event.title())
        .body(event.body())
        .show()
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_agent_attention(urgency: RingUrgency) -> RingEvent {
        RingEvent::AgentAttention {
            task_id: "t1".into(),
            task_type: "review".into(),
            product_id: "p1".into(),
            urgency,
            message: "タスクが完了しました".into(),
        }
    }

    #[test]
    fn agent_attention_event_created_correctly() {
        let ev = make_agent_attention(RingUrgency::Warning);
        assert!(matches!(ev, RingEvent::AgentAttention { .. }));
        assert_eq!(ev.urgency(), &RingUrgency::Warning);
    }

    #[test]
    fn maintenance_alert_event_created_correctly() {
        let ev = RingEvent::MaintenanceAlert {
            product_id: "p1".into(),
            alert_type: "vulnerability".into(),
            severity: AlertSeverity::Critical,
            message: "脆弱性が検出されました".into(),
        };
        assert_eq!(ev.urgency(), &RingUrgency::Critical);
    }

    #[test]
    fn doc_stale_event_with_score() {
        let ev = RingEvent::DocStale {
            product_id: "p1".into(),
            doc_path: "docs/api.md".into(),
            staleness_score: 0.95,
        };
        assert_eq!(ev.urgency(), &RingUrgency::Warning);
    }

    #[test]
    fn github_event_created_correctly() {
        let ev = RingEvent::GitHubEvent {
            product_id: "p1".into(),
            event_type: "pr_review_requested".into(),
            title: "Fix bug".into(),
            url: Some("https://github.com/owner/repo/pull/1".into()),
        };
        assert_eq!(ev.urgency(), &RingUrgency::Info);
    }

    #[test]
    fn ring_urgency_set_correctly() {
        assert_eq!(make_agent_attention(RingUrgency::Info).urgency(), &RingUrgency::Info);
        assert_eq!(make_agent_attention(RingUrgency::Warning).urgency(), &RingUrgency::Warning);
        assert_eq!(make_agent_attention(RingUrgency::Critical).urgency(), &RingUrgency::Critical);
    }

    #[test]
    fn critical_is_native_notification_worthy() {
        assert!(make_agent_attention(RingUrgency::Critical).is_native_notification_worthy());
    }

    #[test]
    fn warning_is_native_notification_worthy() {
        assert!(make_agent_attention(RingUrgency::Warning).is_native_notification_worthy());
    }

    #[test]
    fn info_is_not_native_notification_worthy() {
        assert!(!make_agent_attention(RingUrgency::Info).is_native_notification_worthy());
    }

    #[test]
    fn maintenance_alert_severity_high_maps_to_critical_urgency() {
        let ev = RingEvent::MaintenanceAlert {
            product_id: "p1".into(),
            alert_type: "coverage".into(),
            severity: AlertSeverity::High,
            message: "カバレッジ低下".into(),
        };
        assert_eq!(ev.urgency(), &RingUrgency::Critical);
    }

    #[test]
    fn maintenance_alert_severity_low_maps_to_info_urgency() {
        let ev = RingEvent::MaintenanceAlert {
            product_id: "p1".into(),
            alert_type: "tech_debt".into(),
            severity: AlertSeverity::Low,
            message: "軽微な技術的負債".into(),
        };
        assert_eq!(ev.urgency(), &RingUrgency::Info);
    }
}
