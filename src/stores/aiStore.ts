import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type {
  AiContext,
  AsyncStatus,
  CodegenRequest,
  CodegenResult,
  ReviewRequest,
  ReviewResult,
} from "../types";

interface AiState {
  reviewResult: ReviewResult | null;
  codegenResult: CodegenResult | null;
  aiContext: AiContext | null;
  reviewStatus: AsyncStatus;
  codegenStatus: AsyncStatus;
  contextStatus: AsyncStatus;
  reviewError: string | null;
  codegenError: string | null;

  reviewChanges: (projectPath: string, request: ReviewRequest) => Promise<void>;
  generateCode: (projectPath: string, request: CodegenRequest) => Promise<void>;
  fetchContext: (projectPath: string, filePath?: string) => Promise<void>;
  clearReview: () => void;
  clearCodegen: () => void;
}

export const useAiStore = create<AiState>((set) => ({
  reviewResult: null,
  codegenResult: null,
  aiContext: null,
  reviewStatus: "idle",
  codegenStatus: "idle",
  contextStatus: "idle",
  reviewError: null,
  codegenError: null,

  reviewChanges: async (projectPath, request) => {
    set({ reviewStatus: "loading", reviewError: null });
    try {
      const result = await ipc.aiReviewChanges(projectPath, request);
      set({ reviewResult: result, reviewStatus: "success" });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "レビューに失敗しました";
      set({ reviewStatus: "error", reviewError: msg });
    }
  },

  generateCode: async (projectPath, request) => {
    set({ codegenStatus: "loading", codegenError: null });
    try {
      const result = await ipc.aiGenerateCode(projectPath, request);
      set({ codegenResult: result, codegenStatus: "success" });
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "コード生成に失敗しました";
      set({ codegenStatus: "error", codegenError: msg });
    }
  },

  fetchContext: async (projectPath, filePath) => {
    set({ contextStatus: "loading" });
    try {
      const ctx = await ipc.aiGetContext(projectPath, filePath);
      set({ aiContext: ctx, contextStatus: "success" });
    } catch {
      set({ contextStatus: "error" });
    }
  },

  clearReview: () => set({ reviewResult: null, reviewStatus: "idle", reviewError: null }),
  clearCodegen: () => set({ codegenResult: null, codegenStatus: "idle", codegenError: null }),
}));
