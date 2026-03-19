# DevNest Phase 13 — Step実装指示書
# Advanced Orchestration

**対象**: Claude Code
**作成日**: 2026-03-16
**前提**: Phase 11（Step 11-A〜E）・Phase 12（Step 12-A〜E）完了済み
**前提設計書**: devnest-phase13-design.md

---

## Stepマップ

| Step | Feature | 内容 | 優先度 |
|------|---------|------|--------|
| 13-A | 13-1 + 13-3 | ロールベースWorker + ツールガード | 🔴 高 |
| 13-B | 13-4 | Watchdog・スタック検出・Nudge | 🔴 高 |
| 13-C | 13-2 + 13-8 | SQLiteメール + コンテキスト共有 | 🟡 中 |
| 13-D | 13-6 | クラッシュリカバリ | 🟡 中 |
| 13-E | 13-5 + 13-7 | 知識蓄積 + ヘルスチェック | 🟢 低 |

---

## Step 13-A: ロールベースWorker + ツールガード

### 完了基準
- [ ] WorkerConfigにroleフィールドが追加されている
- [ ] Worker起動時に.devnest/roles/{role}.mdを読んでプロンプトに付加する
- [ ] Worker起動時に.git/hooks/pre-push等が自動設置される
- [ ] ペインヘッダーに役割アイコンが表示される
- [ ] Gitフック違反時にUIに⚠️通知が表示される
- [ ] ロール違反時に[継続/停止]ダイアログが表示される

---

### Rust側

#### 1. worker.rs の更新

```rust
// src-tauri/src/swarm/worker.rs に追加

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerRole {
    Scout,     // 🔍 調査専門
    Builder,   // 🔨 実装専門
    Reviewer,  // 👁️ レビュー専門
    Merger,    // 🔀 マージ専門
    Shell,     // 🐚 通常シェル（既存）
}

impl WorkerRole {
    pub fn icon(&self) -> &str {
        match self {
            WorkerRole::Scout    => "🔍",
            WorkerRole::Builder  => "🔨",
            WorkerRole::Reviewer => "👁️",
            WorkerRole::Merger   => "🔀",
            WorkerRole::Shell    => "🐚",
        }
    }

    /// ロール別に禁止するgit操作
    pub fn blocked_git_commands(&self) -> Vec<&str> {
        match self {
            WorkerRole::Scout | WorkerRole::Reviewer => vec![
                "git push",
                "git reset --hard",
                "git clean -f",
                "git rm",
            ],
            WorkerRole::Builder => vec![
                "git push",
                "git reset --hard",
                "git clean -f",
            ],
            WorkerRole::Merger => vec![
                "rm -rf",
            ],
            WorkerRole::Shell => vec![],
        }
    }

    /// デフォルトのロールテンプレートパス
    pub fn template_path(&self) -> Option<&str> {
        match self {
            WorkerRole::Scout    => Some(".devnest/roles/scout.md"),
            WorkerRole::Builder  => Some(".devnest/roles/builder.md"),
            WorkerRole::Reviewer => Some(".devnest/roles/reviewer.md"),
            WorkerRole::Merger   => Some(".devnest/roles/merger.md"),
            WorkerRole::Shell    => None,
        }
    }
}

// WorkerConfigにroleを追加
pub struct WorkerConfig {
    pub kind: WorkerKind,
    pub mode: WorkerMode,
    pub role: WorkerRole,          // ← 追加
    pub label: String,
    pub working_dir: PathBuf,
    pub assigned_files: Vec<PathBuf>, // ← 追加（Builderのスコープ）
    pub depends_on: Vec<String>,
    pub metadata: HashMap<String, String>,
}
```

---

#### 2. role_manager.rs（新規）

