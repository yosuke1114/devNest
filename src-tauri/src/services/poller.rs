//! バックグラウンドポーリングサービス。
//!
//! 各プロジェクトの `remote_poll_interval_min` に従って GitHub から PR・通知・CI を定期同期し、
//! `pr_sync_done` / `notification_new` イベントをフロントエンドへ emit する。
//! `AppState.polling_active` が false の間はスキップする。

use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use chrono::Utc;

use crate::db;
use crate::db::DbPool;
use crate::models::notifications::NewNotification;
use crate::services::{github::GitHubClient, git::GitService, keychain};
use crate::state::AppState;

/// アプリ起動時に呼ぶ。`AppHandle` と DB プールを受け取りバックグラウンドで動き続ける。
pub fn start(app: AppHandle, pool: DbPool) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;

            // polling_active フラグが false の間はスキップ
            if let Some(state) = app.try_state::<AppState>() {
                if !state.polling_active.load(Ordering::Relaxed) {
                    continue;
                }
            }

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
    let token = {
        // Keychain → DB フォールバック
        let kc = keychain::get_token(project_id).ok().flatten();
        if let Some(t) = kc {
            t
        } else {
            let key = format!("github.token.{}", project_id);
            let row: Option<(String,)> = sqlx::query_as(
                "SELECT value FROM app_settings WHERE key = ?"
            )
            .bind(&key)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
            match row.map(|(v,)| v.trim_matches('"').to_string()).filter(|s| !s.is_empty()) {
                Some(t) => t,
                None => return, // 未認証プロジェクトはスキップ
            }
        }
    };
    let project = match db::project::find(pool, project_id).await {
        Ok(p) => p,
        Err(_) => return,
    };
    let client = GitHubClient::new(&token, &project.repo_owner, &project.repo_name);

    // ── PR 同期 ───────────────────────────────────────────────────────────
    let gh_prs = match client.list_pull_requests(Some("all")).await {
        Ok(prs) => prs,
        Err(e) => {
            tracing::warn!("poller: pr_sync error project={}: {:?}", project_id, e);
            vec![]
        }
    };
    if !gh_prs.is_empty() {
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
    }

    // ── CI check-runs 監視（R-L02）──────────────────────────────────────
    // 最新の open PR のヘッドコミット SHA に対して check-runs を取得
    for gh_pr in gh_prs.iter().take(5) {
        let sha = &gh_pr.head.sha;
        match client.get_check_runs(sha).await {
            Ok(resp) => {
                if resp.check_runs.is_empty() {
                    continue;
                }
                let all_completed = resp.check_runs.iter().all(|r| r.status == "completed");
                if !all_completed {
                    continue; // まだ走行中
                }
                let all_success = resp.check_runs.iter().all(|r| {
                    r.conclusion.as_deref() == Some("success")
                        || r.conclusion.as_deref() == Some("skipped")
                        || r.conclusion.as_deref() == Some("neutral")
                });
                let new_status = if all_success { "passing" } else { "failing" };

                // DB の checks_status と比較して変化があれば通知
                if let Ok(existing_prs) = db::pr::list(pool, project_id, Some("open")).await {
                    if let Some(db_pr) = existing_prs.iter().find(|p| p.github_number == gh_pr.number) {
                        let changed = db_pr.checks_status != new_status;
                        if changed {
                            // checks_status を更新
                            let _ = sqlx::query(
                                "UPDATE pull_requests SET checks_status = ? WHERE id = ?"
                            )
                            .bind(new_status)
                            .bind(db_pr.id)
                            .execute(pool)
                            .await;

                            let (event_type, title) = if all_success {
                                ("ci_pass", format!("CI が通過しました: {}", gh_pr.title))
                            } else {
                                ("ci_fail", format!("CI が失敗しました: {}", gh_pr.title))
                            };

                            // 重複通知防止：直近10件に同じ PR の未読 CI 通知があればスキップ
                            let has_recent = db::notifications::list(pool, project_id)
                                .await
                                .unwrap_or_default()
                                .into_iter()
                                .take(10)
                                .any(|n| {
                                    n.event_type == event_type
                                        && n.dest_resource_id == Some(gh_pr.number)
                                        && !n.is_read
                                });
                            if !has_recent {
                                let n = NewNotification {
                                    project_id,
                                    event_type: event_type.to_string(),
                                    title,
                                    body: Some(format!("#{} {}", gh_pr.number, gh_pr.head.ref_name)),
                                    dest_screen: Some("pr".to_string()),
                                    dest_resource_id: Some(gh_pr.number),
                                };
                                if let Ok(id) = db::notifications::create(pool, &n).await {
                                    let _ = app.emit(
                                        "notification_new",
                                        serde_json::json!({
                                            "notificationId": id,
                                            "title": n.title,
                                            "eventType": n.event_type,
                                        }),
                                    );
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                tracing::debug!("poller: check-runs error pr={}: {:?}", gh_pr.number, e);
            }
        }
    }

    // ── GitHub Notifications API ポーリング（R-L01）─────────────────────
    if let Ok(gh_notifs) = client.list_github_notifications().await {
        for gh_notif in &gh_notifs {
            if !gh_notif.unread {
                continue;
            }
            // リポジトリが一致するものだけ処理
            let expected_repo = format!("{}/{}", project.repo_owner, project.repo_name);
            if gh_notif.repository.full_name != expected_repo {
                continue;
            }

            let (event_type, dest_screen, title) = match gh_notif.reason.as_str() {
                "review_requested" | "commented" => (
                    "pr_comment",
                    "pr",
                    format!("PR コメント: {}", gh_notif.subject.title),
                ),
                "assign" => (
                    "issue_assigned",
                    "issues",
                    format!("Issue がアサインされました: {}", gh_notif.subject.title),
                ),
                _ if gh_notif.subject.subject_type == "PullRequest" => (
                    "pr_opened",
                    "pr",
                    format!("PR 更新: {}", gh_notif.subject.title),
                ),
                _ => continue,
            };

            // 同じ GitHub notification ID で既に作成済みかどうかチェック
            let gh_id_tag = format!("gh:{}", gh_notif.id);
            let already_exists = db::notifications::list(pool, project_id)
                .await
                .unwrap_or_default()
                .into_iter()
                .any(|n| n.title.starts_with(&gh_id_tag) || n.title == title);
            if already_exists {
                continue;
            }

            let n = NewNotification {
                project_id,
                event_type: event_type.to_string(),
                title,
                body: Some(gh_notif.updated_at.clone()),
                dest_screen: Some(dest_screen.to_string()),
                dest_resource_id: None,
            };
            if let Ok(id) = db::notifications::create(pool, &n).await {
                let notif_title = n.title.clone();
                let notif_event_type = n.event_type.clone();
                let _ = app.emit(
                    "notification_new",
                    serde_json::json!({
                        "notificationId": id,
                        "title": notif_title,
                        "eventType": notif_event_type,
                    }),
                );
            }
        }
    }

    // ── コンフリクト検出 ─────────────────────────────────────────────────
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
                    serde_json::json!({
                        "notificationId": id,
                        "title": n.title,
                        "eventType": n.event_type,
                    }),
                );
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
