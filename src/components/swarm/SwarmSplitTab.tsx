import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSwarmStore } from "../../stores/swarmStore";
import type { SubTask, SplitTaskResult, SwarmSettings } from "./types";
import { DEFAULT_SWARM_SETTINGS } from "./types";

// ─── Wave算出ロジック ──────────────────────────────────────────

export function computeWaves(tasks: SubTask[]): SubTask[][] {
  const waves: SubTask[][] = [];
  const done = new Set<number>();

  while (done.size < tasks.length) {
    const wave = tasks.filter(
      (t) => !done.has(t.id) && t.dependsOn.every((dep) => done.has(dep))
    );
    if (wave.length === 0) break; // 循環依存
    waves.push(wave);
    wave.forEach((t) => done.add(t.id));
  }
  return waves;
}

// ─── Props ────────────────────────────────────────────────────

interface SwarmSplitTabProps {
  workingDir: string;
  onRunStarted?: () => void;
}

// ─── Component ────────────────────────────────────────────────

export function SwarmSplitTab({ workingDir, onRunStarted }: SwarmSplitTabProps) {
  const [prompt, setPrompt] = useState("");
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const [contextInput, setContextInput] = useState("");
  const [tasks, setTasks] = useState<SubTask[]>([]);
  const [conflictWarnings, setConflictWarnings] = useState<string[]>([]);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SwarmSettings>(DEFAULT_SWARM_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  const { startRun, isStarting } = useSwarmStore();

  const waves = computeWaves(tasks);

  const handleSplit = async () => {
    if (!prompt.trim()) return;
    setSplitting(true);
    setError(null);
    setTasks([]);
    setConflictWarnings([]);
    setCycleError(null);
    try {
      const result = await invoke<SplitTaskResult>("split_task", {
        request: { prompt, projectPath: workingDir, contextFiles },
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

  const handleAddContextFile = () => {
    const f = contextInput.trim();
    if (f && !contextFiles.includes(f)) {
      setContextFiles((prev) => [...prev, f]);
    }
    setContextInput("");
  };

  const handleRemoveContextFile = (f: string) => {
    setContextFiles((prev) => prev.filter((x) => x !== f));
  };

  const handleRun = async () => {
    if (tasks.length === 0 || cycleError) return;
    await startRun(tasks, settings, workingDir);
    onRunStarted?.();
  };

  const handleDeleteTask = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div style={containerStyle} data-testid="swarm-split-tab">
      {/* プロンプト入力エリア */}
      <section style={sectionStyle}>
        <h3 style={sectionTitle}>プロンプト入力</h3>
        <textarea
          data-testid="split-prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={"タスクの内容を入力...\n例: 認証機能をOAuth2.0に移行したい。既存のsession認証も並行して維持する"}
          style={textareaStyle}
          rows={5}
        />

        {/* コンテキストファイル */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            <input
              data-testid="context-file-input"
              type="text"
              value={contextInput}
              onChange={(e) => setContextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddContextFile()}
              placeholder="コンテキストファイルを追加 (Enter)"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              data-testid="add-context-file-button"
              onClick={handleAddContextFile}
              style={secondaryButtonStyle}
            >
              追加
            </button>
          </div>
          {contextFiles.map((f) => (
            <span key={f} style={fileTagStyle}>
              {f}
              <button
                onClick={() => handleRemoveContextFile(f)}
                style={{ background: "none", border: "none", color: "#fc8181", cursor: "pointer", marginLeft: 4, padding: 0, fontSize: 10 }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        <button
          data-testid="split-button"
          onClick={handleSplit}
          disabled={splitting || !prompt.trim()}
          style={{ ...primaryButtonStyle, marginTop: 10, opacity: splitting || !prompt.trim() ? 0.5 : 1 }}
        >
          {splitting ? "🔄 分解中..." : "🔀 タスク分解を実行"}
        </button>

        {error && (
          <div style={{ color: "#fc8181", fontSize: 11, marginTop: 6 }}>{error}</div>
        )}
      </section>

      {/* 分解結果 — Wave グラフ */}
      {tasks.length > 0 && (
        <section style={sectionStyle} data-testid="split-result-section">
          <h3 style={sectionTitle}>分解結果 ({tasks.length} タスク)</h3>

          {cycleError && (
            <div data-testid="cycle-error-banner" style={errorBannerStyle}>
              🔄 循環依存エラー: {cycleError}
            </div>
          )}

          {conflictWarnings.length > 0 && (
            <div data-testid="conflict-warnings-banner" style={warningBannerStyle}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ ファイル競合警告</div>
              {conflictWarnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {waves.map((wave, wi) => (
            <div key={wi} style={{ marginBottom: 12 }} data-testid={`wave-${wi}`}>
              <div style={waveLabelStyle}>
                Wave {wi + 1} {wi === 0 ? "(並列可能)" : `(Wave ${wi} 完了後)`}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {wave.map((task) => (
                  <TaskCard key={task.id} task={task} onDelete={handleDeleteTask} />
                ))}
              </div>
              {wi < waves.length - 1 && (
                <div style={{ textAlign: "center", color: "#484f58", fontSize: 14, margin: "4px 0" }}>↓</div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* 設定パネル */}
      <section style={sectionStyle}>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => setShowSettings((v) => !v)}
        >
          <h3 style={{ ...sectionTitle, marginBottom: 0 }}>⚙️ 設定</h3>
          <span style={{ color: "#484f58", fontSize: 12 }}>{showSettings ? "▲" : "▼"}</span>
        </div>
        {showSettings && (
          <SettingsPanel settings={settings} onChange={setSettings} />
        )}
      </section>

      {/* Swarm実行ボタン */}
      {tasks.length > 0 && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid #21262d" }}>
          <div style={{ color: "#8b949e", fontSize: 11, marginBottom: 6 }}>
            {tasks.length} タスク / 最大 {settings.maxWorkers} Worker 並列
          </div>
          <button
            data-testid="start-swarm-button"
            onClick={handleRun}
            disabled={isStarting || !!cycleError || tasks.length === 0}
            style={{
              ...primaryButtonStyle,
              width: "100%",
              background: "#1a7f37",
              opacity: isStarting || !!cycleError || tasks.length === 0 ? 0.5 : 1,
              fontSize: 14,
              padding: "10px 0",
            }}
          >
            {isStarting ? "🔄 起動中..." : "🚀 Swarm実行を開始"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────

function TaskCard({ task, onDelete }: { task: SubTask; onDelete: (id: number) => void }) {
  return (
    <div style={taskCardStyle} data-testid={`task-card-${task.id}`}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <span style={{ color: "#58a6ff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>#{task.id}</span>
        <span style={{ flex: 1, fontSize: 12, color: "#e6edf3" }}>{task.title}</span>
        <button
          onClick={() => onDelete(task.id)}
          style={{ background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 11, padding: 0 }}
          aria-label={`タスク ${task.id} を削除`}
        >
          ✕
        </button>
      </div>
      {task.dependsOn.length > 0 && (
        <div style={{ fontSize: 10, color: "#f6ad55", marginTop: 3 }}>
          depends: [{task.dependsOn.join(", ")}]
        </div>
      )}
      {task.files.length > 0 && (
        <div style={{ fontSize: 10, color: "#79c0ff", marginTop: 3 }}>
          files: {task.files.slice(0, 2).join(", ")}{task.files.length > 2 ? ` +${task.files.length - 2}` : ""}
        </div>
      )}
    </div>
  );
}

// ─── SettingsPanel ────────────────────────────────────────────

function SettingsPanel({ settings, onChange }: { settings: SwarmSettings; onChange: (s: SwarmSettings) => void }) {
  return (
    <div style={{ marginTop: 10 }} data-testid="settings-panel">
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>最大Worker数</label>
          <div style={{ display: "flex", gap: 4 }}>
            {([2, 4, 6, 8] as const).map((n) => (
              <button
                key={n}
                data-testid={`max-workers-${n}`}
                aria-pressed={settings.maxWorkers === n}
                onClick={() => onChange({ ...settings, maxWorkers: n })}
                style={{
                  padding: "4px 10px",
                  background: settings.maxWorkers === n ? "#1f6feb" : "#21262d",
                  color: settings.maxWorkers === n ? "#fff" : "#8b949e",
                  border: "1px solid #30363d",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>タイムアウト: {settings.timeoutMinutes}分</label>
          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={settings.timeoutMinutes}
            onChange={(e) => onChange({ ...settings, timeoutMinutes: Number(e.target.value) })}
            style={{ width: 120 }}
            aria-label="タイムアウト設定"
          />
        </div>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "#e6edf3" }}>
          <input
            type="checkbox"
            data-testid="skip-permissions-checkbox"
            checked={settings.claudeSkipPermissions}
            onChange={(e) => onChange({ ...settings, claudeSkipPermissions: e.target.checked })}
          />
          <code style={{ fontSize: 11, color: "#79c0ff" }}>--dangerously-skip-permissions</code>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "#e6edf3" }}>
          <input
            type="checkbox"
            data-testid="auto-approve-checkbox"
            checked={settings.autoApproveHighConfidence}
            onChange={(e) => onChange({ ...settings, autoApproveHighConfidence: e.target.checked })}
          />
          高信頼度コンフリクトの自動承認
        </label>
      </div>
    </div>
  );
}

// ─── スタイル ─────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  height: "100%",
  overflowY: "auto",
  background: "#0d1117",
};

const sectionStyle: React.CSSProperties = {
  padding: "16px",
  borderBottom: "1px solid #21262d",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#e6edf3",
  margin: "0 0 10px 0",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#e6edf3",
  fontSize: 12,
  fontFamily: "monospace",
  padding: "8px 10px",
  resize: "vertical",
  boxSizing: "border-box",
};

const inputStyle: React.CSSProperties = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#e6edf3",
  fontSize: 12,
  fontFamily: "monospace",
  padding: "5px 8px",
  boxSizing: "border-box",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#1f6feb",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "monospace",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "5px 10px",
  background: "#21262d",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#e6edf3",
  cursor: "pointer",
  fontSize: 12,
};

const fileTagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 11,
  color: "#79c0ff",
  background: "#1b2733",
  border: "1px solid #1f6feb40",
  borderRadius: 3,
  padding: "2px 6px",
  marginRight: 4,
  marginBottom: 2,
  fontFamily: "monospace",
};

const waveLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#58a6ff",
  fontWeight: 700,
  marginBottom: 6,
  padding: "3px 8px",
  background: "#1b2733",
  borderRadius: 4,
  display: "inline-block",
};

const taskCardStyle: React.CSSProperties = {
  minWidth: 160,
  maxWidth: 220,
  padding: "8px 10px",
  background: "#161b22",
  border: "1px solid #21262d",
  borderRadius: 6,
};

const errorBannerStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "#2d0a0a",
  border: "1px solid #fc8181",
  borderRadius: 4,
  fontSize: 12,
  color: "#fc8181",
  marginBottom: 8,
};

const warningBannerStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "#2d2014",
  border: "1px solid #f6ad55",
  borderRadius: 4,
  fontSize: 12,
  color: "#f6ad55",
  marginBottom: 8,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#8b949e",
  fontSize: 11,
  marginBottom: 4,
};
