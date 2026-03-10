-- Phase 4: git コンフリクト状態

CREATE TABLE conflict_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path     TEXT    NOT NULL,
  is_managed    INTEGER NOT NULL DEFAULT 0,
  sync_log_id   INTEGER NULLABLE REFERENCES sync_logs(id),
  document_id   INTEGER NULLABLE REFERENCES documents(id),
  our_content   TEXT    NULLABLE,
  their_content TEXT    NULLABLE,
  merged_content TEXT   NULLABLE,
  resolution    TEXT    NULLABLE
                  CHECK(resolution IN ('ours','theirs','manual','terminal') OR resolution IS NULL),
  resolved_at   TEXT    NULLABLE,
  created_at    TEXT    NOT NULL,
  UNIQUE(project_id, file_path)
);

CREATE INDEX idx_conflict_files_project_unresolved
  ON conflict_files(project_id, resolved_at, is_managed)
  WHERE resolved_at IS NULL;
