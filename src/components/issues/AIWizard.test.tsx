import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AIWizard } from "./AIWizard";
import type { IssueDraft } from "../../types";

function makeDraft(overrides: Partial<IssueDraft> = {}): IssueDraft {
  return {
    id: 1,
    project_id: 1,
    title: "テストドラフト",
    body: "",
    draft_body: null,
    wizard_context: null,
    labels: "[]",
    assignee_login: null,
    status: "draft",
    github_issue_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("AIWizard", () => {
  const defaultProps = {
    drafts: [],
    currentDraft: null,
    streamBuffer: "",
    generating: false,
    onSelectDraft: vi.fn(),
    onUpdateDraft: vi.fn(async () => {}),
    onGenerate: vi.fn(async () => {}),
  };

  it("drafts が空のとき一覧が空", () => {
    render(<AIWizard {...defaultProps} drafts={[]} />);
    // ドラフトアイテムが存在しない（generate等のボタンは除く）
    // ドラフト一覧内にドラフト固有のボタンがないことを確認
    expect(screen.queryByText("テストドラフト")).not.toBeInTheDocument();
  });

  it("drafts がある場合、タイトルをリスト表示", () => {
    const drafts = [
      makeDraft({ id: 1, title: "最初のドラフト" }),
      makeDraft({ id: 2, title: "2番目のドラフト" }),
    ];
    render(<AIWizard {...defaultProps} drafts={drafts} />);
    expect(screen.getByText("最初のドラフト")).toBeInTheDocument();
    expect(screen.getByText("2番目のドラフト")).toBeInTheDocument();
  });

  it("タイトルが空の場合「（無題）」を表示", () => {
    const drafts = [makeDraft({ id: 1, title: "" })];
    render(<AIWizard {...defaultProps} drafts={drafts} />);
    expect(screen.getByText("（無題）")).toBeInTheDocument();
  });

  it("currentDraft が null のとき「ドラフトを選択」メッセージ", () => {
    render(<AIWizard {...defaultProps} currentDraft={null} />);
    expect(screen.getByText(/ドラフトを選択/)).toBeInTheDocument();
  });

  it("currentDraft がある場合、title フィールドに値が入る", () => {
    const draft = makeDraft({ title: "私のタイトル" });
    render(<AIWizard {...defaultProps} currentDraft={draft} />);
    const input = screen.getByDisplayValue("私のタイトル");
    expect(input).toBeInTheDocument();
  });

  it("currentDraft がある場合、wizard_context フィールドに値が入る", () => {
    const draft = makeDraft({ wizard_context: "テストコンテキスト" });
    render(<AIWizard {...defaultProps} currentDraft={draft} />);
    const textarea = screen.getByDisplayValue("テストコンテキスト");
    expect(textarea).toBeInTheDocument();
  });

  it("生成ボタンが存在する", () => {
    const draft = makeDraft();
    render(<AIWizard {...defaultProps} currentDraft={draft} />);
    // 生成ボタンが表示される
    const btn = screen.getByRole("button", { name: /生成|generate/i });
    expect(btn).toBeInTheDocument();
  });

  it("generating=true のとき生成ボタンが disabled", () => {
    const draft = makeDraft();
    render(<AIWizard {...defaultProps} currentDraft={draft} generating={true} />);
    const btn = screen.getByRole("button", { name: /生成中|generating/i });
    expect(btn).toBeDisabled();
  });

  it("generating=true のとき「生成中」テキスト", () => {
    const draft = makeDraft();
    render(<AIWizard {...defaultProps} currentDraft={draft} generating={true} />);
    expect(screen.getByText(/生成中/)).toBeInTheDocument();
  });

  it("streamBuffer がある場合、プレビュー領域に表示される", () => {
    const draft = makeDraft();
    render(
      <AIWizard
        {...defaultProps}
        currentDraft={draft}
        streamBuffer="## プレビューテキスト"
      />
    );
    expect(screen.getByText(/プレビューテキスト/)).toBeInTheDocument();
  });

  it("ドラフトをクリックすると onSelectDraft が呼ばれる", () => {
    const onSelectDraft = vi.fn();
    const draft = makeDraft({ id: 1, title: "クリックドラフト" });
    render(<AIWizard {...defaultProps} drafts={[draft]} onSelectDraft={onSelectDraft} />);
    fireEvent.click(screen.getByText("クリックドラフト"));
    expect(onSelectDraft).toHaveBeenCalledWith(draft);
  });

  it("title input を変更できる (line 138)", () => {
    const draft = makeDraft({ title: "初期タイトル" });
    render(<AIWizard {...defaultProps} currentDraft={draft} />);
    const input = screen.getByDisplayValue("初期タイトル") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "更新タイトル" } });
    expect(input.value).toBe("更新タイトル");
  });

  it("title input blur で onUpdateDraft が呼ばれる (lines 63-64, 139)", () => {
    const onUpdateDraft = vi.fn(async () => {});
    const draft = makeDraft({ id: 1, title: "タイトル" });
    render(<AIWizard {...defaultProps} currentDraft={draft} onUpdateDraft={onUpdateDraft} />);
    const input = screen.getByDisplayValue("タイトル");
    fireEvent.blur(input);
    expect(onUpdateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, title: "タイトル" })
    );
  });

  it("context textarea を変更できる (lines 148-154)", () => {
    const draft = makeDraft({ wizard_context: "初期コンテキスト" });
    render(<AIWizard {...defaultProps} currentDraft={draft} />);
    const textarea = screen.getByDisplayValue("初期コンテキスト") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "更新コンテキスト" } });
    expect(textarea.value).toBe("更新コンテキスト");
  });

  it("context textarea blur で onUpdateDraft が呼ばれる (line 150)", () => {
    const onUpdateDraft = vi.fn(async () => {});
    const draft = makeDraft({ id: 1, wizard_context: "ctx" });
    render(<AIWizard {...defaultProps} currentDraft={draft} onUpdateDraft={onUpdateDraft} />);
    const textarea = screen.getByDisplayValue("ctx");
    fireEvent.blur(textarea);
    expect(onUpdateDraft).toHaveBeenCalled();
  });

  it("生成ボタンクリックで onGenerate が呼ばれる (line 157)", () => {
    const onGenerate = vi.fn(async () => {});
    const draft = makeDraft({ id: 1 });
    render(<AIWizard {...defaultProps} currentDraft={draft} onGenerate={onGenerate} />);
    const btn = screen.getByRole("button", { name: /生成|generate/i });
    fireEvent.click(btn);
    expect(onGenerate).toHaveBeenCalledWith(1);
  });
});
