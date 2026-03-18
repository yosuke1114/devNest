import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiAssistant } from "./AiAssistant";
import type { ReviewResult, CodegenResult } from "../../types";

vi.mock("@tabler/icons-react", () => ({
  IconBrain: () => <span data-testid="icon-brain" />,
  IconCode: () => <span data-testid="icon-code" />,
  IconLoader2: () => <span data-testid="icon-loader" />,
  IconX: () => <span data-testid="icon-x" />,
}));

vi.mock("./ReviewPanel", () => ({
  ReviewPanel: ({ result }: { result: ReviewResult }) => (
    <div data-testid="review-panel">{result.summary}</div>
  ),
}));

const mockReviewChanges = vi.fn(async () => {});
const mockGenerateCode = vi.fn(async () => {});
const mockClearReview = vi.fn();
const mockClearCodegen = vi.fn();

const aiState = {
  reviewResult: null as ReviewResult | null,
  reviewStatus: "idle" as "idle" | "loading" | "success" | "error",
  reviewError: null as string | null,
  codegenResult: null as CodegenResult | null,
  codegenStatus: "idle" as "idle" | "loading" | "success" | "error",
  codegenError: null as string | null,
  reviewChanges: mockReviewChanges,
  generateCode: mockGenerateCode,
  clearReview: mockClearReview,
  clearCodegen: mockClearCodegen,
};

const projectState = {
  currentProject: { id: 1, local_path: "/tmp/proj", name: "DevNest" } as unknown,
};

vi.mock("../../stores/aiStore", () => ({
  useAiStore: () => aiState,
}));

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: () => projectState,
}));

function makeReviewResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    overall_assessment: "approve",
    summary: "LGTM",
    findings: [],
    design_consistency: { inconsistencies: [] },
    suggested_doc_updates: [],
    ...overrides,
  };
}

function makeCodegenResult(overrides: Partial<CodegenResult> = {}): CodegenResult {
  return {
    generated_files: [],
    warnings: [],
    mapping_updates: [],
    ...overrides,
  };
}

