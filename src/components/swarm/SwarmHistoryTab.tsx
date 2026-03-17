import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { OrchestratorRun, RunStatus } from "../../stores/swarmStore";

// ─── HistoryRecord ────────────────────────────────────────────

interface HistoryRecord {
  runId: string;
  status: RunStatus;
  totalTasks: number;
  doneCount: number;
  baseBranch: string;
  projectPath: string;
  completedAt: Date;
  hasConflicts: boolean;
}

// ─── Component ────────────────────────────────────────────────

export function SwarmHistoryTab() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  // orchestrator-merge-done イベントで履歴に追加
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<OrchestratorRun>("orchestrator-merge-done", (event) => {
      const run = event.payload;
      const hasConflicts = run.mergeResults.some((r) => !r.success);
      setHistory((prev) => [
        {
          runId: run.runId,
          status: run.status,
          totalTasks: run.total,
          doneCount: run.doneCount,
          baseBranch: run.baseBranch,
          projectPath: run.projectPath,
          completedAt: new Date(),
          hasConflicts,
        },
        ...prev,
      ]);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  if (history.length === 0) {
    return (
      <div style={emptyStyle} data-testid="swarm-history-tab">
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ color: "#484f58", fontSize: 14 }}>実行履歴がありません</div>
        <div style={{ color: "#30363d", fontSize: 12, marginTop: 6 }}>
          Swarmを実行してマージが完了すると、ここに履歴が表示されます
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
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {history.map((record) => (
          <HistoryCard key={record.runId} record={record} />
        ))}
      </div>
    </div>
  );
}

// ─── HistoryCard ──────────────────────────────────────────────

function HistoryCard({ record }: { record: HistoryRecord }) {
  const successPct =
    record.totalTasks > 0
      ? Math.round((record.doneCount / record.totalTasks) * 100)
      : 0;

  const statusColor =
    record.status === "done"
      ? "#68d391"
      : record.status === "partialDone"
      ? "#f6ad55"
      : "#fc8181";

  const timeStr = record.completedAt.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      data-testid={`history-card-${record.runId}`}
      style={{
        padding: "12px 16px",
        background: "#161b22",
        border: "1px solid #21262d",
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 12, color: "#e6edf3", fontFamily: "monospace" }}>
            {record.runId}
          </span>
          <span
            style={{
              marginLeft: 10,
              fontSize: 11,
              color: statusColor,
              fontWeight: 600,
            }}
          >
            {record.status === "done"
              ? "✅ 完了"
              : record.status === "partialDone"
              ? "⚠️ 部分完了"
              : "❌ 失敗"}
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#484f58" }}>{timeStr}</span>
      </div>

      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#8b949e" }}>
        <span>
          タスク: <strong style={{ color: "#e6edf3" }}>{record.doneCount}/{record.totalTasks}</strong> ({successPct}%)
        </span>
        <span>
          ブランチ: <code style={{ color: "#58a6ff", fontSize: 11 }}>{record.baseBranch}</code>
        </span>
        {record.hasConflicts && (
          <span style={{ color: "#f6ad55" }}>⚠️ コンフリクトあり</span>
        )}
      </div>

      {/* 進捗バー */}
      <div style={{ marginTop: 8, height: 4, background: "#21262d", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${successPct}%`,
            background: statusColor,
            borderRadius: 2,
          }}
        />
      </div>
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
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  background: "#0d1117",
};
