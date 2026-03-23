-- Swarm 実行履歴

CREATE TABLE swarm_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT    NOT NULL UNIQUE,
  status       TEXT    NOT NULL
                 CHECK(status IN ('done','partialDone','failed','cancelled')),
  total_tasks  INTEGER NOT NULL DEFAULT 0,
  done_count   INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  base_branch  TEXT    NOT NULL DEFAULT '',
  project_path TEXT    NOT NULL DEFAULT '',
  tasks_json   TEXT    NOT NULL DEFAULT '[]',
  completed_at TEXT    NOT NULL
);

CREATE INDEX idx_swarm_runs_completed_at ON swarm_runs(completed_at DESC);
