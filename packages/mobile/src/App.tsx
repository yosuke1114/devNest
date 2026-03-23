import { useState, useRef, useEffect, useCallback } from "react";
import { useSwarmWS } from "./hooks/useSwarmWS";
import type { SubTask, SwarmSettings, ClientMessage, SwarmRunRecord } from "./types/swarm";
import { DEFAULT_SETTINGS } from "./types/swarm";
import { ToastContainer, showToast } from "./components/Toast";
import { SettingsPanel, loadSettings, type MobileSettings } from "./components/SettingsPanel";
import { SwarmSettingsPanel } from "./components/SwarmSettingsPanel";
import { WorkerModal } from "./components/WorkerModal";
import { HistoryCard } from "./components/HistoryCard";
import { SwarmTab } from "./components/SwarmTab";
import "./App.css";

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

  // Worker modal
  const [workerModal, setWorkerModal] = useState<string | null>(null);

  // F3: worker search
  const [workerSearch, setWorkerSearch] = useState("");

  // Voice input
  const [listening, setListening] = useState(false);

  // B2: Auto Gate (localStorage 永続化)
  const [autoGate, setAutoGate] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("devnest-auto-gate") ?? "false"); }
    catch { return false; }
  });

  // E5: notification asked flag
  const [notifAsked, setNotifAsked] = useState(false);

  // A1: WS ホスト名表示
  const [wsHost, setWsHost] = useState(() => {
    try { return new URL(loadSettings().wsUrl).host; } catch { return ""; }
  });

  // Offline queue (WorkerInput のみキュー)
  const pendingMsgs = useRef<ClientMessage[]>([]);

  // C3: Pull to Refresh
  const touchStartY = useRef(0);
  const [pullY, setPullY] = useState(0);

  // Sync editable tasks when splitResult arrives
  useEffect(() => {
    if (state.splitResult) {
      setEditingTasks(state.splitResult.map((t) => ({ ...t })));
    } else {
      setEditingTasks(null);
    }
  }, [state.splitResult]);

  // A4: Swarm ステータス変化で Toast
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

  // オフラインキューをリコネクト時にフラッシュ
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

  useEffect(() => {
    if (state.connected && pendingMsgs.current.length > 0) {
      const queued = [...pendingMsgs.current];
      pendingMsgs.current = [];
      for (const msg of queued) safeSend(msg);
      showToast(`オフラインキュー ${queued.length} 件を送信`, "info");
    }
  }, [state.connected, safeSend]);

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

  const handleSettingsSave = (s: MobileSettings) => {
    reconnect();
    try { setWsHost(new URL(s.wsUrl).host); } catch { setWsHost(s.wsUrl); }
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

  const { workers } = state;

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
            <div className="card" style={{ textAlign: "center", color: "var(--text-dim)" }}>
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
        <SwarmTab
          state={state}
          safeSend={safeSend}
          settings={settings}
          setSettings={setSettings}
          editingTasks={editingTasks}
          setEditingTasks={setEditingTasks}
          inputText={inputText}
          setInputText={setInputText}
          projectPath={projectPath}
          setProjectPath={setProjectPath}
          listening={listening}
          startVoice={startVoice}
          autoGate={autoGate}
          setAutoGate={setAutoGate}
          swarmSettingsOpen={swarmSettingsOpen}
          setSwarmSettingsOpen={setSwarmSettingsOpen}
          workerSearch={workerSearch}
          setWorkerSearch={setWorkerSearch}
          notifAsked={notifAsked}
          setNotifAsked={setNotifAsked}
          onOpenWorker={(id) => setWorkerModal(id)}
        />
      )}
    </div>
  );
}
