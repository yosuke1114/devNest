import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../lib/ipc";
import type {
  AppError,
  AsyncStatus,
  GitHubLabel,
  Issue,
  IssueDocLink,
  IssueDraft,
  IssueDraftPatch,
} from "../types";

interface IssueState {
  issues: Issue[];
  currentIssue: Issue | null;
  issueLinks: IssueDocLink[];
  drafts: IssueDraft[];
  currentDraft: IssueDraft | null;
  draftStreamBuffer: string;
  labels: GitHubLabel[];
  listStatus: AsyncStatus;
  syncStatus: AsyncStatus;
  generateStatus: AsyncStatus;
  error: AppError | null;

  // Issue
  fetchIssues: (projectId: number, statusFilter?: string) => Promise<void>;
  syncIssues: (projectId: number) => Promise<number>;
  selectIssue: (issue: Issue | null) => void;

  // Doc Links
  fetchIssueLinks: (issueId: number) => Promise<void>;
  addIssueLink: (issueId: number, documentId: number) => Promise<void>;
  removeIssueLink: (issueId: number, documentId: number) => Promise<void>;

  // Draft
  fetchDrafts: (projectId: number) => Promise<void>;
  createDraft: (projectId: number) => Promise<IssueDraft>;
  updateDraft: (patch: IssueDraftPatch) => Promise<void>;
  selectDraft: (draft: IssueDraft | null) => void;
  generateDraft: (draftId: number) => Promise<void>;
  cancelDraft: (draftId: number) => Promise<void>;

  // Labels
  fetchLabels: (projectId: number) => Promise<void>;

  // Event listeners
  listenSyncDone: (projectId: number) => Promise<() => void>;
  listenDraftChunk: () => Promise<() => void>;
  listenDraftDone: () => Promise<() => void>;
}

export const useIssueStore = create<IssueState>((set, get) => ({
  issues: [],
  currentIssue: null,
  issueLinks: [],
  drafts: [],
  currentDraft: null,
  draftStreamBuffer: "",
  labels: [],
  listStatus: "idle",
  syncStatus: "idle",
  generateStatus: "idle",
  error: null,

  fetchIssues: async (projectId, statusFilter) => {
    set({ listStatus: "loading", error: null });
    try {
      const issues = await ipc.issueList(projectId, statusFilter);
      set({ issues, listStatus: "success" });
    } catch (e) {
      set({ listStatus: "error", error: e as AppError });
    }
  },

  syncIssues: async (projectId) => {
    set({ syncStatus: "loading", error: null });
    try {
      const result = await ipc.issueSync(projectId);
      set({ syncStatus: "success" });
      await get().fetchIssues(projectId);
      return result.synced_count;
    } catch (e) {
      set({ syncStatus: "error", error: e as AppError });
      return 0;
    }
  },

  selectIssue: (issue) => set({ currentIssue: issue }),

  fetchIssueLinks: async (issueId) => {
    try {
      const links = await ipc.issueDocLinkList(issueId);
      set({ issueLinks: links });
    } catch (e) {
      set({ error: e as AppError });
    }
  },

  addIssueLink: async (issueId, documentId) => {
    try {
      await ipc.issueDocLinkAdd(issueId, documentId);
      await get().fetchIssueLinks(issueId);
    } catch (e) {
      set({ error: e as AppError });
      throw e;
    }
  },

  removeIssueLink: async (issueId, documentId) => {
    try {
      await ipc.issueDocLinkRemove(issueId, documentId);
      await get().fetchIssueLinks(issueId);
    } catch (e) {
      set({ error: e as AppError });
      throw e;
    }
  },

  fetchDrafts: async (projectId) => {
    try {
      const drafts = await ipc.issueDraftList(projectId);
      set({ drafts });
    } catch (e) {
      set({ error: e as AppError });
    }
  },

  createDraft: async (projectId) => {
    const draft = await ipc.issueDraftCreate(projectId);
    set((s) => ({ drafts: [draft, ...s.drafts], currentDraft: draft }));
    return draft;
  },

  updateDraft: async (patch) => {
    try {
      const updated = await ipc.issueDraftUpdate(patch);
      set((s) => ({
        drafts: s.drafts.map((d) => (d.id === updated.id ? updated : d)),
        currentDraft: s.currentDraft?.id === updated.id ? updated : s.currentDraft,
      }));
    } catch (e) {
      set({ error: e as AppError });
      throw e;
    }
  },

  selectDraft: (draft) =>
    set({ currentDraft: draft, draftStreamBuffer: draft?.draft_body ?? "" }),

  generateDraft: async (draftId) => {
    set({ generateStatus: "loading", draftStreamBuffer: "", error: null });
    try {
      await ipc.issueDraftGenerate(draftId);
      set({ generateStatus: "success" });
    } catch (e) {
      set({ generateStatus: "error", error: e as AppError });
    }
  },

  cancelDraft: async (draftId) => {
    await ipc.issueDraftCancel(draftId);
    set((s) => ({
      drafts: s.drafts.filter((d) => d.id !== draftId),
      currentDraft: s.currentDraft?.id === draftId ? null : s.currentDraft,
    }));
  },

  fetchLabels: async (projectId) => {
    try {
      const labels = await ipc.githubLabelsList(projectId);
      set({ labels });
    } catch (e) {
      set({ error: e as AppError });
    }
  },

  listenSyncDone: async (projectId) => {
    const unlisten = await listen<{ project_id: number; synced_count: number }>(
      "issue_sync_done",
      (event) => {
        if (event.payload.project_id === projectId) {
          get().fetchIssues(projectId);
        }
      }
    );
    return unlisten;
  },

  listenDraftChunk: async () => {
    const unlisten = await listen<{ draft_id: number; delta: string }>(
      "issue_draft_chunk",
      (event) => {
        set((s) => ({
          draftStreamBuffer: s.draftStreamBuffer + event.payload.delta,
        }));
      }
    );
    return unlisten;
  },

  listenDraftDone: async () => {
    const unlisten = await listen<{ draft_id: number; draft_body: string }>(
      "issue_draft_generate_done",
      (event) => {
        set((s) => ({
          generateStatus: "success",
          drafts: s.drafts.map((d) =>
            d.id === event.payload.draft_id
              ? { ...d, draft_body: event.payload.draft_body }
              : d
          ),
          currentDraft:
            s.currentDraft?.id === event.payload.draft_id
              ? { ...s.currentDraft, draft_body: event.payload.draft_body }
              : s.currentDraft,
        }));
      }
    );
    return unlisten;
  },
}));