```rust
// src-tauri/src/swarm/role_manager.rs

use std::path::{Path, PathBuf};
use std::fs;
use super::worker::WorkerRole;

/// デフォルトのロールテンプレートを初期化する
/// .devnest/roles/ がなければ作成してデフォルトを書き込む
pub fn init_role_templates(project_root: &Path) -> Result<(), String> {
    let roles_dir = project_root.join(".devnest/roles");
    fs::create_dir_all(&roles_dir).map_err(|e| e.to_string())?;

    let templates = [
        ("scout.md", SCOUT_TEMPLATE),
        ("builder.md", BUILDER_TEMPLATE),
        ("reviewer.md", REVIEWER_TEMPLATE),
        ("merger.md", MERGER_TEMPLATE),
    ];

    for (filename, content) in templates {
        let path = roles_dir.join(filename);
        // 既存ファイルは上書きしない（カスタマイズを保護）
        if !path.exists() {
            fs::write(&path, content).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

/// ロールテンプレートを読み込む
pub fn load_role_template(
    project_root: &Path,
    role: &WorkerRole,
) -> Option<String> {
    let path = role.template_path()?;
    let full_path = project_root.join(path);
    fs::read_to_string(full_path).ok()
}

// ─── デフォルトテンプレート ───

const SCOUT_TEMPLATE: &str = r#"
# Scout役割定義

あなたはコード調査の専門家です。

## 役割
- コードベースを読み込んで分析・調査することに特化してください
- ファイルへの書き込みは**一切行わない**でください
- 調査結果はJSONフォーマットで出力してください

## 出力フォーマット
```json
{
  "findings": ["発見事項1", "発見事項2"],
  "affected_files": ["src/a.ts", "src/b.ts"],
  "risks": ["リスク1"],
  "recommendation": "推奨アプローチ"
}
```

## 重要
- 不明な点は推測せず、Escalationメールを送信して停止してください
- スコープ外のファイルには触れないでください
"#;

const BUILDER_TEMPLATE: &str = r#"
# Builder役割定義

あなたは実装の専門家です。

## 役割
- 割り当てられたファイルのみ変更してください: {assigned_files}
- スコープ外のファイルには**触れない**でください
- 変更内容をコミットメッセージに詳細に記載してください

## 完了シグナル
作業完了時に必ず以下の形式で出力してください:
TASK_COMPLETE: {変更内容のサマリー}

## 重要
- テストが失敗した場合は自動修正を試みてください
- git pushは**禁止**です
- 判断できない場合はEscalationメールを送信して停止してください
"#;

const REVIEWER_TEMPLATE: &str = r#"
# Reviewer役割定義

あなたはコードレビューの専門家です。

## 役割
- ファイルへの書き込みは**一切行わない**でください
- 以下の観点でレビューしてください:
  1. バグ・エラーハンドリング
  2. パフォーマンス
  3. セキュリティ
  4. 設計の一貫性・可読性

## 出力フォーマット
```json
{
  "overall": "LGTM | NEEDS_CHANGES | BLOCKING",
  "comments": [
    {
      "file": "src/a.ts",
      "line": 42,
      "severity": "error | warning | suggestion",
      "message": "コメント内容"
    }
  ],
  "summary": "レビューサマリー"
}
```
"#;

const MERGER_TEMPLATE: &str = r#"
# Merger役割定義

あなたはマージの専門家です。

## 役割
- Workerのブランチをベースブランチにマージしてください
- コンフリクトが発生した場合はEscalationメールを送信してください
- マージ完了後にWorkDoneメールを送信してください

## 禁止事項
- rm -rf などの破壊的操作は禁止です
- git push --force は禁止です
"#;
```

---

#### 3. guard_manager.rs（新規）

```rust
// src-tauri/src/swarm/guard_manager.rs

use std::path::Path;
use std::fs;
use super::worker::WorkerRole;

/// Worker起動時にgit hooksを設置する
pub fn install_git_hooks(
    worktree_path: &Path,
    role: &WorkerRole,
) -> Result<(), String> {
    let hooks_dir = worktree_path.join(".git/hooks");
    fs::create_dir_all(&hooks_dir).map_err(|e| e.to_string())?;

    let blocked = role.blocked_git_commands();

    // pre-push フック
    if blocked.contains(&"git push") {
        let hook_path = hooks_dir.join("pre-push");
        let content = format!(
            "#!/bin/sh\n\
             echo 'ERROR: git push is blocked for role: {}'\n\
             echo 'DEVNEST_GUARD_VIOLATION: git_push'\n\
             exit 1\n",
            format!("{:?}", role).to_lowercase()
        );
        fs::write(&hook_path, content).map_err(|e| e.to_string())?;
        // 実行権限付与
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                &hook_path,
                fs::Permissions::from_mode(0o755),
            ).map_err(|e| e.to_string())?;
        }
    }

    // pre-commit フック（reset --hard等の間接対策）
    let pre_commit = hooks_dir.join("pre-commit");
    let content = "#!/bin/sh\n\
                   # DevNest guard: installed by role_manager\n\
                   exit 0\n";
    fs::write(&pre_commit, content).map_err(|e| e.to_string())?;

    Ok(())
}

/// PTY出力からガード違反パターンを検出する
pub fn detect_guard_violation(output: &str) -> Option<GuardViolation> {
    // Gitフックが出力するシグナルを検出
    if output.contains("DEVNEST_GUARD_VIOLATION: git_push") {
        return Some(GuardViolation::GitPush);
    }
    if output.contains("DEVNEST_GUARD_VIOLATION: git_reset") {
        return Some(GuardViolation::GitReset);
    }
    None
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GuardViolation {
    GitPush,
    GitReset,
    FileWriteOutOfScope { file: String },
}
```

---

#### 4. manager.rs の更新（spawn_worker内）

