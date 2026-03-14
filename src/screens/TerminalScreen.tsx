import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  IconPlayerPlay,
  IconPlayerStop,
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
import { Button } from "../components/ui/button";

// ─── Terminal singleton（画面遷移後もバッファを保持するためモジュール変数で保持）─
let _term: Terminal | null = null;
let _fitAddon: FitAddon | null = null;
/** term.open() 呼び出し済みフラグ（Strict Mode 二重呼び出し防止） */
let _termOpened = false;
/** ResizeObserver デバウンスタイマー */
let _resizeTimer: ReturnType<typeof setTimeout> | undefined;

function getOrCreateTerminal(): { term: Terminal; fitAddon: FitAddon } {
  if (!_term) {
    _term = new Terminal({
      theme: {
        background: "#0d0d1a",
        foreground: "#e0e0e0",
        cursor: "#7c6cf2",
      },
      fontSize: 13,
      fontFamily: "'Geist Mono Variable', 'JetBrains Mono', 'Fira Code', monospace",
      cursorBlink: true,
    });
    _fitAddon = new FitAddon();
    _term.loadAddon(_fitAddon);
  }
  return { term: _term, fitAddon: _fitAddon! };
}

// ─── TerminalPane ────────────────────────────────────────────────────────────

function TerminalPane({ sessionId }: { sessionId: number | null }) {
  const termRef = useRef<HTMLDivElement>(null);
  const sendInput = useTerminalStore((s) => s.sendInput);
  const sendResize = useTerminalStore((s) => s.sendResize);

  // 初回マウント時のみ term.open() を実行（常時マウントのため一度だけ）
  // Strict Mode は mount→cleanup→remount を行うが、term.open() の二重呼び出しで
  // xterm 内部の DOM キーハンドラが重複し文字が二重入力になるため _termOpened で防ぐ
  useEffect(() => {
    if (!termRef.current) return;

    const { term, fitAddon } = getOrCreateTerminal();
    if (!_termOpened) {
      term.open(termRef.current);
      _termOpened = true;
    }

    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch { /* 初回レイアウト未確定時は無視 */ }
    });

    const onDataDisposable = term.onData((data) => sendInput(data));
    // ゼロ次元ガード: CSS 非表示時に cols/rows=0 で PTY リサイズが飛ぶのを防ぐ
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      if (cols > 0 && rows > 0) sendResize(cols, rows);
    });

    const ro = new ResizeObserver(() => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => {
        try {
          fitAddon.fit();
          if (_term) _term.refresh(0, _term.rows - 1);
        } catch { /* ignore */ }
      }, 100);
    });
    ro.observe(termRef.current);

    return () => {
      clearTimeout(_resizeTimer);
      ro.disconnect();
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 常時マウントのため空依存で正しい

  // 画面が表示状態に戻ったとき再 fit（CSS display:none→flex の復帰対応）
  const isVisible = useUiStore((s) => s.currentScreen === "terminal");
  useEffect(() => {
    if (!isVisible) return;
    const { term, fitAddon } = getOrCreateTerminal();
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        term.refresh(0, term.rows - 1);
      } catch { /* ignore */ }
    });
  }, [isVisible]);

  useEffect(() => {
    if (!sessionId) return;
    // listen() は非同期のため、クリーンアップが先に走ると unlisten が undefined のまま
    // cancelled フラグで「すでにクリーンアップ済み」を検知し、即座に unlisten する
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<{ session_id: number; data: string }>("terminal_output", (ev) => {
      if (ev.payload.session_id === sessionId && _term) {
        _term.write(ev.payload.data);
      }
    }).then((fn) => {
      if (cancelled) {
        fn(); // クリーンアップ済みなので即 unlisten
      } else {
        unlisten = fn;
      }
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [sessionId]);

  return (
    <div
      ref={termRef}
      data-testid="terminal-xterm"
      style={{ flex: 1, background: "#0d0d1a", minHeight: 0, overflow: "hidden" }}
    />
  );
}


// ─── TerminalScreen ───────────────────────────────────────────────────────────

export function TerminalScreen() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const { session, startStatus, showPrReadyBanner, readyBranch, hasDocChanges, error } =
    useTerminalStore();
  const { startSession, stopSession, dismissBanner } = useTerminalStore();
  const navigate = useUiStore((s) => s.navigate);
  const { createPrFromBranch, createStatus: prCreateStatus, error: prCreateError } = usePrStore();
  const pendingPrompt = useTerminalStore((s) => s.pendingPrompt);
  const setPendingPrompt = useTerminalStore((s) => s.setPendingPrompt);

  const [prCreated, setPrCreated] = useState<{
    prNumber: number;
    title: string;
  } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Maintenance など外部から pendingPrompt がセットされた場合は自動起動
  useEffect(() => {
    if (!pendingPrompt) return;
    // currentProject を Zustand から直接取得（stale closure 回避）
    const project = useProjectStore.getState().currentProject;
    if (!project) return;
    const { session: s, startStatus: ss } = useTerminalStore.getState();
    if (s?.status === "running" || ss === "loading") return;

    // prompt を取得してから即座にクリアし、二重起動を防ぐ
    const prompt = pendingPrompt;
    setPendingPrompt(null);

    if (_fitAddon) { try { _fitAddon.fit(); } catch { /* ignore */ } }
    const ptySize = _term ? { cols: _term.cols, rows: _term.rows } : undefined;
    startSession(project.id, prompt, ptySize);
  }, [pendingPrompt, setPendingPrompt, startSession]);

  const handleStart = async () => {
    if (!currentProject) return;
    // PTY 起動前に xterm の実際のサイズを確定させる
    if (_fitAddon) {
      try { _fitAddon.fit(); } catch { /* ignore */ }
    }
    const ptySize = _term ? { cols: _term.cols, rows: _term.rows } : undefined;
    await startSession(currentProject.id, undefined, ptySize);
  };

  const handleStop = () => stopSession();

  const handleCreatePR = () => {
    setShowCreateModal(true);
  };

  const handleReviewChanges = () => {
    if (currentProject) {
      usePrStore.getState().syncPrs(currentProject.id);
    }
    navigate("pr");
  };

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        プロジェクトを選択してください
      </div>
    );
  }

  const isRunning = session?.status === "running";
  const isIdle = !session || session.status === "aborted" || session.status === "failed";

  return (
    <div data-testid="terminal-screen" className="flex-1 flex flex-col overflow-hidden">
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
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground">Claude Code Terminal</div>
          <div data-testid="terminal-status" className="flex items-center gap-2 text-[11px]">
            {isRunning ? (
              <span className="text-yellow-400">◌ running…</span>
            ) : session?.status === "completed" ? (
              <span className="text-green-400">● completed</span>
            ) : session?.status === "aborted" ? (
              <span className="text-destructive">■ stopped</span>
            ) : (
              <span className="text-muted-foreground">● ready to start</span>
            )}
            <span className="text-muted-foreground">{currentProject.local_path}</span>
          </div>
        </div>

        {isRunning ? (
          <Button
            onClick={handleStop}
            variant="destructive"
            size="sm"
            className="h-7 px-3 text-xs"
          >
            <IconPlayerStop size={12} /> STOP
          </Button>
        ) : (
          <Button
            onClick={handleStart}
            size="sm"
            disabled={startStatus === "loading"}
            className="h-7 px-3 text-xs"
          >
            <IconPlayerPlay size={12} />
            {isIdle ? "START CLAUDE CODE" : "RESTART"}
          </Button>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div className="px-4 py-2 bg-destructive/20 border-b border-destructive/40 text-xs text-destructive">
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

      {/* xterm.js ターミナル（残り全領域を使用） */}
      <TerminalPane sessionId={session?.id ?? null} />
    </div>
  );
}
