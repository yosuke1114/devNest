import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ServerMessage,
  ClientMessage,
  SwarmSnapshot,
  WorkerSnapshot,
  SubTask,
} from "../types/swarm";
import { showToast } from "../components/Toast";
import { loadSettings } from "../components/SettingsPanel";

export interface LogEntry {
  ts: string;
  text: string;
  level: "info" | "warn" | "error" | "success";
}

export interface SwarmState {
  swarm: SwarmSnapshot;
  workers: WorkerSnapshot[];
  /** worker_id → 最新の出力行リスト */
  workerLogs: Record<string, string[]>;
  connected: boolean;
  splitResult: SubTask[] | null;
  conflictWarnings: string[];
  splitting: boolean;
  gateReady: number | null;
  logs: LogEntry[];
}

const INITIAL_SWARM: SwarmSnapshot = {
  status: "idle",
  currentWave: 0,
  totalTasks: 0,
  completedTasks: 0,
  failedTasks: 0,
};

const MAX_RECONNECT_DELAY = 30000;

export function useSwarmWS() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const retryCount = useRef(0);
  /** reconnect() を外部から呼ぶためのトリガー */
  const reconnectTrigger = useRef(0);

  const [state, setState] = useState<SwarmState>({
    swarm: INITIAL_SWARM,
    workers: [],
    workerLogs: {},
    connected: false,
    splitResult: null,
    conflictWarnings: [],
    splitting: false,
    gateReady: null,
    logs: [],
  });

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const addLog = useCallback((text: string, level: LogEntry["level"]) => {
    setState((s) => ({
      ...s,
      logs: [...s.logs.slice(-49), { ts: ts(), text, level }],
    }));
  }, []);

  const handleMsg = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "SwarmStatus":
        setState((s) => ({ ...s, swarm: msg.payload }));
        if (msg.payload.status === "done") {
          showToast("Swarm 完了!", "success");
        } else if (msg.payload.status === "blocked") {
          showToast("Swarm がブロックされました", "error");
        }
        break;
      case "WorkerStatus":
        setState((s) => ({
          ...s,
          workers: s.workers.map((w) =>
            w.id === msg.payload.worker_id
              ? { ...w, status: msg.payload.status }
              : w,
          ),
        }));
        if (msg.payload.status === "error") {
          showToast(`Worker エラー: ${msg.payload.worker_id.slice(0, 8)}`, "error");
        }
        break;
      case "WorkerOutput": {
        const settings = loadSettings();
        setState((s) => {
          const wid = msg.payload.worker_id;
          const existing = s.workerLogs[wid] ?? [];
          const updated = [...existing, msg.payload.data].slice(-settings.logRetention);
          return { ...s, workerLogs: { ...s.workerLogs, [wid]: updated } };
        });
        break;
      }
      case "Workers":
        setState((s) => ({ ...s, workers: msg.payload }));
        break;
      case "Splitting":
        setState((s) => ({
          ...s,
          splitting: true,
          splitResult: null,
          conflictWarnings: [],
        }));
        showToast("タスク分割中...", "info");
        break;
      case "SplitResult":
        setState((s) => ({
          ...s,
          splitting: false,
          splitResult: msg.payload.tasks,
          conflictWarnings: msg.payload.conflict_warnings,
        }));
        showToast(`${msg.payload.tasks.length} タスクに分割完了`, "success");
        break;
      case "GateResult":
        setState((s) => ({
          ...s,
          gateReady: null,
          logs: [
            ...s.logs.slice(-49),
            {
              ts: ts(),
              text: `Wave ${msg.payload.wave_number} Gate: ${msg.payload.overall}`,
              level: msg.payload.overall === "blocked" ? "error" as const : "success" as const,
            },
          ],
        }));
        showToast(
          `Gate ${msg.payload.overall === "blocked" ? "失敗" : "通過"}`,
          msg.payload.overall === "blocked" ? "error" : "success",
        );
        break;
      case "GateReady":
        setState((s) => ({ ...s, gateReady: msg.payload.wave_number }));
        showToast(`Wave ${msg.payload.wave_number} Gate準備完了`, "warn");
        break;
      case "Error":
        setState((s) => ({
          ...s,
          logs: [
            ...s.logs.slice(-49),
            { ts: ts(), text: msg.payload.message, level: "error" as const },
          ],
        }));
        showToast(msg.payload.message, "error");
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const settings = loadSettings();
    const url = settings.wsSecret
      ? `${settings.wsUrl}?token=${settings.wsSecret}`
      : settings.wsUrl;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryCount.current = 0;
        setState((s) => ({ ...s, connected: true }));
        addLog("接続完了", "success");
        send({ type: "Sync" });
      };

      ws.onmessage = (e) => {
        try {
          const msg: ServerMessage = JSON.parse(e.data);
          handleMsg(msg);
        } catch (err) {
          console.error("WSメッセージパース失敗", err);
        }
      };

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        // 指数バックオフで再接続
        const delay = Math.min(3000 * Math.pow(2, retryCount.current), MAX_RECONNECT_DELAY);
        retryCount.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    } catch {
      // invalid URL etc.
      addLog("接続失敗: URL を確認してください", "error");
    }
  }, [send, handleMsg, addLog]);

  /** 設定変更後に再接続 */
  const reconnect = useCallback(() => {
    wsRef.current?.close();
    clearTimeout(reconnectTimer.current);
    retryCount.current = 0;
    reconnectTrigger.current += 1;
    setTimeout(connect, 100);
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { state, send, reconnect };
}

function ts(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
