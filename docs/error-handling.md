# DevNest — エラーハンドリング設計書

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**前提資料**: Rust モジュール構成設計書 v1.0 / ストア設計書 v3.0

---

## 1. 設計方針

| 原則 | 内容 |
|------|------|
| **単一エラー型** | Rust 側は `AppError` に集約し、フロントは `{ code, message }` の JSON で受け取る |
| **リトライ可否の明示** | エラーコードに `retryable` フラグを持たせ、フロントが自動リトライ可否を判断できるようにする |
| **ユーザー表示と内部ログを分離** | `message` はユーザー向け日本語メッセージ、`detail` はデバッグ用詳細（本番では非表示） |
| **サイレント失敗の禁止** | バックグラウンド処理の失敗は必ず `notification_new` イベントまたは `AsyncStatus='error'` でフロントに伝える |

---

## 2. エラーコード定義

フロントは `error.code` で分岐する。

| コード | 意味 | retryable | フロント既定の挙動 |
|--------|------|:---------:|-------------------|
| `Db` | DB エラー | ✗ | トースト表示・詳細ログ |
| `Git` | git2 操作エラー | △ | トースト + RETRY ボタン |
| `GitHub` | GitHub API エラー（4xx / 5xx） | △ | トースト表示 |
| `GitHubAuthRequired` | GitHub 未認証 | ✗ | Settings 画面へ誘導 |
| `GitHubRateLimit` | レート制限超過 | ✓ | `reset_at` までカウントダウン表示 |
| `Anthropic` | Anthropic API エラー | △ | Wizard にエラー表示 + 再生成ボタン |
| `Io` | ファイル操作エラー | ✗ | トースト表示 |
| `Validation` | 入力値エラー | ✗ | フォームのインライン表示 |
| `Keychain` | OS Keychain エラー | ✗ | トースト表示 |
| `NotFound` | リソース未存在 | ✗ | 空状態 UI に切替 |
| `Internal` | 予期せぬエラー | ✗ | トースト + GitHub Issue 報告リンク |

---

## 3. Rust 側の実装

### 3.1 `AppError` 型（再掲・補足）

```rust
// src-tauri/src/error.rs

#[derive(Debug, Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    Db(String),
    Git(String),
    GitHub(String),
    #[error("GitHub 認証が必要です")]
    GitHubAuthRequired,
    #[error("GitHub API レート制限超過。リセット: {reset_at}")]
    GitHubRateLimit { reset_at: String },
    Anthropic(String),
    Io(String),
    Validation(String),
    Keychain(String),
    NotFound(String),
    Internal(String),
}
```

### 3.2 GitHub API エラーの変換

```rust
// services/github.rs

fn check_rate_limit(resp: &reqwest::Response) -> Result<()> {
    if resp.status() == 429 {
        let reset_at = resp
            .headers()
            .get("x-ratelimit-reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok())
            .map(|ts| chrono::DateTime::from_timestamp(ts, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default())
            .unwrap_or_default();
        return Err(AppError::GitHubRateLimit { reset_at });
    }
    Ok(())
}
```

### 3.3 バックグラウンド処理のエラー通知

ポーリング等の非同期タスクでエラーが発生した場合、コマンドの戻り値では伝達できないため `app_handle.emit` で通知する。

```rust
// services/polling.rs

async fn poll_tick(project_id: i64, app_handle: tauri::AppHandle, db: &DbPool) {
    if let Err(e) = do_poll(project_id, &app_handle, db).await {
        tracing::error!("polling error project={} err={:?}", project_id, e);
        // push_failed の場合はフロントに通知
        if matches!(e, AppError::Git(_)) {
            let _ = app_handle.emit("doc_save_progress", DocSaveProgressPayload {
                document_id: 0,  // プロジェクト全体の失敗
                stage: "push_failed".to_string(),
                error: Some(e.to_string()),
            });
        }
    }
}
```

### 3.4 push リトライ戦略

```rust
// services/git.rs

pub async fn push_with_retry(
    &self,
    token: &str,
    remote: &str,
    branch: &str,
    max_retries: u32,
) -> Result<()> {
    let mut attempt = 0;
    loop {
        match self.push(token, remote, branch) {
            Ok(_) => return Ok(()),
            Err(e) if attempt < max_retries => {
                attempt += 1;
                tracing::warn!("push failed attempt={} err={:?}", attempt, e);
                tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await; // 指数バックオフ
            }
            Err(e) => return Err(e),
        }
    }
}
// 最大リトライ回数: 3（DB の retry_count と対応）
// バックオフ: 2s → 4s → 8s
```

---

## 4. フロントエンド側の実装

### 4.1 `AppError` の型定義

```typescript
// src/types/errors.ts

export type ErrorCode =
  | 'Db' | 'Git' | 'GitHub' | 'GitHubAuthRequired' | 'GitHubRateLimit'
  | 'Anthropic' | 'Io' | 'Validation' | 'Keychain' | 'NotFound' | 'Internal'

export interface AppError {
  code: ErrorCode
  message: string
  // GitHubRateLimit のみ
  reset_at?: string
}

export function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e
}
```

