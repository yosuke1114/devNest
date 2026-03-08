# DevNest — GitHub API 連携仕様書

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**対象**: GitHub REST API v3 / OAuth App 認証  
**前提資料**: コマンド定義書 v3.0 / Rust モジュール構成設計書 v1.0

---

## 1. 認証方式

### OAuth App（Personal Access Token フロー）

DevNest は **GitHub OAuth App** を使用する。GitHub App（Installation Token）は個人利用では複雑なため Phase 5 以降の拡張とする。

| 項目 | 値 |
|------|-----|
| 認証方式 | OAuth 2.0 Authorization Code フロー |
| コールバック URL | `http://localhost:4649/callback` |
| スコープ | `repo`, `read:user` |
| トークン保存 | OS Keychain（`keyring` crate）。キー: `devnest/{project_id}/github_token` |
| Authorization ヘッダー | `Bearer {access_token}` |

### OAuth フロー詳細

```
1. github_auth_start
   → https://github.com/login/oauth/authorize
     ?client_id={CLIENT_ID}
     &scope=repo,read:user
     &state={random_state}   # CSRF 対策
     &redirect_uri=http://localhost:4649/callback
   → ブラウザで開く（tauri::api::shell::open）

2. GitHub がコールバック
   → GET http://localhost:4649/callback?code=xxx&state=yyy

3. ローカルサーバー（oauth.rs）が code と state を受け取る
   → state を検証して CSRF チェック
   → oneshot channel で code を github_auth_complete に渡す

4. github_auth_complete
   → POST https://github.com/login/oauth/access_token
     body: { client_id, client_secret, code }
   → access_token を受け取る
   → Keychain に保存
   → github_auth_done イベントを emit
```

### トークン取得ヘルパー

```rust
// services/keychain.rs

pub fn get_token(project_id: i64) -> Result<Option<String>> {
    let entry = keyring::Entry::new("devnest", &format!("project_{}", project_id))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Keychain(e.to_string())),
    }
}

pub fn set_token(project_id: i64, token: &str) -> Result<()>
pub fn delete_token(project_id: i64) -> Result<()>
```

---

## 2. 使用エンドポイント一覧

### Phase 1

| コマンド | メソッド | エンドポイント | 用途 |
|---------|---------|-------------|------|
| `github_auth_complete` | POST | `https://github.com/login/oauth/access_token` | code → token 交換 |
| `github_auth_status` | GET | `/user` | 認証ユーザー情報取得 |
| `issue_sync` | GET | `/repos/{owner}/{repo}/issues` | Issue 一覧取得 |
| `issue_create` | POST | `/repos/{owner}/{repo}/issues` | Issue 作成 |
| `github_labels_list` | GET | `/repos/{owner}/{repo}/labels` | ラベル一覧取得 |

### Phase 2

| コマンド | メソッド | エンドポイント | 用途 |
|---------|---------|-------------|------|
| `pr_sync` | GET | `/repos/{owner}/{repo}/pulls` | PR 一覧取得 |
| `pr_get_detail` | GET | `/repos/{owner}/{repo}/pulls/{number}` | PR 詳細 |
| `pr_get_diff` | GET | `/repos/{owner}/{repo}/pulls/{number}/files` | diff 取得 |
| `pr_add_comment` | POST | `/repos/{owner}/{repo}/pulls/{number}/comments` | インラインコメント |
| `pr_submit_review` | POST | `/repos/{owner}/{repo}/pulls/{number}/reviews` | レビュー提出 |
| `pr_merge` | PUT | `/repos/{owner}/{repo}/pulls/{number}/merge` | PR マージ |

### Phase 4（AI 編集ブランチ）

| コマンド | メソッド | エンドポイント | 用途 |
|---------|---------|-------------|------|
| `ai_edit_create_pr` | POST | `/repos/{owner}/{repo}/pulls` | PR 作成 |

---

## 3. リクエスト共通設定

```rust
// services/github.rs

const BASE_URL: &str = "https://api.github.com";
const ACCEPT: &str = "application/vnd.github+json";
const API_VERSION: &str = "2022-11-28";

impl GitHubClient {
    fn build_request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{}{}", BASE_URL, path))
            .header("Accept", ACCEPT)
            .header("Authorization", format!("Bearer {}", self.token))
            .header("X-GitHub-Api-Version", API_VERSION)
            .header("User-Agent", "DevNest/1.0")
    }
}
```

---

## 4. レート制限対応

GitHub REST API の制限: **認証済みで 5,000 req/h**。

### レート制限ヘッダーの確認

```rust
fn check_rate_limit_headers(resp: &reqwest::Response) -> Result<()> {
    let remaining = resp.headers()
        .get("x-ratelimit-remaining")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(i64::MAX);

    if remaining == 0 {
        let reset_at = resp.headers()
            .get("x-ratelimit-reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<i64>().ok())
            .map(|ts| chrono::DateTime::from_timestamp(ts, 0)
                .map(|dt| dt.format("%H:%M").to_string())
                .unwrap_or_default())
            .unwrap_or_default();
        return Err(AppError::GitHubRateLimit { reset_at });
    }

    // 残量が 100 以下になったら WARN ログ
    if remaining < 100 {
        tracing::warn!("GitHub rate limit remaining: {}", remaining);
    }
    Ok(())
}
```

