import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../lib/ipc";
import type {
  AsyncStatus,
  PrComment,
  PrDetail,
  PrFile,
  PullRequest,
} from "../types";
import { parseDiff, type FileDiffResult } from "../lib/diffParser";
import { useUiStore } from "./uiStore";
import { useTerminalStore } from "./terminalStore";

interface PrState {
  prs: PullRequest[];
  selectedPrId: number | null;
  detail: PrDetail | null;
  files: PrFile[];
  diff: string;
  docDiffs: FileDiffResult[];   // .md ファイルのみ
  stateFilter: "open" | "closed" | "merged" | "all";
  activeTab: "overview" | "code-diff" | "design-docs";
  fetchStatus: AsyncStatus;
  detailStatus: AsyncStatus;
  filesStatus: AsyncStatus;
  diffStatus: AsyncStatus;
  docDiffStatus: AsyncStatus;
  syncStatus: AsyncStatus;
  mergeStatus: AsyncStatus;
  reviewStatus: AsyncStatus;
  requestChangesStatus: AsyncStatus;
  createStatus: AsyncStatus;
  error: string | null;

  fetchPrs: (projectId: number) => Promise<void>;
  syncPrs: (projectId: number) => Promise<void>;
  selectPr: (prId: number | null, projectId?: number) => Promise<void>;
  fetchFiles: (projectId: number, prId: number) => Promise<void>;
  fetchDiff: (projectId: number, prId: number) => Promise<void>;
  loadDocDiff: (projectId: number, prId: number) => Promise<void>;
  setStateFilter: (f: PrState["stateFilter"]) => void;
  setActiveTab: (t: PrState["activeTab"]) => void;
  submitReview: (
    projectId: number,
    prId: number,
    state: "approved" | "changes_requested" | "commented",
    body?: string
  ) => Promise<void>;
  addComment: (
    projectId: number,
    prId: number,
    body: string,
    path?: string,
    line?: number
  ) => Promise<PrComment | void>;
  mergePr: (
    projectId: number,
    prId: number,
    mergeMethod?: string
  ) => Promise<void>;
  requestChanges: (
    projectId: number,
    prId: number,
    comment: string
  ) => Promise<void>;
  createPrFromBranch: (
    projectId: number,
    branchName: string,
    title: string,
    body?: string
  ) => Promise<PullRequest>;
  listenSyncDone: () => () => void;
}

