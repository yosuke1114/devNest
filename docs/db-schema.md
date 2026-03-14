---
title: "データベーススキーマ設計"
doc_type: architecture
version: "1.0.0"
last_synced_commit: null
status: current
mapping:
  sources:
    - path: "src-tauri/src/db/"
      scope: directory
      description: "DB アクセス層"
    - path: "src-tauri/migrations/"
      scope: directory
      description: "マイグレーションファイル"
tags: [database, sqlite, schema]
---

# DevNest — DB スキーマ詳細設計書

**バージョン**: 2.0
**作成日**: 2026-03-07
**改訂日**: 2026-03-08（要件変更対応）
**対象**: SQLite + sqlite-vec（Tauri v2 / Rust バックエンド）
**前提資料**: データモデル設計書 v3.0 / Rust コマンド定義書 v4.0（予定） / ストア設計書 v4.0
**変更履歴**: v1.0 → v2.0：ai_edit_branches・ai_edit_branch_docs テーブル廃止。projects.ai_branch_policy カラム廃止。terminal_sessions の branch_id カラム廃止・has_doc_changes 追加。

---

## 1. 設計方針

### 1.1 DB 構成

| 項目 | 内容 |
|------|------|
| エンジン | SQLite 3.45+ |
| ファイルパス | `{app_data_dir}/devnest.db` |
| ベクトル拡張 | sqlite-vec（document_chunks の embedding 検索） |
| 接続設定 | WAL モード・`PRAGMA foreign_keys = ON`・`PRAGMA journal_mode = WAL` |
| 文字コード | UTF-8 固定 |
| 日時形式 | ISO8601 UTC 文字列（`2026-03-07T12:00:00Z`）。`created_at` / `updated_at` は Rust 側で自動セット |

### 1.2 命名規則

| 種別 | 規則 | 例 |
|------|------|----|
| テーブル | snake_case 複数形 | `projects`, `pull_requests` |
| カラム | snake_case | `github_number`, `is_dirty` |
| PK | `id INTEGER PRIMARY KEY AUTOINCREMENT` | — |
| FK | `{参照テーブル単数形}_id` | `project_id`, `document_id` |
| bool | `INTEGER NOT NULL DEFAULT 0`（0/1） | `is_dirty`, `is_read` |
| enum | `TEXT CHECK(col IN (...))` | `status TEXT CHECK(status IN ('open','closed'))` |
| 部分インデックス | `CREATE INDEX ... WHERE condition` | pending 件数の絞り込み |

### 1.3 テーブル一覧

| # | テーブル | 実装フェーズ | 概要 |
|---|---------|------------|------|
| 1 | `projects` | Phase 1 | プロジェクト設定 |
| 2 | `documents` | Phase 1 | 設計書ファイルメタデータ |
| 3 | `issues` | Phase 1 | GitHub Issue キャッシュ |
| 4 | `issue_doc_links` | Phase 1 | Issue ↔ 設計書リンク |
| 5 | `issue_drafts` | Phase 1 | Issue AI ドラフト |
| 6 | `sync_logs` | Phase 1 | git 操作ログ |
| 7 | `app_settings` | Phase 1 | アプリ全体設定（KV） |
| 8 | `pull_requests` | Phase 2 | GitHub PR キャッシュ |
| 9 | `pr_reviews` | Phase 2 | PR レビュー |
| 10 | `pr_comments` | Phase 2 | PR コメント |
| 11 | `document_chunks` | Phase 3 | 設計書チャンク（セマンティック検索） |
| ~~12~~ | ~~`ai_edit_branches`~~ | ~~Phase 4~~ | **廃止（v2.0）** AI 編集ブランチ（同一ブランチ運用に変更のため不要） |
| ~~13~~ | ~~`ai_edit_branch_docs`~~ | ~~Phase 4~~ | **廃止（v2.0）** AI 編集ブランチ × 設計書 |
| 14 | `terminal_sessions` | Phase 4 | Claude Code PTY セッション |
| 15 | `conflict_files` | Phase 4 | git コンフリクト状態 |
| 16 | `notifications` | Phase 5 | アプリ内通知 |
| 17 | `search_history` | Phase 5 | 検索クエリ履歴 |

---

## 2. テーブル定義

---

### 2.1 projects

プロジェクト（リポジトリ）の設定情報。

