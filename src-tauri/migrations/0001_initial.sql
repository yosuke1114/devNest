-- WAL モード・外部キーは接続時 PRAGMA で設定するため migration には含めない

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
  remote_poll_interval_min  INTEGER NOT NULL DEFAULT 5,
  github_installation_id    TEXT    NULLABLE,
  last_opened_document_id   INTEGER NULLABLE REFERENCES documents(id) ON DELETE SET NULL,
  last_synced_at            TEXT    NULLABLE,
  created_at                TEXT    NOT NULL,
  updated_at                TEXT    NOT NULL
);

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

CREATE TABLE issues (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_number    INTEGER NOT NULL,
  github_id        INTEGER NOT NULL UNIQUE,
  title            TEXT    NOT NULL,
  body             TEXT    NULLABLE,
  status           TEXT    NOT NULL
                     CHECK(status IN ('open','in_progress','closed')),
  author_login     TEXT    NOT NULL,
  assignee_login   TEXT    NULLABLE,
  labels           TEXT    NOT NULL DEFAULT '[]',
  milestone        TEXT    NULLABLE,
  linked_pr_number INTEGER NULLABLE,
  created_by       TEXT    NOT NULL DEFAULT 'user'
                     CHECK(created_by IN ('user','ai_wizard')),
  github_created_at TEXT   NOT NULL,
  github_updated_at TEXT   NOT NULL,
  synced_at        TEXT    NOT NULL,

  UNIQUE(project_id, github_number)
);

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

CREATE TABLE issue_drafts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title            TEXT    NOT NULL DEFAULT '',
  body             TEXT    NOT NULL DEFAULT '',
  draft_body       TEXT    NULLABLE,
  wizard_context   TEXT    NULLABLE,
  labels           TEXT    NOT NULL DEFAULT '[]',
  assignee_login   TEXT    NULLABLE,
  status           TEXT    NOT NULL DEFAULT 'draft'
                     CHECK(status IN ('draft','submitting','submitted','failed')),
  github_issue_id  INTEGER NULLABLE,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

CREATE TABLE sync_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operation     TEXT    NOT NULL
                  CHECK(operation IN ('push','pull','commit','conflict_detect','conflict_resolve')),
  status        TEXT    NOT NULL
                  CHECK(status IN ('success','failure','conflict','retry')),
  commit_sha    TEXT    NULLABLE,
  branch        TEXT    NULLABLE,
  file_path     TEXT    NULLABLE,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  error_message TEXT    NULLABLE,
  created_at    TEXT    NOT NULL
);

CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Phase 2 以降のテーブル（cleanup.rs で参照されるため stub として定義）
CREATE TABLE pr_reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id         INTEGER NOT NULL,
  github_id     INTEGER NULLABLE UNIQUE,
  reviewer_login TEXT   NOT NULL,
  state         TEXT    NOT NULL
                  CHECK(state IN ('pending','approved','changes_requested','dismissed')),
  submit_status TEXT    NOT NULL DEFAULT 'submitted'
                  CHECK(submit_status IN ('pending_submit','submitted')),
  body          TEXT    NULLABLE,
  submitted_at  TEXT    NULLABLE,
  synced_at     TEXT    NOT NULL
);

-- インデックス
CREATE INDEX idx_documents_project_path
  ON documents(project_id, path);

CREATE INDEX idx_documents_embedding_status
  ON documents(embedding_status)
  WHERE embedding_status IN ('pending', 'stale');

CREATE INDEX idx_issues_project_status
  ON issues(project_id, status);

CREATE INDEX idx_issues_github_number
  ON issues(project_id, github_number);

CREATE INDEX idx_issue_doc_links_issue
  ON issue_doc_links(issue_id);

CREATE INDEX idx_issue_doc_links_document
  ON issue_doc_links(document_id);

-- 初期設定
INSERT INTO app_settings(key, value, updated_at) VALUES
  ('app.theme',           '"system"',  datetime('now')),
  ('app.notif_granted',   '"skipped"', datetime('now')),
  ('app.last_project_id', 'null',      datetime('now')),
  ('app.onboarding_done', 'false',     datetime('now'));
