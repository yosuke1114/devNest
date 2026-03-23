import { useRef, useCallback } from "react";
import type { SubTask, SwarmSettings, ClientMessage } from "../types/swarm";
import type { SwarmState } from "../hooks/useSwarmWS";
import { showToast } from "./Toast";
import { TaskBoard } from "./TaskBoard";
import { SwarmSettingsPanel } from "./SwarmSettingsPanel";
import { StickyStatusBar } from "./StickyStatusBar";
import { useLogFilter } from "../hooks/useLogFilter";
import { usePRLinks } from "../hooks/usePRLinks";
import { useQuickRun, saveLastRun } from "../hooks/useQuickRun";
import { useTemplates } from "../hooks/useTemplates";

// Highlight matching text within a string
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="worker-search-highlight">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

const STATUS_COLORS: Record<string, string> = {
  idle: "#71717a",
  running: "#3b82f6",
  done: "#10b981",
  error: "#ef4444",
};

interface Props {
  state: SwarmState;
  safeSend: (msg: ClientMessage) => void;
  settings: SwarmSettings;
  setSettings: (s: SwarmSettings) => void;
  editingTasks: SubTask[] | null;
  setEditingTasks: React.Dispatch<React.SetStateAction<SubTask[] | null>>;
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  projectPath: string;
  setProjectPath: React.Dispatch<React.SetStateAction<string>>;
  listening: boolean;
  startVoice: () => void;
  autoGate: boolean;
  setAutoGate: React.Dispatch<React.SetStateAction<boolean>>;
  swarmSettingsOpen: boolean;
  setSwarmSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  workerSearch: string;
  setWorkerSearch: React.Dispatch<React.SetStateAction<string>>;
  notifAsked: boolean;
  setNotifAsked: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenWorker: (id: string) => void;
}

