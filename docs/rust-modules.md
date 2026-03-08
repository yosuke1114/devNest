# DevNest — Rust モジュール構成設計書

**バージョン**: 2.0
**作成日**: 2026-03-08
**改訂日**: 2026-03-08（要件変更対応）
**対象**: `src-tauri/src/`
**前提資料**: コマンド定義書 v4.0 / DB スキーマ設計書 v2.0
**変更履歴**: v1.0 → v2.0：`models/ai_edit.rs` 廃止・`commands/ai_edit.rs` 廃止。`commands/pr.rs` に `pr_doc_diff_get` 追加。

---

## 1. ディレクトリ構成

```
src-tauri/
  src/
    main.rs                  # エントリーポイント（Tauri Builder）
    lib.rs                   # run() 公開・コマンド登録
    error.rs                 # AppError 型・From 実装
    db/
      mod.rs                 # DbPool 型エイリアス・init()
      migrations.rs          # sqlx::migrate! ラッパー
      cleanup.rs             # startup_cleanup 実装
    models/
      mod.rs
      project.rs             # Project, ProjectPatch
      document.rs            # Document, SyncLog
      issue.rs               # Issue, IssueDocLink, IssueDraft
      pull_request.rs        # PullRequest, PrReview, PrComment  ← Phase 2
      ~~ai_edit.rs~~         # ★ v2.0 廃止（ai_edit_branches テーブル廃止）
      notification.rs        # Notification                      ← Phase 5
      settings.rs            # AppSettingKey, app_settings KV
    commands/
      mod.rs                 # 全コマンドを use・register_commands() を公開
      project.rs             # project_* コマンドハンドラ
      document.rs            # document_* コマンドハンドラ
      github_auth.rs         # github_auth_* コマンドハンドラ
      issue.rs               # issue_* コマンドハンドラ
      issue_draft.rs         # issue_draft_* コマンドハンドラ
      pr.rs                  # pr_* コマンドハンドラ（★ v2.0: pr_doc_diff_get 追加）  ← Phase 2/4
      ~~ai_edit.rs~~         # ★ v2.0 廃止（ai_edit_* コマンドハンドラ削除）
      terminal.rs            # terminal_* コマンドハンドラ       ← Phase 4
      conflict.rs            # conflict_* コマンドハンドラ       ← Phase 4
      search.rs              # search_* コマンドハンドラ         ← Phase 3
      notification.rs        # notification_* コマンドハンドラ   ← Phase 5
      settings.rs            # settings_get / settings_set
      util.rs                # startup_cleanup, sync_log_list 等
    services/
      mod.rs
      git.rs                 # git2-rs ラッパー（commit/push/pull/scan）
      github.rs              # GitHub REST API クライアント
      anthropic.rs           # Anthropic API クライアント（streaming 対応）
      keychain.rs            # OS Keychain（keyring crate）ラッパー
      polling.rs             # バックグラウンドポーリングタスク管理
      oauth.rs               # OAuth コールバック用ローカル HTTP サーバー
    state.rs                 # AppState（DbPool・GitHub クライアント等を保持）
  Cargo.toml
  tauri.conf.json
  capabilities/
    default.json
  migrations/
    0001_initial.sql
    0002_pull_requests.sql   ← Phase 2
    0003_document_chunks.sql ← Phase 3
    0004_ai_terminal_conflict.sql ← Phase 4
    0005_notifications_search.sql ← Phase 5
```

---

## 2. 主要モジュールの責務

---

### 2.1 `main.rs` / `lib.rs`

