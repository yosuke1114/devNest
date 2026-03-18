import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRCreateModal } from "./PRCreateModal";

describe("PRCreateModal", () => {
  const defaultProps = {
    branchName: "feat/99-my-branch",
    createStatus: "idle",
    error: null,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
  };

  it("branchName を表示する", () => {
    render(<PRCreateModal {...defaultProps} />);
    expect(screen.getByText("feat/99-my-branch")).toBeInTheDocument();
  });

  it("デフォルトの title が `feat: {branchName}` になっている", () => {
    render(<PRCreateModal {...defaultProps} />);
    const input = screen.getByRole("textbox", { name: /title/i }) as HTMLInputElement;
    // fallback: find the first input
    const inputEl = input || (screen.getAllByRole("textbox")[0] as HTMLInputElement);
    expect(inputEl.value).toBe("feat: feat/99-my-branch");
  });

  it("title input が変更できる", () => {
    render(<PRCreateModal {...defaultProps} />);
    const inputs = screen.getAllByRole("textbox");
    const titleInput = inputs[0] as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "new title" } });
    expect(titleInput.value).toBe("new title");
  });

  it("title が空のとき Create PR ボタンが disabled", () => {
    render(<PRCreateModal {...defaultProps} />);
    const inputs = screen.getAllByRole("textbox");
    const titleInput = inputs[0];
    fireEvent.change(titleInput, { target: { value: "" } });
    const createBtn = screen.getByRole("button", { name: /Create PR/i });
    expect(createBtn).toBeDisabled();
  });

  it("createStatus='loading' のとき Create PR ボタンが disabled かつ「Creating…」と表示", () => {
    render(<PRCreateModal {...defaultProps} createStatus="loading" />);
    expect(screen.getByText(/Creating…/)).toBeInTheDocument();
    const btn = screen.getByText(/Creating…/).closest("button");
    expect(btn).toBeDisabled();
  });

  it("error がある場合にエラーメッセージを表示する", () => {
    render(<PRCreateModal {...defaultProps} error="Something went wrong" createStatus="error" />);
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  it("Create PR ボタンクリックで onSubmit(title, body) が呼ばれる", () => {
    const onSubmit = vi.fn();
    render(<PRCreateModal {...defaultProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /Create PR/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // body is optional — when empty the component may pass undefined
    const [calledTitle] = onSubmit.mock.calls[0];
    expect(calledTitle).toBe("feat: feat/99-my-branch");
  });

  it("description textarea を変更できる (line 67)", () => {
    render(<PRCreateModal {...defaultProps} />);
    // textarea は 2番目の textbox
    const textareas = screen.getAllByRole("textbox");
    const descTextarea = textareas.find((el) => el.tagName === "TEXTAREA")!;
    expect(descTextarea).toBeTruthy();
    fireEvent.change(descTextarea, { target: { value: "PR description text" } });
    expect((descTextarea as HTMLTextAreaElement).value).toBe("PR description text");
  });

  it("description 入力後 Create PR で body が渡される", () => {
    const onSubmit = vi.fn();
    render(<PRCreateModal {...defaultProps} onSubmit={onSubmit} />);
    const textareas = screen.getAllByRole("textbox");
    const descTextarea = textareas.find((el) => el.tagName === "TEXTAREA")!;
    fireEvent.change(descTextarea, { target: { value: "my body" } });
    fireEvent.click(screen.getByRole("button", { name: /Create PR/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.any(String), "my body");
  });

  it("背景クリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    const { container } = render(<PRCreateModal {...defaultProps} onClose={onClose} />);
    const overlay = container.querySelector("[data-testid='pr-create-modal']")!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel ボタンクリックで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(<PRCreateModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