### ポーリング間隔の設計

| 操作 | 頻度 | 推定消費（1h） |
|------|------|--------------|
| `issue_sync` | 5分ごと | 12 req |
| `pr_sync`（Phase 2） | 5分ごと | 12 req |
| polling_tick 合計 | 5分ごと | 24 req |
| ユーザー手動操作 | 随時 | 〜50 req |
| **合計** | — | **< 100 req/h** |

5,000 req/h の制限に対して余裕があり、通常利用では問題ない。

---

## 5. ページネーション

GitHub API はデフォルト 30 件・最大 100 件/ページ。

### `issue_sync` のページネーション方針

```rust
// services/github.rs

pub async fn list_issues_all(&self, state: Option<&str>) -> Result<Vec<GitHubIssue>> {
    let mut page = 1u32;
    let mut all = Vec::new();

    loop {
        let resp = self.build_request(Method::GET, "/repos/{owner}/{repo}/issues")
            .query(&[
                ("state", state.unwrap_or("all")),
                ("per_page", "100"),
                ("page", &page.to_string()),
                ("sort", "updated"),
                ("direction", "desc"),
            ])
            .send()
            .await?;

        check_rate_limit_headers(&resp)?;

        let items: Vec<GitHubIssue> = resp.json().await?;
        let has_next = items.len() == 100;
        all.extend(items);

        // 増分同期: issues.synced_at より古い更新日時のものが出たら停止
        // （全件取得ではなく差分のみ取得して DB upsert）
        if !has_next { break; }
        page += 1;
    }
    Ok(all)
}
```

**増分同期の方針**

- `issue_sync` 実行時は `issues` テーブルの最大 `github_updated_at` を取得
- GitHub API に `since={max_updated_at}` パラメータを渡して差分のみ取得
- 初回同期（`since` なし）のみ全ページを取得

```rust
// issues の増分同期
let since = db::issue::max_updated_at(&state.db, project_id).await?;
let params = if let Some(since) = since {
    vec![("since", since), ("per_page", "100")]
} else {
    vec![("per_page", "100")]
};
```

---

## 6. PR diff 取得

PR の diff は GitHub API の `application/vnd.github.diff` メディアタイプで取得する。

```rust
// services/github.rs

pub async fn get_pull_request_diff(&self, pr_number: i64) -> Result<String> {
    let resp = self.build_request(
        Method::GET,
        &format!("/repos/{}/{}/pulls/{}", self.owner, self.repo, pr_number)
    )
    .header("Accept", "application/vnd.github.diff")  // diff 形式で取得
    .send()
    .await?;

    check_rate_limit_headers(&resp)?;

    if !resp.status().is_success() {
        return Err(AppError::GitHub(resp.text().await?));
    }

    Ok(resp.text().await?)
}
```

diff は `ai_edit_branches.diff_content` に格納する（最大サイズ目安: 1MB）。

---

## 7. エラーレスポンス処理

### GitHub API のエラーレスポンス形式

```json
{
  "message": "Validation Failed",
  "errors": [{ "resource": "Issue", "code": "missing_field", "field": "title" }],
  "documentation_url": "https://docs.github.com/..."
}
```

### Rust 側の変換

```rust
async fn handle_response<T: DeserializeOwned>(resp: reqwest::Response) -> Result<T> {
    check_rate_limit_headers(&resp)?;

    let status = resp.status();
    if status.is_success() {
        return Ok(resp.json::<T>().await?);
    }

    // エラーレスポンスをパース
    let body = resp.text().await.unwrap_or_default();
    let msg = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v["message"].as_str().map(String::from))
        .unwrap_or_else(|| format!("HTTP {}", status));

    match status.as_u16() {
        401 => Err(AppError::GitHubAuthRequired),
        403 => Err(AppError::GitHub(format!("権限エラー: {}", msg))),
        404 => Err(AppError::NotFound(msg)),
        422 => Err(AppError::Validation(msg)),
        _ => Err(AppError::GitHub(msg)),
    }
}
```

---

## 8. セキュリティ考慮事項

| 項目 | 対策 |
|------|------|
| `client_secret` の保護 | Tauri の `tauri.conf.json` の `env` からは読まず、ビルド時に環境変数で注入（CI/CD）。配布バイナリには含まない ※ |
| state パラメータ | OAuth 開始時に `uuid::Uuid::new_v4()` を生成し、コールバック時に検証する |
| トークンのメモリ保持 | コマンドハンドラ内での一時変数のみ。`AppState` には保持しない（Keychain から毎回取得） |
| HTTPS 強制 | `reqwest` で `https://` のみ許可（HTTP へのダウングレード不可） |
| ログにトークン出力禁止 | `tracing` のフォーマッタに `token` フィールドをフィルタする |

※ **`client_secret` の配布問題**: OAuth App の `client_secret` はオープンソース配布時に公開されてしまう。個人利用の場合はユーザー自身が OAuth App を作成してもらう方式（BYOC: Bring Your Own Credentials）を Phase 1 では採用する。Settings 画面で `client_id` / `client_secret` を入力させ `app_settings` に暗号化保存する。
