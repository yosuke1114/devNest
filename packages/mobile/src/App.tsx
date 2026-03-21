import { useState, useRef, useEffect } from "react";
import { useSwarmWS } from "./hooks/useSwarmWS";
import type { SubTask } from "./types/swarm";
import "./App.css";

// ────────────────────────────────────────
//  Tag colors
// ────────────────────────────────────────
const TAG_COLORS: Record<string, string> = {
  backend: "#3b82f6",
  frontend: "#8b5cf6",
  design: "#f59e0b",
  test: "#10b981",
  infra: "#ef4444",
};

// ────────────────────────────────────────
//  App
// ────────────────────────────────────────
export default function App() {
  const { state, send } = useSwarmWS();
  const [inputText, setInputText] = useState("");
  const [modalInput, setModalInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.waitingPrompt && !showModal) {
      setShowModal(true);
    }
  }, [state.waitingPrompt, showModal]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs]);

  const handleSplit = () => {
    if (!inputText.trim()) return;
    send({ type: "TaskSplit", payload: { text: inputText.trim() } });
  };

  const handleStart = () => {
    if (!state.splitResult?.length) return;
    send({ type: "SwarmStart", payload: { tasks: state.splitResult } });
  };

  const handleStop = () => {
    send({ type: "SwarmStop" });
  };

  const handleModalSubmit = () => {
    if (!modalInput.trim()) return;
    send({ type: "SwarmInput", payload: { text: modalInput.trim() } });
    setModalInput("");
    setShowModal(false);
  };

  const isRunning =
    state.phase === "running" ||
    state.phase === "starting" ||
    state.phase === "waiting_input";
  const progress =
    state.total > 0 ? (state.completed / state.total) * 100 : 0;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>DevNest Mobile</h1>
        <span className={`conn-badge ${state.connected ? "on" : "off"}`}>
          {state.connected ? "Connected" : "Disconnected"}
        </span>
      </header>

      {/* Task Input */}
      {state.phase === "idle" && !state.splitResult && (
        <div className="card">
          <h2>Task Input</h2>
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
            disabled={state.splitting || !inputText.trim()}
          >
            {state.splitting ? "Splitting..." : "Split Tasks"}
          </button>
        </div>
      )}

      {/* Split Result */}
      {state.splitResult && state.phase === "idle" && (
        <div className="card">
          <h2>Tasks ({state.splitResult.length})</h2>
          <ul className="task-list">
            {state.splitResult.map((task: SubTask) => (
              <li key={task.id} className="task-item">
                <span
                  className="tag"
                  style={{ backgroundColor: TAG_COLORS[task.tag] || "#666" }}
                >
                  {task.tag}
                </span>
                <span className="task-title">{task.title}</span>
                <span className="points">{task.points}pt</span>
              </li>
            ))}
          </ul>
          <div className="btn-group">
            <button className="btn btn-primary" onClick={handleStart}>
              Start Swarm
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                // Reset to allow new input
                setInputText("");
                // Clear split result by re-sending Sync
                send({ type: "Sync" });
                window.location.reload();
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Status */}
      {isRunning && (
        <div className="card">
          <h2>Status</h2>
          <div className="status-info">
            <span className={`phase-badge phase-${state.phase}`}>
              {state.phase}
            </span>
            {state.agent && (
              <span className="agent-name">[{state.agent}]</span>
            )}
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="progress-text">
            {state.completed} / {state.total} tasks
          </p>
          <button className="btn btn-danger" onClick={handleStop}>
            Stop Swarm
          </button>
        </div>
      )}

      {/* Waiting Input Banner */}
      {state.waitingPrompt && (
        <div className="card waiting-card">
          <h2>Input Required</h2>
          <p className="waiting-prompt">{state.waitingPrompt}</p>
          <button
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
          >
            Respond
          </button>
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

      {/* Input Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Send Input</h3>
            {state.waitingPrompt && (
              <p className="modal-prompt">{state.waitingPrompt}</p>
            )}
            <input
              className="modal-input"
              type="text"
              placeholder="入力..."
              value={modalInput}
              onChange={(e) => setModalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleModalSubmit()}
              autoFocus
            />
            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleModalSubmit}>
                Send
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
