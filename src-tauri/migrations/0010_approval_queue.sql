-- Agent承認キュー（MCP/Swarmツール実行承認）
CREATE TABLE IF NOT EXISTS approval_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id      TEXT    NOT NULL UNIQUE,     -- UUID
    worker_id       TEXT,                         -- Swarm worker ID（nullable）
    tool_name       TEXT    NOT NULL,
    tool_input      TEXT    NOT NULL DEFAULT '{}', -- JSON
    risk_level      TEXT    NOT NULL DEFAULT 'medium', -- low/medium/high/critical
    status          TEXT    NOT NULL DEFAULT 'pending', -- pending/approved/rejected/expired
    decision_reason TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    decided_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_worker ON approval_requests(worker_id);
