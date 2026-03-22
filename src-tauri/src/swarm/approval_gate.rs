//! Worker 起動前の承認ゲート
//!
//! Orchestrator が SpawnRequest を生成した時、PolicyEngine とリスク評価に基づいて
//! 即座に起動するか、ユーザー承認を待つかを判定する。
//!
//! ## フロー
//! 1. `assess_risk()` でタスクのリスクレベルを判定
//! 2. `evaluate()` でポリシーと設定に基づき承認要否を判断
//! 3. 承認が必要な場合は `PendingSpawn` に保存し、承認待ちに
//! 4. `approval_decide` で承認されたら `PendingSpawns::take()` で取り出して起動

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use super::settings::SwarmSettings;
use super::subtask::{SubTask, TaskRole};
use super::worker::SpawnRequest;
use crate::policy::rules::{RiskLevel, ToolPolicy};

/// 承認待ちの SpawnRequest を保持する共有ストア
pub type SharedPendingSpawns = Arc<Mutex<PendingSpawns>>;

pub fn create_pending_spawns() -> SharedPendingSpawns {
    Arc::new(Mutex::new(PendingSpawns::new()))
}

/// 承認リクエストの request_id → SpawnRequest + メタ情報 のマッピング
#[derive(Default)]
pub struct PendingSpawns {
    store: HashMap<String, PendingSpawn>,
}

/// 承認待ちの個別エントリ
#[derive(Debug, Clone)]
pub struct PendingSpawn {
    pub request_id: String,
    pub spawn_request: SpawnRequest,
    pub risk_level: RiskLevel,
}

impl PendingSpawns {
    pub fn new() -> Self {
        Self::default()
    }

    /// 承認待ちの SpawnRequest を登録する
    pub fn insert(&mut self, request_id: String, spawn: PendingSpawn) {
        self.store.insert(request_id, spawn);
    }

    /// 承認された SpawnRequest を取り出す（1回限り）
    pub fn take(&mut self, request_id: &str) -> Option<PendingSpawn> {
        self.store.remove(request_id)
    }

    /// 承認待ちのリクエスト数
    pub fn count(&self) -> usize {
        self.store.len()
    }
}

/// 承認ゲートの評価結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GateDecision {
    /// 即座に起動して良い
    SpawnImmediately,
    /// ユーザー承認が必要
    RequiresApproval { risk_level: RiskLevel },
    /// 拒否（policy が Deny）
    Denied,
}

/// タスクのリスクレベルを評価する。
///
/// 以下の基準でリスクを判定:
/// - Merger ロール → High（ブランチ統合・PR作成を伴う）
/// - Builder/Designer でファイル数 5 以上 → Medium
/// - Reviewer/Scout → Low（読み取り中心）
/// - Tester → Low
pub fn assess_risk(task: &SubTask) -> RiskLevel {
    match task.role {
        TaskRole::Merger => RiskLevel::High,
        TaskRole::Builder | TaskRole::Designer => {
            if task.files.len() >= 5 {
                RiskLevel::Medium
            } else {
                RiskLevel::Low
            }
        }
        TaskRole::Reviewer | TaskRole::Scout | TaskRole::Tester => RiskLevel::Low,
    }
}

/// ポリシーと設定に基づいて承認要否を判定する。
///
/// 判定ロジック:
/// 1. `auto_approve_high_confidence` が true かつ risk が Low → SpawnImmediately
/// 2. `claude_skip_permissions` が true → SpawnImmediately（全タスク自動承認）
/// 3. PolicyEngine の判定:
///    - Allow → SpawnImmediately
///    - RequireApproval → RequiresApproval
///    - Deny → Denied
pub fn evaluate(
    task: &SubTask,
    settings: &SwarmSettings,
    tool_policy: ToolPolicy,
) -> GateDecision {
    let risk = assess_risk(task);

    // skip_permissions 設定時は無条件で即時起動
    if settings.claude_skip_permissions {
        return GateDecision::SpawnImmediately;
    }

    // auto_approve_high_confidence かつ Low リスクなら即時起動
    if settings.auto_approve_high_confidence && risk == RiskLevel::Low {
        return GateDecision::SpawnImmediately;
    }

    // ポリシーに基づく判定
    match tool_policy {
        ToolPolicy::Allow => GateDecision::SpawnImmediately,
        ToolPolicy::RequireApproval => GateDecision::RequiresApproval { risk_level: risk },
        ToolPolicy::Deny => GateDecision::Denied,
    }
}