```sql
CREATE TABLE projects (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  name                      TEXT    NOT NULL,
  repo_owner                TEXT    NOT NULL,
  repo_name                 TEXT    NOT NULL,
  local_path                TEXT    NOT NULL UNIQUE,
  default_branch            TEXT    NOT NULL DEFAULT 'main',
  docs_root                 TEXT    NOT NULL DEFAULT 'docs/',
  sync_mode                 TEXT    NOT NULL DEFAULT 'auto'
                              CHECK(sync_mode IN ('auto', 'manual')),
  debounce_ms               INTEGER NOT NULL DEFAULT 1000,
  commit_msg_format         TEXT    NOT NULL DEFAULT 'docs: {filename} を更新',
  -- ★ v2.0 廃止: ai_branch_policy（'separate' / 'direct'）→ 常に同一ブランチ運用に統一
  -- ★ v2.0 廃止: auto_delete_ai_branch
  remote_poll_interval_min  INTEGER NOT NULL DEFAULT 5,
  github_installation_id    TEXT    NULLABLE,
  last_opened_document_id   INTEGER NULLABLE REFERENCES documents(id) ON DELETE SET NULL,
  last_synced_at            TEXT    NULLABLE,
  created_at                TEXT    NOT NULL,
  updated_at                TEXT    NOT NULL
);
```

**注記**
- `last_opened_document_id` は FK だが循環参照を避けるため `DEFERRABLE` は使わない。`documents` 削除時に `SET NULL`。
- `github_installation_id` は GitHub App 対応の将来拡張用。現時点では常に NULL。
- `sync_mode = 'auto'` の場合、保存イベントをトリガーに自動コミット・プッシュを実行する。

---

### 2.2 documents

設計書ファイルのメタデータ。ファイル内容本体はローカル fs から読む（DB には格納しない）。

```sql
CREATE TABLE documents (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path              TEXT    NOT NULL,
  title             TEXT    NULLABLE,
  sha               TEXT    NULLABLE,
  size_bytes        INTEGER NULLABLE,
  embedding_status  TEXT    NOT NULL DEFAULT 'pending'
                      CHECK(embedding_status IN ('pending','indexed','stale','error','conflict')),
  push_status       TEXT    NOT NULL DEFAULT 'synced'
                      CHECK(push_status IN ('synced','pending_push','push_failed')),
  is_dirty          INTEGER NOT NULL DEFAULT 0,
  last_indexed_at   TEXT    NULLABLE,
  last_synced_at    TEXT    NULLABLE,
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,

  UNIQUE(project_id, path)
);
```

**ステータス遷移**

```
embedding_status:
  pending ──(index_build)──▶ indexed
  indexed ──(sha変化検知)──▶ stale
  stale   ──(index_build)──▶ indexed
  *       ──(conflict検知)──▶ conflict
  conflict──(解消後)──────▶ stale → indexed

push_status:
  synced       ──(編集検知)──▶ pending_push
  pending_push ──(push成功)──▶ synced
  pending_push ──(push失敗×3)▶ push_failed
  push_failed  ──(手動retry)──▶ pending_push
```

**注記**
- `sha` は git blob SHA。`document_scan` 実行時に git ツリーと比較して `stale` を検知する。
- `is_dirty = 1` は再起動後の未保存ファイル復元用。通常フローでは保存完了時に `0` に戻す。
- `embedding_status = 'conflict'` はコンフリクト中の誤インデックスを防ぐため設定する。

---

### 2.3 issues

GitHub Issue のローカルキャッシュ。GitHub を正とし、READ 専用でキャッシュする。

```sql
CREATE TABLE issues (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_number   INTEGER NOT NULL,
  github_id       INTEGER NOT NULL UNIQUE,
  title           TEXT    NOT NULL,
  body            TEXT    NULLABLE,
  status          TEXT    NOT NULL
                    CHECK(status IN ('open','in_progress','closed')),
  author_login    TEXT    NOT NULL,
  assignee_login  TEXT    NULLABLE,
  labels          TEXT    NOT NULL DEFAULT '[]',  -- JSON 配列
  milestone       TEXT    NULLABLE,
  linked_pr_number INTEGER NULLABLE,
  created_by      TEXT    NOT NULL DEFAULT 'user'
                    CHECK(created_by IN ('user','ai_wizard')),
  github_created_at TEXT  NOT NULL,
  github_updated_at TEXT  NOT NULL,
  synced_at       TEXT    NOT NULL,

  UNIQUE(project_id, github_number)
);
```

