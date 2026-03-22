import { beforeEach, describe, it, expect, vi } from "vitest";
import { useAiStore } from "./aiStore";
import type { ReviewRequest, ReviewResult, CodegenRequest, CodegenResult, AiContext } from "../types";

const mockIpc = vi.hoisted(() => ({
  aiReviewChanges: vi.fn(),
  aiGenerateCode: vi.fn(),
  aiGetContext: vi.fn(),
}));

vi.mock("../lib/ipc", () => mockIpc);

// ─── ヘルパー ──────────────────────────────────────────────────────

const projectPath = "/tmp/proj";

const mockReviewRequest: ReviewRequest = {
  diff: "--- a/src/foo.ts\n+++ b/src/foo.ts",
  changed_files: ["src/foo.ts"],
  review_scope: "full",
};

const mockReviewResult: ReviewResult = {
  summary: "問題なし",
  findings: [],
  design_consistency: { checked_docs: [], inconsistencies: [], missing_doc_updates: [] },
  suggested_doc_updates: [],
  overall_assessment: "approve",
};

const mockCodegenRequest: CodegenRequest = {
  doc_path: "docs/spec.md",
  generation_mode: "scaffold",
};

const mockCodegenResult: CodegenResult = {
  generated_files: [],
  mapping_updates: [],
  warnings: [],
};

const mockAiContext: AiContext = {
  doc_context: [],
  maintenance_context: { outdated_deps_count: 0, stale_docs_count: 0 },
  git_context: { current_branch: "main", recent_commits: [], recent_changed_files: [] },
  product_context: { name: "DevNest", repo_owner: "yo", repo_name: "devnest", default_branch: "main", docs_root: "docs/" },
};

function resetStore() {
  useAiStore.setState({
    reviewResult: null,
    codegenResult: null,
    aiContext: null,
    reviewStatus: "idle",
    codegenStatus: "idle",
    contextStatus: "idle",
    reviewError: null,
    codegenError: null,
  });
}

// ─── テスト ─────────────────────────────────────────────────────────

