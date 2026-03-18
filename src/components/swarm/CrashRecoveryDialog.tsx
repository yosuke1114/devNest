import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";

interface CrashedSession {
  id: string;
  taskInput: string;
  workers: Array<{
    workerId: string;
    role: string;
    status: string;
    hasCommits: boolean;
  }>;
}

export function CrashRecoveryDialog() {
  const [crashed, setCrashed] = useState<CrashedSession | null>(null);

  useEffect(() => {
    invoke<CrashedSession | null>("check_crashed_sessions").then(setCrashed);
  }, []);

  if (!crashed) return null;

  const completedWorkers = crashed.workers.filter(w => w.status === "done");
  const pendingWorkers = crashed.workers.filter(w => w.status !== "done");

  return (
    <div data-testid="crash-recovery-dialog" style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.8)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 300,
    }}>
      <div style={{
        background: "#161b22", border: "1px solid #30363d",
        borderRadius: 10, padding: 24, width: 420,
      }}>
        <div style={{ color: "#e6edf3", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          🔄 前回のSwarmが中断されています
        </div>
        <div style={{ color: "#8b949e", fontSize: 12, marginBottom: 16 }}>
          タスク: {crashed.taskInput.slice(0, 50)}...
        </div>
        {completedWorkers.map(w => (
          <div key={w.workerId} data-testid={`completed-worker-${w.workerId}`}
            style={{ color: "#68d391", fontSize: 11, marginBottom: 4 }}>
            ✅ {w.workerId}（{w.role}）完了済み → スキップ
          </div>
        ))}
        {pendingWorkers.map(w => (
          <div key={w.workerId} data-testid={`pending-worker-${w.workerId}`}
            style={{ color: "#f6ad55", fontSize: 11, marginBottom: 4 }}>
            {w.hasCommits ? "🔄" : "🆕"} {w.workerId}（{w.role}）
            → {w.hasCommits ? "続きから再開" : "新規ブランチで再実行"}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button
            data-testid="crash-resume-button"
            onClick={() => {
              invoke("resume_crashed_session", { sessionId: crashed.id });
              setCrashed(null);
            }}
          >
            再開する
          </button>
          <button
            data-testid="crash-discard-button"
            onClick={() => {
              invoke("discard_crashed_session", { sessionId: crashed.id });
              setCrashed(null);
            }}
          >
            破棄する
          </button>
        </div>
      </div>
    </div>
  );
}