```rust
// src-tauri/src/lib.rs

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            // commands/mod.rs の register_commands!() マクロで一括登録
        ])
        .setup(|app| {
            let db = db::init(app.handle()).await?;
            app.manage(db);
            // startup_cleanup を非同期で実行
            tauri::async_runtime::spawn(async move {
                let _ = db::cleanup::run(&db).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**責務**
- Tauri Builder の構成（プラグイン・State 登録・コマンド登録）
- DB 初期化・起動時クリーンアップのキック
- ウィンドウ設定（`tauri.conf.json` に委譲）

---

### 2.2 `error.rs`

アプリ全体で使用するエラー型。

```rust
// src-tauri/src/error.rs

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    // DB
    #[error("DB エラー: {0}")]
    Db(String),

    // git2
    #[error("git エラー: {0}")]
    Git(String),

    // GitHub API
    #[error("GitHub API エラー: {0}")]
    GitHub(String),

    #[error("GitHub 認証が必要です")]
    GitHubAuthRequired,

    #[error("GitHub API レート制限超過。リセット: {reset_at}")]
    GitHubRateLimit { reset_at: String },

    // Anthropic API
    #[error("Anthropic API エラー: {0}")]
    Anthropic(String),

    // ファイル操作
    #[error("ファイル操作エラー: {0}")]
    Io(String),

    // バリデーション
    #[error("入力エラー: {0}")]
    Validation(String),

    // Keychain
    #[error("Keychain エラー: {0}")]
    Keychain(String),

    // Not Found
    #[error("見つかりません: {0}")]
    NotFound(String),

    // 予期せぬエラー
    #[error("内部エラー: {0}")]
    Internal(String),
}

// sqlx::Error → AppError
impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

// git2::Error → AppError
impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self {
        AppError::Git(e.to_string())
    }
}

// std::io::Error → AppError
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
```

**設計方針**
- `thiserror` で `Display` 実装を自動生成
- `Serialize` を derive することで Tauri が JSON としてフロントに返せる
- `serde(tag = "code")` によりフロント側で `error.code` による分岐が可能
- フロント側の受け取り: `catch (e) { const err = e as AppError; if (err.code === 'GitHubRateLimit') ... }`

---

### 2.3 `state.rs`

Tauri の `State<T>` で管理するアプリケーション状態。

```rust
// src-tauri/src/state.rs

use std::sync::Arc;
use tokio::sync::RwLock;
use crate::db::DbPool;

pub struct AppState {
    pub db: DbPool,
    // ポーリングタスクのハンドル管理（project_id → JoinHandle）
    pub polling_handles: Arc<RwLock<HashMap<i64, tokio::task::JoinHandle<()>>>>,
    // OAuth コールバック待ちのチャンネル（project_id → oneshot::Sender）
    pub oauth_channels: Arc<RwLock<HashMap<i64, tokio::sync::oneshot::Sender<String>>>>,
}
```

**責務**
- DB 接続プール（`sqlx::SqlitePool`）の保持
- バックグラウンドタスクのライフタイム管理
- コマンドハンドラ間での共有状態の格納

---

### 2.4 `services/git.rs`

git2-rs を薄くラップするサービス層。コマンドハンドラから直接 git2 を呼ばない。

```rust
// src-tauri/src/services/git.rs

pub struct GitService {
    repo_path: PathBuf,
}

impl GitService {
    pub fn open(local_path: &str) -> Result<Self>
    pub fn scan_docs(&self, docs_root: &str) -> Result<Vec<ScannedFile>>
      // → [(relative_path, sha, size_bytes)]
    pub fn write_and_commit(&self, relative_path: &str, content: &str, msg: &str) -> Result<String>
      // → commit_sha
    pub fn push(&self, token: &str, remote: &str, branch: &str) -> Result<()>
    pub fn pull(&self, token: &str) -> Result<PullResult>
      // → PullResult { status: "success" | "conflict", conflict_files: Vec<String> }
    pub fn get_diff(&self, branch: &str) -> Result<String>
    pub fn merge_branch(&self, branch: &str) -> Result<()>
    pub fn delete_branch(&self, branch: &str) -> Result<()>
}

pub struct ScannedFile {
    pub path: String,
    pub sha: String,
    pub size_bytes: i64,
}

pub struct PullResult {
    pub status: PullStatus,
    pub conflict_files: Vec<String>,
}
```

---

### 2.5 `services/github.rs`

GitHub REST API クライアント。認証トークンはコンストラクタで受け取る。

```rust
// src-tauri/src/services/github.rs

pub struct GitHubClient {
    token: String,
    owner: String,
    repo: String,
    http: reqwest::Client,
}