// ─── テスト ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_task(role: TaskRole, file_count: usize) -> SubTask {
        SubTask {
            id: 1,
            title: "test task".into(),
            role,
            files: (0..file_count).map(|i| format!("file{}.rs", i)).collect(),
            instruction: "do something".into(),
            depends_on: vec![],
        }
    }

    #[test]
    fn test_assess_risk_merger_is_high() {
        let task = make_task(TaskRole::Merger, 1);
        assert_eq!(assess_risk(&task), RiskLevel::High);
    }

    #[test]
    fn test_assess_risk_builder_few_files_is_low() {
        let task = make_task(TaskRole::Builder, 3);
        assert_eq!(assess_risk(&task), RiskLevel::Low);
    }

    #[test]
    fn test_assess_risk_builder_many_files_is_medium() {
        let task = make_task(TaskRole::Builder, 5);
        assert_eq!(assess_risk(&task), RiskLevel::Medium);
    }

    #[test]
    fn test_assess_risk_scout_is_low() {
        let task = make_task(TaskRole::Scout, 10);
        assert_eq!(assess_risk(&task), RiskLevel::Low);
    }

    #[test]
    fn test_evaluate_skip_permissions_always_spawns() {
        let task = make_task(TaskRole::Merger, 1);
        let mut settings = SwarmSettings::default();
        settings.claude_skip_permissions = true;
        let decision = evaluate(&task, &settings, ToolPolicy::RequireApproval);
        assert!(matches!(decision, GateDecision::SpawnImmediately));
    }

    #[test]
    fn test_evaluate_auto_approve_low_risk() {
        let task = make_task(TaskRole::Scout, 1);
        let mut settings = SwarmSettings::default();
        settings.auto_approve_high_confidence = true;
        let decision = evaluate(&task, &settings, ToolPolicy::RequireApproval);
        assert!(matches!(decision, GateDecision::SpawnImmediately));
    }

    #[test]
    fn test_evaluate_auto_approve_high_risk_still_requires() {
        let task = make_task(TaskRole::Merger, 1);
        let mut settings = SwarmSettings::default();
        settings.auto_approve_high_confidence = true;
        let decision = evaluate(&task, &settings, ToolPolicy::RequireApproval);
        assert!(matches!(decision, GateDecision::RequiresApproval { .. }));
    }

    #[test]
    fn test_evaluate_allow_policy_spawns_immediately() {
        let task = make_task(TaskRole::Builder, 3);
        let settings = SwarmSettings::default();
        let decision = evaluate(&task, &settings, ToolPolicy::Allow);
        assert!(matches!(decision, GateDecision::SpawnImmediately));
    }

    #[test]
    fn test_evaluate_deny_policy_denies() {
        let task = make_task(TaskRole::Builder, 3);
        let settings = SwarmSettings::default();
        let decision = evaluate(&task, &settings, ToolPolicy::Deny);
        assert!(matches!(decision, GateDecision::Denied));
    }

    #[test]
    fn test_evaluate_default_requires_approval() {
        let task = make_task(TaskRole::Builder, 3);
        let settings = SwarmSettings::default();
        let decision = evaluate(&task, &settings, ToolPolicy::RequireApproval);
        assert!(matches!(decision, GateDecision::RequiresApproval { .. }));
    }

    #[test]
    fn test_pending_spawns_insert_and_take() {
        let mut store = PendingSpawns::new();
        assert_eq!(store.count(), 0);

        let spawn = PendingSpawn {
            request_id: "req-1".into(),
            spawn_request: SpawnRequest {
                worker_config: crate::swarm::worker::OrchestratorTaskConfig {
                    task: make_task(TaskRole::Builder, 1),
                    branch_name: "test-branch".into(),
                    base_branch: "main".into(),
                    project_path: "/tmp".into(),
                    run_id: "run-1".into(),
                    default_shell: "zsh".into(),
                    claude_skip_permissions: false,
                    claude_no_stream: false,
                    claude_interactive: false,
                },
                task_id: 1,
                is_retry: false,
                old_worker_id: None,
            },
            risk_level: RiskLevel::Low,
        };

        store.insert("req-1".into(), spawn);
        assert_eq!(store.count(), 1);

        let taken = store.take("req-1");
        assert!(taken.is_some());
        assert_eq!(store.count(), 0);

        // 2回目は取れない
        assert!(store.take("req-1").is_none());
    }
}
