import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSwarmStore } from "../../stores/swarmStore";
import type {
  SubTask,
  SplitTaskResult,
  SwarmSettings,
} from "./types";
import { DEFAULT_SWARM_SETTINGS } from "./types";
import { ResultSummaryPanel } from "./ResultSummaryPanel";
import { SwarmConflictView } from "./SwarmConflictView";

interface OrchestratorPanelProps {
  workingDir: string;
}

export function OrchestratorPanel({ workingDir }: OrchestratorPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [tasks, setTasks] = useState<SubTask[]>([]);
  const [conflictWarnings, setConflictWarnings] = useState<string[]>([]);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SwarmSettings>(DEFAULT_SWARM_SETTINGS);

  const {
    currentRun,
    mergeReady,
    isStarting,
    isMerging,
    aggregatedResult,
    conflictOutcome,
    startRun,
    cancelRun,
    mergeAll,
    listenOrchestratorEvents,
    setConflictOutcome,
  } = useSwarmStore();

  // Orchestrator イベントリスナー登録
  useEffect(() => {
    return listenOrchestratorEvents();
  }, [listenOrchestratorEvents]);

  const handleSplit = async () => {
    if (!prompt.trim()) return;
    setSplitting(true);
    setError(null);
    try {
      const result = await invoke<SplitTaskResult>("split_task", {
        request: {
          prompt,
          projectPath: workingDir,
          contextFiles: [],
        },
      });
      setTasks(result.tasks);
      setConflictWarnings(result.conflictWarnings);
      setCycleError(result.cycleError ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSplitting(false);
    }
  };

  const handleDeleteTask = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleEditInstruction = (id: number, instruction: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, instruction } : t)));
  };

  const handleRun = async () => {
    if (tasks.length === 0) return;
    await startRun(tasks, settings, workingDir);
  };

  return (
    <div style={panelStyle} data-testid="orchestrator-panel">
      {/* ヘッダー */}
      <div style={headerStyle}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
          🧠 Orchestrator
        </span>
        <button
          data-testid="settings-button"
          onClick={() => setShowSettings(true)}
          style={iconButtonStyle}
          aria-label="Swarm設定を開く"
        >
          ⚙️
        </button>
      </div>

      {/* タスク入力 */}
      <div style={{ flexShrink: 0, padding: "8px 12px" }}>
        <textarea
          data-testid="task-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="タスクを自然言語で入力してください&#10;例: このPRのレビュー指摘を全部修正して"
          style={textareaStyle}
          rows={4}
        />
        <button
          data-testid="split-button"
          onClick={handleSplit}
          disabled={splitting || !prompt.trim()}
          style={{
            ...actionButtonStyle,
            opacity: splitting || !prompt.trim() ? 0.5 : 1,
            width: "100%",
            marginTop: 6,
          }}
        >
          {splitting ? "🔄 分解中..." : "✂️ タスクを分解"}
        </button>
        {error && (
          <div style={{ color: "#fc8181", fontSize: 11, marginTop: 4 }}>{error}</div>
        )}
      </div>

      {/* 循環依存エラー */}
      {cycleError && (
        <div
          data-testid="cycle-error"
          style={{
            margin: "0 12px",
            padding: "6px 10px",
            background: "#2d0a0a",
            border: "1px solid #fc8181",
            borderRadius: 4,
            fontSize: 11,
            color: "#fc8181",
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>🔄 循環依存エラー</div>
          {cycleError}
        </div>
      )}

      {/* 競合警告 */}
      {conflictWarnings.length > 0 && (
        <div
          data-testid="conflict-warnings"
          style={{
            margin: "0 12px",
            padding: "6px 10px",
            background: "#2d2014",
            border: "1px solid #f6ad55",
            borderRadius: 4,
            fontSize: 11,
            color: "#f6ad55",
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>⚠️ ファイル競合警告</div>
          {conflictWarnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {/* SubTask リスト */}
      <div style={{ flex: 1, overflow: "auto", padding: "4px 12px" }}>
        {tasks.length === 0 ? (
          <div style={emptyStyle}>
            タスクを入力して「分解」を実行してください
          </div>
        ) : (
          tasks.map((task, idx) => (
            <SubTaskCard
              key={task.id}
              task={task}
              index={idx}
              onDelete={handleDeleteTask}
              onEditInstruction={handleEditInstruction}
            />
          ))
        )}
      </div>

      {/* 実行ボタン / 実行中ステータス */}
      {tasks.length > 0 && !currentRun && (
        <div style={{ padding: "8px 12px", flexShrink: 0, borderTop: "1px solid #21262d" }}>
          <div style={{ color: "#8b949e", fontSize: 11, marginBottom: 4 }}>
            {tasks.length} タスク / 最大 {settings.maxWorkers} Worker 並列
          </div>
          <button
            data-testid="run-button"
            onClick={handleRun}
            disabled={isStarting || !!cycleError}
            style={{
              ...actionButtonStyle,
              width: "100%",
              background: "#1a7f37",
              opacity: isStarting || !!cycleError ? 0.6 : 1,
            }}
          >
            {isStarting ? "🔄 起動中..." : "▶ 実行開始"}
          </button>
        </div>
      )}

      {/* 実行中パネル */}
      {currentRun && currentRun.status !== "done" && currentRun.status !== "partialDone" && (
        <div style={{ padding: "8px 12px", flexShrink: 0, borderTop: "1px solid #21262d" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#8b949e" }}>
              {currentRun.status === "merging" ? "🔀 マージ中..." : `▶ 実行中 ${currentRun.doneCount}/${currentRun.total}`}
            </span>
            <button
              onClick={cancelRun}
              style={{ ...iconButtonStyle, color: "#fc8181", fontSize: 11 }}
              aria-label="実行をキャンセル"
            >
              ✕ キャンセル
            </button>
          </div>
          {/* Worker 割り当て一覧（executionState 対応） */}
          {currentRun.assignments.map((a) => (
            <div key={a.workerId || a.task.id} style={{ display: "flex", gap: 6, fontSize: 10, color: "#8b949e", marginBottom: 2, fontFamily: "monospace" }}>
              <span style={{
                color: a.executionState === "done" ? "#68d391"
                  : a.executionState === "error" ? "#fc8181"
                  : a.executionState === "skipped" ? "#484f58"
                  : a.executionState === "waiting" ? "#4a5568"
                  : "#f6ad55"
              }}>
                {a.executionState === "done" ? "✓"
                  : a.executionState === "error" ? "✕"
                  : a.executionState === "skipped" ? "─"
                  : a.executionState === "waiting" ? "⏸"
                  : "●"}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.task.title}
                {a.executionState === "skipped" && <span style={{ color: "#484f58", marginLeft: 4 }}>(スキップ)</span>}
                {a.executionState === "waiting" && a.task.dependsOn?.length > 0 && (
                  <span style={{ color: "#4a5568", marginLeft: 4 }}>← Task {a.task.dependsOn.join(",")}</span>
                )}
              </span>
              <span style={{ color: "#484f58" }}>{a.branchName.split("/").pop()}</span>
            </div>
          ))}
          {/* マージ実行ボタン */}
          {mergeReady && (
            <button
              data-testid="merge-button"
              onClick={mergeAll}
              disabled={isMerging}
              style={{ ...actionButtonStyle, width: "100%", marginTop: 8, background: "#6e40c9", opacity: isMerging ? 0.6 : 1 }}
            >
              {isMerging ? "🔀 マージ中..." : "🔀 ブランチをマージ"}
            </button>
          )}
        </div>
      )}

      {/* 完了サマリー */}
      {currentRun && (currentRun.status === "done" || currentRun.status === "partialDone" || currentRun.status === "failed") && (
        <div style={{ flex: 1, overflow: "auto", borderTop: "1px solid #21262d" }}>
          <ResultSummaryPanel
            run={currentRun}
            result={aggregatedResult}
            onReset={() => useSwarmStore.getState().reset()}
            onOpenConflict={(outcome) => setConflictOutcome(outcome)}
          />
        </div>
      )}

      {/* コンフリクト解決ビュー */}
      {conflictOutcome && currentRun && (
        <SwarmConflictView
          outcome={conflictOutcome}
          projectPath={currentRun.projectPath}
          onResolved={() => setConflictOutcome(null)}
          onClose={() => setConflictOutcome(null)}
        />
      )}

      {/* 設定モーダル */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ─── SubTaskCard ───────────────────────────────────────────────

interface SubTaskCardProps {
  task: SubTask;
  index: number;
  onDelete: (id: number) => void;
  onEditInstruction: (id: number, instruction: string) => void;
}

function SubTaskCard({ task, index, onDelete, onEditInstruction }: SubTaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={cardStyle} data-testid={`subtask-card-${task.id}`}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ color: "#484f58", fontSize: 11, width: 16 }}>{index + 1}.</span>
        <span style={{ flex: 1, color: "#e6edf3", fontSize: 12, fontFamily: "monospace" }}>
          {task.title}
        </span>
        {task.dependsOn?.length > 0 && (
          <span style={{ color: "#f6ad55", fontSize: 10 }}>
            ↳ Task {task.dependsOn.join(",")} 待
          </span>
        )}
        {task.files.length > 0 && (
          <span style={{ color: "#58a6ff", fontSize: 10 }}>
            {task.files.length} ファイル
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          style={{ ...iconButtonStyle, color: "#fc8181", fontSize: 11 }}
          aria-label={`タスク ${task.id} を削除`}
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 6 }}>
          {task.files.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              {task.files.map((f) => (
                <span key={f} style={fileTagStyle}>{f}</span>
              ))}
            </div>
          )}
          <textarea
            value={task.instruction}
            onChange={(e) => onEditInstruction(task.id, e.target.value)}
            style={{ ...textareaStyle, rows: 3, fontSize: 11, height: 60 } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

// ─── SettingsModal ─────────────────────────────────────────────

interface SettingsModalProps {
  settings: SwarmSettings;
  onChange: (s: SwarmSettings) => void;
  onClose: () => void;
}

function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
  const [local, setLocal] = useState(settings);

  const handleSave = () => {
    onChange(local);
    onClose();
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle} data-testid="settings-modal">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ color: "#e6edf3", fontWeight: 700 }}>⚙️ Swarm設定</span>
          <button onClick={onClose} style={iconButtonStyle} aria-label="設定を閉じる">✕</button>
        </div>

        <label style={labelStyle}>並列 Worker 上限</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {([2, 4, 6, 8] as const).map((n) => (
            <button
              key={n}
              aria-pressed={local.maxWorkers === n}
              onClick={() => setLocal((s) => ({ ...s, maxWorkers: n }))}
              style={{
                ...segmentButtonStyle,
                background: local.maxWorkers === n ? "#1f6feb" : "#21262d",
                color: local.maxWorkers === n ? "#fff" : "#8b949e",
              }}
            >
              {n}
            </button>
          ))}
        </div>

        <label style={labelStyle}>タイムアウト: {local.timeoutMinutes} 分</label>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={local.timeoutMinutes}
          onChange={(e) => setLocal((s) => ({ ...s, timeoutMinutes: Number(e.target.value) }))}
          style={{ width: "100%", marginBottom: 12 }}
          aria-label="タイムアウト設定"
        />

        <label style={labelStyle}>Git ブランチプレフィックス</label>
        <input
          type="text"
          value={local.branchPrefix}
          onChange={(e) => setLocal((s) => ({ ...s, branchPrefix: e.target.value }))}
          style={inputStyle}
          aria-label="Gitブランチプレフィックス"
        />

        {/* Shell セクション */}
        <div style={{ color: "#8b949e", fontSize: 10, fontWeight: 700, marginBottom: 6, marginTop: 12, letterSpacing: "0.05em" }}>SHELL</div>
        <label style={labelStyle}>デフォルト Shell</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {["zsh", "bash", "fish"].map((sh) => (
            <button
              key={sh}
              aria-pressed={local.defaultShell === sh}
              onClick={() => setLocal((s) => ({ ...s, defaultShell: sh }))}
              style={{
                ...segmentButtonStyle,
                background: local.defaultShell === sh ? "#1f6feb" : "#21262d",
                color: local.defaultShell === sh ? "#fff" : "#8b949e",
              }}
            >
              {sh}
            </button>
          ))}
        </div>
        <label style={labelStyle}>プロンプトパターン（| 区切り）</label>
        <input
          type="text"
          value={local.promptPatterns}
          onChange={(e) => setLocal((s) => ({ ...s, promptPatterns: e.target.value }))}
          style={inputStyle}
          aria-label="プロンプトパターン"
          placeholder="$|%|❯|>"
        />

        {/* Claude Code セクション */}
        <div style={{ color: "#8b949e", fontSize: 10, fontWeight: 700, marginBottom: 6, marginTop: 12, letterSpacing: "0.05em" }}>CLAUDE CODE</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer", fontSize: 12, color: "#e6edf3" }}>
          <input
            type="checkbox"
            checked={local.claudeSkipPermissions}
            onChange={(e) => setLocal((s) => ({ ...s, claudeSkipPermissions: e.target.checked }))}
            aria-label="--dangerously-skip-permissions"
          />
          <code style={{ fontSize: 11, color: "#79c0ff" }}>--dangerously-skip-permissions</code>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer", fontSize: 12, color: "#e6edf3" }}>
          <input
            type="checkbox"
            checked={local.claudeNoStream}
            onChange={(e) => setLocal((s) => ({ ...s, claudeNoStream: e.target.checked }))}
            aria-label="--no-stream"
          />
          <code style={{ fontSize: 11, color: "#79c0ff" }}>--no-stream</code>
        </label>

        {/* AI 解決セクション */}
        <div style={{ color: "#8b949e", fontSize: 10, fontWeight: 700, marginBottom: 6, marginTop: 4, letterSpacing: "0.05em" }}>AI解決</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer", fontSize: 12, color: "#e6edf3" }}>
          <input
            type="checkbox"
            checked={local.autoApproveHighConfidence}
            onChange={(e) => setLocal((s) => ({ ...s, autoApproveHighConfidence: e.target.checked }))}
            aria-label="信頼度Highの自動承認"
          />
          信頼度 High のコンフリクトを自動承認
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={cancelButtonStyle}>キャンセル</button>
          <button
            data-testid="settings-save"
            onClick={handleSave}
            style={{ ...actionButtonStyle, padding: "6px 16px" }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── スタイル定数 ──────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#0d1117",
  borderRight: "1px solid #21262d",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderBottom: "1px solid #21262d",
  flexShrink: 0,
};

const iconButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#484f58",
  cursor: "pointer",
  fontSize: 14,
  padding: "2px 4px",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#e6edf3",
  fontSize: 12,
  fontFamily: "monospace",
  padding: "6px 8px",
  resize: "vertical",
  boxSizing: "border-box",
};

const actionButtonStyle: React.CSSProperties = {
  padding: "7px 14px",
  background: "#1f6feb",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "monospace",
};

const cardStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#161b22",
  border: "1px solid #21262d",
  borderRadius: 6,
  marginBottom: 6,
};

const fileTagStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 10,
  color: "#79c0ff",
  background: "#1b2733",
  border: "1px solid #1f6feb40",
  borderRadius: 3,
  padding: "1px 5px",
  marginRight: 4,
  marginBottom: 2,
  fontFamily: "monospace",
};

const emptyStyle: React.CSSProperties = {
  color: "#484f58",
  fontSize: 12,
  textAlign: "center",
  paddingTop: 24,
};

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalStyle: React.CSSProperties = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 8,
  padding: 20,
  width: 300,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#8b949e",
  fontSize: 11,
  marginBottom: 6,
};

const segmentButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "5px 0",
  border: "1px solid #30363d",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "monospace",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#e6edf3",
  fontSize: 12,
  fontFamily: "monospace",
  padding: "5px 8px",
  boxSizing: "border-box",
};

const cancelButtonStyle: React.CSSProperties = {
  padding: "6px 16px",
  background: "none",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#8b949e",
  cursor: "pointer",
  fontSize: 12,
};
