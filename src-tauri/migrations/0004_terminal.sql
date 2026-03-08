-- Phase 4: Claude Code Terminal セッション

CREATE TABLE terminal_sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_name     TEXT    NULLABLE,
  has_doc_changes INTEGER NOT NULL DEFAULT 0,
  prompt_summary  TEXT    NULLABLE,
  output_log      TEXT    NULLABLE,
  exit_code       INTEGER NULLABLE,
  status          TEXT    NOT NULL DEFAULT 'running'
                    CHECK(status IN ('running','completed','failed','aborted')),
  started_at      TEXT    NOT NULL,
  ended_at        TEXT    NULLABLE
);

CREATE INDEX idx_terminal_sessions_project
  ON terminal_sessions(project_id, started_at DESC);
