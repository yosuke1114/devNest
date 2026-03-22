import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../lib/ipc";
import type { ApprovalRequest, ApprovalDecision, AsyncStatus } from "../types";

interface ApprovalState {
  pending: ApprovalRequest[];
  history: ApprovalRequest[];
  pendingCount: number;
  listStatus: AsyncStatus;
  error: string | null;

  loadPending: () => Promise<void>;
  loadHistory: () => Promise<void>;
  decide: (decision: ApprovalDecision) => Promise<void>;
  cleanup: () => Promise<void>;
  listenEvents: () => () => void;
  reset: () => void;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  pending: [],
  history: [],
  pendingCount: 0,
  listStatus: "idle",
  error: null,

  loadPending: async () => {
    set({ listStatus: "loading", error: null });
    try {
      const [pending, count] = await Promise.all([
        ipc.approvalList(),
        ipc.approvalPendingCount(),
      ]);
      set({ pending, pendingCount: count, listStatus: "success" });
    } catch (e) {
      set({ listStatus: "error", error: String(e) });
    }
  },

  loadHistory: async () => {
    try {
      const history = await ipc.approvalHistory();
      set({ history });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  decide: async (decision) => {
    try {
      await ipc.approvalDecide(decision);
      // リストを更新
      const [pending, count] = await Promise.all([
        ipc.approvalList(),
        ipc.approvalPendingCount(),
      ]);
      set({ pending, pendingCount: count });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  cleanup: async () => {
    try {
      await ipc.approvalCleanup();
      await get().loadPending();
    } catch (e) {
      set({ error: String(e) });
    }
  },

  listenEvents: () => {
    const unlistenPending = listen<ApprovalRequest>("approval-request-pending", () => {
      get().loadPending();
    });
    const unlistenDecided = listen<ApprovalDecision>("approval-decided", () => {
      get().loadPending();
    });

    return () => {
      unlistenPending.then((f) => f());
      unlistenDecided.then((f) => f());
    };
  },

  reset: () => {
    set({ pending: [], history: [], pendingCount: 0, listStatus: "idle", error: null });
  },
}));
