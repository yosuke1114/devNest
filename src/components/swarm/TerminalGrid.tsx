import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { XtermPane } from "./XtermPane";
import type { WorkerConfig, WorkerInfo, WorkerStatus } from "./types";

const MAX_WORKERS = 8;

interface TerminalGridProps {
  workingDir?: string;
}

export function TerminalGrid({ workingDir = "/" }: TerminalGridProps) {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // worker-status-changed イベントで Worker ステータスをリアルタイム更新
  useEffect(() => {
    const unlistenPromise = listen<{ workerId: string; status: WorkerStatus }>(
      "worker-status-changed",
      (event) => {
        setWorkers((prev) =>
          prev.map((w) =>
            w.id === event.payload.workerId
              ? { ...w, status: event.payload.status }
              : w
          )
        );
      }
    );
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  const addWorker = async (kind: "shell" | "claudeCode") => {
    if (workers.length >= MAX_WORKERS) return;
    const n = workers.length + 1;
    const config: WorkerConfig = {
      kind,
      mode: "interactive",
      label: kind === "shell" ? `Shell ${n}` : `Worker ${n}`,
      workingDir,
      dependsOn: [],
      metadata: {},
    };

    try {
      const id = await invoke<string>("spawn_worker", { config });
      const newWorker: WorkerInfo = { id, config, status: "idle" };
      setWorkers((prev) => [...prev, newWorker]);
      setActiveId(id);
    } catch (err) {
      console.error("spawn_worker failed:", err);
    }
  };

  const killWorker = async (id: string) => {
    try {
      await invoke("kill_worker", { workerId: id });
    } catch {
      // ベストエフォート
    }
    setWorkers((prev) => prev.filter((w) => w.id !== id));
    if (activeId === id) setActiveId(null);
  };

  // Worker数に応じてグリッドのカラム数を自動調整
  const cols =
    workers.length <= 1 ? 1
    : workers.length <= 4 ? 2
    : 3;

  // 進捗バー計算（ClaudeCode Worker のみ対象）
  const claudeWorkers = workers.filter((w) => w.config.kind === "claudeCode");
  const finishedCount = claudeWorkers.filter(
    (w) => w.status === "done" || w.status === "error"
  ).length;
  const showProgress = claudeWorkers.length > 0;
  const progressPct =
    claudeWorkers.length > 0
      ? Math.round((finishedCount / claudeWorkers.length) * 100)
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {/* ツールバー */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => addWorker("shell")}
          disabled={workers.length >= MAX_WORKERS}
          style={addButtonStyle}
        >
          🐚 Shell を追加
        </button>
        <button
          onClick={() => addWorker("claudeCode")}
          disabled={workers.length >= MAX_WORKERS}
          style={addButtonStyle}
        >
          🤖 Worker を追加
        </button>
        <span
          style={{
            color: "#484f58",
            fontSize: 12,
            marginLeft: "auto",
            alignSelf: "center",
          }}
        >
          {workers.length} / {MAX_WORKERS} ペイン
        </span>
      </div>

      {/* 進捗バー（ClaudeCode Worker が1つ以上のときのみ表示） */}
      {showProgress && (
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 11, color: "#8b949e" }}>
              Worker 進捗
            </span>
            <span style={{ fontSize: 11, color: "#e6edf3", fontFamily: "monospace" }}>
              {finishedCount} / {claudeWorkers.length} 完了 ({progressPct}%)
            </span>
          </div>
          <div
            style={{
              height: 4,
              background: "#21262d",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background:
                  claudeWorkers.some((w) => w.status === "error") &&
                  finishedCount === claudeWorkers.length
                    ? "#fc8181"
                    : "#68d391",
                borderRadius: 2,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* グリッド */}
      {workers.length === 0 ? (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🤖</div>
          <div style={{ color: "#484f58", fontSize: 13 }}>
            Worker または Shell を追加してください
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 10,
            overflow: "auto",
            minHeight: 0,
          }}
        >
          {workers.map((worker) => (
            <XtermPane
              key={worker.id}
              worker={worker}
              onKill={killWorker}
              isActive={activeId === worker.id}
              onClick={() => setActiveId(worker.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const addButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "#21262d",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#e6edf3",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "monospace",
  opacity: 1,
};

const emptyStateStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  border: "1px dashed #30363d",
  borderRadius: 8,
};
