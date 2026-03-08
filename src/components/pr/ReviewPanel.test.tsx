import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReviewPanel } from "./ReviewPanel";

describe("ReviewPanel", () => {
  const defaultProps = {
    reviewStatus: "idle" as const,
    onSubmitReview: vi.fn(),
  };

  // ─── 表示 ─────────────────────────────────────────────────────────────────

  it("コメント用 textarea を表示する", () => {
    render(<ReviewPanel {...defaultProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("Approve ラジオボタンを表示する", () => {
    render(<ReviewPanel {...defaultProps} />);
    expect(screen.getByRole("radio", { name: /approve/i })).toBeInTheDocument();
  });

  it("Request Changes ラジオボタンを表示する", () => {
    render(<ReviewPanel {...defaultProps} />);
    expect(screen.getByRole("radio", { name: /request changes/i })).toBeInTheDocument();
  });

  it("デフォルトで Approve が選択されている", () => {
    render(<ReviewPanel {...defaultProps} />);
    expect(screen.getByRole("radio", { name: /approve/i })).toBeChecked();
  });

  it("SUBMIT REVIEW ボタンを表示する", () => {
    render(<ReviewPanel {...defaultProps} />);
    expect(screen.getByRole("button", { name: /submit review/i })).toBeInTheDocument();
  });

  // ─── インタラクション ─────────────────────────────────────────────────────

  it("Request Changes を選択してコメント入力後 Submit で onSubmitReview('changes_requested', body) が呼ばれる", () => {
    const onSubmitReview = vi.fn();
    render(<ReviewPanel {...defaultProps} onSubmitReview={onSubmitReview} />);
    fireEvent.click(screen.getByRole("radio", { name: /request changes/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Please fix typo" } });
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));
    expect(onSubmitReview).toHaveBeenCalledWith("changes_requested", "Please fix typo");
  });

  it("Approve のまま Submit で onSubmitReview('approved', '') が呼ばれる", () => {
    const onSubmitReview = vi.fn();
    render(<ReviewPanel {...defaultProps} onSubmitReview={onSubmitReview} />);
    fireEvent.click(screen.getByRole("button", { name: /submit review/i }));
    expect(onSubmitReview).toHaveBeenCalledWith("approved", "");
  });

  it("textarea へのコメント入力が反映される", () => {
    render(<ReviewPanel {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "LGTM!" } });
    expect(textarea).toHaveValue("LGTM!");
  });

  // ─── ローディング状態 ────────────────────────────────────────────────────

  it("reviewStatus='loading' のとき Submit ボタンが disabled", () => {
    render(<ReviewPanel {...defaultProps} reviewStatus="loading" />);
    expect(screen.getByRole("button", { name: /submit review/i })).toBeDisabled();
  });

  it("reviewStatus='loading' のとき textarea が disabled", () => {
    render(<ReviewPanel {...defaultProps} reviewStatus="loading" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  // ─── エラー状態 ───────────────────────────────────────────────────────────

  it("reviewStatus='error' のときエラーメッセージを表示する", () => {
    render(<ReviewPanel {...defaultProps} reviewStatus="error" />);
    expect(screen.getByText(/失敗|error|failed/i)).toBeInTheDocument();
  });
});