**注記**
- `labels` は GitHub API の配列をそのまま JSON 文字列で保存。フロントで `JSON.parse` する。
- `status = 'in_progress'` は `linked_pr_number IS NOT NULL` のケースで Rust 側が自動セット。
- ライフサイクル: `status='closed'` かつ `github_updated_at` から 90 日後に削除。関連する `issue_doc_links` は CASCADE 削除。

---

### 2.4 issue_doc_links

Issue と設計書の多対多リンク。

```sql
CREATE TABLE issue_doc_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id    INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  link_type   TEXT    NOT NULL DEFAULT 'manual'
                CHECK(link_type IN ('manual','ai_suggested','ai_confirmed','user_rejected')),
  created_by  TEXT    NOT NULL
                CHECK(created_by IN ('user','ai')),
  created_at  TEXT    NOT NULL,

  UNIQUE(issue_id, document_id)
);
```

**link_type の意味**

| 値 | 意味 |
|----|------|
| `manual` | ユーザーが手動でリンク |
| `ai_suggested` | AI がサジェスト（未確認） |
| `ai_confirmed` | AI サジェストをユーザーが確認 |
| `user_rejected` | ユーザーが削除（再サジェスト防止用。DELETE はしない） |

**注記**
- AI が `ai_suggested` を再提案する際、既に `manual` リンクが存在する場合は `INSERT OR IGNORE` でスキップ。
- `manual` → `ai_confirmed` への自動昇格は行わない。

---

### 2.5 issue_drafts

GitHub API 送信前の Issue ドラフト。AI Wizard の中断・再開をサポートする。

```sql
CREATE TABLE issue_drafts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title            TEXT    NOT NULL DEFAULT '',
  body             TEXT    NOT NULL DEFAULT '',
  draft_body       TEXT    NULLABLE,  -- streaming 中断時の保存領域
  wizard_context   TEXT    NULLABLE,  -- JSON: {chunks:[{document_id,chunk_id,score}]}
  labels           TEXT    NOT NULL DEFAULT '[]',  -- JSON 配列
  assignee_login   TEXT    NULLABLE,
  status           TEXT    NOT NULL DEFAULT 'draft'
                     CHECK(status IN ('draft','submitting','submitted','failed')),
  github_issue_id  INTEGER NULLABLE,  -- 送信成功後に issues.github_id を格納
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);
```

**注記**
- `draft_body` は streaming 途中で STOP ボタンを押した場合にリアルタイム UPDATE する。
- `status = 'submitted'` かつ `github_issue_id IS NOT NULL` のレコードは 24 時間後に削除。
- `status = 'failed'` のレコードはユーザーが明示的に削除するまで保持。

---

### 2.6 sync_logs

git 操作（commit・push・pull・conflict）のログ。StatusBar 表示と Sync/Diff 画面の「YOUR EDITS」に使用。

```sql
CREATE TABLE sync_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operation     TEXT    NOT NULL
                  CHECK(operation IN ('push','pull','commit','conflict_detect','conflict_resolve')),
  status        TEXT    NOT NULL
                  CHECK(status IN ('success','failure','conflict','retry')),
  commit_sha    TEXT    NULLABLE,
  branch        TEXT    NULLABLE,
  file_path     TEXT    NULLABLE,  -- 対象ファイル（1操作1ファイルの場合に格納）
  retry_count   INTEGER NOT NULL DEFAULT 0,
  error_message TEXT    NULLABLE,
  created_at    TEXT    NOT NULL
);
```

**注記**
- `push` 失敗時は `status='retry'`・`retry_count++`。3 回目失敗で `status='failure'`。
- 古いレコードは `created_at` から 30 日後に削除（起動時クリーンアップ）。
- `file_path` は NULL の場合あり（プロジェクト全体に関わる pull 操作など）。

---

### 2.7 app_settings

アプリ全体のキーバリュー設定ストア。

```sql
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,  -- JSON または 文字列
  updated_at TEXT NOT NULL
);
```

**既定キー一覧**

| キー | 型 | デフォルト | 説明 |
|------|----|----------|------|
| `app.theme` | string | `'system'` | `'light'` \| `'dark'` \| `'system'` |
| `app.notif_granted` | string | `'skipped'` | `'granted'` \| `'denied'` \| `'skipped'` |
| `app.last_project_id` | number \| null | `null` | 最後に開いていたプロジェクト ID |
| `app.onboarding_done` | bool | `false` | オンボーディング完了フラグ |
| `app.telemetry_opt_in` | bool | `false` | テレメトリ同意フラグ（将来拡張） |

