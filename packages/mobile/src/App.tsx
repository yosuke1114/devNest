import { useState, useRef, useEffect, useCallback } from "react";
import { useSwarmWS } from "./hooks/useSwarmWS";
import type { TaskSnapshot, SubTask, SwarmSettings, ClientMessage, SwarmRunRecord } from "./types/swarm";
import { DEFAULT_SETTINGS } from "./types/swarm";
import { WorkerTerminal } from "./components/WorkerTerminal";
import { ToastContainer, showToast } from "./components/Toast";
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
//  Task state config
// ────────────────────────────────────────
const TASK_STATE: Record<string, { icon: string; color: string; label: string }> = {
  waiting:  { icon: "⏳", color: "#4a5568", label: "待機" },
  ready:    { icon: "🟢", color: "#68d391", label: "準備完了" },
  running:  { icon: "🔄", color: "#f6ad55", label: "実行中" },
  done:     { icon: "✅", color: "#68d391", label: "完了" },
  error:    { icon: "❌", color: "#fc8181", label: "エラー" },
  skipped:  { icon: "⏭️", color: "#484f58", label: "スキップ" },
};

// ────────────────────────────────────────
//  TaskBoard
// ────────────────────────────────────────
function TaskBoard({ tasks }: { tasks: TaskSnapshot[] }) {
  if (tasks.length === 0) return null;
  const waves = Array.from(new Set(tasks.map((t) => t.waveNumber))).sort((a, b) => a - b);
  return (
    <div className="card">
      <h2>Tasks ({tasks.filter((t) => t.executionState === "done").length}/{tasks.length} 完了)</h2>
      {waves.map((wn) => {
        const waveTasks = tasks.filter((t) => t.waveNumber === wn);
        const allDone = waveTasks.every((t) => t.executionState === "done");
        const anyRunning = waveTasks.some((t) => t.executionState === "running");
        const waveColor = allDone ? "#10b981" : anyRunning ? "#f6ad55" : "#71717a";
        return (
          <div key={wn} className="wave-group">
            <div className="wave-label" style={{ color: waveColor }}>
              Wave {wn} {allDone ? "✅" : anyRunning ? "🔄" : ""}
            </div>
            {waveTasks.map((task) => {
              const st = TASK_STATE[task.executionState] ?? TASK_STATE.waiting;
              return (
                <div key={task.taskId} className="task-row">
                  <span className="task-icon">{st.icon}</span>
                  <div className="task-row-body">
                    <span className="task-row-title">{task.title}</span>
                    {task.dependsOn.length > 0 && (
                      <span className="task-deps-small">← #{task.dependsOn.join(", #")}</span>
                    )}
                  </div>
                  <span className="task-state-label" style={{ color: st.color }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────
//  SwarmSettingsPanel  (#1 — swarm-specific settings)
// ────────────────────────────────────────
function SwarmSettingsPanel({
  settings,
  onChange,
}: {
  settings: SwarmSettings;
  onChange: (s: SwarmSettings) => void;
}) {
  const num = (key: keyof SwarmSettings, min: number, max: number) => (
    <input
      type="number"
      className="setting-num"
      min={min}
      max={max}
      value={settings[key] as number}
      onChange={(e) => onChange({ ...settings, [key]: Number(e.target.value) })}
    />
  );
  const text = (key: keyof SwarmSettings) => (
    <input
      type="text"
      className="setting-text"
      value={settings[key] as string}
      onChange={(e) => onChange({ ...settings, [key]: e.target.value })}
    />
  );
  const toggle = (key: keyof SwarmSettings, label: string) => (
    <label className="setting-toggle">
      <span>{label}</span>
      <div
        className={`toggle-switch ${settings[key] ? "on" : ""}`}
        onClick={() => onChange({ ...settings, [key]: !settings[key] })}
      >
        <div className="toggle-knob" />
      </div>
    </label>
  );

  return (
    <div className="card settings-card">
      <h2>Swarm Settings</h2>
      <div className="settings-grid">
        <div className="setting-row">
          <span>Max Workers</span>
          {num("maxWorkers", 1, 10)}
        </div>
        <div className="setting-row">
          <span>Base Branch</span>
          {text("baseBranch")}
        </div>
        <div className="setting-row">
          <span>Timeout (min)</span>
          {num("timeoutMinutes", 5, 120)}
        </div>
        <div className="setting-row">
          <span>Max Retries</span>
          {num("maxRetries", 0, 5)}
        </div>
      </div>
      {toggle("claudeSkipPermissions", "Skip Permissions")}
      {toggle("claudeInteractive", "Interactive Mode")}
    </div>
  );
}

// ────────────────────────────────────────
//  WorkerModal  (#4)
// ────────────────────────────────────────
function WorkerModal({
  label,
  logs,
  onClose,
  onSend,
}: {
  label: string;
  logs: string[];
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const submit = () => {
    if (!input.trim()) return;
    onSend(input.trim() + "\n");
    setInput("");
  };

  return (
    <div className="worker-modal" onClick={onClose}>
      <div className="worker-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="worker-modal-header">
          <span className="worker-modal-title">{label}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="worker-modal-output">
          {logs.map((line, i) => (
            <div key={i} className="modal-log-line">{line}</div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="worker-input-row">
          <input
            className="modal-input"
            type="text"
            placeholder="Worker に入力..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button className="btn btn-primary btn-send" onClick={submit}>Send</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
//  HistoryCard
// ────────────────────────────────────────
function HistoryCard({
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

// ────────────────────────────────────────
//  App
// ────────────────────────────────────────
export default function App() {
  const { state, send, reconnect } = useSwarmWS();

  // Core input state
  const [inputText, setInputText] = useState("");
  const [projectPath, setProjectPath] = useState("");

  // タブ
  const [tab, setTab] = useState<"swarm" | "history">("swarm");

  // WS settings panel (gear icon)
  const [settingsOpen, setSettingsOpen] = useState(false);

  // #1 Swarm settings
  const [settings, setSettings] = useState<SwarmSettings>(DEFAULT_SETTINGS);
  const [swarmSettingsOpen, setSwarmSettingsOpen] = useState(false);

  // #2 Editable task list
  const [editingTasks, setEditingTasks] = useState<SubTask[] | null>(null);

  // #3 Log filter
  const [logFilter, setLogFilter] = useState<"all" | "info" | "warn" | "error" | "success">("all");
  const [logSearch, setLogSearch] = useState("");

  // #4 Worker modal
  const [workerModal, setWorkerModal] = useState<string | null>(null);

  // #4b Selected worker for xterm.js view
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [workerInputText, setWorkerInputText] = useState("");

  // #6 PR links
  const [prLinks, setPrLinks] = useState<string[]>([]);

  // #8 Voice input
  const [listening, setListening] = useState(false);

  // #9 Offline queue (only for WorkerInput — other messages are idempotent)
  const pendingMsgs = useRef<ClientMessage[]>([]);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs]);

  // #2 Sync editable tasks when splitResult arrives
  useEffect(() => {
    if (state.splitResult) {
      setEditingTasks(state.splitResult.map((t) => ({ ...t })));
    } else {
      setEditingTasks(null);
    }
  }, [state.splitResult]);

  // #5 Watch swarm status for toast notifications
  const prevStatus = useRef(state.swarm.status);
  useEffect(() => {
    const cur = state.swarm.status;
    if (cur === prevStatus.current) return;
    if (cur === "done") {
      showToast("Swarm 完了!", "success");
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("DevNest Swarm", { body: "全タスク完了" });
      }
    } else if (cur === "blocked") {
      showToast("Wave Gate でブロック", "error");
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification("DevNest Swarm", { body: "Wave Gate でブロックされました" });
      }
    } else if (cur === "running" && prevStatus.current === "gating") {
      showToast(`Wave ${state.swarm.currentWave} 開始`, "info");
    }
    prevStatus.current = cur;
  }, [state.swarm.status, state.swarm.currentWave]);

  // #6 Extract PR links from worker output
  useEffect(() => {
    const allLines = Object.values(state.workerLogs).flat();
    const found = new Set<string>();
    for (const line of allLines) {
      const matches = line.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/g);
      if (matches) matches.forEach((u) => found.add(u));
    }
    setPrLinks(Array.from(found));
  }, [state.workerLogs]);

  // #9 Flush offline queue on reconnect
  useEffect(() => {
    if (state.connected && pendingMsgs.current.length > 0) {
      const queued = [...pendingMsgs.current];
      pendingMsgs.current = [];
      for (const msg of queued) send(msg);
      showToast(`オフラインキュー ${queued.length} 件を送信`, "info");
    }
  }, [state.connected, send]);

  // #9 Wrapped send with offline queue
  const safeSend = useCallback(
    (msg: ClientMessage) => {
      if (state.connected) {
        send(msg);
      } else if (msg.type === "WorkerInput") {
        pendingMsgs.current.push(msg);
        showToast("オフライン - 再接続後に送信します", "warn");
      }
    },
    [state.connected, send],
  );

  // #8 Voice input
  const startVoice = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      showToast("このブラウザは音声入力に対応していません", "warn");
      return;
    }
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      setInputText((prev) => (prev ? prev + " " + transcript : transcript));
    };
    rec.start();
  }, []);

  const handleSplit = () => {
    if (!inputText.trim() || !projectPath.trim()) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    safeSend({
      type: "TaskSplit",
      payload: { prompt: inputText.trim(), project_path: projectPath.trim() },
    });
  };

  const handleStart = () => {
    const tasks = editingTasks ?? state.splitResult;
    if (!tasks?.length || !projectPath.trim()) return;
    safeSend({
      type: "SwarmStart",
      payload: { tasks, settings, project_path: projectPath.trim() },
    });
  };

  const handleResume = useCallback(
    (record: SwarmRunRecord) => {
      safeSend({
        type: "HistoryResume",
        payload: { run_id: record.runId, settings },
      });
      setTab("swarm");
    },
    [safeSend, settings],
  );

  const handleStop = () => safeSend({ type: "SwarmStop" });
  const handleGate = () => safeSend({ type: "RunGate" });

  const handleWorkerInput = useCallback(
    (data: string) => {
      if (!selectedWorkerId) return;
      safeSend({
        type: "WorkerInput",
        payload: { worker_id: selectedWorkerId, data },
      });
    },
    [selectedWorkerId, safeSend],
  );

  const handleWorkerInputText = () => {
    if (!workerInputText.trim() || !selectedWorkerId) return;
    safeSend({
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
  const isIdle = swarm.status === "idle";
  const progress =
    swarm.totalTasks > 0 ? (swarm.completedTasks / swarm.totalTasks) * 100 : 0;

  // #3 Filtered logs
  const filteredLogs = state.logs.filter((log) => {
    if (logFilter !== "all" && log.level !== logFilter) return false;
    if (logSearch && !log.text.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="app">
      {/* Toast notifications */}
      <ToastContainer />

      {/* WS Settings modal */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSave}
      />

      {/* #4 Worker Modal */}
      {workerModal && (
        <WorkerModal
          label={workers.find((w) => w.id === workerModal)?.label ?? workerModal.slice(0, 8)}
          logs={state.workerLogs[workerModal] ?? []}
          onClose={() => setWorkerModal(null)}
          onSend={(text) =>
            safeSend({ type: "WorkerInput", payload: { worker_id: workerModal, data: text } })
          }
        />
      )}

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

      {/* タブナビゲーション */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${tab === "swarm" ? "active" : ""}`}
          onClick={() => setTab("swarm")}
        >
          Swarm
        </button>
        <button
          className={`tab-btn ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          履歴 {state.history.length > 0 && `(${state.history.length})`}
        </button>
      </div>

      {/* 履歴タブ */}
      {tab === "history" && (
        <div style={{ padding: "0 0 24px" }}>
          {state.history.length === 0 ? (
            <div className="card" style={{ textAlign: "center", color: "#71717a" }}>
              実行履歴がありません
            </div>
          ) : (
            <div className="card" style={{ padding: "12px 14px" }}>
              <h2>実行履歴 ({state.history.length} 件)</h2>
              {state.history.map((r) => (
                <HistoryCard key={r.runId} record={r} onResume={handleResume} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Swarm タブ */}
      {tab === "swarm" && <>

      {/* #1 Swarm Settings Panel (idle only) */}
      {isIdle && !state.splitResult && (
        <>
          <div style={{ textAlign: "right", padding: "0 12px" }}>
            <button
              className={`settings-btn ${swarmSettingsOpen ? "active" : ""}`}
              onClick={() => setSwarmSettingsOpen((o) => !o)}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              {swarmSettingsOpen ? "▲ Swarm設定" : "▼ Swarm設定"}
            </button>
          </div>
          {swarmSettingsOpen && (
            <SwarmSettingsPanel settings={settings} onChange={setSettings} />
          )}
        </>
      )}

      {/* Task Input */}
      {isIdle && !state.splitResult && (
        <div className="card">
          <h2>Task Input</h2>
          {state.projects.length > 0 ? (
            <select
              className="project-input"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
            >
              <option value="">プロジェクトを選択...</option>
              {state.projects.map((p) => (
                <option key={p.id} value={p.localPath}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="project-input"
              placeholder="プロジェクトパス (/path/to/project)"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
            />
          )}
          {/* #8 Voice input wrapper */}
          <div className="textarea-wrap">
            <textarea
              className="task-input"
              placeholder="実装したい機能を入力..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={4}
            />
            <button
              className={`mic-btn ${listening ? "listening" : ""}`}
              onClick={startVoice}
              title="音声入力"
            >
              🎤
            </button>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSplit}
            disabled={state.splitting || !inputText.trim() || !projectPath.trim()}
          >
            {state.splitting ? "Splitting..." : "Split Tasks"}
          </button>
        </div>
      )}

      {/* #2 Editable Split Result */}
      {editingTasks && isIdle && (
        <div className="card">
          <h2>Tasks ({editingTasks.length})</h2>
          {state.conflictWarnings.length > 0 && (
            <div className="warnings">
              {state.conflictWarnings.map((w, i) => (
                <div key={i} className="warning-item">
                  {w}
                </div>
              ))}
            </div>
          )}
          <ul className="task-list">
            {editingTasks.map((task, idx) => (
              <li key={task.id} className="task-edit-row">
                <span className="task-id">#{task.id}</span>
                <input
                  className="task-edit-input"
                  value={task.title}
                  onChange={(e) =>
                    setEditingTasks((prev) =>
                      prev!.map((t, i) =>
                        i === idx ? { ...t, title: e.target.value } : t,
                      ),
                    )
                  }
                />
                {task.dependsOn.length > 0 && (
                  <span className="task-deps">←{task.dependsOn.join(",")}</span>
                )}
                <button
                  className="task-delete-btn"
                  onClick={() =>
                    setEditingTasks((prev) => prev!.filter((_, i) => i !== idx))
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="btn-group">
            <button
              className="btn btn-primary"
              onClick={handleStart}
              disabled={editingTasks.length === 0}
            >
              Start Swarm
            </button>
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
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
            <span className={`phase-badge phase-${swarm.status}`}>{swarm.status}</span>
            {swarm.currentWave > 0 && (
              <span className="wave-badge">Wave {swarm.currentWave}</span>
            )}
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
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
          {!isRunning && (swarm.status === "done" || swarm.status === "blocked" || swarm.status === "cancelled") && (
            <button
              className="btn btn-secondary"
              onClick={() => safeSend({ type: "SwarmReset" })}
              style={{ marginTop: 8 }}
            >
              ＋ 新規タスク
            </button>
          )}
        </div>
      )}

      {/* Task Board */}
      {state.tasks.length > 0 && <TaskBoard tasks={state.tasks} />}

      {/* #6 PR Links */}
      {prLinks.length > 0 && (
        <div className="card">
          <h2>Pull Requests ({prLinks.length})</h2>
          <ul className="pr-list">
            {prLinks.map((url, i) => (
              <li key={i} className="pr-link">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {url.replace("https://github.com/", "")}
                </a>
              </li>
            ))}
          </ul>
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

      {/* Workers — tap to open modal (#4) */}
      {workers.length > 0 && (
        <div className="card">
          <h2>Workers ({workers.length})</h2>
          <ul className="worker-list">
            {workers.map((w) => (
              <li
                key={w.id}
                className="worker-item"
                onClick={() => {
                  setWorkerModal(w.id);
                  setSelectedWorkerId(w.id);
                }}
              >
                <span
                  className="worker-dot"
                  style={{ backgroundColor: STATUS_COLORS[w.status] || "#666" }}
                />
                <span className="worker-label">{w.label || w.id.slice(0, 8)}</span>
                <span className="worker-status">{w.status}</span>
                <span className="worker-expand">›</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Worker Output — xterm.js (selected worker) */}
      {selectedWorkerId && state.workerLogs[selectedWorkerId] && !workerModal && (
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

      {/* #3 Log Stream with filter */}
      {state.logs.length > 0 && (
        <div className="card log-card">
          <h2>Logs</h2>
          <div className="filter-chips">
            {(["all", "info", "warn", "error", "success"] as const).map((f) => (
              <button
                key={f}
                className={`filter-chip chip-${f} ${logFilter === f ? "active" : ""}`}
                onClick={() => setLogFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            className="log-search"
            placeholder="ログを検索..."
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
          />
          <div className="log-stream">
            {filteredLogs.map((log, i) => (
              <div key={i} className={`log-entry log-${log.level}`}>
                <span className="log-ts">{log.ts}</span>
                <span className="log-text">{log.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      </> /* end swarm tab */}
    </div>
  );
}