describe("aiStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ─ 初期状態 ──────────────────────────────────────────────────────

  describe("初期状態", () => {
    it("全結果が null", () => {
      const s = useAiStore.getState();
      expect(s.reviewResult).toBeNull();
      expect(s.codegenResult).toBeNull();
      expect(s.aiContext).toBeNull();
    });

    it("全 status が idle", () => {
      const s = useAiStore.getState();
      expect(s.reviewStatus).toBe("idle");
      expect(s.codegenStatus).toBe("idle");
      expect(s.contextStatus).toBe("idle");
    });

    it("全エラーが null", () => {
      const s = useAiStore.getState();
      expect(s.reviewError).toBeNull();
      expect(s.codegenError).toBeNull();
    });
  });

  // ─ reviewChanges ─────────────────────────────────────────────────

  describe("reviewChanges", () => {
    it("成功時に reviewResult と reviewStatus=success がセットされる", async () => {
      mockIpc.aiReviewChanges.mockResolvedValue(mockReviewResult);
      await useAiStore.getState().reviewChanges(projectPath, mockReviewRequest);
      const s = useAiStore.getState();
      expect(s.reviewResult).toEqual(mockReviewResult);
      expect(s.reviewStatus).toBe("success");
      expect(s.reviewError).toBeNull();
    });

    it("loading → success の遷移", async () => {
      let capturedStatus: string | null = null;
      mockIpc.aiReviewChanges.mockImplementation(async () => {
        capturedStatus = useAiStore.getState().reviewStatus;
        return mockReviewResult;
      });
      await useAiStore.getState().reviewChanges(projectPath, mockReviewRequest);
      expect(capturedStatus).toBe("loading");
      expect(useAiStore.getState().reviewStatus).toBe("success");
    });

    it("失敗時に reviewStatus=error と reviewError がセットされる", async () => {
      mockIpc.aiReviewChanges.mockRejectedValue({ message: "API error" });
      await useAiStore.getState().reviewChanges(projectPath, mockReviewRequest);
      const s = useAiStore.getState();
      expect(s.reviewStatus).toBe("error");
      expect(s.reviewError).toBe("API error");
    });

    it("失敗時に message プロパティがないオブジェクトはデフォルトメッセージ", async () => {
      mockIpc.aiReviewChanges.mockRejectedValue({});
      await useAiStore.getState().reviewChanges(projectPath, mockReviewRequest);
      expect(useAiStore.getState().reviewError).toBe("レビューに失敗しました");
    });

    it("正しい引数を渡す", async () => {
      mockIpc.aiReviewChanges.mockResolvedValue(mockReviewResult);
      await useAiStore.getState().reviewChanges(projectPath, mockReviewRequest);
      expect(mockIpc.aiReviewChanges).toHaveBeenCalledWith(projectPath, mockReviewRequest);
    });
  });

  // ─ generateCode ──────────────────────────────────────────────────

  describe("generateCode", () => {
    it("成功時に codegenResult と codegenStatus=success がセットされる", async () => {
      mockIpc.aiGenerateCode.mockResolvedValue(mockCodegenResult);
      await useAiStore.getState().generateCode(projectPath, mockCodegenRequest);
      const s = useAiStore.getState();
      expect(s.codegenResult).toEqual(mockCodegenResult);
      expect(s.codegenStatus).toBe("success");
      expect(s.codegenError).toBeNull();
    });

    it("失敗時に codegenStatus=error と codegenError がセットされる", async () => {
      mockIpc.aiGenerateCode.mockRejectedValue({ message: "codegen failed" });
      await useAiStore.getState().generateCode(projectPath, mockCodegenRequest);
      const s = useAiStore.getState();
      expect(s.codegenStatus).toBe("error");
      expect(s.codegenError).toBe("codegen failed");
    });

    it("失敗時に message がない場合はデフォルトメッセージ", async () => {
      mockIpc.aiGenerateCode.mockRejectedValue({});
      await useAiStore.getState().generateCode(projectPath, mockCodegenRequest);
      expect(useAiStore.getState().codegenError).toBe("コード生成に失敗しました");
    });
  });

  // ─ fetchContext ──────────────────────────────────────────────────

  describe("fetchContext", () => {
    it("成功時に aiContext と contextStatus=success がセットされる", async () => {
      mockIpc.aiGetContext.mockResolvedValue(mockAiContext);
      await useAiStore.getState().fetchContext(projectPath);
      const s = useAiStore.getState();
      expect(s.aiContext).toEqual(mockAiContext);
      expect(s.contextStatus).toBe("success");
    });

    it("filePath を省略して呼べる", async () => {
      mockIpc.aiGetContext.mockResolvedValue(mockAiContext);
      await useAiStore.getState().fetchContext(projectPath);
      expect(mockIpc.aiGetContext).toHaveBeenCalledWith(projectPath, undefined);
    });

    it("filePath を渡せる", async () => {
      mockIpc.aiGetContext.mockResolvedValue(mockAiContext);
      await useAiStore.getState().fetchContext(projectPath, "src/foo.ts");
      expect(mockIpc.aiGetContext).toHaveBeenCalledWith(projectPath, "src/foo.ts");
    });

    it("失敗時に contextStatus=error がセットされる", async () => {
      mockIpc.aiGetContext.mockRejectedValue(new Error("fail"));
      await useAiStore.getState().fetchContext(projectPath);
      expect(useAiStore.getState().contextStatus).toBe("error");
    });
  });

  // ─ clearReview / clearCodegen ────────────────────────────────────

  describe("clearReview", () => {
    it("reviewResult / reviewStatus / reviewError をリセットする", () => {
      useAiStore.setState({
        reviewResult: mockReviewResult,
        reviewStatus: "success",
        reviewError: "some error",
      });
      useAiStore.getState().clearReview();
      const s = useAiStore.getState();
      expect(s.reviewResult).toBeNull();
      expect(s.reviewStatus).toBe("idle");
      expect(s.reviewError).toBeNull();
    });
  });

  describe("clearCodegen", () => {
    it("codegenResult / codegenStatus / codegenError をリセットする", () => {
      useAiStore.setState({
        codegenResult: mockCodegenResult,
        codegenStatus: "success",
        codegenError: "some error",
      });
      useAiStore.getState().clearCodegen();
      const s = useAiStore.getState();
      expect(s.codegenResult).toBeNull();
      expect(s.codegenStatus).toBe("idle");
      expect(s.codegenError).toBeNull();
    });
  });
});