---

### 2.8 pull_requests

GitHub PR のローカルキャッシュ。

```sql
CREATE TABLE pull_requests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_number    INTEGER NOT NULL,
  github_id        INTEGER NOT NULL UNIQUE,
  title            TEXT    NOT NULL,
  body             TEXT    NULLABLE,
  status           TEXT    NOT NULL
                     CHECK(status IN ('open','draft','merged','closed')),
  head_branch      TEXT    NOT NULL,
  base_branch      TEXT    NOT NULL DEFAULT 'main',
  linked_issue_number INTEGER NULLABLE,
  checks_status    TEXT    NULLABLE
                     CHECK(checks_status IN ('pending','passing','failing') OR checks_status IS NULL),
  created_by       TEXT    NOT NULL DEFAULT 'user'
                     CHECK(created_by IN ('user','claude_code')),
  merged_at        TEXT    NULLABLE,
  github_created_at TEXT   NOT NULL,
  github_updated_at TEXT   NOT NULL,
  synced_at        TEXT    NOT NULL,

  UNIQUE(project_id, github_number)
);
```

**注記**
- ライフサイクル: `status IN ('merged','closed')` かつ `github_updated_at` から 90 日後に削除。関連する `pr_reviews`・`pr_comments` は CASCADE 削除。
- `checks_status` は CI/CD の最新状態。polling 時に更新。`canMerge()` はこのフィールドを参照。

---

### 2.9 pr_reviews

PR レビュー（Approve / RequestChanges）。GitHub API への送信補償用に `submit_status` を持つ。

```sql
CREATE TABLE pr_reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id         INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  github_id     INTEGER NOT NULL UNIQUE,
  reviewer_login TEXT   NOT NULL,
  state         TEXT    NOT NULL
                  CHECK(state IN ('pending','approved','changes_requested','dismissed')),
  submit_status TEXT    NOT NULL DEFAULT 'submitted'
                  CHECK(submit_status IN ('pending_submit','submitted')),
  body          TEXT    NULLABLE,
  submitted_at  TEXT    NULLABLE,
  synced_at     TEXT    NOT NULL
);
```

**注記**
- 起動時クリーンアップ: `submit_status='pending_submit' AND github_id IS NULL` のレコードを DELETE する（送信失敗レコードの除去）。

---

### 2.10 pr_comments

PR のインラインコメント・レビューコメント・Issue コメント。

```sql
CREATE TABLE pr_comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id         INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  github_id     INTEGER NULLABLE UNIQUE,  -- API 送信前は NULL
  comment_type  TEXT    NOT NULL
                  CHECK(comment_type IN ('inline','review','issue_comment')),
  author_login  TEXT    NOT NULL,
  body          TEXT    NOT NULL,
  path          TEXT    NULLABLE,       -- inline のみ
  diff_hunk     TEXT    NULLABLE,       -- inline のみ
  line          INTEGER NULLABLE,       -- inline のみ
  resolved      INTEGER NOT NULL DEFAULT 0,
  is_pending    INTEGER NOT NULL DEFAULT 0,  -- GitHub API 送信待ち
  in_reply_to_id INTEGER NULLABLE,          -- スレッド返信
  created_at    TEXT    NOT NULL,
  synced_at     TEXT    NOT NULL
);
```

**注記**
- `is_pending = 1` のコメントはフロント側で ⚠ アイコンを表示し、ユーザーに送信待ちを示す。
- `github_id IS NULL AND is_pending = 1` のレコードは次回 polling 時に再送を試みる。

---

### 2.11 document_chunks

設計書をセマンティック検索用に分割したチャンク。sqlite-vec の仮想テーブルと組み合わせる。

```sql
CREATE TABLE document_chunks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  section_heading TEXT    NULLABLE,
  content         TEXT    NOT NULL,
  start_line      INTEGER NOT NULL,
  end_line        INTEGER NOT NULL,
  token_count     INTEGER NULLABLE,
  created_at      TEXT    NOT NULL,

  UNIQUE(document_id, chunk_index)
);

-- sqlite-vec 仮想テーブル（embedding ベクトル格納）
-- dimension は claude-haiku の embedding 次元数に合わせる（1536）
CREATE VIRTUAL TABLE chunk_embeddings USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[1536]
);
```

**chunk_embeddings との結合クエリ例**

