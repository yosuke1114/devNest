import { useState, useRef, useEffect, useCallback } from "react";
import { useSwarmWS } from "./hooks/useSwarmWS";
import type { SubTask, SwarmSettings } from "./types/swarm";
import { DEFAULT_SETTINGS } from "./types/swarm";
import { WorkerTerminal } from "./components/WorkerTerminal";
import { ToastContainer } from "./components/Toast";
import { SettingsPanel, type MobileSettings } from "./components/SettingsPanel";
import "./App.css";

// ────────────────────────────────────────
//  Worker status colors
// ────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  idle: "#71717a",
  running: "#3b82f6",
  done: "#10b981",
  error: "#ef4444",
};

// ────────────────────────────────────────
//  App
// ────────────────────────────────────────
export default function App() {
  const { state, send, reconnect } = useSwarmWS();
  const [inputText, setInputText] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [workerInputText, setWorkerInputText] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs]);

  const handleSplit = () => {
    if (!inputText.trim() || !projectPath.trim()) return;
    send({
      type: "TaskSplit",
      payload: { prompt: inputText.trim(), project_path: projectPath.trim() },
    });
  };

  const handleStart = () => {
    if (!state.splitResult?.length || !projectPath.trim()) return;
    const settings: SwarmSettings = { ...DEFAULT_SETTINGS };
    send({
      type: "SwarmStart",
      payload: {
        tasks: state.splitResult,
        settings,
        project_path: projectPath.trim(),
      },
    });
  };

  const handleStop = () => {
    send({ type: "SwarmStop" });
  };

  const handleGate = () => {
    send({ type: "RunGate" });
  };

  const handleWorkerInput = useCallback(
    (data: string) => {
      if (!selectedWorkerId) return;
      send({
        type: "WorkerInput",
        payload: { worker_id: selectedWorkerId, data },
      });
    },
    [selectedWorkerId, send],
  );

  const handleWorkerInputText = () => {
    if (!workerInputText.trim() || !selectedWorkerId) return;
    send({
      type: "WorkerInput",
      payload: { worker_id: selectedWorkerId, data: workerInputText.trim() + "\n" },
    });
    setWorkerInputText("");
  };

  const handleSettingsSave = (_s: MobileSettings) => {
    reconnect();
  };

  const { swarm, workers } = state;
  const isRunning = swarm.status === "running" || swarm.status === "gating";
  const progress =
    swarm.totalTasks > 0
      ? (swarm.completedTasks / swarm.totalTasks) * 100
      : 0;

  return (
    <div className="app">
      <ToastContainer />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSave}
      />

      {/* Header */}
      <header className="header">
        <h1>DevNest Mobile</h1>
        <div className="header-right">
          <span className={`conn-badge ${state.connected ? "on" : "off"}`}>
            {state.connected ? "Connected" : "Disconnected"}
          </span>
          <button
            className="settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            &#9881;
          </button>
        </div>
      </header>

      {/* Task Input */}
      {swarm.status === "idle" && !state.splitResult && (
        <div className="card">
          <h2>Task Input</h2>
          <input
            className="project-input"
            placeholder="プロジェクトパス (/path/to/project)"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
          />
          <textarea
            className="task-input"
            placeholder="実装したい機能を入力..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={4}
          />
          <button
            className="btn btn-primary"
            onClick={handleSplit}
            disabled={state.splitting || !inputText.trim() || !projectPath.trim()}
          >
            {state.splitting ? "Splitting..." : "Split Tasks"}
          </button>
        </div>
      )}

      {/* Split Result */}
      {state.splitResult && swarm.status === "idle" && (
        <div className="card">
          <h2>Tasks ({state.splitResult.length})</h2>
          {state.conflictWarnings.length > 0 && (
            <div className="warnings">
              {state.conflictWarnings.map((w, i) => (
                <div key={i} className="warning-item">{w}</div>
              ))}
            </div>
          )}
          <ul className="task-list">
            {state.splitResult.map((task: SubTask) => (
              <li key={task.id} className="task-item">
                <span className="task-id">#{task.id}</span>
                <span className="task-title">{task.title}</span>
                {task.dependsOn.length > 0 && (
                  <span className="task-deps">
                    dep: {task.dependsOn.join(",")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={handleStart}>
              Start Swarm
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Swarm Status */}
      {(isRunning || swarm.status === "done" || swarm.status === "blocked") && (
        <div className="card">
          <h2>Swarm Status</h2>
          <div className="status-info">
            <span className={`phase-badge phase-${swarm.status}`}>
              {swarm.status}
            </span>
            {swarm.currentWave > 0 && (
              <span className="wave-badge">Wave {swarm.currentWave}</span>
            )}
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="progress-text">
            {swarm.completedTasks} / {swarm.totalTasks} tasks
            {swarm.failedTasks > 0 && (
              <span className="failed-count"> ({swarm.failedTasks} failed)</span>
            )}
          </p>
          {isRunning && (
            <button className="btn btn-danger" onClick={handleStop}>
              Stop Swarm
            </button>
          )}
        </div>
      )}

      {/* Gate Ready */}
      {state.gateReady != null && (
        <div className="card gate-card">
          <h2>Gate Check Ready</h2>
          <p className="gate-text">Wave {state.gateReady} の全タスクが完了しました</p>
          <button className="btn btn-primary" onClick={handleGate}>
            Run Gate
          </button>
        </div>
      )}

      {/* Workers */}
      {workers.length > 0 && (
        <div className="card">
          <h2>Workers ({workers.length})</h2>
          <ul className="worker-list">
            {workers.map((w) => (
              <li
                key={w.id}
                className={`worker-item ${selectedWorkerId === w.id ? "selected" : ""}`}
                onClick={() => setSelectedWorkerId(w.id === selectedWorkerId ? null : w.id)}
              >
                <span
                  className="worker-dot"
                  style={{ backgroundColor: STATUS_COLORS[w.status] || "#666" }}
                />
                <span className="worker-label">{w.label || w.id.slice(0, 8)}</span>
                <span className="worker-status">{w.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Worker Output — xterm.js */}
      {selectedWorkerId && state.workerLogs[selectedWorkerId] && (
        <div className="card">
          <h2>Worker Output</h2>
          <WorkerTerminal
            lines={state.workerLogs[selectedWorkerId]}
            onInput={handleWorkerInput}
          />
          <div className="worker-input-row">
            <input
              className="modal-input"
              type="text"
              placeholder="Worker に入力..."
              value={workerInputText}
              onChange={(e) => setWorkerInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleWorkerInputText()}
            />
            <button className="btn btn-primary btn-send" onClick={handleWorkerInputText}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* Log Stream */}
      {state.logs.length > 0 && (
        <div className="card log-card">
          <h2>Logs</h2>
          <div className="log-stream">
            {state.logs.map((log, i) => (
              <div key={i} className={`log-entry log-${log.level}`}>
                <span className="log-ts">{log.ts}</span>
                <span className="log-text">{log.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
