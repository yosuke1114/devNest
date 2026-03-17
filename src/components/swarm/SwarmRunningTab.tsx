import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSwarmStore } from "../../stores/swarmStore";
import type { ExecutionState } from "./types";
import { TerminalGrid } from "./TerminalGrid";

// ─── 型 ───────────────────────────────────────────────────────

interface SystemResources {
  cpuPct: number;
  memFreeGb: number;
  spawnSuppressed: boolean;
}

interface WorkerLogLine {
  workerId: string;
  line: string;
}

// ─── Component ────────────────────────────────────────────────

interface SwarmRunningTabProps {
  workingDir: string;
}

export function SwarmRunningTab({ workingDir }: SwarmRunningTabProps) {
  const { currentRun, mergeReady, isMerging, cancelRun, mergeAll, listenOrchestratorEvents } =
    useSwarmStore();
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [logs, setLogs] = useState<WorkerLogLine[]>([]);

  // Orchestrator イベントリスナー
  useEffect(() => {
    return listenOrchestratorEvents();
  }, [listenOrchestratorEvents]);

  // リソースポーリング (5秒)
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await invoke<SystemResources>("get_system_resources");
        setResources(r);
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  // ライブログリッスン
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ workerId: string; line: string }>("worker-output", (event) => {
      setLogs((prev) => {
        const next = [...prev, event.payload];
        return next.slice(-200); // 最大200行保持
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  if (!currentRun) {
    return (
      <div style={emptyStyle} data-testid="running-tab-empty">
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <div style={{ color: "#484f58", fontSize: 14 }}>実行中のSwarmセッションはありません</div>
        <div style={{ color: "#30363d", fontSize: 12, marginTop: 6 }}>
          「タスク分解」タブでタスクを分解してから「Swarm実行を開始」してください
        </div>
      </div>
    );
  }

  const runningCount = currentRun.assignments.filter(
    (a) => a.executionState === "running"
  ).length;

  const filteredLogs = selectedWorker
    ? logs.filter((l) => l.workerId === selectedWorker)
    : logs;

  return (
    <div style={containerStyle} data-testid="swarm-running-tab">
      {/* ヘッダー情報 */}
      <div style={headerStyle}>
        <div>
          <span style={{ color: "#8b949e", fontSize: 12 }}>実行中: </span>
          <span style={{ color: "#e6edf3", fontFamily: "monospace", fontSize: 12 }}>
            {currentRun.runId}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <StatusBadge status={currentRun.status} />
          <span style={{ color: "#8b949e", fontSize: 12 }}>
            進捗: {currentRun.doneCount}/{currentRun.total} 完了
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 左ペイン: Worker一覧 + リソース */}
        <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #21262d", overflowY: "auto" }}>
          {/* Worker一覧 */}
          <div style={panelSection} data-testid="worker-list">
            <div style={panelTitle}>Worker一覧</div>
            {currentRun.assignments.map((a) => (
              <div
                key={a.workerId}
                data-testid={`worker-row-${a.workerId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px",
                  cursor: "pointer",
                  background: selectedWorker === a.workerId ? "#161b22" : "transparent",
                  borderLeft: selectedWorker === a.workerId ? "2px solid #1f6feb" : "2px solid transparent",
                }}
                onClick={() => setSelectedWorker(a.workerId === selectedWorker ? null : a.workerId)}
              >
                <ExecutionIcon state={a.executionState} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 12, color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.task.title}
                  </div>
                  <div style={{ fontSize: 10, color: "#484f58", fontFamily: "monospace" }}>
                    {a.workerId ? a.workerId.split("-").pop() : "—"}
                    {a.executionState === "waiting" && a.task.dependsOn?.length > 0 && (
                      <span style={{ color: "#4a5568" }}> ← Task {a.task.dependsOn.join(",")}</span>
                    )}
                  </div>
                </div>
                <ExecutionLabel state={a.executionState} />
              </div>
            ))}
          </div>

          {/* リソースモニター */}
          {resources && (
            <div style={panelSection} data-testid="resource-monitor">
              <div style={panelTitle}>リソース</div>
              <ResourceBar label="CPU" pct={resources.cpuPct} color="#58a6ff" />
              <ResourceBar
                label="MEM (Free)"
                pct={Math.max(0, 100 - resources.memFreeGb * 8)}
                color="#68d391"
              />
              <div style={{ fontSize: 11, color: "#8b949e", marginTop: 6 }}>
                Workers: {runningCount}/{currentRun.total} active
                {resources.spawnSuppressed && (
                  <span style={{ color: "#fc8181", marginLeft: 8 }}>⚠️ スポーン制限中</span>
                )}
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {mergeReady && (
              <button
                data-testid="merge-all-button"
                onClick={mergeAll}
                disabled={isMerging}
                style={{ ...actionButton, background: "#6e40c9", opacity: isMerging ? 0.6 : 1 }}
              >
                {isMerging ? "🔀 マージ中..." : "🔀 ブランチをマージ"}
              </button>
            )}
            <button
              data-testid="cancel-run-button"
              onClick={cancelRun}
              style={{ ...actionButton, background: "transparent", border: "1px solid #fc8181", color: "#fc8181" }}
            >
              ❌ キャンセル
            </button>
          </div>
        </div>

        {/* 右ペイン: TerminalGrid + ライブログ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* ターミナルグリッド */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TerminalGrid workingDir={workingDir} />
          </div>

          {/* ライブログ */}
          <div style={logPanel} data-testid="live-log-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={panelTitle}>ライブログ</span>
              {selectedWorker && (
                <span style={{ fontSize: 11, color: "#58a6ff", fontFamily: "monospace" }}>
                  [{selectedWorker.split("-").pop()}]
                </span>
              )}
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 11 }}
                >
                  クリア
                </button>
              )}
            </div>
            <div style={logBody} data-testid="log-body">
              {filteredLogs.length === 0 ? (
                <div style={{ color: "#484f58", fontSize: 11 }}>ログがありません</div>
              ) : (
                filteredLogs.map((l, i) => (
                  <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: "#8b949e", lineHeight: 1.5 }}>
                    <span style={{ color: "#484f58" }}>[{l.workerId.split("-").pop()}]</span>{" "}
                    {l.line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── サブコンポーネント ────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    preparing: { color: "#8b949e", label: "🔧 準備中" },
    running:   { color: "#f6ad55", label: "🟡 Running" },
    merging:   { color: "#a78bfa", label: "🔀 Merging" },
    done:      { color: "#68d391", label: "✅ Done" },
    partialDone: { color: "#f6ad55", label: "⚠️ Partial" },
    failed:    { color: "#fc8181", label: "❌ Failed" },
    cancelled: { color: "#484f58", label: "⏹ Cancelled" },
  };
  const s = map[status] ?? { color: "#8b949e", label: status };
  return (
    <span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{s.label}</span>
  );
}

function ExecutionIcon({ state }: { state: ExecutionState }) {
  const icons: Record<ExecutionState, string> = {
    waiting: "⏳",
    ready:   "🟢",
    running: "🔄",
    done:    "✅",
    error:   "❌",
    skipped: "⏭️",
  };
  return <span style={{ fontSize: 14, flexShrink: 0 }}>{icons[state] ?? "●"}</span>;
}

function ExecutionLabel({ state }: { state: ExecutionState }) {
  const map: Record<ExecutionState, { color: string; label: string }> = {
    waiting: { color: "#4a5568", label: "Waiting" },
    ready:   { color: "#68d391", label: "Ready" },
    running: { color: "#f6ad55", label: "Running" },
    done:    { color: "#68d391", label: "Done" },
    error:   { color: "#fc8181", label: "Error" },
    skipped: { color: "#484f58", label: "Skipped" },
  };
  const s = map[state] ?? { color: "#8b949e", label: state };
  return <span style={{ fontSize: 10, color: s.color, flexShrink: 0 }}>{s.label}</span>;
}

function ResourceBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: "#8b949e" }}>{label}</span>
        <span style={{ fontSize: 11, color: "#8b949e" }}>{clamped.toFixed(0)}%</span>
      </div>
      <div style={{ height: 6, background: "#21262d", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${clamped}%`,
            background: clamped > 80 ? "#fc8181" : color,
            borderRadius: 3,
            transition: "width 0.5s ease",
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
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
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

const panelSection: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #21262d",
};

const panelTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#8b949e",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const actionButton: React.CSSProperties = {
  padding: "8px 0",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "monospace",
};

const logPanel: React.CSSProperties = {
  height: 140,
  flexShrink: 0,
  padding: "8px 12px",
  borderTop: "1px solid #21262d",
  background: "#0d1117",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const logBody: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
};