```sql
-- セマンティック検索（上位 5 件）
SELECT dc.id, dc.document_id, dc.content, dc.start_line,
       vec_distance_cosine(ce.embedding, :query_vec) AS score
FROM chunk_embeddings ce
JOIN document_chunks dc ON dc.id = ce.chunk_id
JOIN documents d ON d.id = dc.document_id
WHERE d.project_id = :project_id
ORDER BY score ASC
LIMIT 5;
```

**注記**
- `document_chunks` レコード削除時、`chunk_embeddings` も一緒に削除する（Rust 側で明示的に DELETE）。sqlite-vec は CASCADE DELETE に非対応のため。
- `index_build` 時は `document_chunks` を全削除してから再 INSERT する（REPLACE INTO は使わない）。

---

---

### 2.12 ai_edit_branches — **廃止（v2.0）**

> Claude Code が `feat/{issue-id}-xxx` 同一ブランチにコードと設計書を両方コミットする運用に変更したため、別ブランチ方式（`ai-edit/xxx`）を管理するこのテーブルは不要になった。Migration `0004_ai_terminal_conflict.sql` にはこのテーブルを含めない。

---

### 2.13 ai_edit_branch_docs — **廃止（v2.0）**

> 同上。`ai_edit_branches` 廃止にともない削除。

---

### 2.14 terminal_sessions

Claude Code PTY セッションのログ記録。

```sql
CREATE TABLE terminal_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- ★ v2.0 廃止: branch_id（ai_edit_branches テーブル廃止のため）
  branch_name    TEXT    NULLABLE,     -- Claude Code が作成したブランチ名（完了後に確定）
  has_doc_changes INTEGER NOT NULL DEFAULT 0,  -- ★ v2.0 追加：.md ファイルの変更を含むか
  prompt_summary TEXT    NULLABLE,
  output_log     TEXT    NULLABLE,     -- PTY stdout/stderr 全文
  exit_code      INTEGER NULLABLE,     -- 実行中は NULL
  status         TEXT    NOT NULL DEFAULT 'running'
                   CHECK(status IN ('running','completed','failed','aborted')),
  started_at     TEXT    NOT NULL,
  ended_at       TEXT    NULLABLE
);
```

**注記**
- `output_log` は xterm.js の描画バッファとは独立して DB に全文保存する。最大サイズは 10MB（Rust 側で切り詰め）。
- `has_doc_changes` は `terminal_done` 時に `changed_files` に `.md` が含まれるかを Rust 側で判定して INSERT する。
- セッション履歴は `started_at` から 30 日後に削除（起動時クリーンアップ）。

---

### 2.15 conflict_files

git コンフリクトの状態と解消内容を記録する。

```sql
CREATE TABLE conflict_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sync_log_id   INTEGER NOT NULL REFERENCES sync_logs(id),
  document_id   INTEGER NULLABLE REFERENCES documents(id) ON DELETE SET NULL,
  file_path     TEXT    NOT NULL,
  is_managed    INTEGER NOT NULL DEFAULT 0,  -- docs/ 配下 = 1
  our_content   TEXT    NULLABLE,   -- is_managed=1 のみ保存。解消後7日でNULLクリア
  their_content TEXT    NULLABLE,   -- is_managed=1 のみ保存。解消後7日でNULLクリア
  merged_content TEXT   NULLABLE,   -- resolution='manual' 時に格納
  resolution    TEXT    NULLABLE
                  CHECK(resolution IN ('ours','theirs','manual','terminal') OR resolution IS NULL),
  resolved_at   TEXT    NULLABLE,
  created_at    TEXT    NOT NULL
);
```

**注記**
- `is_managed = 0`（docs/ 外）のファイルは `our_content` / `their_content` を保存しない。Terminal で解消する。
- `resolved_at IS NOT NULL` かつ 7 日経過後に `our_content`・`their_content`・`merged_content` を NULL クリア（定期クリーンアップ）。
- `resolution = 'terminal'` は Terminal セッション内で Claude Code が解消したケース。

---

### 2.16 notifications

アプリ内通知とOS通知の既読管理。

```sql
CREATE TABLE notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type   TEXT    NOT NULL
                 CHECK(event_type IN ('ci_pass','ci_fail','pr_comment','pr_opened','issue_assigned','conflict','ai_edit')),
  title        TEXT    NOT NULL,
  body         TEXT    NULLABLE,
  dest_screen  TEXT    NULLABLE,     -- 遷移先画面 ID
  dest_resource_id INTEGER NULLABLE, -- 遷移先リソース ID（PR id, Issue id 等）
  is_read      INTEGER NOT NULL DEFAULT 0,
  os_notified  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);
```

