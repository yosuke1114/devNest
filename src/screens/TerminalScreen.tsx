import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconFileCode,
} from "@tabler/icons-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useProjectStore } from "../stores/projectStore";
import { useTerminalStore } from "../stores/terminalStore";
import { usePrStore } from "../stores/prStore";
import { useUiStore } from "../stores/uiStore";
import { PRCreateModal } from "../components/terminal/PRCreateModal";
import { PRReadyBanner } from "../components/terminal/PRReadyBanner";
import { PRCreatedBanner } from "../components/terminal/PRCreatedBanner";

// ─── TerminalPane ────────────────────────────────────────────────────────────

function TerminalPane({
  sessionId,
  height,
}: {
  sessionId: number | null;
  height: number;
}) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sendInput = useTerminalStore((s) => s.sendInput);

  useEffect(() => {
    if (!termRef.current) return;

    const term = new Terminal({
      theme: {
        background: "#0d0d1a",
        foreground: "#e0e0e0",
        cursor: "#7c6cf2",
      },
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // キー入力をターミナルに送信
    term.onData((data) => {
      sendInput(data);
    });

    return () => {
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // PTY 出力をリッスン
  useEffect(() => {
    if (!sessionId) return;
    let unlisten: (() => void) | undefined;
    listen<{ session_id: number; data: string }>("terminal_output", (ev) => {
      if (ev.payload.session_id === sessionId && xtermRef.current) {
        xtermRef.current.write(ev.payload.data);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [sessionId]);

  // リサイズ時に FitAddon を再フィット
  useEffect(() => {
    fitAddonRef.current?.fit();
  }, [height]);

  return (
    <div
      ref={termRef}
      style={{ height, background: "#0d0d1a" }}
      className="overflow-hidden"
    />
  );
}

// ─── ResizeHandle ─────────────────────────────────────────────────────────────

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const isDragging = useRef(false);
  const lastY = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastY.current = e.clientY;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = lastY.current - ev.clientY;
      lastY.current = ev.clientY;
      onResize(delta);
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="h-1.5 bg-white/5 hover:bg-white/20 cursor-row-resize transition-colors border-t border-white/10"
    />
  );
}

// ─── TerminalScreen ───────────────────────────────────────────────────────────

export function TerminalScreen() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const { session, startStatus, showPrReadyBanner, readyBranch, hasDocChanges, error } =
    useTerminalStore();
  const { startSession, stopSession, dismissBanner, listenEvents } = useTerminalStore();
  const navigate = useUiStore((s) => s.navigate);
  const syncPrs = usePrStore((s) => s.syncPrs);
  const { createPrFromBranch, createStatus: prCreateStatus, error: prCreateError } = usePrStore();

  const [terminalHeight, setTerminalHeight] = useState(280);
  const [prCreated, setPrCreated] = useState<{
    prNumber: number;
    title: string;
  } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // イベントリスナー登録
  useEffect(() => {
    return listenEvents();
  }, [listenEvents]);

  const handleStart = () => {
    if (!currentProject) return;
    startSession(currentProject.id);
  };

  const handleStop = () => stopSession();

  const handleResize = (delta: number) => {
    setTerminalHeight((h) => Math.max(120, Math.min(500, h + delta)));
  };

  const handleCreatePR = () => {
    setShowCreateModal(true);
  };

  const handleReviewChanges = () => {
    if (currentProject) {
      syncPrs(currentProject.id);
    }
    navigate("pr");
  };

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        プロジェクトを選択してください
      </div>
    );
  }

  const isRunning = session?.status === "running";
  const isIdle = !session || session.status === "aborted" || session.status === "failed";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* PR 作成モーダル */}
      {showCreateModal && currentProject && (
        <PRCreateModal
          branchName={readyBranch || session?.branch_name || ""}
          createStatus={prCreateStatus}
          error={prCreateError}
          onSubmit={async (title, body) => {
            try {
              await createPrFromBranch(currentProject.id, readyBranch || session?.branch_name || "", title, body);
              setShowCreateModal(false);
              dismissBanner();
              navigate("pr");
            } catch {
              // error stored in prStore
            }
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10">
        <div className="flex-1">
          <div className="text-sm font-medium text-white">Claude Code Terminal</div>
          <div className="flex items-center gap-2 text-[11px]">
            {isRunning ? (
              <span className="text-yellow-400">◌ running…</span>
            ) : session?.status === "completed" ? (
              <span className="text-green-400">● completed</span>
            ) : session?.status === "aborted" ? (
              <span className="text-red-400">■ stopped</span>
            ) : (
              <span className="text-gray-500">● ready to start</span>
            )}
            <span className="text-gray-600">{currentProject.local_path}</span>
          </div>
        </div>

        {isRunning ? (
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-red-800 hover:bg-red-700 text-white transition-colors"
          >
            <IconPlayerStop size={12} /> STOP
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={startStatus === "loading"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors"
          >
            <IconPlayerPlay size={12} />
            {isIdle ? "START CLAUDE CODE" : "RESTART"}
          </button>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* PR Ready バナー */}
      {showPrReadyBanner && !prCreated && (
        <PRReadyBanner
          branchName={readyBranch}
          hasDocChanges={hasDocChanges}
          onCreatePR={handleCreatePR}
          onReviewChanges={handleReviewChanges}
          onDismiss={dismissBanner}
        />
      )}

      {/* PR 作成完了バナー */}
      {prCreated && (
        <PRCreatedBanner
          prNumber={prCreated.prNumber}
          title={prCreated.title}
          hasDocChanges={hasDocChanges}
          onOpenPR={() => navigate("pr")}
          onDismiss={() => setPrCreated(null)}
        />
      )}

      {/* 設定書プレビューエリア（flex: 1） */}
      <div className="flex-1 overflow-y-auto p-4 text-xs text-gray-500">
        {session?.status === "running" || session?.status === "completed" ? (
          <div className="flex items-center gap-2 text-gray-400">
            <IconFileCode size={12} />
            <span>PTY セッション稼働中 — ターミナルペインで操作してください</span>
          </div>
        ) : (
          <div className="text-center mt-8">
            <div className="text-gray-600 mb-2">Claude Code を起動して作業を始める</div>
            <div className="text-gray-700 text-[10px]">
              START CLAUDE CODE ボタンで PTY セッションを開始します。
              <br />
              Issue の context が自動的に渡されます。
            </div>
          </div>
        )}
      </div>

      {/* リサイズハンドル */}
      <ResizeHandle onResize={handleResize} />

      {/* xterm.js ターミナルペイン */}
      <TerminalPane sessionId={session?.id ?? null} height={terminalHeight} />
    </div>
  );
}