describe("AiAssistant", () => {
  beforeEach(() => {
    aiState.reviewResult = null;
    aiState.reviewStatus = "idle";
    aiState.reviewError = null;
    aiState.codegenResult = null;
    aiState.codegenStatus = "idle";
    aiState.codegenError = null;
    mockReviewChanges.mockClear();
    mockGenerateCode.mockClear();
    mockClearReview.mockClear();
    mockClearCodegen.mockClear();
  });

  it("ai-assistant が表示される", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    expect(screen.getByTestId("ai-assistant")).toBeInTheDocument();
  });

  it("「AI アシスタント」ヘッダーが表示される", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    expect(screen.getByText("AI アシスタント")).toBeInTheDocument();
  });

  it("閉じるボタンクリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<AiAssistant onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("初期タブは review で「レビュー」コンテンツが表示される", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    expect(screen.getByText("スコープ")).toBeInTheDocument();
  });

  it("「コード生成」タブをクリックすると generate コンテンツが表示される", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    expect(screen.getByText("生成モード")).toBeInTheDocument();
  });

  it("スコープ select を変更できる", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "security_focus" } });
    expect(select.value).toBe("security_focus");
  });

  it("currentDiff がない場合にレビューボタンが disabled", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /レビュー実行/ });
    expect(btn).toBeDisabled();
  });

  it("currentDiff がある場合にレビューボタンが有効", () => {
    render(<AiAssistant currentDiff="diff content" onClose={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /レビュー実行/ });
    expect(btn).not.toBeDisabled();
  });

  it("currentDiff なしのとき「diff がありません」メッセージを表示する", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    expect(screen.getByText(/diff がありません/)).toBeInTheDocument();
  });

  it("レビューボタンクリックで reviewChanges が呼ばれる", () => {
    render(<AiAssistant currentFilePath="src/main.rs" currentDiff="--- diff" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /レビュー実行/ }));
    expect(mockReviewChanges).toHaveBeenCalledWith("/tmp/proj", expect.objectContaining({
      diff: "--- diff",
    }));
  });

  it("reviewStatus=loading のとき「レビュー中」が表示されボタンが disabled", () => {
    aiState.reviewStatus = "loading";
    render(<AiAssistant currentDiff="diff" onClose={vi.fn()} />);
    expect(screen.getByText(/レビュー中/)).toBeInTheDocument();
    const btn = screen.getByText(/レビュー中/).closest("button")!;
    expect(btn).toBeDisabled();
  });

  it("reviewError がある場合にエラーメッセージを表示する", () => {
    aiState.reviewError = "API error occurred";
    render(<AiAssistant onClose={vi.fn()} />);
    expect(screen.getByText("API error occurred")).toBeInTheDocument();
  });

  it("reviewResult がある場合に ReviewPanel を表示する", () => {
    aiState.reviewResult = makeReviewResult({ summary: "Great code" });
    render(<AiAssistant onClose={vi.fn()} />);
    expect(screen.getByTestId("review-panel")).toBeInTheDocument();
    expect(screen.getByText("Great code")).toBeInTheDocument();
  });

  it("reviewResult がある場合にクリアボタンが表示され clearReview を呼ぶ", () => {
    aiState.reviewResult = makeReviewResult();
    render(<AiAssistant onClose={vi.fn()} />);
    // クリアボタン (title="クリア") をクリック
    const clearBtn = screen.getByTitle("クリア");
    fireEvent.click(clearBtn);
    expect(mockClearReview).toHaveBeenCalled();
  });

  // ─── Generate タブ ────────────────────────────────────────────

  it("「コード生成」タブ: 生成モード select を変更できる", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "implementation" } });
    expect(select.value).toBe("implementation");
  });

  it("「コード生成」タブ: currentFilePath なしのとき生成ボタンが disabled", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    // タブボタン + アクションボタンが同名 → 最後がアクションボタン
    const btns = screen.getAllByRole("button", { name: /コード生成/ });
    expect(btns[btns.length - 1]).toBeDisabled();
  });

  it("「コード生成」タブ: currentFilePath ありのとき生成ボタンが有効", () => {
    render(<AiAssistant currentFilePath="docs/spec.md" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    const btns = screen.getAllByRole("button", { name: /コード生成/ });
    expect(btns[btns.length - 1]).not.toBeDisabled();
  });

  it("「コード生成」タブ: currentFilePath なしのとき案内メッセージを表示", () => {
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    expect(screen.getByText(/設計書を開いてから/)).toBeInTheDocument();
  });

  it("「コード生成」タブ: 生成ボタンクリックで generateCode が呼ばれる", () => {
    render(<AiAssistant currentFilePath="docs/spec.md" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    const btns = screen.getAllByRole("button", { name: /コード生成/ });
    fireEvent.click(btns[btns.length - 1]);
    expect(mockGenerateCode).toHaveBeenCalledWith("/tmp/proj", expect.objectContaining({
      doc_path: "docs/spec.md",
    }));
  });

  it("「コード生成」タブ: codegenStatus=loading で「生成中」表示", () => {
    aiState.codegenStatus = "loading";
    render(<AiAssistant currentFilePath="docs/spec.md" onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    expect(screen.getByText(/生成中/)).toBeInTheDocument();
    const btn = screen.getByText(/生成中/).closest("button")!;
    expect(btn).toBeDisabled();
  });

  it("「コード生成」タブ: codegenError がある場合にエラーを表示する", () => {
    aiState.codegenError = "Codegen failed";
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    expect(screen.getByText("Codegen failed")).toBeInTheDocument();
  });

  it("「コード生成」タブ: codegenResult でファイル一覧を表示する", () => {
    aiState.codegenResult = makeCodegenResult({
      generated_files: [{ path: "src/foo.rs", file_type: "rust", content: "fn main() {}" }],
    });
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    expect(screen.getByText("src/foo.rs")).toBeInTheDocument();
    expect(screen.getByText("rust")).toBeInTheDocument();
    expect(screen.getByText("fn main() {}")).toBeInTheDocument();
  });

  it("「コード生成」タブ: content が 400文字超の場合に省略表示する", () => {
    const longContent = "x".repeat(500);
    aiState.codegenResult = makeCodegenResult({
      generated_files: [{ path: "big.rs", file_type: "rust", content: longContent }],
    });
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    expect(screen.getByText(/\.\.\.$/)).toBeInTheDocument();
  });

  it("「コード生成」タブ: warnings がある場合に表示する", () => {
    aiState.codegenResult = makeCodegenResult({
      warnings: ["Warning: missing test"],
    });
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    expect(screen.getByText("Warning: missing test")).toBeInTheDocument();
  });

  it("「コード生成」タブ: mapping_updates があるとき件数を表示する", () => {
    aiState.codegenResult = makeCodegenResult({
      mapping_updates: [{ doc_path: "a.md", code_paths: ["a.rs"] }, { doc_path: "b.md", code_paths: ["b.rs"] }],
    });
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    expect(screen.getByText(/2 件/)).toBeInTheDocument();
  });

  it("「コード生成」タブ: codegenResult がある場合にクリアボタンで clearCodegen を呼ぶ", () => {
    aiState.codegenResult = makeCodegenResult();
    render(<AiAssistant onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("コード生成"));
    const clearBtn = screen.getByTitle("クリア");
    fireEvent.click(clearBtn);
    expect(mockClearCodegen).toHaveBeenCalled();
  });
});
