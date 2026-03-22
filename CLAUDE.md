# DevNest — CLAUDE.md

このファイルを読んだら、まず「## 現在のステータス確認」を実行し、
未完了のステップから自律的に作業を進めてください。
人間への確認は最小限にし、判断できることはすべて自分で実行してください。

---

## プロジェクト概要

**DevNest** — 設計書・GitHub・AI が一体化したプロジェクト管理ハブ。
個人開発者（複数リポジトリ管理）向けの Tauri v2 デスクトップアプリ。

| 項目 | 内容 |
|------|------|
| フロントエンド | React + TypeScript + Zustand + xterm.js + CodeMirror 6 |
| デスクトップ | Tauri v2（Rust） |
| Git 操作 | git2-rs |
| DB | SQLite（sqlx）+ sqlite-vec（Phase 3〜） |
| AI（Issue 作成） | Anthropic API（claude-sonnet）ストリーミング |
| AI（PR 作成） | Claude Code CLI（PTY 経由サブプロセス） |
| GitHub | REST/GraphQL API + OAuth App |

---

## 現在のステータス確認

起動時に以下をチェックし、未完了のステップから開始する：

```bash
ls package.json 2>/dev/null && echo "STEP1:done" || echo "STEP1:pending"
ls src-tauri/Cargo.toml 2>/dev/null && echo "STEP2:done" || echo "STEP2:pending"
ls src-tauri/migrations 2>/dev/null && echo "STEP3:done" || echo "STEP3:pending"
ls docs/phase1-schedule.md 2>/dev/null && echo "DOCS:ready" || echo "DOCS:missing"
git log --oneline -1 2>/dev/null && echo "GIT:committed" || echo "GIT:not-committed"
```

---

## セットアップ手順（未完了なら自動実行）

### STEP 1：Tauri プロジェクト初期化

`package.json` が存在しない場合に実行する：

```bash
npm create tauri-app@latest . -- --template react-ts --manager npm --force

npm install zustand
npm install @codemirror/state @codemirror/view @codemirror/lang-markdown @codemirror/language
npm install @xterm/xterm @xterm/addon-fit
npm install react-markdown remark-gfm
npm install @tauri-apps/api @tauri-apps/plugin-shell @tauri-apps/plugin-notification
npm install -D @types/node
```

### STEP 2：Rust 依存クレートの追加

`src-tauri/Cargo.toml` の `[dependencies]` を以下の内容に更新する：

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio-native-tls", "migrate", "chrono"] }
git2 = "0.19"
reqwest = { version = "0.12", features = ["json", "stream"] }
thiserror = "1"
anyhow = "1"
chrono = { version = "0.4", features = ["serde"] }
keyring = "3"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
portable-pty = "0.8"
tokio-util = "0.7"
uuid = { version = "1", features = ["v4"] }

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

`cargo build` でコンパイル確認。エラーがあれば修正してから次へ進む。

### STEP 3：ディレクトリ構造の作成

```bash
mkdir -p src-tauri/migrations
mkdir -p src-tauri/src/{db,models,commands,services}
mkdir -p src/screens
mkdir -p src/components/{layout,editor,issues,pr,terminal,conflict,shared}
mkdir -p src/stores
mkdir -p src/types
```

### STEP 4：.gitignore の更新

以下を `.gitignore` に追記（重複しないよう確認してから追加）：

```
src-tauri/target/
src-tauri/gen/
node_modules/
dist/
*.db
*.db-shm
*.db-wal
.env
.env.local
```

### STEP 5：初期コミット・push

```bash
git add .
git commit -m "chore: initial Tauri v2 project setup"
git push origin main
```

---

## 実装フェーズ

セットアップ完了後は Phase 1 の実装に入る。

```
Phase 1（現在）: プロジェクト管理・設計書エディタ・Issue 管理
Phase 2:         PR 管理・GitHub 同期強化
Phase 3:         セマンティック検索・ベクトル検索
Phase 4:         Claude Code Terminal・PR Design Docs タブ
Phase 5:         通知・ポーリング
```

**Phase 1 の実装は `docs/phase1-schedule.md` のタスク T-I01 から順に進める。**

---

## 設計書インデックス

`docs/` 以下の設計書を実装タスクに応じて参照すること。
設計書は**参照専用・編集しない**。

### 全体把握（必ず最初に読む）

| ファイル | 内容 |
|---------|------|
| `docs/user-scenarios.md` | ユーザーシナリオ S-01〜S-11 |
| `docs/phase1-schedule.md` | Phase 1 タスク一覧・実装順序 |
| `docs/rust-modules.md` | Rust モジュール構成・各ファイルの責務 |

### Rust バックエンド実装時

| ファイル | 参照タイミング |
|---------|--------------|
| `docs/commands-v4.docx` | コマンドハンドラ実装時（pandoc で読む） |
| `docs/db-schema.md` | DB・マイグレーション実装時 |
| `docs/error-handling.md` | エラー処理実装時 |
| `docs/github-api.md` | GitHub API 呼び出し実装時 |

