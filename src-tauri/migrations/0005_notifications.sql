-- Phase 5: アプリ内通知

CREATE TABLE notifications (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type       TEXT    NOT NULL
                     CHECK(event_type IN ('ci_pass','ci_fail','pr_comment','pr_opened','issue_assigned','conflict','ai_edit')),
  title            TEXT    NOT NULL,
  body             TEXT    NULLABLE,
  dest_screen      TEXT    NULLABLE,
  dest_resource_id INTEGER NULLABLE,
  is_read          INTEGER NOT NULL DEFAULT 0,
  os_notified      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL
);

CREATE INDEX idx_notifications_project_unread
  ON notifications(project_id, is_read, created_at)
  WHERE is_read = 0;
