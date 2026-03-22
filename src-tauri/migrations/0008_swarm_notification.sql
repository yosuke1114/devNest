-- Swarm 完了通知の event_type を追加

-- SQLite は CHECK 制約の変更を ALTER TABLE でサポートしないため、
-- テーブルを再作成して制約を更新する。

CREATE TABLE notifications_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_type       TEXT    NOT NULL
                     CHECK(event_type IN ('ci_pass','ci_fail','pr_comment','pr_opened','issue_assigned','conflict','ai_edit','swarm_done')),
  title            TEXT    NOT NULL,
  body             TEXT    NULLABLE,
  dest_screen      TEXT    NULLABLE,
  dest_resource_id INTEGER NULLABLE,
  is_read          INTEGER NOT NULL DEFAULT 0,
  os_notified      INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL
);

INSERT INTO notifications_new SELECT * FROM notifications;

DROP TABLE notifications;

ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX idx_notifications_project_unread
  ON notifications(project_id, is_read, created_at)
  WHERE is_read = 0;
