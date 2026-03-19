import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../lib/ipc";
import type { AppError, AsyncStatus, Document, DocumentWithContent, FileNode, Issue, OpenedFile, SaveResult } from "../types";

interface DocSaveProgressPayload {
  document_id: number;
  status: "committing" | "pushing" | "synced" | "push_failed";
  sha?: string;
}

export interface CodeSaveProgressPayload {
  path: string;
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

  // CodeViewer
  openedFile: OpenedFile | null;
  fileTreeNodes: FileNode[];
  fileTreeLoading: boolean;
  codeSaveStatus: AsyncStatus;
  codeSaveProgress: CodeSaveProgressPayload | null;

  fetchDocuments: (projectId: number) => Promise<void>;
  openDocument: (documentId: number) => Promise<void>;
  saveDocument: (documentId: number, content: string) => Promise<SaveResult>;
  scanDocuments: (projectId: number) => Promise<number>;
  retryPush: (documentId: number) => Promise<void>;
  setDirty: (documentId: number, dirty: boolean) => void;
  listenSaveProgress: () => Promise<() => void>;
  fetchLinkedIssues: (documentId: number) => Promise<void>;
  createDocument: (projectId: number, relPath: string) => Promise<Document>;
  renameDocument: (projectId: number, documentId: number, newRelPath: string) => Promise<Document>;
  fetchFileTree: (projectId: number) => Promise<void>;
  openCodeFile: (projectId: number, path: string) => Promise<void>;
  saveCodeFile: (projectId: number, path: string, content: string) => Promise<void>;
  listenCodeSaveProgress: () => Promise<() => void>;
  reset: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDoc: null,
  linkedIssues: [],
  saveStatus: "idle",
  saveProgress: null,
  error: null,
  openedFile: null,
  fileTreeNodes: [],
  fileTreeLoading: false,
  codeSaveStatus: "idle",
  codeSaveProgress: null,

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
      set({ currentDoc: doc, openedFile: { type: "doc", docId: documentId } });
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
      return result.total;
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

  fetchFileTree: async (projectId) => {
    set({ fileTreeLoading: true });
    try {
      const nodes = await ipc.fileTree(projectId);
      set({ fileTreeNodes: nodes, fileTreeLoading: false });
    } catch {
      set({ fileTreeLoading: false });
    }
  },

  openCodeFile: async (projectId, path) => {
    // まず currentDoc を null にして中央ペインを切り替える
    set({ currentDoc: null, openedFile: { type: "code-error", path, error: "読み込み中…" } });
    try {
      const fc = await ipc.fileRead(projectId, path, 1000);
      set({
        openedFile: {
          type: "code",
          path: fc.path,
          content: fc.content,
          truncated: fc.truncated,
          totalLines: fc.total_lines,
        },
      });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e);
      console.error("[openCodeFile] error:", e);
      set({ error: e as AppError, openedFile: { type: "code-error", path, error: msg } });
    }
  },

  createDocument: async (projectId, relPath) => {
    const doc = await ipc.documentCreate(projectId, relPath);
    set((s) => ({ documents: [...s.documents, doc].sort((a, b) => a.path.localeCompare(b.path)) }));
    return doc;
  },

  renameDocument: async (projectId, documentId, newRelPath) => {
    const doc = await ipc.documentRename(projectId, documentId, newRelPath);
    set((s) => ({
      documents: s.documents
        .map((d) => d.id === documentId ? doc : d)
        .sort((a, b) => a.path.localeCompare(b.path)),
      currentDoc: s.currentDoc?.id === documentId
        ? { ...s.currentDoc, ...doc }
        : s.currentDoc,
    }));
    return doc;
  },

  saveCodeFile: async (projectId, path, content) => {
    set({ codeSaveStatus: "loading", error: null });
    try {
      await ipc.fileSave(projectId, path, content);
      set({ codeSaveStatus: "success" });
    } catch (e) {
      set({ codeSaveStatus: "error", error: e as AppError });
      throw e;
    }
  },

  listenCodeSaveProgress: async () => {
    const unlisten = await listen<CodeSaveProgressPayload>(
      "code_save_progress",
      (event) => {
        set({ codeSaveProgress: event.payload });
      }
    );
    return unlisten;
  },

  reset: () =>
    set({
      documents: [],
      currentDoc: null,
      linkedIssues: [],
      saveStatus: "idle",
      saveProgress: null,
      error: null,
      openedFile: null,
      fileTreeNodes: [],
      fileTreeLoading: false,
      codeSaveStatus: "idle",
      codeSaveProgress: null,
    }),
}));
