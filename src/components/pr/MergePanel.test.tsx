import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MergePanel } from "./MergePanel";

describe("MergePanel", () => {
  const defaultProps = {
    canMerge: true,
    mergeStatus: "idle" as const,
    onMerge: vi.fn(),
    headBranch: "feat/42-oauth",
    baseBranch: "main",
  };

  // ─── 表示 ─────────────────────────────────────────────────────────────────

  it("Squash and merge ボタンを表示する", () => {
    render(<MergePanel {...defaultProps} />);
    expect(screen.getByRole("button", { name: /squash and merge/i })).toBeInTheDocument();
  });

  it("head_branch と base_branch を表示する", () => {
    render(<MergePanel {...defaultProps} />);
    expect(screen.getByText(/feat\/42-oauth/)).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
  });

  // ─── canMerge ────────────────────────────────────────────────────────────

  it("canMerge=true のとき Merge ボタンが enabled", () => {
    render(<MergePanel {...defaultProps} canMerge={true} />);
    expect(screen.getByRole("button", { name: /squash and merge/i })).not.toBeDisabled();
  });

  it("canMerge=false のとき Merge ボタンが disabled", () => {
    render(<MergePanel {...defaultProps} canMerge={false} />);
    expect(screen.getByRole("button", { name: /squash and merge/i })).toBeDisabled();
  });

  it("canMerge=false のとき条件未達成の案内を表示する", () => {
    render(<MergePanel {...defaultProps} canMerge={false} />);
    expect(screen.getByText(/approve|passing|条件/i)).toBeInTheDocument();
  });

  // ─── クリック ─────────────────────────────────────────────────────────────

  it("Merge ボタンクリックで onMerge が呼ばれる", () => {
    const onMerge = vi.fn();
    render(<MergePanel {...defaultProps} onMerge={onMerge} />);
    fireEvent.click(screen.getByRole("button", { name: /squash and merge/i }));
    expect(onMerge).toHaveBeenCalledTimes(1);
  });

  // ─── ローディング状態 ────────────────────────────────────────────────────

  it("mergeStatus='loading' のとき Merge ボタンが disabled", () => {
    render(<MergePanel {...defaultProps} mergeStatus="loading" />);
    expect(screen.getByRole("button", { name: /squash and merge/i })).toBeDisabled();
  });

  // ─── 成功状態 ─────────────────────────────────────────────────────────────

  it("mergeStatus='success' のときマージ完了メッセージを表示する", () => {
    render(<MergePanel {...defaultProps} mergeStatus="success" />);
    expect(screen.getByText(/マージ完了|merged|完了/i)).toBeInTheDocument();
  });

  // ─── エラー状態 ───────────────────────────────────────────────────────────

  it("mergeStatus='error' のときエラーメッセージを表示する", () => {
    render(<MergePanel {...defaultProps} mergeStatus="error" />);
    expect(screen.getByText(/失敗|error|failed/i)).toBeInTheDocument();
  });
});
