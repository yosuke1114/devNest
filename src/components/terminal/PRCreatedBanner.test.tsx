import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRCreatedBanner } from "./PRCreatedBanner";

describe("PRCreatedBanner", () => {
  const defaultProps = {
    prNumber: 42,
    title: "feat: add new feature",
    hasDocChanges: false,
    onOpenPR: vi.fn(),
    onDismiss: vi.fn(),
  };

  it("PR 番号を「#N」形式で表示する", () => {
    render(<PRCreatedBanner {...defaultProps} />);
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("title を表示する", () => {
    render(<PRCreatedBanner {...defaultProps} />);
    expect(screen.getByText(/feat: add new feature/)).toBeInTheDocument();
  });

  it("hasDocChanges=true のとき Design Docs の案内文を表示する", () => {
    render(<PRCreatedBanner {...defaultProps} hasDocChanges={true} />);
    expect(screen.getByText(/Design Docs/)).toBeInTheDocument();
  });

  it("「PR を開く」ボタンクリックで onOpenPR が呼ばれる", () => {
    const onOpenPR = vi.fn();
    render(<PRCreatedBanner {...defaultProps} onOpenPR={onOpenPR} />);
    fireEvent.click(screen.getByText(/PR を開く/));
    expect(onOpenPR).toHaveBeenCalledTimes(1);
  });

  it("閉じるボタンクリックで onDismiss が呼ばれる", () => {
    const onDismiss = vi.fn();
    const { container } = render(<PRCreatedBanner {...defaultProps} onDismiss={onDismiss} />);
    const buttons = container.querySelectorAll("button");
    const dismissBtn = buttons[buttons.length - 1];
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