**注記**
- `os_notified = 0` かつ `app.notif_granted = 'granted'` のレコードを起動時に一括 OS 通知する（バックグラウンド中に溜まった通知の復元）。
- 通知は `created_at` から 90 日後に削除（起動時クリーンアップ）。

---

### 2.17 search_history

検索クエリの履歴。サジェスト表示に使用する。

```sql
CREATE TABLE search_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  query        TEXT    NOT NULL,
  search_type  TEXT    NOT NULL
                 CHECK(search_type IN ('keyword','semantic','both')),
  result_count INTEGER NULLABLE,
  created_at   TEXT    NOT NULL
);
```

**注記**
- 同一 `(project_id, query)` の重複は INSERT 時に古いレコードを DELETE してから INSERT する（LIFO）。
- 履歴は最新 50 件を保持し、それ以外は削除する。

---

## 3. インデックス定義

```sql
-- 2.2 documents
CREATE INDEX idx_documents_project_path
  ON documents(project_id, path);           -- ファイルツリー表示・パス検索

CREATE INDEX idx_documents_embedding_status
  ON documents(embedding_status)
  WHERE embedding_status IN ('pending', 'stale');  -- インデックス待ちバッチ処理

-- 2.3 issues
CREATE INDEX idx_issues_project_status
  ON issues(project_id, status);            -- ステータスフィルタ一覧表示

CREATE INDEX idx_issues_github_number
  ON issues(project_id, github_number);     -- #番号による Issue 検索

-- 2.4 issue_doc_links
CREATE INDEX idx_issue_doc_links_issue
  ON issue_doc_links(issue_id);             -- Issue の紐づき設計書一覧

CREATE INDEX idx_issue_doc_links_document
  ON issue_doc_links(document_id);          -- 設計書から参照 Issue 一覧（逆引き）

-- 2.8 pull_requests
CREATE INDEX idx_prs_project_status
  ON pull_requests(project_id, status);     -- PR 一覧・フィルタ

CREATE INDEX idx_prs_github_number
  ON pull_requests(project_id, github_number);  -- github_number 解決（SS2-S11-01対応）

-- 2.9 pr_reviews
CREATE INDEX idx_pr_reviews_pr
  ON pr_reviews(pr_id);

-- 2.10 pr_comments
CREATE INDEX idx_pr_comments_pr_path_line
  ON pr_comments(pr_id, path, line);        -- PR diff インラインコメント表示

-- 2.11 document_chunks
CREATE INDEX idx_chunks_document
  ON document_chunks(document_id, chunk_index);  -- ファイル単位のチャンク取得

-- ★ v2.0 廃止: 2.12 ai_edit_branches インデックス（テーブル廃止）
-- ★ v2.0 廃止: 2.13 ai_edit_branch_docs インデックス（テーブル廃止）

-- 2.14 terminal_sessions
CREATE INDEX idx_terminal_sessions_project
  ON terminal_sessions(project_id, started_at DESC);  -- プロジェクト別セッション履歴

-- 2.15 conflict_files
CREATE INDEX idx_conflict_files_project_unresolved
  ON conflict_files(project_id, resolved_at, is_managed);  -- 未解消コンフリクト一覧

-- 2.16 notifications
CREATE INDEX idx_notifications_project_unread
  ON notifications(project_id, is_read, created_at DESC)
  WHERE is_read = 0;                        -- 未読通知バッジカウント

-- 2.17 search_history
CREATE INDEX idx_search_history_project
  ON search_history(project_id, created_at DESC);  -- 最新履歴サジェスト
```

---

## 4. マイグレーション設計

### 4.1 方針

- マイグレーションは Rust の `sqlx::migrate!` マクロを使用する（`migrations/` ディレクトリ）。
- ファイル名規則: `{version}_{description}.sql`（例: `0001_initial.sql`）
- バージョンは 4 桁の連番。後退（rollback）は原則サポートしない。
- スキーマバージョンは `sqlx_migrations` テーブルで管理する（sqlx デフォルト）。

### 4.2 マイグレーション一覧

