import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSwarmStore } from "../../stores/swarmStore";
import type { ExecutionState, Wave, WaveGateResult } from "./types";
import { TerminalGrid } from "./TerminalGrid";

// ─── 型 ───────────────────────────────────────────────────────

interface SystemResources {
  cpuPct: number;
  memFreeGb: number;
  memTotalGb: number;
  spawnSuppressed: boolean;
}

interface WorkerLogLine {
  workerId: string;
  data: string;
}

// ANSIエスケープコードと制御文字を除去
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "");
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
  const [logOpen, setLogOpen] = useState(false);

  // workerId → タスクラベルのマップ
  const workerLabelMap = Object.fromEntries(
    (currentRun?.assignments ?? []).map((a) => [a.workerId, a.task.title])
  );

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

  // wave-gate-ready: Wave 完了時に Gate を自動実行
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ runId: string; waveNumber: number }>("wave-gate-ready", async (event) => {
      console.log(`[Swarm] Wave ${event.payload.waveNumber} 完了 → Gate 自動実行`);
      try {
        const result = await invoke<WaveGateResult>("orchestrator_run_wave_gate");
        if (result.overall === "blocked") {
          console.warn("[Swarm] Wave Gate: マージにコンフリクトがあります");
        } else if (result.overall === "passedWithWarnings") {
          console.warn("[Swarm] Wave Gate: 警告ありで次 Wave に進行");
        } else {
          console.info("[Swarm] Wave Gate: 全パス → 次 Wave 開始");
        }
      } catch (e) {
        console.error("[Swarm] Wave Gate 実行エラー:", e);
      }
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  // ライブログリッスン
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ workerId: string; data: string }>("worker-output", (event) => {
      const lines = event.payload.data.split(/\r?\n/).map(stripAnsi).filter((l) => l.trim().length > 0);
      if (lines.length === 0) return;
      setLogs((prev) => {
        const next = [
          ...prev,
          ...lines.map((l) => ({ workerId: event.payload.workerId, data: l })),
        ];
        return next.slice(-200); // 最大200行保持
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  if (!currentRun) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#0d1117" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 0", flexShrink: 0 }} data-testid="running-tab-empty">
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <div style={{ color: "#484f58", fontSize: 14 }}>実行中のSwarmセッションはありません</div>
          <div style={{ color: "#30363d", fontSize: 12, marginTop: 6 }}>
            「タスク分解」タブでタスクを分解してから「Swarm実行を開始」してください
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden", padding: 8 }}>
          <TerminalGrid workingDir={workingDir} />
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

  const memUsagePct = resources && resources.memTotalGb > 0
    ? Math.round((1 - resources.memFreeGb / resources.memTotalGb) * 100)
    : 0;

  const isDone = currentRun.status === "done" || currentRun.status === "partialDone";
  const isSuccess = currentRun.status === "done";

  return (
    <div style={containerStyle} data-testid="swarm-running-tab">
      {/* 完了バナー */}
      {isDone && (
        <div
          data-testid="completion-banner"
          style={{
            padding: "16px 20px",
            background: isSuccess ? "#0d2818" : "#2d1f0d",
            borderBottom: `2px solid ${isSuccess ? "#1a7f37" : "#b45309"}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 32 }}>{isSuccess ? "✅" : "⚠️"}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: isSuccess ? "#4ade80" : "#fbbf24" }}>
                {isSuccess ? "Swarm 完了" : "Swarm 部分完了"}
              </div>
              <div style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
                {currentRun.doneCount}/{currentRun.total} タスク成功
                {currentRun.failed > 0 && (
                  <span style={{ color: "#fc8181", marginLeft: 8 }}>
                    {currentRun.failed} 件失敗
                  </span>
                )}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {currentRun.assignments.map((a) => (
                <span
                  key={a.workerId || a.task.id}
                  title={a.task.title}
                  style={{ fontSize: 18 }}
                >
                  {a.executionState === "done" ? "✅"
                    : a.executionState === "error" ? "❌"
                    : a.executionState === "skipped" ? "⏭️"
                    : "⏳"}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

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

      {/* Wave 進捗バー（Wave が複数のときのみ表示） */}
      {currentRun.waves && currentRun.waves.length > 1 && (
        <WaveProgressBar waves={currentRun.waves} currentWave={currentRun.currentWave ?? 1} />
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 左ペイン: Worker一覧 + リソース */}
        <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #21262d", overflowY: "auto" }}>
          {/* Worker一覧 */}
          <div style={panelSection} data-testid="worker-list">
            <div style={panelTitle}>Worker一覧</div>
            {currentRun.assignments.map((a) => (
              <div
                key={a.workerId || String(a.task.id)}
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
                label={`MEM (空き ${resources.memFreeGb.toFixed(1)}GB)`}
                pct={memUsagePct}
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
            {isDone ? (
              <button
                data-testid="new-run-button"
                onClick={cancelRun}
                style={{ ...actionButton, background: "#1f6feb" }}
              >
                ＋ 新しい Swarm を開始
              </button>
            ) : (
              <button
                data-testid="cancel-run-button"
                onClick={cancelRun}
                style={{ ...actionButton, background: "transparent", border: "1px solid #fc8181", color: "#fc8181" }}
              >
                ❌ キャンセル
              </button>
            )}
          </div>
        </div>

        {/* 右ペイン: TerminalGrid + ライブログ（折りたたみ） */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* ターミナルグリッド */}
          <div style={{ flex: 1, overflow: "hidden", padding: 8 }}>
            <TerminalGrid workingDir={workingDir} />
          </div>

          {/* ライブログ（折りたたみ） */}
          <div style={{ flexShrink: 0, borderTop: "1px solid #21262d" }} data-testid="live-log-panel">
            {/* ヘッダー（クリックで開閉） */}
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", userSelect: "none" }}
              onClick={() => setLogOpen((v) => !v)}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                ライブログ
              </span>
              {selectedWorker && workerLabelMap[selectedWorker] && (
                <span style={{ fontSize: 11, color: "#58a6ff" }}>
                  — {workerLabelMap[selectedWorker]}
                </span>
              )}
              {!selectedWorker && (
                <span style={{ fontSize: 11, color: "#484f58" }}>（Worker一覧からWorkerを選択してフィルター）</span>
              )}
              <span style={{ marginLeft: "auto", color: "#484f58", fontSize: 11 }}>{logOpen ? "▲ 閉じる" : "▼ 開く"}</span>
              {logs.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLogs([]); }}
                  style={{ background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 11, padding: "0 4px" }}
                >
                  クリア
                </button>
              )}
            </div>

            {/* ログ本体 */}
            {logOpen && (
              <div style={logBody} data-testid="log-body">
                {filteredLogs.length === 0 ? (
                  <div style={{ color: "#484f58", fontSize: 11, padding: "4px 12px" }}>ログがありません</div>
                ) : (
                  filteredLogs.map((l, i) => {
                    const label = workerLabelMap[l.workerId] ?? l.workerId.slice(0, 8);
                    return (
                      <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: "#8b949e", lineHeight: 1.5, padding: "0 12px" }}>
                        <span style={{ color: "#388bfd", marginRight: 6 }}>[{label}]</span>
                        {l.data}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── サブコンポーネント ────────────────────────────────────────

function WaveProgressBar({ waves, currentWave }: { waves: Wave[]; currentWave: number }) {
  const waveStatusIcon: Record<string, string> = {
    pending:            "⏳",
    running:            "🔄",
    gating:             "🔍",
    passed:             "✅",
    passedWithWarnings: "⚠️",
    failed:             "❌",
  };

  return (
    <div
      data-testid="wave-progress-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "8px 16px",
        borderBottom: "1px solid #21262d",
        flexShrink: 0,
        overflowX: "auto",
        background: "#0d1117",
      }}
    >
      <span style={{ fontSize: 11, color: "#8b949e", marginRight: 4, whiteSpace: "nowrap" }}>Wave:</span>
      {waves.map((wave, idx) => (
        <div key={wave.waveNumber} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Wave ノード */}
          <div
            data-testid={`wave-node-${wave.waveNumber}`}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "4px 8px",
              borderRadius: 6,
              border: `1px solid ${wave.waveNumber === currentWave ? "#388bfd" : "#30363d"}`,
              background: wave.waveNumber === currentWave ? "#1c2d4f" : "#161b22",
              minWidth: 56,
            }}
          >
            <span style={{ fontSize: 10, color: "#8b949e" }}>W{wave.waveNumber}</span>
            <span style={{ fontSize: 14 }}>{waveStatusIcon[wave.status] ?? "●"}</span>
            <span style={{ fontSize: 9, color: "#484f58" }}>{wave.taskIds.length}タスク</span>
          </div>

          {/* Wave Gate（最後の Wave 以外） */}
          {idx < waves.length - 1 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                fontSize: 10,
                color: "#484f58",
                padding: "0 4px",
              }}
            >
              {wave.gateResult ? (
                <>
                  <span>{wave.gateResult.merge.passed ? "✅" : "❌"}M</span>
                  <span>{wave.gateResult.test.passed ? "✅" : "❌"}T</span>
                  <span>{wave.gateResult.review.passed ? "✅" : "⚠️"}R</span>
                </>
              ) : (
                <>
                  <span style={{ color: "#30363d" }}>→</span>
                  {wave.status === "gating" && <span>🔍</span>}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

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
    awaitingApproval: "🔒",
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
    awaitingApproval: { color: "#f59e0b", label: "Approval" },
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

const logBody: React.CSSProperties = {
  maxHeight: 160,
  overflowY: "auto",
  paddingBottom: 6,
};