export const usePrStore = create<PrState>((set, get) => ({
  prs: [],
  selectedPrId: null,
  detail: null,
  files: [],
  diff: "",
  docDiffs: [],
  stateFilter: "open",
  activeTab: "overview",
  fetchStatus: "idle",
  detailStatus: "idle",
  filesStatus: "idle",
  diffStatus: "idle",
  docDiffStatus: "idle",
  syncStatus: "idle",
  mergeStatus: "idle",
  reviewStatus: "idle",
  requestChangesStatus: "idle",
  createStatus: "idle",
  error: null,

  fetchPrs: async (projectId) => {
    const { stateFilter } = get();
    set({ fetchStatus: "loading", error: null });
    try {
      const filter = stateFilter === "all" ? undefined : stateFilter;
      const prs = await ipc.prList(projectId, filter);
      set({ prs, fetchStatus: "success" });
    } catch (e) {
      set({ fetchStatus: "error", error: String(e) });
    }
  },

  syncPrs: async (projectId) => {
    set({ syncStatus: "loading", error: null });
    try {
      const { stateFilter } = get();
      const filter = stateFilter === "all" ? undefined : stateFilter;
      await ipc.prSync(projectId, filter);
      set({ syncStatus: "success" });
    } catch (e) {
      set({ syncStatus: "error", error: String(e) });
    }
  },

  selectPr: async (prId, projectId) => {
    set({ selectedPrId: prId, detail: null, files: [], diff: "", docDiffs: [], diffStatus: "idle", docDiffStatus: "idle", filesStatus: "idle" });
    if (prId == null || projectId == null) return;
    set({ detailStatus: "loading" });
    try {
      const detail = await ipc.prGetDetail(prId);
      set({ detail, detailStatus: "success" });
    } catch (e) {
      set({ detailStatus: "error", error: String(e) });
    }
  },

  fetchFiles: async (projectId, prId) => {
    set({ filesStatus: "loading" });
    try {
      const files = await ipc.prGetFiles(projectId, prId);
      set({ files, filesStatus: "success" });
    } catch (e) {
      set({ filesStatus: "error", error: String(e) });
    }
  },

  fetchDiff: async (projectId, prId) => {
    set({ diffStatus: "loading" });
    try {
      const diff = await ipc.prGetDiff(projectId, prId);
      set({ diff, diffStatus: "success" });
    } catch (e) {
      set({ diffStatus: "error", error: String(e) });
    }
  },

  loadDocDiff: async (projectId, prId) => {
    set({ docDiffStatus: "loading" });
    try {
      const raw = await ipc.prGetDiff(projectId, prId);
      const all = parseDiff(raw);
      const docDiffs = all.filter((f) => f.filename.endsWith(".md"));
      set({ docDiffs, docDiffStatus: "success" });
    } catch (e) {
      set({ docDiffStatus: "error", error: String(e) });
    }
  },

  setStateFilter: (stateFilter) => set({ stateFilter }),

  setActiveTab: (activeTab) => set({ activeTab }),

  submitReview: async (projectId, prId, state, body) => {
    set({ reviewStatus: "loading" });
    try {
      await ipc.prReviewSubmit(projectId, { pr_id: prId, state, body });
      // detail を再取得してレビューを反映
      const detail = await ipc.prGetDetail(prId);
      set({ detail, reviewStatus: "success" });
    } catch (e) {
      set({ reviewStatus: "error", error: String(e) });
    }
  },

  addComment: async (projectId, prId, body, path, line) => {
    try {
      await ipc.prAddComment(projectId, prId, body, path, line);
      const detail = await ipc.prGetDetail(prId);
      set({ detail });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  mergePr: async (projectId, prId, mergeMethod) => {
    set({ mergeStatus: "loading" });
    try {
      await ipc.prMerge(projectId, prId, mergeMethod);
      // PR を merged に更新してリスト再取得
      const prs = get().prs.map((p) =>
        p.id === prId ? { ...p, state: "merged" as const } : p
      );
      set({ prs, mergeStatus: "success", selectedPrId: null, detail: null });
    } catch (e) {
      set({ mergeStatus: "error", error: String(e) });
    }
  },

  requestChanges: async (projectId, prId, comment) => {
    set({ requestChangesStatus: "loading" });
    try {
      await ipc.prReviewSubmit(projectId, {
        pr_id: prId,
        state: "changes_requested",
        body: comment,
      });
      const pr = get().prs.find((p) => p.id === prId);
      set({ requestChangesStatus: "success" });
      // Terminal 画面に遷移して Claude Code に再実装を依頼
      useUiStore.getState().navigate("terminal");
      if (pr) {
        useTerminalStore.getState().startSession(projectId, `${pr.head_branch}: ${comment}`);
      }
    } catch (e) {
      set({ requestChangesStatus: "error", error: String(e) });
    }
  },

  createPrFromBranch: async (projectId, branchName, title, body) => {
    set({ createStatus: "loading", error: null });
    try {
      const pr = await ipc.prCreateFromBranch(projectId, branchName, title, body);
      set((s) => ({ prs: [pr, ...s.prs], createStatus: "success" }));
      return pr;
    } catch (e) {
      set({ createStatus: "error", error: String(e) });
      throw e;
    }
  },

  listenSyncDone: () => {
    let unlistenFn: (() => void) | undefined;
    listen<{ project_id: number; synced_count: number }>(
      "pr_sync_done",
      (event) => {
        const projectId = event.payload.project_id;
        get().fetchPrs(projectId);
      }
    ).then((fn) => {
      unlistenFn = fn;
    });
    return () => unlistenFn?.();
  },
}));