| バージョン | ファイル名 | 内容 | フェーズ |
|-----------|----------|------|---------|
| 0001 | `0001_initial.sql` | Phase 1 テーブル全件作成 | Phase 1 |
| 0002 | `0002_pull_requests.sql` | `pull_requests`・`pr_reviews`・`pr_comments` 追加 | Phase 2 |
| 0003 | `0003_document_chunks.sql` | `document_chunks`・`chunk_embeddings` 追加 | Phase 3 |
| 0004 | `0004_ai_terminal_conflict.sql` | ~~`ai_edit_branches`・`ai_edit_branch_docs`~~・`terminal_sessions`・`conflict_files` 追加（**v2.0: ai_edit_branches・ai_edit_branch_docs を除外**） | Phase 4 |
| 0005 | `0005_notifications_search.sql` | `notifications`・`search_history` 追加 | Phase 5 |

### 4.3 0001_initial.sql（抜粋）

```sql
-- WAL モード・外部キー有効化（接続時に毎回 PRAGMA で設定するため migration には含めない）

CREATE TABLE projects ( ... );  -- 2.1 参照
CREATE TABLE documents ( ... );  -- 2.2 参照
CREATE TABLE issues ( ... );     -- 2.3 参照
CREATE TABLE issue_doc_links ( ... );  -- 2.4 参照
CREATE TABLE issue_drafts ( ... );     -- 2.5 参照
CREATE TABLE sync_logs ( ... );        -- 2.6 参照
CREATE TABLE app_settings ( ... );     -- 2.7 参照

-- インデックス（Phase 1 対象のみ）
CREATE INDEX idx_documents_project_path ON documents(project_id, path);
CREATE INDEX idx_documents_embedding_status ON documents(embedding_status)
  WHERE embedding_status IN ('pending', 'stale');
CREATE INDEX idx_issues_project_status ON issues(project_id, status);
CREATE INDEX idx_issues_github_number ON issues(project_id, github_number);
CREATE INDEX idx_issue_doc_links_issue ON issue_doc_links(issue_id);
CREATE INDEX idx_issue_doc_links_document ON issue_doc_links(document_id);

-- 初期設定
INSERT INTO app_settings(key, value, updated_at) VALUES
  ('app.theme',           '"system"', datetime('now')),
  ('app.notif_granted',   '"skipped"', datetime('now')),
  ('app.last_project_id', 'null', datetime('now')),
  ('app.onboarding_done', 'false', datetime('now'));
```

### 4.4 起動時クリーンアップ処理

アプリ起動時（`main.rs` の初期化フェーズ）に以下を実行する。

```sql
-- ① 孤立した pending_submit レビューの削除（SS-09）
DELETE FROM pr_reviews
WHERE submit_status = 'pending_submit' AND github_id IS NULL;

-- ② 古い sync_logs の削除（30日）
DELETE FROM sync_logs
WHERE created_at < datetime('now', '-30 days');

-- ③ 古い terminal_sessions の削除（30日）
DELETE FROM terminal_sessions
WHERE started_at < datetime('now', '-30 days');

-- ④ 解消済み conflict_files のコンテンツ NULL クリア（7日）
UPDATE conflict_files
SET our_content = NULL, their_content = NULL, merged_content = NULL
WHERE resolved_at IS NOT NULL
  AND resolved_at < datetime('now', '-7 days')
  AND (our_content IS NOT NULL OR their_content IS NOT NULL OR merged_content IS NOT NULL);

-- ⑤ ★ v2.0 廃止: ai_edit_branches の diff_content NULL クリア（テーブル廃止）

-- ⑥ 古い issues の削除（closed から 90日）
DELETE FROM issues
WHERE status = 'closed'
  AND github_updated_at < datetime('now', '-90 days');

-- ⑦ 古い pull_requests の削除（merged/closed から 90日）
DELETE FROM pull_requests
WHERE status IN ('merged', 'closed')
  AND github_updated_at < datetime('now', '-90 days');

-- ⑧ 古い notifications の削除（90日）
DELETE FROM notifications
WHERE created_at < datetime('now', '-90 days');

-- ⑨ search_history を最新 50 件に切り詰め（プロジェクトごと）
DELETE FROM search_history
WHERE id NOT IN (
  SELECT id FROM search_history
  WHERE project_id = search_history.project_id
  ORDER BY created_at DESC
  LIMIT 50
);
```

---

## 5. 主要クエリパターン

### 5.1 設計書ツリー取得

```sql
-- project_id に属する全設計書をパス順で取得
SELECT id, path, title, sha, embedding_status, push_status, is_dirty
FROM documents
WHERE project_id = ?
ORDER BY path ASC;
```

### 5.2 プロジェクトステータス取得（project_get_status）

