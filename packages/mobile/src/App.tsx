import { useState, useRef, useEffect, useCallback } from "react";
import { useSwarmWS } from "./hooks/useSwarmWS";
import type { SubTask, SwarmSettings, ClientMessage, SwarmRunRecord } from "./types/swarm";
import { DEFAULT_SETTINGS } from "./types/swarm";
import { ToastContainer, showToast } from "./components/Toast";
import { SettingsPanel, loadSettings, type MobileSettings } from "./components/SettingsPanel";
import { TaskBoard } from "./components/TaskBoard";
import { SwarmSettingsPanel } from "./components/SwarmSettingsPanel";
import { WorkerModal } from "./components/WorkerModal";
import { HistoryCard } from "./components/HistoryCard";
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

  // Core input state
  const [inputText, setInputText] = useState("");
  const [projectPath, setProjectPath] = useState("");

  // タブ
  const [tab, setTab] = useState<"swarm" | "history">("swarm");

  // WS settings panel (gear icon)
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Swarm settings
  const [settings, setSettings] = useState<SwarmSettings>(DEFAULT_SETTINGS);
  const [swarmSettingsOpen, setSwarmSettingsOpen] = useState(false);

  // Editable task list
  const [editingTasks, setEditingTasks] = useState<SubTask[] | null>(null);

  // Log filter
  const [logFilter, setLogFilter] = useState<"all" | "info" | "warn" | "error" | "success">("all");
  const [logSearch, setLogSearch] = useState("");

  // Worker modal
  const [workerModal, setWorkerModal] = useState<string | null>(null);

  // PR links
  const [prLinks, setPrLinks] = useState<string[]>([]);

  // Voice input
  const [listening, setListening] = useState(false);

  // B2: Auto Gate (localStorage 永続化)
  const [autoGate, setAutoGate] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("devnest-auto-gate") ?? "false"); }
    catch { return false; }
  });

  // A1: WS ホスト名表示
  const [wsHost, setWsHost] = useState(() => {
    try { return new URL(loadSettings().wsUrl).host; } catch { return ""; }
  });

  // Offline queue (WorkerInput のみキュー)
  const pendingMsgs = useRef<ClientMessage[]>([]);

  // C3: Pull to Refresh
  const touchStartY = useRef(0);
  const [pullY, setPullY] = useState(0);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs]);

  // Sync editable tasks when splitResult arrives
  useEffect(() => {
    if (state.splitResult) {
      setEditingTasks(state.splitResult.map((t) => ({ ...t })));
    } else {
      setEditingTasks(null);
    }
  }, [state.splitResult]);

  // A4: Swarm ステータス変化で Toast（useSwarmWS.ts 側から移動済み）
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

  // PR links: Worker 出力から抽出
  useEffect(() => {
    const allLines = Object.values(state.workerLogs).flat();
    const found = new Set<string>();
    for (const line of allLines) {
      const matches = line.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/g);
      if (matches) matches.forEach((u) => found.add(u));
    }
    setPrLinks(Array.from(found));
  }, [state.workerLogs]);

  // オフラインキューをリコネクト時にフラッシュ
  useEffect(() => {
    if (state.connected && pendingMsgs.current.length > 0) {
      const queued = [...pendingMsgs.current];
      pendingMsgs.current = [];
      for (const msg of queued) send(msg);
      showToast(`オフラインキュー ${queued.length} 件を送信`, "info");
    }
  }, [state.connected, send]);

  // B2: autoGate を localStorage に永続化
  useEffect(() => {
    localStorage.setItem("devnest-auto-gate", JSON.stringify(autoGate));
  }, [autoGate]);

  // B2: gateReady 変化時に自動 Gate 実行
  const prevGateReady = useRef<number | null>(null);
  useEffect(() => {
    if (autoGate && state.gateReady != null && state.gateReady !== prevGateReady.current) {
      prevGateReady.current = state.gateReady;
      send({ type: "RunGate" });
      showToast(`Wave ${state.gateReady} Gate 自動実行`, "info");
    }
    if (state.gateReady == null) prevGateReady.current = null;
  }, [autoGate, state.gateReady, send]);

  // オフラインキュー付き send
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

  // 音声入力
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

  const handleSettingsSave = (s: MobileSettings) => {
    reconnect();
    try { setWsHost(new URL(s.wsUrl).host); } catch { setWsHost(s.wsUrl); }
  };

  // A3: タスク手動追加
  const addTask = () => {
    setEditingTasks((prev) => {
      if (!prev) return prev;
      const nextId = prev.length > 0 ? Math.max(...prev.map((t) => t.id)) + 1 : 1;
      return [...prev, { id: nextId, title: "", files: [], instruction: "", dependsOn: [] }];
    });
  };

  // C3: Pull to Refresh ハンドラ
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = 0;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartY.current === 0) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setPullY(Math.min(delta * 0.5, 60));
    else setPullY(0);
  };

  const handleTouchEnd = () => {
    if (pullY >= 40) {
      safeSend({ type: "Sync" });
      showToast("同期中...", "info");
    }
    setPullY(0);
    touchStartY.current = 0;
  };

  const { swarm, workers } = state;
  const isRunning = swarm.status === "running" || swarm.status === "gating";
  const isIdle = swarm.status === "idle";
  const progress =
    swarm.totalTasks > 0 ? (swarm.completedTasks / swarm.totalTasks) * 100 : 0;

  const filteredLogs = state.logs.filter((log) => {
    if (logFilter !== "all" && log.level !== logFilter) return false;
    if (logSearch && !log.text.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div
      className="app"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* C3: Pull to Refresh インジケーター */}
      {pullY > 0 && (
        <div
          className="pull-refresh-indicator"
          style={{
            opacity: Math.min(pullY / 40, 1),
            transform: `translateX(-50%) translateY(${pullY - 32}px)`,
          }}
        >
          ↓
        </div>
      )}

      <ToastContainer />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSettingsSave}
      />

      {/* A2: Worker Modal (xterm.js 統合) */}
      {workerModal && (
        <WorkerModal
          label={workers.find((w) => w.id === workerModal)?.label ?? workerModal.slice(0, 8)}
          lines={state.workerLogs[workerModal] ?? []}
          onClose={() => setWorkerModal(null)}
          onInput={(data) =>
            safeSend({ type: "WorkerInput", payload: { worker_id: workerModal, data } })
          }
        />
      )}

      {/* Header */}
      <header className="header">
        <h1>DevNest Mobile</h1>
        <div className="header-right">
          {/* A1: Disconnected 時はタップで再接続 + WS ホスト名表示 */}
          <div className="conn-badge-wrap">
            <span
              className={`conn-badge ${state.connected ? "on" : "off"}`}
              onClick={!state.connected ? reconnect : undefined}
            >
              {state.connected ? "Connected" : "↺ Reconnect"}
            </span>
            {wsHost && <span className="ws-host">{wsHost}</span>}
          </div>
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
      {tab === "swarm" && (
        <>
          {/* B2: Auto Gate トグル + Swarm 設定ボタン */}
          {isIdle && !state.splitResult && (
            <>
              <div className="settings-toolbar">
                <label className="auto-gate-toggle">
                  <span>Auto Gate</span>
                  <div
                    className={`toggle-switch ${autoGate ? "on" : ""}`}
                    onClick={() => setAutoGate((o) => !o)}
                  >
                    <div className="toggle-knob" />
                  </div>
                </label>
                <button
                  className={`settings-btn ${swarmSettingsOpen ? "active" : ""}`}
                  onClick={() => setSwarmSettingsOpen((o) => !o)}
                  style={{ fontSize: 12, padding: "4px 10px", width: "auto", height: "auto" }}
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

          {/* A3: Editable Split Result（+ Task ボタン追加） */}
          {editingTasks && isIdle && (
            <div className="card">
              <h2>Tasks ({editingTasks.length})</h2>
              {state.conflictWarnings.length > 0 && (
                <div className="warnings">
                  {state.conflictWarnings.map((w, i) => (
                    <div key={i} className="warning-item">{w}</div>
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
              <button className="btn btn-secondary add-task-btn" onClick={addTask}>
                + Task
              </button>
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

          {/* PR Links */}
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
              {autoGate ? (
                <p style={{ fontSize: 12, color: "#f59e0b", margin: 0 }}>
                  Auto Gate 有効 — 自動実行中
                </p>
              ) : (
                <button className="btn btn-primary" onClick={handleGate}>
                  Run Gate
                </button>
              )}
            </div>
          )}

          {/* B3: Workers（最終出力1行プレビュー付き） */}
          {workers.length > 0 && (
            <div className="card">
              <h2>Workers ({workers.length})</h2>
              <ul className="worker-list">
                {workers.map((w) => (
                  <li
                    key={w.id}
                    className="worker-item"
                    onClick={() => setWorkerModal(w.id)}
                  >
                    <span
                      className="worker-dot"
                      style={{ backgroundColor: STATUS_COLORS[w.status] || "#666" }}
                    />
                    <div className="worker-item-body">
                      <span className="worker-label">{w.label || w.id.slice(0, 8)}</span>
                      {state.workerLogs[w.id]?.slice(-1)[0] && (
                        <span className="worker-preview">
                          {state.workerLogs[w.id].slice(-1)[0].slice(0, 60)}
                        </span>
                      )}
                    </div>
                    <span className="worker-status">{w.status}</span>
                    <span className="worker-expand">›</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Log Stream with filter */}
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
        </>
      )}
    </div>
  );
}
