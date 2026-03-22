import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ServerMessage,
  ClientMessage,
  SwarmSnapshot,
  WorkerSnapshot,
  SubTask,
} from "../types/swarm";

const WS_URL = import.meta.env.VITE_WS_URL;
const WS_SECRET = import.meta.env.VITE_WS_SECRET;
const RECONNECT_INTERVAL = 3000;

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

export function useSwarmWS() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  const handleMsg = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "SwarmStatus":
        setState((s) => ({ ...s, swarm: msg.payload }));
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
        break;
      case "WorkerOutput":
        setState((s) => {
          const wid = msg.payload.worker_id;
          const existing = s.workerLogs[wid] ?? [];
          // 最新200行を保持
          const updated = [...existing, msg.payload.data].slice(-200);
          return { ...s, workerLogs: { ...s.workerLogs, [wid]: updated } };
        });
        break;
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
        break;
      case "SplitResult":
        setState((s) => ({
          ...s,
          splitting: false,
          splitResult: msg.payload.tasks,
          conflictWarnings: msg.payload.conflict_warnings,
        }));
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
        break;
      case "GateReady":
        setState((s) => ({ ...s, gateReady: msg.payload.wave_number }));
        break;
      case "Error":
        setState((s) => ({
          ...s,
          logs: [
            ...s.logs.slice(-49),
            { ts: ts(), text: msg.payload.message, level: "error" as const },
          ],
        }));
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = `${WS_URL}?token=${WS_SECRET}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true }));
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
      reconnectTimer.current = setTimeout(connect, RECONNECT_INTERVAL);
    };

    ws.onerror = () => ws.close();
  }, [send, handleMsg]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { state, send };
}

function ts(): string {
  const d = new Date();
  return `${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
