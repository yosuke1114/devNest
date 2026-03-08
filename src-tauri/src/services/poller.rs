//! バックグラウンドポーリングサービス。
//!
//! 各プロジェクトの `remote_poll_interval_min` に従って GitHub から PR を定期同期し、
//! `pr_sync_done` イベントをフロントエンドへ emit する。
//! また git コンフリクトを検出して `conflict` 通知を発行する。

use std::time::Duration;
use tauri::{AppHandle, Emitter};
use chrono::Utc;

use crate::db;
use crate::db::DbPool;
use crate::models::notifications::NewNotification;
use crate::services::{github::GitHubClient, git::GitService, keychain};

/// アプリ起動時に呼ぶ。`AppHandle` と DB プールを受け取りバックグラウンドで動き続ける。
pub fn start(app: AppHandle, pool: DbPool) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            poll_once(&app, &pool).await;
        }
    });
}

/// 全プロジェクトを一巡してポーリング処理を実行する。
async fn poll_once(app: &AppHandle, pool: &DbPool) {
    let projects = match db::project::list(pool).await {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("poller: project list error: {:?}", e);
            return;
        }
    };

    let now_min = Utc::now().timestamp() / 60;

    for project in &projects {
        if should_sync(project.remote_poll_interval_min, now_min) {
            sync_project(app, pool, project.id).await;
        }
    }
}

/// インターバル判定を純粋関数として分離（テスト容易性のため）。
/// `interval_min <= 0` はポーリング無効、`now_min % interval_min == 0` のときのみ同期する。
pub(crate) fn should_sync(interval_min: i64, now_min: i64) -> bool {
    if interval_min <= 0 {
        return false;
    }
    now_min % interval_min == 0
}

/// プロジェクト単位の同期処理。
async fn sync_project(app: &AppHandle, pool: &DbPool, project_id: i64) {
    // ── PR 同期 ───────────────────────────────────────────────────────────
    if let Ok(token) = keychain::require_token(project_id) {
        if let Ok(project) = db::project::find(pool, project_id).await {
            let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);
            match client.list_pull_requests(Some("open")).await {
                Ok(gh_prs) => {
                    let now = Utc::now().to_rfc3339();
                    let synced_count = gh_prs.len();
                    for gh in &gh_prs {
                        let _ = db::pr::upsert(pool, project_id, gh, &now).await;
                    }
                    let _ = app.emit(
                        "pr_sync_done",
                        serde_json::json!({
                            "project_id": project_id,
                            "synced_count": synced_count
                        }),
                    );
                    tracing::debug!(
                        "poller: synced {} PRs for project {}",
                        synced_count, project_id
                    );
                }
                Err(e) => {
                    tracing::warn!("poller: pr_sync error project={}: {:?}", project_id, e);
                }
            }
        }
    }

    // ── コンフリクト検出 ─────────────────────────────────────────────────
    if let Ok(project) = db::project::find(pool, project_id).await {
        let local_path = project.local_path.clone();
        let docs_root = project.docs_root.clone();

        let conflicted = tokio::task::spawn_blocking(move || {
            GitService::open(&local_path)
                .and_then(|git| git.list_conflicted_files())
                .unwrap_or_default()
        })
        .await
        .unwrap_or_default();

        let managed_count = conflicted
            .iter()
            .filter(|p| p.starts_with(&docs_root) || p.ends_with(".md"))
            .count();

        if managed_count > 0 {
            // 最近の未読 conflict 通知があれば重複通知しない
            let recent_unread_conflict = db::notifications::list(pool, project_id)
                .await
                .unwrap_or_default()
                .into_iter()
                .take(10)
                .any(|n| n.event_type == "conflict" && !n.is_read);

            if !recent_unread_conflict {
                let n = NewNotification {
                    project_id,
                    event_type: "conflict".to_string(),
                    title: format!("{} file(s) with conflicts detected", managed_count),
                    body: Some("Open the Conflict screen to resolve.".to_string()),
                    dest_screen: Some("conflict".to_string()),
                    dest_resource_id: None,
                };
                if let Ok(id) = db::notifications::create(pool, &n).await {
                    let _ = app.emit(
                        "notification_new",
                        serde_json::json!({ "id": id, "project_id": project_id }),
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::should_sync;

    // 🔴 Red: interval=0 のときはスキップ
    #[test]
    fn test_should_sync_disabled_when_zero() {
        assert!(!should_sync(0, 0));
        assert!(!should_sync(0, 100));
    }

    // 🔴 Red: interval=5 のとき now_min が 5 の倍数のときのみ true
    #[test]
    fn test_should_sync_fires_on_interval() {
        assert!(should_sync(5, 0));
        assert!(should_sync(5, 5));
        assert!(should_sync(5, 10));
        assert!(!should_sync(5, 1));
        assert!(!should_sync(5, 3));
        assert!(!should_sync(5, 7));
    }

    // 🔴 Red: interval=1 のときは毎分 true
    #[test]
    fn test_should_sync_every_minute() {
        assert!(should_sync(1, 0));
        assert!(should_sync(1, 1));
        assert!(should_sync(1, 999));
    }

    // 🔴 Red: interval が負のときはスキップ
    #[test]
    fn test_should_sync_negative_interval_disabled() {
        assert!(!should_sync(-1, 0));
        assert!(!should_sync(-5, 10));
    }
}