export function SwarmTab({
  state,
  safeSend,
  settings,
  setSettings,
  editingTasks,
  setEditingTasks,
  inputText,
  setInputText,
  projectPath,
  setProjectPath,
  listening,
  startVoice,
  autoGate,
  setAutoGate,
  swarmSettingsOpen,
  setSwarmSettingsOpen,
  workerSearch,
  setWorkerSearch,
  notifAsked,
  setNotifAsked,
  onOpenWorker,
}: Props) {
  const logEndRef = useRef<HTMLDivElement>(null);

  const { swarm, workers } = state;
  const isRunning = swarm.status === "running" || swarm.status === "gating";
  const isIdle = swarm.status === "idle";
  const progress = swarm.totalTasks > 0 ? (swarm.completedTasks / swarm.totalTasks) * 100 : 0;
  const isNewlyDone = swarm.status === "done";

  const { logFilter, setLogFilter, logSearch, setLogSearch, filteredLogs } = useLogFilter(state.logs);
  const prLinks = usePRLinks(state.workerLogs);

  // D4: extract gate result logs
  const gateResultLogs = state.logs.filter((l) =>
    l.text.toLowerCase().includes("gate") && (l.level === "success" || l.level === "error"),
  );

  // F1: Quick run
  const handleRestoreLastRun = useCallback(
    (run: { tasks: SubTask[]; settings: SwarmSettings; projectPath: string }) => {
      setEditingTasks(run.tasks.map((t) => ({ ...t })));
      setSettings(run.settings);
      setProjectPath(run.projectPath);
      safeSend({
        type: "SwarmStart",
        payload: { tasks: run.tasks, settings: run.settings, project_path: run.projectPath },
      });
    },
    [setEditingTasks, setSettings, setProjectPath, safeSend],
  );
  const { lastRun, execute: executeQuickRun } = useQuickRun(handleRestoreLastRun);

  // F5: Templates
  const { templates, saveTemplate, getTemplate } = useTemplates();

  const handleSplit = () => {
    if (!inputText.trim() || !projectPath.trim()) return;
    safeSend({
      type: "TaskSplit",
      payload: { prompt: inputText.trim(), project_path: projectPath.trim() },
    });
  };

  const handleStart = () => {
    const tasks = editingTasks ?? state.splitResult;
    if (!tasks?.length || !projectPath.trim()) return;
    // F1: save last run
    saveLastRun({ tasks, settings, projectPath: projectPath.trim() });
    safeSend({
      type: "SwarmStart",
      payload: { tasks, settings, project_path: projectPath.trim() },
    });
  };

  const handleStop = () => safeSend({ type: "SwarmStop" });
  const handleGate = () => safeSend({ type: "RunGate" });

  // A3: add task
  const addTask = () => {
    setEditingTasks((prev) => {
      if (!prev) return prev;
      const nextId = prev.length > 0 ? Math.max(...prev.map((t) => t.id)) + 1 : 1;
      return [...prev, { id: nextId, title: "", files: [], instruction: "", dependsOn: [] }];
    });
  };

  // F5: save template
  const handleSaveTemplate = () => {
    const tasks = editingTasks ?? state.splitResult;
    if (!tasks?.length) return;
    const name = window.prompt("テンプレート名を入力してください:");
    if (!name?.trim()) return;
    saveTemplate(name.trim(), tasks, settings);
    showToast(`テンプレート「${name.trim()}」を保存しました`, "success");
  };

  // F5: load template
  const handleLoadTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (!name) return;
    const tmpl = getTemplate(name);
    if (!tmpl) return;
    setEditingTasks(tmpl.tasks.map((t) => ({ ...t })));
    setSettings(tmpl.settings);
    showToast(`テンプレート「${name}」を読み込みました`, "info");
    e.target.value = "";
  };

  // F3: sorted workers by search match
  const sortedWorkers = workerSearch
    ? [...workers].sort((a, b) => {
        const aLogs = state.workerLogs[a.id] ?? [];
        const bLogs = state.workerLogs[b.id] ?? [];
        const aMatch = aLogs.some((l) => l.toLowerCase().includes(workerSearch.toLowerCase()));
        const bMatch = bLogs.some((l) => l.toLowerCase().includes(workerSearch.toLowerCase()));
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      })
    : workers;

  return (
    <>
      {/* E1: Sticky status bar when running */}
      {isRunning && (
        <StickyStatusBar
          currentWave={swarm.currentWave}
          completedTasks={swarm.completedTasks}
          totalTasks={swarm.totalTasks}
          onStop={handleStop}
        />
      )}

      {/* E5: Notification permission banner on newly done */}
      {isNewlyDone && !notifAsked && typeof Notification !== "undefined" && Notification.permission === "default" && (
        <div className="notif-banner">
          <span className="notif-banner-text">通知を許可しますか？完了時にお知らせします。</span>
          <button
            className="notif-allow-btn"
            onClick={() => {
              Notification.requestPermission();
              setNotifAsked(true);
            }}
          >
            許可
          </button>
          <button className="notif-dismiss-btn" onClick={() => setNotifAsked(true)}>
            ×
          </button>
        </div>
      )}

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

          {/* F1: Quick Run button */}
          {lastRun && (
            <button className="quick-run-btn" onClick={executeQuickRun}>
              ▶ 前回の設定で実行（{lastRun.tasks.length} タスク）
            </button>
          )}

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
              maxLength={80}
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
          {/* D3: char counter */}
          <div className={`task-char-counter ${inputText.length >= 70 ? "warn" : ""}`}>
            {inputText.length} / 80
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

      {/* A3: Editable Split Result */}
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
                  maxLength={80}
                  onChange={(e) =>
                    setEditingTasks((prev) =>
                      prev!.map((t, i) =>
                        i === idx ? { ...t, title: e.target.value } : t,
                      ),
                    )
                  }
                />
                {task.dependsOn.length > 0 && (
                  <span className="task-deps">↳{task.dependsOn.join(",")}</span>
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

          {/* F5: Template save */}
          <div className="template-section">
            <button className="template-save-btn" onClick={handleSaveTemplate}>
              💾 テンプレート保存
            </button>
            {templates.length > 0 && (
              <select className="template-select" defaultValue="" onChange={handleLoadTemplate}>
                <option value="" disabled>📋 テンプレートを選択...</option>
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            )}
          </div>

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

      {/* Gate Ready - D4: detailed gate result */}
      {state.gateReady != null && (
        <div className="card gate-card">
          <h2>Gate Check Ready</h2>
          <p className="gate-text">Wave {state.gateReady} の全タスクが完了しました</p>
          {autoGate ? (
            <p style={{ fontSize: 12, color: "var(--warn)", margin: 0 }}>
              Auto Gate 有効 — 自動実行中
            </p>
          ) : (
            <button className="btn btn-primary" onClick={handleGate}>
              Run Gate
            </button>
          )}
          {/* D4: recent gate logs */}
          {gateResultLogs.length > 0 && (
            <div className="gate-result-detail">
              {gateResultLogs.slice(-3).map((log, i) => (
                <div key={i} className="gate-result-row">
                  <span className={`gate-result-status ${log.level === "success" ? "passed" : "blocked"}`}>
                    {log.level === "success" ? "passed" : "blocked"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{log.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* B3: Workers - E3: branch/role, F3: search */}
      {workers.length > 0 && (
        <div className="card">
          <h2>Workers ({workers.length})</h2>
          {/* F3: Worker log search */}
          <input
            className="worker-search"
            placeholder="🔍 Worker ログ検索..."
            value={workerSearch}
            onChange={(e) => setWorkerSearch(e.target.value)}
          />
          <ul className="worker-list">
            {sortedWorkers.map((w) => {
              const logs = state.workerLogs[w.id] ?? [];
              const lastLine = logs.slice(-1)[0] ?? "";
              // E3: extract branch and role from worker data (optional fields)
              const wWithExtra = w as typeof w & { branch?: string; role?: string };
              const hasBranchRole = wWithExtra.branch || wWithExtra.role;
              // F3: check if this worker matches search
              const matchesSearch = workerSearch
                ? logs.some((l) => l.toLowerCase().includes(workerSearch.toLowerCase()))
                : false;
              const previewText = workerSearch && matchesSearch
                ? (logs.find((l) => l.toLowerCase().includes(workerSearch.toLowerCase())) ?? lastLine)
                : lastLine;

              return (
                <li
                  key={w.id}
                  className={`worker-item ${matchesSearch && workerSearch ? "selected" : ""}`}
                  onClick={() => onOpenWorker(w.id)}
                >
                  <span
                    className="worker-dot"
                    style={{ backgroundColor: STATUS_COLORS[w.status] || "#666" }}
                  />
                  <div className="worker-item-body">
                    <span className="worker-label">{w.label || w.id.slice(0, 8)}</span>
                    {/* E3: branch/role row */}
                    {hasBranchRole && (
                      <span className="worker-branch-role">
                        {wWithExtra.branch ? `[${wWithExtra.branch}]` : ""}{wWithExtra.role ? ` role: ${wWithExtra.role}` : ""}
                      </span>
                    )}
                    {previewText && (
                      <span className="worker-preview">
                        {workerSearch && matchesSearch ? (
                          <HighlightText text={previewText.slice(0, 60)} query={workerSearch} />
                        ) : (
                          previewText.slice(0, 60)
                        )}
                      </span>
                    )}
                  </div>
                  <span className="worker-status">{w.status}</span>
                  <span className="worker-expand">›</span>
                </li>
              );
            })}
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
  );
}