```rust
// spawn_worker() に以下を追加

// ① ロールテンプレートを読み込んでプロンプトに付加
let role_prompt = role_manager::load_role_template(
    &config.working_dir, &config.role
);

// ② Gitフックを設置
guard_manager::install_git_hooks(
    &config.working_dir, &config.role
)?;

// ③ Batch + ClaudeCodeの場合はプロンプト付きで起動
if config.mode == WorkerMode::Batch {
    let enriched_prompt = build_enriched_prompt(
        &task.instruction,
        role_prompt.as_deref(),
        &config.assigned_files,
    );
    cmd.args(["--print", &enriched_prompt]);
}

// ④ PTY出力監視にガード違反検出を追加（manager.rsのreadループ内）
if let Some(violation) = guard_manager::detect_guard_violation(&data) {
    let _ = app_clone.emit("guard-violation", serde_json::json!({
        "workerId": worker_id,
        "violation": violation,
    }));
}
```

---

### フロント側

#### 5. types.ts の更新

```typescript
// src/components/swarm/types.ts に追加

export type WorkerRole =
  | "scout"
  | "builder"
  | "reviewer"
  | "merger"
  | "shell";

export const ROLE_ICON: Record<WorkerRole, string> = {
  scout:    "🔍",
  builder:  "🔨",
  reviewer: "👁️",
  merger:   "🔀",
  shell:    "🐚",
};

export const ROLE_LABEL: Record<WorkerRole, string> = {
  scout:    "Scout",
  builder:  "Builder",
  reviewer: "Reviewer",
  merger:   "Merger",
  shell:    "Shell",
};

// WorkerConfigにroleを追加
export interface WorkerConfig {
  kind: WorkerKind;
  mode: WorkerMode;
  role: WorkerRole;          // ← 追加
  label: string;
  workingDir: string;
  assignedFiles: string[];   // ← 追加
  dependsOn: string[];
  metadata: Record<string, string>;
}
```

---

#### 6. XtermPane.tsx の更新（役割バッジ）

```typescript
// XtermPaneのヘッダー部分を更新

import { ROLE_ICON, ROLE_LABEL } from "./types";

// ヘッダー内の種別表示を役割バッジに変更
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
  {/* 役割アイコン */}
  <span
    data-testid={`worker-role-icon-${worker.id}`}
    title={ROLE_LABEL[worker.config.role]}
    style={{ fontSize: 14 }}
  >
    {ROLE_ICON[worker.config.role]}
  </span>

  {/* ラベル */}
  <span style={{ color: "#e6edf3", fontSize: 12, fontFamily: "monospace" }}>
    {worker.config.label}
  </span>

  {/* ステータスバッジ（ClaudeCode Workerのみ） */}
  {worker.config.kind === "claudeCode" && (
    <StatusBadge status={status} />
  )}
</div>
```

---

#### 7. GuardViolationDialog.tsx（新規）

```typescript
// src/components/swarm/GuardViolationDialog.tsx

import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface GuardViolation {
  workerId: string;
  violation: { type: string; file?: string };
}

interface Props {
  onContinue: (workerId: string) => void;
  onStop: (workerId: string) => void;
}

export function GuardViolationDialog({ onContinue, onStop }: Props) {
  const [violation, setViolation] = useState<GuardViolation | null>(null);

  useEffect(() => {
    const unlisten = listen<GuardViolation>("guard-violation", (e) => {
      // Gitフック違反はUIに通知だけ（ダイアログなし）
      if (e.payload.violation.type === "git_push" ||
          e.payload.violation.type === "git_reset") {
        // トースト通知のみ
        console.warn("Guard violation (git):", e.payload);
        return;
      }
      // ロール違反はダイアログで確認
      setViolation(e.payload);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  if (!violation) return null;

  const violationLabel =
    violation.violation.type === "file_write_out_of_scope"
      ? `ファイルへの書き込みを試みました: ${violation.violation.file}`
      : `不正な操作を試みました: ${violation.violation.type}`;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24,
      background: "#161b22", border: "1px solid #f6ad55",
      borderRadius: 8, padding: 16, zIndex: 200,
      maxWidth: 360,
    }}>
      <div style={{ color: "#f6ad55", fontSize: 13, marginBottom: 8 }}>
        ⚠️ ガード違反検出
      </div>
      <div style={{ color: "#8b949e", fontSize: 12, marginBottom: 12 }}>
        Worker {violation.workerId} が{violationLabel}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          data-testid="guard-continue-button"
          onClick={() => { onContinue(violation.workerId); setViolation(null); }}
          style={secondaryButtonStyle}
        >
          継続させる
        </button>
        <button
          data-testid="guard-stop-button"
          onClick={() => { onStop(violation.workerId); setViolation(null); }}
          style={dangerButtonStyle}
        >
          停止する
        </button>
      </div>
    </div>
  );
}

const secondaryButtonStyle = {
  padding: "6px 12px", background: "none",
  border: "1px solid #30363d", borderRadius: 6,
  color: "#8b949e", cursor: "pointer", fontSize: 12,
};

const dangerButtonStyle = {
  padding: "6px 12px", background: "#da3633",
  border: "none", borderRadius: 6,
  color: "#fff", cursor: "pointer", fontSize: 12,
};
```