impl GitHubClient {
    pub fn new(token: &str, owner: &str, repo: &str) -> Self
    pub async fn exchange_code(&self, code: &str, client_id: &str, client_secret: &str) -> Result<String>
      // → access_token
    pub async fn get_user(&self) -> Result<GitHubUser>
    pub async fn list_issues(&self, state: Option<&str>) -> Result<Vec<GitHubIssue>>
    pub async fn create_issue(&self, title: &str, body: &str, labels: &[String], assignee: Option<&str>) -> Result<GitHubIssue>
    pub async fn list_labels(&self) -> Result<Vec<GitHubLabel>>
    pub async fn list_pull_requests(&self, state: Option<&str>) -> Result<Vec<GitHubPullRequest>>
    pub async fn merge_pull_request(&self, pr_number: i64, method: &str) -> Result<()>
    pub async fn get_pull_request_diff(&self, pr_number: i64) -> Result<String>
    pub async fn add_pr_comment(&self, pr_number: i64, body: &str, path: Option<&str>, line: Option<i64>) -> Result<GitHubComment>
    pub async fn submit_review(&self, pr_number: i64, state: &str, body: Option<&str>) -> Result<()>

    // レート制限ヘッダーの確認
    fn check_rate_limit(&self, resp: &reqwest::Response) -> Result<()>
}
```

---

### 2.6 `services/anthropic.rs`

Anthropic API クライアント。SSE ストリーミングに対応。

```rust
// src-tauri/src/services/anthropic.rs

pub struct AnthropicClient {
    api_key: String,
    http: reqwest::Client,
}

impl AnthropicClient {
    pub fn new(api_key: &str) -> Self

    // 通常の completion（Issue ドラフト生成プロンプト構築等）
    pub async fn complete(&self, model: &str, system: &str, messages: &[Message], max_tokens: u32) -> Result<String>

    // ストリーミング completion（issue_draft_generate）
    // chunk_callback: デルタテキストを受け取るクロージャ
    pub async fn complete_stream<F>(
        &self,
        model: &str,
        system: &str,
        messages: &[Message],
        max_tokens: u32,
        chunk_callback: F,
    ) -> Result<String>
    where
        F: Fn(String) + Send + 'static,
        // → 最終的な全テキストを返す

    // Embedding（document_chunks 用）← Phase 3
    pub async fn embed(&self, texts: &[String]) -> Result<Vec<Vec<f32>>>
}
```

---

### 2.7 `services/polling.rs`

バックグラウンドのポーリングタスク管理。

```rust
// src-tauri/src/services/polling.rs

