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
});