```sql
SELECT
  (SELECT COUNT(*) FROM documents WHERE project_id = ? AND push_status = 'pending_push') AS pending_push_count,
  (SELECT COUNT(*) FROM documents WHERE project_id = ? AND is_dirty = 1)                AS dirty_count,
  (SELECT COUNT(*) FROM conflict_files WHERE project_id = ? AND resolved_at IS NULL)    AS unresolved_conflict_count;
  -- ★ v2.0 削除: pending_ai_review_count（ai_edit_branches テーブル廃止）
```

### 5.3 Issue + Doc Links 取得（issue_doc_link_list）

```sql
SELECT idl.id, idl.issue_id, idl.document_id, idl.link_type, idl.created_by,
       d.path, d.title
FROM issue_doc_links idl
JOIN documents d ON d.id = idl.document_id
WHERE idl.issue_id = ?
  AND idl.link_type != 'user_rejected'
ORDER BY idl.created_at ASC;
```

### 5.4 未解消コンフリクト一覧（conflict_list）

```sql
SELECT cf.id, cf.file_path, cf.is_managed, cf.resolution, cf.created_at,
       d.id AS document_id, d.title AS document_title
FROM conflict_files cf
LEFT JOIN documents d ON d.id = cf.document_id
WHERE cf.project_id = ?
  AND cf.resolved_at IS NULL
ORDER BY cf.is_managed DESC, cf.file_path ASC;
-- is_managed=1（docs配下）を先に表示
```

### 5.5 notification_navigate 用クエリ

```sql
-- dest_resource_id が pull_requests の github_number の場合に DB id を解決
SELECT id FROM pull_requests
WHERE project_id = ? AND github_number = ?;
```

### 5.6 セマンティック検索（search_documents: semantic）

```sql
-- プリペアドステートメント（Rust側でvec_distance_cosineを使用）
SELECT
  dc.id        AS chunk_id,
  dc.document_id,
  dc.content,
  dc.start_line,
  dc.section_heading,
  d.path,
  vec_distance_cosine(ce.embedding, ?) AS score
FROM chunk_embeddings ce
JOIN document_chunks dc ON dc.id = ce.chunk_id
JOIN documents d ON d.id = dc.document_id
WHERE d.project_id = ?
  AND d.embedding_status = 'indexed'
ORDER BY score ASC
LIMIT 10;
```

---

## 6. ER 図（テキスト表現）

```
projects
  ├── documents (project_id)
  │     ├── document_chunks (document_id)
  │     │     └── [chunk_embeddings: vec0仮想テーブル]
  │     ├── issue_doc_links (document_id) ←─── issues (project_id)
  │     │                  (issue_id)  ─────┘
  │     └── ai_edit_branch_docs (document_id) ←─ ai_edit_branches (project_id)
  │                             (branch_id) ─────┘
  ├── issues (project_id)
  │     └── issue_drafts (project_id)
  ├── pull_requests (project_id)
  │     ├── pr_reviews (pr_id)
  │     └── pr_comments (pr_id)
  -- ★ v2.0 廃止: ai_edit_branches (project_id)
  ├── terminal_sessions (project_id)
  ├── conflict_files (project_id)
  │     └── [sync_log_id → sync_logs]
  ├── sync_logs (project_id)
  ├── notifications (project_id)
  └── search_history (project_id)

app_settings (standalone KV)
```

---

## 7. 付録：ストア設計との対応表

| ストア | 主に参照するテーブル |
|--------|-------------------|
| `projectStore` | `projects`, `app_settings` |
| `githubAuthStore` | `projects`（oauth token は Tauri Keychain に保存、DB には格納しない） |
| `documentStore` | `documents`, `sync_logs` |
| `issueStore` | `issues`, `issue_doc_links`, `issue_drafts` |
| `prStore` | `pull_requests`, `pr_reviews`, `pr_comments`（設計書 diff は GitHub API 経由で取得・非永続） |
| ~~`aiEditStore`~~ | **廃止（v2.0）** |
| `terminalStore` | `terminal_sessions` |
| `conflictStore` | `conflict_files`, `sync_logs` |
| `searchStore` | `document_chunks`, `chunk_embeddings`, `search_history` |
| `notificationStore` | `notifications` |
| `uiStore` | `app_settings`（theme・last_project_id 等） |

**セキュリティ注記**  
GitHub OAuth トークンは `app_settings` には格納しない。Tauri の `keyring` プラグイン（OS Keychain）に保存し、DB には一切残さない。
