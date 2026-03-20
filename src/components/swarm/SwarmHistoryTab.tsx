import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { OrchestratorRun } from "../../stores/swarmStore";
import { ROLE_ICON } from "./types";

// ─── 型 ───────────────────────────────────────────────────────

interface TaskResult {
  id: number;
  title: string;
  role: string;
  executionState: string;
  branchName: string;
}

interface SwarmRunRecord {
  id: number;
  runId: string;
  status: string;
  totalTasks: number;
  doneCount: number;
  failedCount: number;
  baseBranch: string;
  projectPath: string;
  tasks: TaskResult[];
  completedAt: string;
}

// ─── Component ────────────────────────────────────────────────

export function SwarmHistoryTab() {
  const [history, setHistory] = useState<SwarmRunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const records = await invoke<SwarmRunRecord[]>("swarm_history_list", { limit: 50 });
      setHistory(records);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 完了イベントで自動リロード
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<OrchestratorRun>("orchestrator-status-changed", (event) => {
      const s = event.payload.status;
      if (s === "done" || s === "partialDone" || s === "failed" || s === "cancelled") {
        setTimeout(load, 500); // 保存完了を少し待つ
      }
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  const handleDelete = async (runId: string) => {
    await invoke("swarm_history_delete", { runId }).catch(() => {});
    setHistory((prev) => prev.filter((r) => r.runId !== runId));
  };

  if (loading) {
    return (
      <div style={emptyStyle}>
        <div style={{ color: "#484f58", fontSize: 14 }}>読み込み中...</div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div style={emptyStyle} data-testid="swarm-history-tab">
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ color: "#484f58", fontSize: 14 }}>実行履歴がありません</div>
        <div style={{ color: "#30363d", fontSize: 12, marginTop: 6 }}>
          Swarmを実行すると、完了後にここに履歴が保存されます
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle} data-testid="swarm-history-tab">
      <div style={headerStyle}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>
          実行履歴 ({history.length} 件)
        </span>
        <button
          onClick={load}
          style={{ background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 12 }}
        >
          🔄 更新
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {history.map((record) => (
          <HistoryCard key={record.runId} record={record} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}

// ─── HistoryCard ──────────────────────────────────────────────

function HistoryCard({
  record,
  onDelete,
}: {
  record: SwarmRunRecord;
  onDelete: (runId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const successPct =
    record.totalTasks > 0
      ? Math.round((record.doneCount / record.totalTasks) * 100)
      : 0;

  const statusColor =
    record.status === "done"
      ? "#4ade80"
      : record.status === "partialDone"
      ? "#fbbf24"
      : "#fc8181";

  const statusLabel =
    record.status === "done"
      ? "✅ 完了"
      : record.status === "partialDone"
      ? "⚠️ 部分完了"
      : record.status === "cancelled"
      ? "⏹ キャンセル"
      : "❌ 失敗";

  // ISO日時をローカル表示
  const dateStr = (() => {
    try {
      const d = new Date(record.completedAt);
      return d.toLocaleString("ja-JP", {
        month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return record.completedAt;
    }
  })();

  return (
    <div
      data-testid={`history-card-${record.runId}`}
      style={{
        padding: "12px 14px",
        background: "#161b22",
        border: "1px solid #21262d",
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      {/* ヘッダー行 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
        <span style={{ fontSize: 11, color: "#e6edf3", fontFamily: "monospace", flex: 1 }}>
          {record.doneCount}/{record.totalTasks} タスク
          {record.failedCount > 0 && (
            <span style={{ color: "#fc8181", marginLeft: 6 }}>{record.failedCount} 失敗</span>
          )}
        </span>
        <span style={{ fontSize: 11, color: "#484f58" }}>{dateStr}</span>
        <button
          onClick={() => onDelete(record.runId)}
          style={{ background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 11, padding: "0 2px" }}
          aria-label="履歴を削除"
        >
          ✕
        </button>
      </div>

      {/* ブランチ・パス */}
      <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 8, display: "flex", gap: 12 }}>
        <span>
          ブランチ: <code style={{ color: "#58a6ff" }}>{record.baseBranch}</code>
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {record.projectPath.split("/").slice(-2).join("/")}
        </span>
      </div>

      {/* 進捗バー */}
      <div style={{ height: 4, background: "#21262d", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
        <div
          style={{
            height: "100%",
            width: `${successPct}%`,
            background: statusColor,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* タスク一覧トグル */}
      {record.tasks.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "none",
              border: "none",
              color: "#484f58",
              cursor: "pointer",
              fontSize: 11,
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {expanded ? "▲" : "▼"} タスク詳細 ({record.tasks.length})
          </button>

          {expanded && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {record.tasks.map((t) => {
                const stateIcon =
                  t.executionState === "done"    ? "✅"
                  : t.executionState === "error"  ? "❌"
                  : t.executionState === "skipped"? "⏭️"
                  : "⏳";
                const roleIcon = ROLE_ICON[t.role as keyof typeof ROLE_ICON] ?? "🔨";
                return (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 8px",
                      background: "#0d1117",
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                  >
                    <span>{stateIcon}</span>
                    <span title={t.role}>{roleIcon}</span>
                    <span style={{ flex: 1, color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.title}
                    </span>
                    <code style={{ color: "#484f58", fontSize: 10 }}>
                      {t.branchName.split("/").pop()}
                    </code>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── スタイル ─────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  background: "#0d1117",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #21262d",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  background: "#0d1117",
};