// polling_start コマンドから呼ばれる
pub async fn start(
    project_id: i64,
    interval_min: u32,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<()>
// → 既存ハンドルがあれば中断してから再起動

// polling_stop コマンドから呼ばれる
pub async fn stop(project_id: i64, state: tauri::State<'_, AppState>) -> Result<()>

// ポーリング本体（interval ごとに実行）
async fn poll_tick(project_id: i64, app_handle: tauri::AppHandle, db: &DbPool)
// → issue_sync → pr_sync（Phase 2）→ notification_new イベント（Phase 5）
```

---

### 2.8 `services/oauth.rs`

OAuth コールバック用のローカル HTTP サーバー。

```rust
// src-tauri/src/services/oauth.rs

// ローカルポート 4649 でリクエストを 1 件受け取り、code パラメータを返す
pub async fn wait_for_callback(
    tx: tokio::sync::oneshot::Sender<String>,  // code を送る
) -> Result<()>
// → "http://localhost:4649/callback" に code=xxx が届いたら tx.send(code)

// github_auth_start の実装例
// 1. wait_for_callback を spawn
// 2. ブラウザで GitHub 認証 URL を開く（tauri::api::shell::open）
// 3. コールバックで code を受け取り → github_auth_complete を呼ぶ
```

---

## 3. コマンドハンドラの実装パターン

全コマンドハンドラは以下のパターンに統一する。

```rust
// commands/document.rs の例

#[tauri::command]
pub async fn document_save(
    project_id: i64,
    document_id: i64,
    content: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> std::result::Result<DocSaveResult, AppError> {
    // 1. DB からプロジェクト情報取得
    let project = db::project::find(&state.db, project_id).await?;

    // 2. ビジネスロジックは services 層に委譲
    let sha = services::git::GitService::open(&project.local_path)?
        .write_and_commit(&doc.path, &content, &msg)?;

    // 3. DB 更新
    db::document::update_sha(&state.db, document_id, &sha).await?;

    // 4. Tauri イベント発行（進捗通知）
    app_handle.emit("doc_save_progress", DocSaveProgressPayload {
        document_id,
        stage: "pushing".to_string(),
    })?;

    Ok(DocSaveResult { commit_sha: sha })
}
```

**原則**

| 原則 | 内容 |
|------|------|
| ハンドラは薄く | DB アクセス・git 操作は services / db モジュールに委譲し、ハンドラは 30 行以内を目安にする |
| エラーは `?` で伝播 | `AppError` の `From` 実装で各エラー型を変換し、`?` で一貫して伝播する |
| イベントは `app_handle.emit` | ストリーミング・長時間処理の進捗は `emit` でフロントに push する |
| `async` 統一 | 全コマンドハンドラは `async fn` とし、`tokio::spawn` でバックグラウンド処理を切り出す |

---

## 4. Cargo.toml 依存ライブラリ

```toml
[dependencies]
# Tauri
tauri = { version = "2", features = ["macos-private-api"] }
tauri-plugin-notification = "2"

# 非同期
tokio = { version = "1", features = ["full"] }

# DB
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio", "migrate", "chrono"] }

# git
git2 = "0.19"

# HTTP（GitHub API / Anthropic API）
reqwest = { version = "0.12", features = ["json", "stream"] }
eventsource-stream = "0.2"   # SSE ストリーミングパース

# シリアライゼーション
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# エラーハンドリング
thiserror = "1"
anyhow = "1"   # services 層の内部エラーに使用。コマンドハンドラでは AppError に変換

# Keychain
keyring = "3"

# ユーティリティ
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4"] }
tracing = "0.1"
tracing-subscriber = "0.3"

[dev-dependencies]
# テスト用
tempfile = "3"
mockall = "0.13"
```

---

## 5. コマンド登録（`commands/mod.rs`）

```rust
// src-tauri/src/commands/mod.rs

pub mod document;
pub mod github_auth;
pub mod issue;
pub mod issue_draft;
pub mod project;
pub mod settings;
pub mod util;
// Phase 2〜5 は追加時に pub mod を追記

/// lib.rs の invoke_handler! に渡すコマンドリスト
/// Phase ごとにコメントで区切り管理する
#[macro_export]
macro_rules! all_commands {
    () => {
        tauri::generate_handler![
            // Phase 1: project
            project::project_create,
            project::project_list,
            project::project_update,
            project::project_get_status,
            project::project_delete,
            project::project_set_last_opened_document,
            // Phase 1: document
            document::document_list,
            document::document_get,
            document::document_save,
            document::document_set_dirty,
            document::document_scan,
            document::document_linked_issues,
            document::document_push_retry,
            // Phase 1: github_auth
            github_auth::github_auth_start,
            github_auth::github_auth_complete,
            github_auth::github_auth_status,
            github_auth::github_auth_revoke,
            // Phase 1: issue
            issue::issue_list,
            issue::issue_sync,
            issue::issue_create,
            issue::issue_doc_link_list,
            issue::issue_doc_link_add,
            issue::issue_doc_link_remove,
            // Phase 1: issue_draft
            issue_draft::issue_draft_create,
            issue_draft::issue_draft_update,
            issue_draft::issue_draft_generate,
            issue_draft::issue_draft_cancel,
            issue_draft::issue_draft_list,
            // Phase 1: settings / util
            settings::settings_get,
            settings::settings_set,
            util::startup_cleanup,
            util::sync_log_list,
            util::search_history_list,
            util::notification_permission_request,
            util::github_labels_list,
        ]
    };
}
```
