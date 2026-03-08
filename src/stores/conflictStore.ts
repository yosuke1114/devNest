import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type {
  AsyncStatus,
  BlockResolutionInput,
  BlockResolutionKind,
  ConflictBlock,
  ConflictFile,
  ResolveAllResult,
} from "../types";

/** ブロックごとの解消選択（ローカル状態） */
interface BlockResolution {
  resolution: BlockResolutionKind;
  manualContent?: string;
}

/** ファイルごとの解消状態（ローカル state として管理） */
type FileResolutions = Record<number, BlockResolution>; // blockIndex → resolution

interface ConflictState {
  managedFiles: ConflictFile[];
  unmanagedCount: number;
  activeFileId: number | null;
  resolutions: Record<number, FileResolutions>; // fileId → FileResolutions
  listStatus: AsyncStatus;
  resolveStatus: AsyncStatus;
  resolveAllStatus: AsyncStatus;
  resolveAllResult: ResolveAllResult | null;
  error: string | null;

  // 計算値
  totalBlocks: () => number;
  resolvedBlocks: () => number;
  allResolved: () => boolean;
  activeFile: () => ConflictFile | null;

  loadConflicts: (projectId: number) => Promise<void>;
  scanConflicts: (projectId: number) => Promise<void>;
  setActiveFile: (fileId: number) => void;
  setBlockResolution: (fileId: number, blockIndex: number, res: BlockResolution) => void;
  resolveAllBlocks: (fileId: number, resolution: BlockResolutionKind) => void;
  saveResolutions: (projectId: number, fileId: number) => Promise<void>;
  resolveAll: (projectId: number) => Promise<void>;
  reset: () => void;
}

export const useConflictStore = create<ConflictState>((set, get) => ({
  managedFiles: [],
  unmanagedCount: 0,
  activeFileId: null,
  resolutions: {},
  listStatus: "idle",
  resolveStatus: "idle",
  resolveAllStatus: "idle",
  resolveAllResult: null,
  error: null,

  totalBlocks: () =>
    get().managedFiles.reduce((sum, f) => sum + f.blocks.length, 0),

  resolvedBlocks: () => {
    const { managedFiles, resolutions } = get();
    return managedFiles.reduce((sum, f) => {
      const fileRes = resolutions[f.id] ?? {};
      return sum + Object.keys(fileRes).length;
    }, 0);
  },

  allResolved: () => {
    const { totalBlocks, resolvedBlocks } = get();
    const total = totalBlocks();
    return total > 0 && resolvedBlocks() >= total;
  },

  activeFile: () => {
    const { managedFiles, activeFileId } = get();
    return managedFiles.find((f) => f.id === activeFileId) ?? null;
  },

  loadConflicts: async (projectId) => {
    set({ listStatus: "loading", error: null });
    try {
      const result = await ipc.conflictList(projectId);
      set({
        managedFiles: result.managed,
        unmanagedCount: result.unmanaged_count,
        activeFileId: result.managed[0]?.id ?? null,
        listStatus: "success",
      });
    } catch (e) {
      set({ listStatus: "error", error: String(e) });
    }
  },

  scanConflicts: async (projectId) => {
    set({ listStatus: "loading", error: null });
    try {
      const result = await ipc.conflictScan(projectId);
      set({
        managedFiles: result.managed,
        unmanagedCount: result.unmanaged_count,
        activeFileId: result.managed[0]?.id ?? null,
        listStatus: "success",
      });
    } catch (e) {
      set({ listStatus: "error", error: String(e) });
    }
  },

  setActiveFile: (fileId) => set({ activeFileId: fileId }),

  setBlockResolution: (fileId, blockIndex, res) => {
    set((s) => ({
      resolutions: {
        ...s.resolutions,
        [fileId]: {
          ...(s.resolutions[fileId] ?? {}),
          [blockIndex]: res,
        },
      },
    }));
  },

  resolveAllBlocks: (fileId, resolution) => {
    const file = get().managedFiles.find((f) => f.id === fileId);
    if (!file) return;
    const fileRes: FileResolutions = {};
    file.blocks.forEach((b: ConflictBlock) => {
      fileRes[b.index] = { resolution };
    });
    set((s) => ({
      resolutions: { ...s.resolutions, [fileId]: fileRes },
    }));
  },

  saveResolutions: async (projectId, fileId) => {
    const file = get().managedFiles.find((f) => f.id === fileId);
    if (!file) return;
    const fileRes = get().resolutions[fileId] ?? {};

    const inputs: BlockResolutionInput[] = file.blocks.map((b) => {
      const res = fileRes[b.index];
      return {
        block_index: b.index,
        resolution: res?.resolution ?? "ours",
        manual_content: res?.manualContent,
      };
    });

    set({ resolveStatus: "loading" });
    try {
      await ipc.conflictResolve(projectId, fileId, file.file_path, inputs);
      // ローカルの managedFiles から解消済みを除去
      set((s) => ({
        managedFiles: s.managedFiles.filter((f) => f.id !== fileId),
        resolveStatus: "success",
      }));
    } catch (e) {
      set({ resolveStatus: "error", error: String(e) });
      throw e;
    }
  },

  resolveAll: async (projectId) => {
    set({ resolveAllStatus: "loading", error: null });
    try {
      const result = await ipc.conflictResolveAll(projectId);
      set({ resolveAllStatus: "success", resolveAllResult: result });
    } catch (e) {
      set({ resolveAllStatus: "error", error: String(e) });
      throw e;
    }
  },

  reset: () =>
    set({
      managedFiles: [],
      unmanagedCount: 0,
      activeFileId: null,
      resolutions: {},
      listStatus: "idle",
      resolveStatus: "idle",
      resolveAllStatus: "idle",
      resolveAllResult: null,
      error: null,
    }),
}));