---

#### 8. .devnest/roles/ の初期化コマンド追加

```rust
// src-tauri/src/commands/swarm_commands.rs に追加

#[tauri::command]
pub async fn init_project_roles(
    project_path: String,
) -> Result<(), String> {
    role_manager::init_role_templates(Path::new(&project_path))
}
```

---

## Step 13-B: Watchdog・スタック検出・Nudge

### 完了基準
- [ ] Batch Worker起動時にWatchdogが自動起動する
- [ ] 120秒無音でスタック検知・Nudge（\n送信）が実行される
- [ ] 3回Nudge失敗でWorkerが再起動される
- [ ] スタック状態のペインがUIで強調表示される
- [ ] 全Batch Worker終了時にWatchdogが自動停止する

---

### Rust側

#### watchdog.rs（新規）

```rust
// src-tauri/src/swarm/watchdog.rs

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::interval;
use tauri::{AppHandle, Emitter};

pub struct WatchdogConfig {
    pub stall_threshold_secs: u64,  // デフォルト: 120
    pub nudge_max_attempts: u32,    // デフォルト: 3
    pub nudge_debounce_ms: u64,     // デフォルト: 500
    pub poll_interval_secs: u64,    // デフォルト: 30
}

impl Default for WatchdogConfig {
    fn default() -> Self {
        Self {
            stall_threshold_secs: 120,
            nudge_max_attempts: 3,
            nudge_debounce_ms: 500,
            poll_interval_secs: 30,
        }
    }
}

struct WorkerActivity {
    last_output_at: Instant,
    nudge_attempts: u32,
}

pub struct Watchdog {
    config: WatchdogConfig,
    activity: HashMap<String, WorkerActivity>,
}

impl Watchdog {
    pub fn new(config: WatchdogConfig) -> Self {
        Self { config, activity: HashMap::new() }
    }

    /// Worker出力があったら最終活動時刻を更新
    pub fn record_activity(&mut self, worker_id: &str) {
        self.activity.insert(worker_id.to_string(), WorkerActivity {
            last_output_at: Instant::now(),
            nudge_attempts: 0,
        });
    }

    /// スタックしているWorkerを返す
    pub fn stalled_workers(&self) -> Vec<(String, u32)> {
        let threshold = Duration::from_secs(self.config.stall_threshold_secs);
        self.activity.iter()
            .filter(|(_, a)| a.last_output_at.elapsed() > threshold)
            .map(|(id, a)| (id.clone(), a.nudge_attempts))
            .collect()
    }

    pub fn increment_nudge(&mut self, worker_id: &str) {
        if let Some(a) = self.activity.get_mut(worker_id) {
            a.nudge_attempts += 1;
            a.last_output_at = Instant::now(); // タイマーリセット
        }
    }

    pub fn remove_worker(&mut self, worker_id: &str) {
        self.activity.remove(worker_id);
    }
}

/// Watchdogデーモンを起動する（tokioタスク）
pub fn start_watchdog_daemon(
    watchdog: Arc<Mutex<Watchdog>>,
    manager: Arc<Mutex<super::manager::WorkerManager>>,
    app: AppHandle,
    config: WatchdogConfig,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(config.poll_interval_secs));
        loop {
            ticker.tick().await;

            let stalled = {
                let wg = watchdog.lock().unwrap();
                wg.stalled_workers()
            };

            for (worker_id, attempts) in stalled {
                if attempts < config.nudge_max_attempts {
                    // Nudge: \nを送信
                    {
                        let mut mgr = manager.lock().unwrap();
                        let _ = mgr.write_to_worker(&worker_id, b"\n");
                    }
                    {
                        let mut wg = watchdog.lock().unwrap();
                        wg.increment_nudge(&worker_id);
                    }
                    let _ = app.emit("worker-nudged", serde_json::json!({
                        "workerId": worker_id,
                        "attempt": attempts + 1,
                    }));
                } else {
                    // リスタート
                    let _ = app.emit("worker-stalled", serde_json::json!({
                        "workerId": worker_id,
                    }));
                    // kill → respawn（Orchestratorに委ねる）
                }
            }
        }
    })
}
```

---

## Step 13-C: SQLiteメール + コンテキスト共有