### フロントエンド実装時

| ファイル | 参照タイミング |
|---------|--------------|
| `docs/store-design-v4.md` | ストア実装時 |
| `docs/component-design.md` | コンポーネント実装時 |

### 画面別詳細仕様

| ファイル | 対象画面 | Phase |
|---------|---------|-------|
| `docs/detail-setup.md` | SetupScreen | 1 |
| `docs/detail-editor.md` | EditorScreen | 1 |
| `docs/detail-issues.md` | IssuesScreen + AI Wizard | 1 |
| `docs/detail-settings.md` | SettingsScreen | 1 |
| `docs/detail-terminal.md` | TerminalScreen | 4 |
| `docs/detail-pr.md` | PRScreen | 2/4 |
| `docs/detail-conflict.md` | ConflictScreen | 4 |
| `docs/detail-search.md` | SearchScreen | 3 |
| `docs/detail-notifications.md` | NotificationsScreen | 5 |

### docx 設計書の読み方

```bash
# pandoc がない場合
brew install pandoc

# docx を markdown として読む
pandoc docs/commands-v4.docx -t markdown | less
```

---

## 重要な設計方針

### Rust バックエンド

- 全コマンドの戻り値は `Result<T, AppError>` に統一（`src-tauri/src/error.rs`）
- DB 接続は `AppState.db`（sqlx `SqlitePool`）を `tauri::State<AppState>` 経由で受け取る
- コマンド登録は `src-tauri/src/commands/mod.rs` の `all_commands!` マクロに追記する
- マイグレーションは `sqlx::migrate!("../migrations")` を使用
- git 操作は `services/git.rs`（git2-rs ラッパー）経由
- GitHub API 呼び出しは `services/github.rs` 経由

### フロントエンド

- コンポーネントから Tauri IPC を**直接呼ばない**。必ずストア経由
- 画面遷移は `uiStore.navigate()` を使用
- 非同期状態は `'idle' | 'loading' | 'success' | 'error'` で統一
- エラーは `catch (e) { const err = e as AppError }` でハンドリング

### 廃止済み（実装しない）

| 項目 | 理由 |
|------|------|
| `aiEditStore` | ai_edit_branches テーブル廃止により不要 |
| `SyncDiffScreen` | PRScreen の Design Docs タブに統合済み |
| `AiEditBanner` / `AiEditBannerRight` | EditorScreen から削除済み |
| `branch_id: i64`（pr_create_from_branch の引数） | `branch_name: String` に変更済み |
| `ai_edit_branch_*` コマンド群 | v4.0 で廃止 |

---

## コミット方針

- タスク単位でコミットする（1タスク = 1コミット が目安）
- コミットメッセージ形式：`{type}({scope}): {内容}`
  - 例：`feat(db): add migration 0001 initial schema`
  - 例：`feat(rust): implement project_create command`
  - 例：`feat(ui): add SetupScreen component`
- タスク完了のたびに push する

---

## push 前に CI と同様のテストを実行する

push する前に以下のコマンドで CI と同等のチェックを手元で実行できる。

### フロントエンド（TypeScript + Vitest）

```bash
# 型チェック
npx tsc --noEmit

# ユニットテスト
npx vitest run

# ビルド確認
npm run build
```

### Rust（cargo test + clippy）

```bash
cd src-tauri

# テスト
cargo test

# Clippy（CI と同じ設定）
cargo clippy -- -D warnings

# 戻る
cd ..
```

### E2E テスト（Playwright）

```bash
npx playwright test
```

> **注意**: `data-testid` を変更・追加・削除したときは同じコミットで E2E テストも更新すること。

### まとめて実行（push 前の一括チェック）

```bash
npx tsc --noEmit && npx vitest run && npm run build && (cd src-tauri && cargo test && cargo clippy -- -D warnings)
```

---

## 実装ルール（過去の失敗から）

### Rust DB テストは connect_for_test を使う

```rust
use crate::db::{connect_for_test as connect, migrations};
```

`connect`（`max_connections(5)`）は WAL モードで書き込みと読み取りが別接続になり、INSERT 直後の SELECT が NotFound になる。

### data-testid を変更したら E2E も同時更新

`data-testid` の追加・変更・削除は必ず `e2e/scenarios/` の対応テストを同一コミットで更新する。

### props のデストラクチャリング漏れに注意

TypeScript の props 型に新フィールドを追加したら、コンポーネント関数のデストラクチャリングにも必ず追加する（型エラーが出ないため見落としやすい）。

---

## エラー対応方針

- `cargo build` エラーは自分で読んで修正する
- `npm install` の依存エラーはバージョン調整して再試行する
- 設計書に記載のない細部は設計方針に沿って自分で判断する
- どうしても判断できない場合のみ人間に報告する
