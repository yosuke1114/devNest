import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRDetailTabs } from "./PRDetailTabs";

type TabId = "overview" | "code-diff" | "design-docs";

describe("PRDetailTabs", () => {
  const defaultProps = {
    activeTab: "overview" as TabId,
    onChange: vi.fn(),
    codeFileCount: 0,
  };

  // ─── タブ表示 ──────────────────────────────────────────────────────────────

  it("Overview タブを表示する", () => {
    render(<PRDetailTabs {...defaultProps} />);
    expect(screen.getByRole("button", { name: /overview/i })).toBeInTheDocument();
  });

  it("Code Changes タブを表示する", () => {
    render(<PRDetailTabs {...defaultProps} />);
    expect(screen.getByRole("button", { name: /code changes/i })).toBeInTheDocument();
  });

  it("Design Docs タブを表示する", () => {
    render(<PRDetailTabs {...defaultProps} />);
    expect(screen.getByRole("button", { name: /design docs/i })).toBeInTheDocument();
  });

  // ─── active タブ ──────────────────────────────────────────────────────────

  it("activeTab='overview' のとき Overview ボタンが active 状態", () => {
    render(<PRDetailTabs {...defaultProps} activeTab="overview" />);
    const btn = screen.getByRole("button", { name: /overview/i });
    const isActive =
      btn.getAttribute("aria-selected") === "true" ||
      btn.getAttribute("data-active") === "true" ||
      btn.className.includes("border-blue");
    expect(isActive).toBe(true);
  });

  it("activeTab='code-diff' のとき Code Changes ボタンが active 状態", () => {
    render(<PRDetailTabs {...defaultProps} activeTab="code-diff" />);
    const btn = screen.getByRole("button", { name: /code changes/i });
    const isActive =
      btn.getAttribute("aria-selected") === "true" ||
      btn.getAttribute("data-active") === "true" ||
      btn.className.includes("border-blue");
    expect(isActive).toBe(true);
  });

  // ─── クリック ─────────────────────────────────────────────────────────────

  it("Overview クリックで onChange('overview') が呼ばれる", () => {
    const onChange = vi.fn();
    render(<PRDetailTabs {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /overview/i }));
    expect(onChange).toHaveBeenCalledWith("overview");
  });

  it("Code Changes クリックで onChange('code-diff') が呼ばれる", () => {
    const onChange = vi.fn();
    render(<PRDetailTabs {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /code changes/i }));
    expect(onChange).toHaveBeenCalledWith("code-diff");
  });

  // ─── Design Docs (enabled) ────────────────────────────────────────────────

  it("Design Docs タブは enabled", () => {
    render(<PRDetailTabs {...defaultProps} />);
    expect(screen.getByRole("button", { name: /design docs/i })).not.toBeDisabled();
  });

  it("Design Docs クリックで onChange('design-docs') が呼ばれる", () => {
    const onChange = vi.fn();
    render(<PRDetailTabs {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /design docs/i }));
    expect(onChange).toHaveBeenCalledWith("design-docs");
  });

  // ─── codeFileCount バッジ ─────────────────────────────────────────────────

  it("codeFileCount > 0 のときファイル数バッジを表示する", () => {
    render(<PRDetailTabs {...defaultProps} codeFileCount={5} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
  });

  it("codeFileCount = 0 のときバッジを表示しない", () => {
    render(<PRDetailTabs {...defaultProps} codeFileCount={0} />);
    // 数字 0 がバッジとして出ないこと（タブラベル内のテキストとして 0 は含まない）
    const codeBtn = screen.getByRole("button", { name: /code changes/i });
    expect(codeBtn.textContent).not.toMatch(/\b0\b/);
  });
});
