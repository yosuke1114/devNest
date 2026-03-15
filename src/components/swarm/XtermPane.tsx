import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import type { WorkerInfo, WorkerStatus } from "./types";

// Shell アイドル検出: 行末が $/%/>/#/❯/→ で終わる場合にプロンプト表示と判定 (F-12-10)
const SHELL_PROMPT_RE = /[\$%>#❯→]\s*$/m;

interface XtermPaneProps {
  worker: WorkerInfo;
  onKill: (id: string) => void;
  isActive: boolean;
  onClick: () => void;
}

const STATUS_COLOR: Record<WorkerStatus, string> = {
  idle: "#4a5568",
  running: "#f6ad55",
  done: "#68d391",
  error: "#fc8181",
  retrying: "#76e4f7",
};

const STATUS_ICON: Record<WorkerStatus, string> = {
  idle: "○",
  running: "●",
  done: "✓",
  error: "✕",
  retrying: "↺",
};

export function XtermPane({ worker, onKill, isActive, onClick }: XtermPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const isShell = worker.config.kind === "shell";
  // Shell アイドル状態: プロンプトが検出されたら true (F-12-11)
  const [shellIdle, setShellIdle] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#e6edf3",
        selectionBackground: "#264f78",
      },
      fontFamily: "'SF Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    try { fitAddon.fit(); } catch { /* ignore initial layout */ }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // PTY出力をxtermに流す（Shell の場合はプロンプト検出でアイドル判定）
    let unlistenFn: (() => void) | undefined;
    const unlistenPromise = listen<{ workerId: string; data: string }>(
      "worker-output",
      (event) => {
        if (event.payload.workerId === worker.id) {
          term.write(event.payload.data);
          if (isShell && SHELL_PROMPT_RE.test(event.payload.data)) {
            setShellIdle(true);
          }
        }
      }
    );
    unlistenPromise.then((fn) => { unlistenFn = fn; });

    // キーボード入力をRustに転送（Shell の場合は入力でRunningに戻す）
    const onDataDisposable = term.onData((data) => {
      if (isShell) setShellIdle(false);
      const encoder = new TextEncoder();
      invoke("write_to_worker", {
        workerId: worker.id,
        data: Array.from(encoder.encode(data)),
      }).catch(() => {});
    });

    // リサイズ対応（xterm.js フィット + Rust PTY へサイズ通知）
    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        invoke("resize_worker", {
          workerId: worker.id,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      } catch { /* ignore */ }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      unlistenFn?.();
      ro.disconnect();
      onDataDisposable.dispose();
      term.dispose();
    };
  }, [worker.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const borderColor = isActive ? "#388bfd" : STATUS_COLOR[worker.status];

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        overflow: "hidden",
        background: "#0d1117",
        minHeight: 200,
        cursor: "pointer",
        transition: "border-color 0.2s",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "5px 10px",
          background: "#161b22",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>{isShell ? "🐚" : "🤖"}</span>
          <span style={{ color: "#e6edf3", fontSize: 12, fontFamily: "monospace" }}>
            {worker.config.label}
          </span>
          {isShell ? (
            <span
              data-testid="shell-idle-badge"
              style={{
                fontSize: 10,
                color: shellIdle ? "#68d391" : "#f6ad55",
                fontFamily: "monospace",
              }}
            >
              {shellIdle ? "Idle" : "● Running"}
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                color: STATUS_COLOR[worker.status],
                fontFamily: "monospace",
              }}
            >
              {STATUS_ICON[worker.status]} {worker.status}
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onKill(worker.id);
          }}
          style={{
            background: "none",
            border: "none",
            color: "#484f58",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px",
          }}
          aria-label="ペインを閉じる"
        >
          ✕
        </button>
      </div>

      {/* ターミナル本体 */}
      <div ref={containerRef} style={{ flex: 1, padding: 4 }} />
    </div>
  );
}
