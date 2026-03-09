import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type { AsyncStatus, IssueContextChunk, TerminalDonePayload, TerminalSession } from "../types";
import { useIssueStore } from "./issueStore";

interface TerminalState {
  session: TerminalSession | null;
  sessions: TerminalSession[];
  startStatus: AsyncStatus;
  showPrReadyBanner: boolean;
  readyBranch: string;
  hasDocChanges: boolean;
  changedFiles: string[];
  error: string | null;
  /** Issue コンテキスト検索結果（search_context_for_issue の結果）。
   *  startSession 前に呼び側がセットし、Claude Code の context として利用する。 */
  contextChunks: IssueContextChunk[];

  startSession: (projectId: number, promptSummary?: string) => Promise<void>;
  stopSession: () => Promise<void>;
  sendInput: (input: string) => Promise<void>;
  loadSessions: (projectId: number) => Promise<void>;
  dismissBanner: () => void;
  listenEvents: () => () => void;

  // terminal イベントハンドラ（外部から呼べるようにexport）
  onTerminalDone: (payload: TerminalDonePayload) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  session: null,
  sessions: [],
  startStatus: "idle",
  showPrReadyBanner: false,
  readyBranch: "",
  hasDocChanges: false,
  changedFiles: [],
  error: null,
  contextChunks: [],

  startSession: async (projectId, promptSummary) => {
    set({ startStatus: "loading", error: null, showPrReadyBanner: false });
    try {
      // F-K02: issueStore の issueLinks からリンク済みドキュメントパスを context として注入
      const issueLinks = useIssueStore.getState().issueLinks;
      const docPaths = issueLinks
        .map((l) => l.path)
        .filter((p): p is string => p !== null);
      const contextSummary =
        docPaths.length > 0
          ? `関連設計書: ${docPaths.join(", ")}${promptSummary ? `\n${promptSummary}` : ""}`
          : promptSummary;
      const session = await ipc.terminalSessionStart(projectId, contextSummary);
      set({ session, startStatus: "success" });
    } catch (e) {
      set({ startStatus: "error", error: String(e) });
    }
  },

  stopSession: async () => {
    const { session } = get();
    if (!session) return;
    await ipc.terminalSessionStop(session.id).catch(() => {});
    set({ session: { ...session, status: "aborted" } });
  },

  sendInput: async (input) => {
    const { session } = get();
    if (!session || session.status !== "running") return;
    await ipc.terminalInputSend(session.id, input).catch(() => {});
  },

  loadSessions: async (projectId) => {
    const sessions = await ipc.terminalSessionList(projectId).catch(() => []);
    set({ sessions });
  },

  dismissBanner: () => set({ showPrReadyBanner: false }),

  onTerminalDone: (payload) => {
    set((s) => ({
      session: s.session
        ? {
            ...s.session,
            status: payload.exit_code === 0 ? "completed" : "failed",
            branch_name: payload.branch_name,
            has_doc_changes: payload.has_doc_changes,
          }
        : null,
      showPrReadyBanner: payload.exit_code === 0,
      readyBranch: payload.branch_name,
      hasDocChanges: payload.has_doc_changes,
      changedFiles: payload.changed_files,
    }));
  },

  // terminal_done の listen は App.tsx で一本化（prStore との連携のため）
  listenEvents: () => () => {},
}));