### 完了基準
- [ ] .devnest/mail.db が作成されWALモードで動作する
- [ ] Worker起動時に未読メールがプロンプトに注入される
- [ ] Worker完了時にWorkDoneメールが自動送信される
- [ ] Scoutの調査結果がBuilderの起動プロンプトに注入される
- [ ] セッション完了時にメールがアーカイブされる

---

### Rust側

#### mail_store.rs（新規）

```rust
// src-tauri/src/swarm/mail_store.rs

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MailMessage {
    WorkerDone {
        from: String,
        summary: String,
        artifacts: Vec<String>,
    },
    MergeReady {
        from: String,
        branch: String,
        files_changed: Vec<String>,
    },
    Merged { from: String, branch: String },
    MergeFailed { from: String, reason: String },
    Escalation { from: String, question: String, context: String },
    HealthCheck { from: String, status: String },
    Dispatch { from: String, to: String, instruction: String },
    Assign { from: String, to: String, files: Vec<String> },
}

pub struct MailStore {
    conn: Connection,
    session_id: String,
}

impl MailStore {
    pub fn open(db_path: &Path, session_id: &str) -> Result<Self, String> {
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

        // WALモード有効化
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| e.to_string())?;

        // テーブル作成
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS mail (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                from_worker  TEXT NOT NULL,
                to_worker    TEXT NOT NULL,
                type         TEXT NOT NULL,
                payload      TEXT NOT NULL,
                read         INTEGER DEFAULT 0,
                created_at   TEXT DEFAULT (datetime('now')),
                session_id   TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_to_worker_read
                ON mail(to_worker, read);
            CREATE INDEX IF NOT EXISTS idx_session
                ON mail(session_id);"
        ).map_err(|e| e.to_string())?;

        Ok(Self { conn, session_id: session_id.to_string() })
    }

    /// メールを送信する
    pub fn send(
        &self,
        from: &str,
        to: &str,
        message: &MailMessage,
    ) -> Result<(), String> {
        let msg_type = match message {
            MailMessage::WorkerDone { .. }  => "worker_done",
            MailMessage::MergeReady { .. }  => "merge_ready",
            MailMessage::Merged { .. }      => "merged",
            MailMessage::MergeFailed { .. } => "merge_failed",
            MailMessage::Escalation { .. }  => "escalation",
            MailMessage::HealthCheck { .. } => "health_check",
            MailMessage::Dispatch { .. }    => "dispatch",
            MailMessage::Assign { .. }      => "assign",
        };
        let payload = serde_json::to_string(message)
            .map_err(|e| e.to_string())?;

        self.conn.execute(
            "INSERT INTO mail (from_worker, to_worker, type, payload, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![from, to, msg_type, payload, self.session_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }

    /// 未読メールを取得して既読にする
    pub fn fetch_unread(&self, worker_id: &str) -> Result<Vec<MailMessage>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, payload FROM mail
             WHERE to_worker = ?1 AND read = 0 AND session_id = ?2
             ORDER BY id ASC"
        ).map_err(|e| e.to_string())?;

        let rows: Vec<(i64, String)> = stmt.query_map(
            params![worker_id, self.session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        // 既読に更新
        for (id, _) in &rows {
            self.conn.execute(
                "UPDATE mail SET read = 1 WHERE id = ?1",
                params![id],
            ).map_err(|e| e.to_string())?;
        }

        rows.iter()
            .map(|(_, payload)| serde_json::from_str(payload)
                .map_err(|e| e.to_string()))
            .collect()
    }

    /// セッション完了時にアーカイブしてレコードを削除
    pub fn archive_session(&self, archive_path: &Path) -> Result<(), String> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM mail WHERE session_id = ?1"
        ).map_err(|e| e.to_string())?;

        // JSONLとして書き出し
        let rows: Vec<serde_json::Value> = stmt.query_map(
            params![self.session_id],
            |row| Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "from": row.get::<_, String>(1)?,
                "to": row.get::<_, String>(2)?,
                "type": row.get::<_, String>(3)?,
                "payload": row.get::<_, String>(4)?,
                "created_at": row.get::<_, String>(6)?,
            })),
        ).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        let jsonl: String = rows.iter()
            .map(|r| r.to_string())
            .collect::<Vec<_>>()
            .join("\n");

        std::fs::write(archive_path, jsonl).map_err(|e| e.to_string())?;

        // DBから削除
        self.conn.execute(
            "DELETE FROM mail WHERE session_id = ?1",
            params![self.session_id],
        ).map_err(|e| e.to_string())?;

        Ok(())
    }
}
```

#### context_store.rs（新規）

