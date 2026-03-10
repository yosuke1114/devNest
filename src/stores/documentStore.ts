import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../lib/ipc";
import type { AppError, AsyncStatus, Document, DocumentWithContent, Issue, SaveResult } from "../types";

interface DocSaveProgressPayload {
  document_id: number;
  status: "committing" | "pushing" | "synced" | "push_failed";
  sha?: string;
}

interface DocumentState {
  documents: Document[];
  currentDoc: DocumentWithContent | null;
  linkedIssues: Issue[];
  saveStatus: AsyncStatus;
  saveProgress: DocSaveProgressPayload | null;
  error: AppError | null;

  fetchDocuments: (projectId: number) => Promise<void>;
  openDocument: (documentId: number) => Promise<void>;
  saveDocument: (documentId: number, content: string) => Promise<SaveResult>;
  scanDocuments: (projectId: number) => Promise<number>;
  retryPush: (documentId: number) => Promise<void>;
  setDirty: (documentId: number, dirty: boolean) => void;
  listenSaveProgress: () => Promise<() => void>;
  fetchLinkedIssues: (documentId: number) => Promise<void>;
  reset: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDoc: null,
  linkedIssues: [],
  saveStatus: "idle",
  saveProgress: null,
  error: null,

  fetchDocuments: async (projectId) => {
    try {
      const docs = await ipc.documentList(projectId);
      set({ documents: docs });
    } catch (e) {
      set({ error: e as AppError });
    }
  },

  openDocument: async (documentId) => {
    try {
      const projectId = get().documents.find((d) => d.id === documentId)?.project_id;
      if (!projectId) throw new Error(`document ${documentId} not found in list`);
      const doc = await ipc.documentGet(projectId, documentId);
      set({ currentDoc: doc });
    } catch (e) {
      set({ error: e as AppError });
    }
  },

  saveDocument: async (documentId, content) => {
    set({ saveStatus: "loading", error: null });
    try {
      const projectId = get().currentDoc?.project_id;
      if (!projectId) throw new Error("No project selected");
      const result = await ipc.documentSave(projectId, documentId, content);
      // ローカルの documents リストも更新
      set((s) => ({
        saveStatus: "success",
        documents: s.documents.map((d) =>
          d.id === documentId
            ? { ...d, is_dirty: false, push_status: result.push_status, sha: result.sha }
            : d
        ),
        currentDoc:
          s.currentDoc?.id === documentId
            ? { ...s.currentDoc, is_dirty: false }
            : s.currentDoc,
      }));
      return result;
    } catch (e) {
      set({ saveStatus: "error", error: e as AppError });
      throw e;
    }
  },

  scanDocuments: async (projectId) => {
    try {
      const result = await ipc.documentScan(projectId);
      await get().fetchDocuments(projectId);
      return result.count;
    } catch (e) {
      set({ error: e as AppError });
      return 0;
    }
  },

  retryPush: async (documentId) => {
    try {
      const projectId = get().currentDoc?.project_id ?? 0;
      await ipc.documentPushRetry(projectId, documentId);
    } catch (e) {
      set({ error: e as AppError });
    }
  },

  setDirty: (documentId, dirty) => {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === documentId ? { ...d, is_dirty: dirty } : d
      ),
      currentDoc:
        s.currentDoc?.id === documentId
          ? { ...s.currentDoc, is_dirty: dirty }
          : s.currentDoc,
    }));
    const projectId = get().currentDoc?.project_id ?? 0;
    ipc.documentSetDirty(projectId, documentId, dirty).catch(() => {});
  },

  listenSaveProgress: async () => {
    const unlisten = await listen<DocSaveProgressPayload>(
      "doc_save_progress",
      (event) => {
        set({ saveProgress: event.payload });
      }
    );
    return unlisten;
  },

  fetchLinkedIssues: async (documentId) => {
    try {
      const projectId = get().currentDoc?.project_id;
      if (!projectId) {
        const issues = await ipc.documentLinkedIssues(0, documentId);
        set({ linkedIssues: issues });
        return;
      }
      const issues = await ipc.documentLinkedIssues(projectId, documentId);
      set({ linkedIssues: issues });
    } catch {
      set({ linkedIssues: [] });
    }
  },

  reset: () =>
    set({
      documents: [],
      currentDoc: null,
      linkedIssues: [],
      saveStatus: "idle",
      saveProgress: null,
      error: null,
    }),
}));
