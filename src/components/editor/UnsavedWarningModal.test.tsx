import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UnsavedWarningModal } from "./UnsavedWarningModal";

describe("UnsavedWarningModal", () => {
  const defaultProps = {
    filename: "docs/spec.md",
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    onCancel: vi.fn(),
  };

  // ─── 表示 ────────────────────────────────────────────────────────────────

  it("filename を表示する", () => {
    render(<UnsavedWarningModal {...defaultProps} />);
    expect(screen.getByText(/docs\/spec\.md/)).toBeInTheDocument();
  });

  it("警告メッセージを表示する", () => {
    render(<UnsavedWarningModal {...defaultProps} />);
    const items = screen.getAllByText(/未保存|unsaved/i);
    expect(items.length).toBeGreaterThan(0);
  });

  // ─── 保存ボタン ──────────────────────────────────────────────────────────

  it("保存ボタンが存在する", () => {
    render(<UnsavedWarningModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: /保存|save/i })).toBeInTheDocument();
  });

  it("保存ボタンクリックで onSave が呼ばれる", () => {
    const onSave = vi.fn();
    render(<UnsavedWarningModal {...defaultProps} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /保存|save/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  // ─── 破棄ボタン ──────────────────────────────────────────────────────────

  it("変更を破棄ボタンが存在する", () => {
    render(<UnsavedWarningModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: /破棄|discard/i })).toBeInTheDocument();
  });

  it("破棄ボタンクリックで onDiscard が呼ばれる", () => {
    const onDiscard = vi.fn();
    render(<UnsavedWarningModal {...defaultProps} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole("button", { name: /破棄|discard/i }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  // ─── キャンセルボタン ────────────────────────────────────────────────────

  it("キャンセルボタンが存在する", () => {
    render(<UnsavedWarningModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: /キャンセル|cancel/i })).toBeInTheDocument();
  });

  it("キャンセルボタンクリックで onCancel が呼ばれる", () => {
    const onCancel = vi.fn();
    render(<UnsavedWarningModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /キャンセル|cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // ─── オーバーレイ ─────────────────────────────────────────────────────────

  it("モーダルオーバーレイが存在する", () => {
    const { container } = render(<UnsavedWarningModal {...defaultProps} />);
    expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
  });
});