```rust
// src-tauri/src/swarm/context_store.rs

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerArtifact {
    pub role: String,
    pub completed_at: String,
    pub modified_files: Vec<PathBuf>,
    pub git_diff_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SwarmContext {
    pub session_id: String,
    pub artifacts: HashMap<String, WorkerArtifact>,
}

impl SwarmContext {
    pub fn load(context_path: &Path) -> Self {
        std::fs::read_to_string(context_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, context_path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| e.to_string())?;
        std::fs::write(context_path, json).map_err(|e| e.to_string())
    }

    /// Worker完了時に成果物を記録する
    pub fn record_artifact(
        &mut self,
        worker_id: &str,
        role: &str,
        modified_files: Vec<PathBuf>,
        git_diff_summary: String,
    ) {
        self.artifacts.insert(worker_id.to_string(), WorkerArtifact {
            role: role.to_string(),
            completed_at: chrono::Utc::now().to_rfc3339(),
            modified_files,
            git_diff_summary,
        });
    }

    /// 依存Workerのコンテキストをプロンプトに注入する文字列を生成
    pub fn build_context_prompt(&self, depends_on: &[String]) -> String {
        let contexts: Vec<String> = depends_on.iter()
            .filter_map(|id| self.artifacts.get(id))
            .map(|a| format!(
                "## 前のWorkerの変更内容\n\
                 役割: {}\n\
                 変更ファイル: {}\n\
                 変更サマリー: {}",
                a.role,
                a.modified_files.iter()
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", "),
                a.git_diff_summary,
            ))
            .collect();

        if contexts.is_empty() {
            String::new()
        } else {
            format!(
                "\n\n# 依存タスクのコンテキスト\n{}",
                contexts.join("\n\n")
            )
        }
    }
}
```

---

## Step 13-D: クラッシュリカバリ

### 完了基準
- [ ] sessions.dbにハートビートが30秒ごとに更新される
- [ ] DevNest起動時に5分以上古いセッションを検出する
- [ ] クラッシュ検出時にリカバリ確認ダイアログが表示される
- [ ] コミット有無に応じて既存/新規ブランチで再開される

---

### Rust側

#### session_store.rs（新規）

```rust
// src-tauri/src/swarm/session_store.rs

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionWorker {
    pub worker_id: String,
    pub role: String,
    pub subtask_id: u32,
    pub status: String,
    pub branch: String,
    pub has_commits: bool,
}

pub struct SessionStore {
    conn: Connection,
}

impl SessionStore {
    pub fn open(db_path: &Path) -> Result<Self, String> {
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS sessions (
                id                TEXT PRIMARY KEY,
                task_input        TEXT,
                status            TEXT DEFAULT 'running',
                created_at        TEXT DEFAULT (datetime('now')),
                last_heartbeat_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS session_workers (
                session_id    TEXT,
                worker_id     TEXT,
                role          TEXT,
                subtask_id    INTEGER,
                status        TEXT DEFAULT 'waiting',
                branch        TEXT,
                has_commits   INTEGER DEFAULT 0,
                started_at    TEXT,
                completed_at  TEXT,
                PRIMARY KEY (session_id, worker_id)
            );"
        ).map_err(|e| e.to_string())?;
        Ok(Self { conn })
    }

    /// ハートビートを更新（Watchdogの30秒ポーリングと連動）
    pub fn update_heartbeat(&self, session_id: &str) -> Result<(), String> {
        self.conn.execute(
            "UPDATE sessions SET last_heartbeat_at = datetime('now')
             WHERE id = ?1",
            params![session_id],
        ).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// クラッシュしたセッションを検出（5分以上古いハートビート）
    pub fn find_crashed_sessions(&self) -> Result<Vec<String>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM sessions
             WHERE status = 'running'
             AND last_heartbeat_at < datetime('now', '-5 minutes')"
        ).map_err(|e| e.to_string())?;

        let ids: Vec<String> = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        Ok(ids)
    }

    /// 再開時のブランチ判断（コミット有無で切り替え）
    pub fn determine_resume_branch(
        &self,
        worker: &SessionWorker,
        repo_path: &Path,
    ) -> ResumeBranch {
        // git logでコミット有無を確認
        let has_commits = std::process::Command::new("git")
            .args(["log", &worker.branch, "^HEAD", "--oneline"])
            .current_dir(repo_path)
            .output()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);

        if has_commits {
            ResumeBranch::Existing(worker.branch.clone())
        } else {
            ResumeBranch::New(format!("{}-retry", worker.branch))
        }
    }
}

pub enum ResumeBranch {
    Existing(String),  // 途中コミットあり → 既存ブランチを継続
    New(String),       // コミットなし → 新規ブランチを作成
}
```

---

### フロント側

#### CrashRecoveryDialog.tsx（新規）

