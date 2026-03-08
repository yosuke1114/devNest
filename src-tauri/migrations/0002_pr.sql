-- Phase 2: PR 管理テーブル
-- pr_reviews は 0001 で stub 定義済み → DROP して再定義
DROP TABLE IF EXISTS pr_reviews;

CREATE TABLE pull_requests (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_number       INTEGER NOT NULL,
  github_id           INTEGER NOT NULL UNIQUE,
  title               TEXT    NOT NULL,
  body                TEXT    NULLABLE,
  state               TEXT    NOT NULL
                        CHECK(state IN ('open','closed','merged')),
  head_branch         TEXT    NOT NULL,
  base_branch         TEXT    NOT NULL DEFAULT 'main',
  author_login        TEXT    NOT NULL,
  checks_status       TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(checks_status IN ('pending','passing','failing','unknown')),
  linked_issue_number INTEGER NULLABLE,
  draft               INTEGER NOT NULL DEFAULT 0,
  merged_at           TEXT    NULLABLE,
  github_created_at   TEXT    NOT NULL,
  github_updated_at   TEXT    NOT NULL,
  synced_at           TEXT    NOT NULL,

  UNIQUE(project_id, github_number)
);

CREATE TABLE pr_reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id           INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  github_id       INTEGER NULLABLE UNIQUE,
  reviewer_login  TEXT    NOT NULL,
  state           TEXT    NOT NULL
                    CHECK(state IN ('pending','approved','changes_requested','dismissed')),
  submit_status   TEXT    NOT NULL DEFAULT 'submitted'
                    CHECK(submit_status IN ('pending_submit','submitted')),
  body            TEXT    NULLABLE,
  submitted_at    TEXT    NULLABLE,
  synced_at       TEXT    NOT NULL
);

CREATE TABLE pr_comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_id         INTEGER NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  github_id     INTEGER NULLABLE UNIQUE,
  body          TEXT    NOT NULL,
  path          TEXT    NULLABLE,
  line          INTEGER NULLABLE,
  author_login  TEXT    NOT NULL,
  is_pending    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  synced_at     TEXT    NULLABLE
);

CREATE INDEX idx_pull_requests_project_state
  ON pull_requests(project_id, state);

CREATE INDEX idx_pull_requests_github_number
  ON pull_requests(project_id, github_number);

CREATE INDEX idx_pr_reviews_pr
  ON pr_reviews(pr_id);

CREATE INDEX idx_pr_comments_pr
  ON pr_comments(pr_id);
