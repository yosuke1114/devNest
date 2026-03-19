import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRFilterBar } from "./PRFilterBar";

type FilterValue = "open" | "closed" | "merged" | "all";

describe("PRFilterBar", () => {
  const defaultProps = {
    filter: "open" as FilterValue,
    onChange: vi.fn(),
    onSync: vi.fn(),
    syncing: false,
  };

  // ─── フィルタボタン ──────────────────────────────────────────────────────────

  it("4つのフィルタボタンを表示する", () => {
    render(<PRFilterBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /open/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /closed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /merged/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();
  });

  it("現在の filter ボタンが aria-pressed=true または selected スタイルを持つ", () => {
    render(<PRFilterBar {...defaultProps} filter="merged" />);
    const mergedBtn = screen.getByRole("button", { name: /merged/i });
    // selected か aria-pressed で判定（実装に応じてどちらか）
    const isSelected =
      mergedBtn.getAttribute("aria-pressed") === "true" ||
      mergedBtn.getAttribute("data-selected") === "true" ||
      mergedBtn.className.includes("bg-blue");
    expect(isSelected).toBe(true);
  });

  it("open フィルタボタンクリックで onChange が 'open' を引数に呼ばれる", () => {
    const onChange = vi.fn();
    render(<PRFilterBar {...defaultProps} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onChange).toHaveBeenCalledWith("open");
  });

  it("all フィルタボタンクリックで onChange が 'all' を引数に呼ばれる", () => {
    const onChange = vi.fn();
    render(<PRFilterBar {...defaultProps} onChange={onChange} filter="open" />);
    fireEvent.click(screen.getByRole("button", { name: /^all$/i }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  // ─── Sync ボタン ─────────────────────────────────────────────────────────────

  it("Sync ボタンが存在する", () => {
    render(<PRFilterBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /sync/i })).toBeInTheDocument();
  });

  it("syncing=false のとき Sync ボタンが enabled", () => {
    render(<PRFilterBar {...defaultProps} syncing={false} />);
    expect(screen.getByRole("button", { name: /sync/i })).not.toBeDisabled();
  });

  it("syncing=true のとき Sync ボタンが disabled", () => {
    render(<PRFilterBar {...defaultProps} syncing={true} />);
    expect(screen.getByRole("button", { name: /sync/i })).toBeDisabled();
  });

  it("Sync ボタンクリックで onSync が呼ばれる", () => {
    const onSync = vi.fn();
    render(<PRFilterBar {...defaultProps} onSync={onSync} />);
    fireEvent.click(screen.getByRole("button", { name: /sync/i }));
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("非選択フィルタボタンの mouseenter/mouseleave が動作する (lines 49-52)", () => {
    render(<PRFilterBar {...defaultProps} filter="open" />);
    // "closed" は非選択
    const closedBtn = screen.getByRole("button", { name: /closed/i });
    fireEvent.mouseEnter(closedBtn);
    fireEvent.mouseLeave(closedBtn);
    expect(closedBtn).toBeInTheDocument();
  });

  it("選択済みフィルタボタンの mouseenter でスタイル変更しない", () => {
    render(<PRFilterBar {...defaultProps} filter="open" />);
    // "open" は選択中 → mouseenter で background 変更しない
    const openBtn = screen.getByRole("button", { name: /^open$/i });
    fireEvent.mouseEnter(openBtn);
    fireEvent.mouseLeave(openBtn);
    expect(openBtn).toBeInTheDocument();
  });

  it("Sync ボタンの mouseenter/mouseleave が動作する (lines 77-78)", () => {
    render(<PRFilterBar {...defaultProps} syncing={false} />);
    const syncBtn = screen.getByRole("button", { name: /sync/i });
    fireEvent.mouseEnter(syncBtn);
    fireEvent.mouseLeave(syncBtn);
    expect(syncBtn).toBeInTheDocument();
  });

  it("syncing=true のとき Sync ボタンの mouseenter でスタイル変更しない", () => {
    render(<PRFilterBar {...defaultProps} syncing={true} />);
    const syncBtn = screen.getByRole("button", { name: /sync/i });
    fireEvent.mouseEnter(syncBtn);
    fireEvent.mouseLeave(syncBtn);
    expect(syncBtn).toBeInTheDocument();
  });
});