### 4.2 `invoke` ラッパーでの共通エラー処理

```typescript
// src/lib/ipc.ts

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { isAppError, AppError } from '@/types/errors'
import { useNotificationStore } from '@/stores/notification.store'

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    return tauriInvoke<T>(cmd, args)
}

// 共通エラーハンドラ（ストア内で使用するヘルパー）
export function handleError(e: unknown, context: string): AppError {
  const err = isAppError(e)
    ? e
    : { code: 'Internal' as const, message: String(e) }

  // GitHubAuthRequired → Settings 画面への誘導は各ストアが行う
  // GitHubRateLimit → reset_at の表示は各ストアが行う

  console.error(`[${context}]`, err)
  return err
}
```

### 4.3 ストア内でのエラーハンドリングパターン

```typescript
// stores/document.store.ts の例

saveDocument: async (projectId, documentId) => {
  set({ saveStatuses: { ...get().saveStatuses, [documentId]: 'committing' } })
  try {
    await invoke('document_save', { project_id: projectId, document_id: documentId, content: get().editorContent })
    // 成功は doc_save_progress イベントで処理
  } catch (e) {
    const err = handleError(e, 'document_save')
    set({ saveStatuses: { ...get().saveStatuses, [documentId]: 'error' } })

    // GitHubAuthRequired → Settings へ誘導
    if (err.code === 'GitHubAuthRequired') {
      useUiStore.getState().showModal({ type: 'github_auth_required' })
      return
    }
    // Git エラー → push_failed を DB に反映（Rust 側でも更新済み）
    if (err.code === 'Git') {
      // documentStore の状態は Rust 側の push_status='push_failed' と同期
      return
    }
    // その他 → トースト表示（notificationStore 経由）
    useNotificationStore.getState().addToast({ type: 'error', message: err.message })
  }
}
```

### 4.4 エラー表示コンポーネント

| 表示方法 | 使用場面 | コンポーネント |
|---------|---------|-------------|
| **インライン** | フォームのバリデーション | フォーム項目直下に赤テキスト |
| **トースト** | 一時的な操作失敗 | `Toast`（右下・3秒で自動消去） |
| **バナー** | 持続する状態エラー（push_failed 等） | `SaveStatusBar` 内の赤バナー |
| **モーダル** | 操作を継続できないエラー（認証切れ等） | `uiStore.showModal` |
| **空状態** | リソースが見つからない | 各リスト・詳細の空状態 UI |

### 4.5 `GitHubRateLimit` 専用の表示

```typescript
// stores/github-auth.store.ts

if (err.code === 'GitHubRateLimit' && err.reset_at) {
  const resetDate = new Date(err.reset_at)
  const minutes = Math.ceil((resetDate.getTime() - Date.now()) / 60000)
  useNotificationStore.getState().addToast({
    type: 'warning',
    message: `GitHub API のレート制限に達しました。約 ${minutes} 分後に自動で再試行します。`,
    duration: minutes * 60 * 1000,   // リセットまで表示し続ける
  })
  // minutes 後に自動リトライをスケジュール
  setTimeout(() => get().checkStatus(projectId), minutes * 60 * 1000 + 5000)
}
```

---

## 5. エラーハンドリングのフロー図

```
コマンド呼び出し（invoke）
      │
      ▼
  Rust コマンドハンドラ
      │
      ├── services 層で AppError 発生
      │         │
      │         └── ? でハンドラまで伝播
      │
      ├── Err(AppError) を JSON シリアライズして返す
      │
      ▼
フロントの invoke catch ブロック
      │
      ├── isAppError(e) で型ガード
      │
      ├── handleError(e, context) でログ出力
      │
      ├── err.code による分岐
      │     ├── GitHubAuthRequired → showModal
      │     ├── GitHubRateLimit    → Toast + 自動リトライ
      │     ├── Validation         → フォームインライン表示
      │     ├── Git（push 失敗）   → SaveStatusBar バナー
      │     └── その他             → Toast
      │
      └── AsyncStatus = 'error' を set
```

---

## 6. ログ設計

```rust
// main.rs

fn setup_logging() {
    tracing_subscriber::fmt()
        .with_max_level(if cfg!(debug_assertions) {
            tracing::Level::DEBUG
        } else {
            tracing::Level::WARN
        })
        .with_target(false)
        .init();
}
```

| ログレベル | 使用場面 |
|----------|---------|
| `ERROR` | `AppError` が発生した全ケース |
| `WARN` | リトライ・レート制限・想定内の失敗 |
| `INFO` | コマンド開始・完了・イベント発火 |
| `DEBUG` | SQL クエリ・git 操作の詳細（開発時のみ） |

ログファイルは `{app_log_dir}/devnest.log` に出力し、`tracing-appender` でローテーション（10MB × 5 世代）する。
