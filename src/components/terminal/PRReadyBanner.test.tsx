import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRReadyBanner } from "./PRReadyBanner";

describe("PRReadyBanner", () => {
  const defaultProps = {
    branchName: "feat/123-my-feature",
    hasDocChanges: false,
    onCreatePR: vi.fn(),
    onReviewChanges: vi.fn(),
    onDismiss: vi.fn(),
  };

  it("branchName を表示する", () => {
    render(<PRReadyBanner {...defaultProps} />);
    expect(screen.getByText("feat/123-my-feature")).toBeInTheDocument();
  });

  it("hasDocChanges=true のとき「設計書変更あり」バッジを表示する", () => {
    render(<PRReadyBanner {...defaultProps} hasDocChanges={true} />);
    expect(screen.getByText(/設計書変更あり/)).toBeInTheDocument();
  });

  it("hasDocChanges=false のとき「設計書変更あり」バッジを表示しない", () => {
    render(<PRReadyBanner {...defaultProps} hasDocChanges={false} />);
    expect(screen.queryByText(/設計書変更あり/)).toBeNull();
  });

  it("CREATE PR ボタンクリックで onCreatePR が呼ばれる", () => {
    const onCreatePR = vi.fn();
    render(<PRReadyBanner {...defaultProps} onCreatePR={onCreatePR} />);
    fireEvent.click(screen.getByText(/CREATE PR/i));
    expect(onCreatePR).toHaveBeenCalledTimes(1);
  });

  it("REVIEW CHANGES ボタンクリックで onReviewChanges が呼ばれる", () => {
    const onReviewChanges = vi.fn();
    render(<PRReadyBanner {...defaultProps} onReviewChanges={onReviewChanges} />);
    fireEvent.click(screen.getByText(/REVIEW CHANGES/i));
    expect(onReviewChanges).toHaveBeenCalledTimes(1);
  });

  it("閉じるボタンクリックで onDismiss が呼ばれる", () => {
    const onDismiss = vi.fn();
    const { container } = render(<PRReadyBanner {...defaultProps} onDismiss={onDismiss} />);
    // dismiss button is the last button (no text, just icon)
    const buttons = container.querySelectorAll("button");
    const dismissBtn = buttons[buttons.length - 1];
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