```typescript
// src/components/swarm/CrashRecoveryDialog.tsx

import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";

interface CrashedSession {
  id: string;
  taskInput: string;
  workers: Array<{
    workerId: string;
    role: string;
    status: string;
    hasCommits: boolean;
  }>;
}

export function CrashRecoveryDialog() {
  const [crashed, setCrashed] = useState<CrashedSession | null>(null);

  useEffect(() => {
    invoke<CrashedSession | null>("check_crashed_sessions").then(setCrashed);
  }, []);

  if (!crashed) return null;

  const completedWorkers = crashed.workers.filter(w => w.status === "done");
  const pendingWorkers = crashed.workers.filter(w => w.status !== "done");

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 300,
    }}>
      <div style={{
        background: "#161b22", border: "1px solid #30363d",
        borderRadius: 10, padding: 24, width: 420,
      }}>
        <div style={{ color: "#e6edf3", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          🔄 前回のSwarmが中断されています
        </div>

        <div style={{ color: "#8b949e", fontSize: 12, marginBottom: 16 }}>
          タスク: {crashed.taskInput.slice(0, 50)}...
        </div>

        {/* 完了済みWorker */}
        {completedWorkers.map(w => (
          <div key={w.workerId} style={{ color: "#68d391", fontSize: 11, marginBottom: 4 }}>
            ✅ {w.workerId}（{w.role}）完了済み → スキップ
          </div>
        ))}

        {/* 未完了Worker */}
        {pendingWorkers.map(w => (
          <div key={w.workerId} style={{ color: "#f6ad55", fontSize: 11, marginBottom: 4 }}>
            {w.hasCommits ? "🔄" : "🆕"} {w.workerId}（{w.role}）
            → {w.hasCommits ? "続きから再開" : "新規ブランチで再実行"}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            data-testid="crash-resume-button"
            onClick={() => {
              invoke("resume_crashed_session", { sessionId: crashed.id });
              setCrashed(null);
            }}
            style={primaryButtonStyle}
          >
            再開する
          </button>
          <button
            data-testid="crash-discard-button"
            onClick={() => {
              invoke("discard_crashed_session", { sessionId: crashed.id });
              setCrashed(null);
            }}
            style={secondaryButtonStyle}
          >
            破棄する
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryButtonStyle = {
  padding: "8px 16px", background: "#1f6feb",
  border: "none", borderRadius: 6, color: "#fff",
  cursor: "pointer", fontSize: 13,
};
const secondaryButtonStyle = {
  padding: "8px 16px", background: "none",
  border: "1px solid #30363d", borderRadius: 6,
  color: "#8b949e", cursor: "pointer", fontSize: 13,
};
```

---

## Step 13-E: 知識蓄積 + ヘルスチェック

### 完了基準
- [ ] セッション完了時にknowledge.mdに知識が追記される
- [ ] Worker起動時に関連知識がプロンプトに注入される
- [ ] 30日以上古い一時メモが自動削除される
- [ ] ヘルスチェックコマンドが8カテゴリを診断する

---

### Rust側

#### knowledge_store.rs（新規）

```rust
// src-tauri/src/swarm/knowledge_store.rs

use std::path::Path;
use std::fs;

#[derive(Debug, Clone)]
pub enum KnowledgeCategory {
    ErrorPattern,        // 永続
    ProjectConstraint,   // 永続
    TemporaryNote,       // 30日で削除
}

pub struct KnowledgeEntry {
    pub category: KnowledgeCategory,
    pub content: String,
    pub created_at: String,
    pub expires_at: Option<String>,  // Noneなら永続
    pub occurrence_count: u32,
}

pub struct KnowledgeStore {
    knowledge_path: std::path::PathBuf,
}

impl KnowledgeStore {
    pub fn new(project_root: &Path) -> Self {
        Self {
            knowledge_path: project_root.join(".devnest/knowledge.md"),
        }
    }

    /// セッション完了時にClaude APIで知識を抽出して追記
    pub async fn extract_and_append(
        &self,
        session_log: &str,
        api_key: &str,
    ) -> Result<(), String> {
        // Claude APIで知識を抽出
        let extracted = self.call_extraction_api(session_log, api_key).await?;
        self.append_entries(&extracted)?;
        Ok(())
    }

    /// Worker起動時に関連知識を取得
    pub fn get_relevant_knowledge(&self, task: &str) -> String {
        let content = fs::read_to_string(&self.knowledge_path)
            .unwrap_or_default();
        // タスクに関連するセクションを抽出
        // シンプルな実装: 全件返す（将来的にはベクトル検索）
        if content.is_empty() {
            String::new()
        } else {
            format!("\n\n# このプロジェクトの注意事項\n{}", content)
        }
    }

    /// 期限切れの一時メモを削除
    pub fn purge_expired(&self) -> Result<u32, String> {
        // TODO: Markdownパーサーで expires_at を確認して削除
        Ok(0)
    }

    async fn call_extraction_api(
        &self,
        session_log: &str,
        api_key: &str,
    ) -> Result<Vec<KnowledgeEntry>, String> {
        // Claude APIで知識を抽出するプロンプト
        // （実装は devnest-phase13-design.md 参照）
        todo!("Claude API呼び出し実装")
    }

    fn append_entries(&self, entries: &[KnowledgeEntry]) -> Result<(), String> {
        // knowledge.mdに追記
        todo!("Markdown追記実装")
    }
}
```

