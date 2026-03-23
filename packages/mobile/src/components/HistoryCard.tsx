import { useState } from "react";
import type { SwarmRunRecord } from "../types/swarm";

export function HistoryCard({
  record,
  onResume,
}: {
  record: SwarmRunRecord;
  onResume: (record: SwarmRunRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusColor =
    record.status === "done" ? "#10b981" :
    record.status === "partialDone" ? "#f59e0b" : "#ef4444";

  const statusLabel =
    record.status === "done" ? "✅ 完了" :
    record.status === "partialDone" ? "⚠️ 部分完了" :
    record.status === "cancelled" ? "⏹ 中止" : "❌ 失敗";

  const canResume = record.status !== "done";
  const resumableTasks = record.tasks.filter(
    (t) => t.executionState !== "done" && t.executionState !== "skipped",
  );

  const dateStr = (() => {
    try {
      return new Date(record.completedAt).toLocaleString("ja-JP", {
        month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return record.completedAt;
    }
  })();

  return (
    <div style={{
      padding: "12px 14px",
      background: "#0f1117",
      border: `1px solid ${canResume ? "#f59e0b44" : "#21262d"}`,
      borderRadius: 10,
      marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
        <span style={{ fontSize: 11, color: "#8b949e", flex: 1 }}>
          {record.doneCount}/{record.totalTasks} タスク
          {record.failedCount > 0 && (
            <span style={{ color: "#ef4444", marginLeft: 6 }}>{record.failedCount} 失敗</span>
          )}
        </span>
        <span style={{ fontSize: 10, color: "#484f58" }}>{dateStr}</span>
      </div>

      <div style={{ fontSize: 11, color: "#58a6ff", marginBottom: 8, fontFamily: "monospace" }}>
        {record.projectPath.split("/").slice(-2).join("/")} • {record.baseBranch}
      </div>

      <div style={{ height: 3, background: "#21262d", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${record.totalTasks > 0 ? (record.doneCount / record.totalTasks) * 100 : 0}%`,
          background: statusColor,
        }} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 11, padding: 0, flex: 1, textAlign: "left" }}
        >
          {expanded ? "▲" : "▼"} タスク詳細 ({record.tasks.length})
        </button>
        {canResume && resumableTasks.length > 0 && (
          <button
            onClick={() => onResume(record)}
            style={{
              background: "#f59e0b",
              border: "none",
              color: "#0d1117",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: 6,
            }}
          >
            ▶ 再実行 ({resumableTasks.length}件)
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          {record.tasks.map((t) => {
            const icon = t.executionState === "done" ? "✅" :
                         t.executionState === "error" ? "❌" :
                         t.executionState === "skipped" ? "⏭️" : "⏳";
            return (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "3px 8px", background: "#0a0c0f", borderRadius: 4, fontSize: 11,
              }}>
                <span>{icon}</span>
                <span style={{ flex: 1, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title}
                </span>
                <code style={{ color: "#484f58", fontSize: 10 }}>{t.role}</code>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
