import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ServerMessage,
  ClientMessage,
  SwarmPhase,
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
  phase: SwarmPhase;
  agent: string | null;
  completed: number;
  total: number;
  waitingPrompt: string | null;
  logs: LogEntry[];
  connected: boolean;
  splitResult: SubTask[] | null;
  splitting: boolean;
}

export function useSwarmWS() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [state, setState] = useState<SwarmState>({
    phase: "idle",
    agent: null,
    completed: 0,
    total: 0,
    waitingPrompt: null,
    logs: [],
    connected: false,
    splitResult: null,
    splitting: false,
  });

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const handleMsg = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "Status":
        setState((s) => ({
          ...s,
          phase: msg.payload.phase,
          agent: msg.payload.agent,
          completed: msg.payload.completed,
          total: msg.payload.total,
          waitingPrompt:
            msg.payload.phase === "idle" ? null : s.waitingPrompt,
        }));
        break;
      case "WaitingInput":
        setState((s) => ({ ...s, waitingPrompt: msg.payload.prompt }));
        break;
      case "Log":
        setState((s) => ({
          ...s,
          logs: [
            ...s.logs.slice(-49),
            { ts: ts(), text: msg.payload.text, level: msg.payload.level },
          ],
        }));
        break;
      case "Splitting":
        setState((s) => ({ ...s, splitting: true, splitResult: null }));
        break;
      case "SplitResult":
        setState((s) => ({
          ...s,
          splitting: false,
          splitResult: msg.payload.tasks,
        }));
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