#### health_check.rs（新規）

```rust
// src-tauri/src/swarm/health_check.rs

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct HealthReport {
    pub category: String,
    pub status: HealthStatus,
    pub message: String,
    pub auto_fixable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HealthStatus { Ok, Warning, Error }

pub async fn run_health_check() -> Vec<HealthReport> {
    let mut reports = vec![];

    // 1. dependencies: claude/git/portable-ptyの存在確認
    reports.push(check_dependencies());
    // 2. config: 設定値の妥当性
    reports.push(check_config());
    // 3. databases: mail.db / sessions.dbの整合性
    reports.push(check_databases());
    // 4. agents: ゾンビプロセス確認
    reports.push(check_zombie_agents());
    // 5. git: worktreeの状態・孤立ブランチ
    reports.push(check_git_state());
    // 6. resources: CPU/メモリ
    reports.push(check_resources());
    // 7. api: Claude APIへの疎通確認
    reports.push(check_api_connectivity().await);
    // 8. logs: ログサイズ確認
    reports.push(check_log_size());

    reports
}

fn check_dependencies() -> HealthReport {
    let claude_ok = std::process::Command::new("claude")
        .arg("--version")
        .output()
        .is_ok();

    let git_ok = std::process::Command::new("git")
        .arg("--version")
        .output()
        .is_ok();

    if claude_ok && git_ok {
        HealthReport {
            category: "dependencies".to_string(),
            status: HealthStatus::Ok,
            message: "claude・git ともに利用可能です".to_string(),
            auto_fixable: false,
        }
    } else {
        HealthReport {
            category: "dependencies".to_string(),
            status: HealthStatus::Error,
            message: format!(
                "{}{}",
                if !claude_ok { "claude コマンドが見つかりません。" } else { "" },
                if !git_ok { "git コマンドが見つかりません。" } else { "" },
            ),
            auto_fixable: false,
        }
    }
}

// 残り7カテゴリも同様に実装...
async fn check_api_connectivity() -> HealthReport {
    // Claude APIへの疎通確認（最小リクエスト）
    todo!()
}

fn check_config() -> HealthReport { todo!() }
fn check_databases() -> HealthReport { todo!() }
fn check_zombie_agents() -> HealthReport { todo!() }
fn check_git_state() -> HealthReport { todo!() }
fn check_resources() -> HealthReport { todo!() }
fn check_log_size() -> HealthReport { todo!() }
```

---

## Cargo.toml への追加（Phase 13全体分）

```toml
[dependencies]
# Step 13-C: SQLiteメール
rusqlite = { version = "0.31", features = ["bundled"] }
chrono = { version = "0.4", features = ["serde"] }
```

---

## ファイル構成（Phase 13追加分）

```
src-tauri/src/swarm/
├── mod.rs              # 新モジュールを追加登録
├── worker.rs           # WorkerRole・WorkerConfig更新
├── manager.rs          # spawn_worker更新（ロール・ガード・Watchdog）
├── parser.rs           # 既存（ガード違反検出を追加）
├── role_manager.rs     # 新規: ロールテンプレート管理
├── guard_manager.rs    # 新規: Gitフック設置・違反検出
├── watchdog.rs         # 新規: スタック検出・Nudge
├── mail_store.rs       # 新規: SQLiteメール
├── context_store.rs    # 新規: コンテキスト共有
├── session_store.rs    # 新規: クラッシュリカバリ
├── knowledge_store.rs  # 新規: 知識蓄積
└── health_check.rs     # 新規: ヘルスチェック

src/components/swarm/
├── XtermPane.tsx           # 役割バッジ追加
├── GuardViolationDialog.tsx # 新規
├── CrashRecoveryDialog.tsx  # 新規
└── types.ts                # WorkerRole追加

.devnest/
├── roles/
│   ├── scout.md
│   ├── builder.md
│   ├── reviewer.md
│   └── merger.md
├── mail.db
├── sessions.db
├── knowledge.md
└── context.json
```

---

## 実装順序

```
13-A（ロール + ガード）
  → 13-B（Watchdog）    ← Watchdog内でheartbeat更新も実装
    → 13-C（メール + コンテキスト）
      → 13-D（クラッシュリカバリ）  ← session_storeはWatchdogと連動
        → 13-E（知識蓄積 + ヘルスチェック）
```

---

## 関連ドキュメント

- devnest-phase13-design.md
- devnest-phase12-steps-impl.md
- devnest-phase11-step-b-impl.md
- devnest-test-design.md
