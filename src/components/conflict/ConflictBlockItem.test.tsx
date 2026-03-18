import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConflictBlockItem } from "./ConflictBlockItem";
import type { ConflictBlock } from "../../types";

function makeBlock(overrides: Partial<ConflictBlock> = {}): ConflictBlock {
  return {
    index: 0,
    ours: "my content",
    theirs: "their content",
    ...overrides,
  };
}

describe("ConflictBlockItem", () => {
  const defaultProps = {
    block: makeBlock(),
    resolution: undefined,
    manualContent: undefined,
    onResolve: vi.fn(),
    onManualChange: vi.fn(),
  };

  it("block.index + 1 を「Conflict block #N」として表示する", () => {
    render(<ConflictBlockItem {...defaultProps} block={makeBlock({ index: 2 })} />);
    expect(screen.getByText(/Conflict block #3/)).toBeInTheDocument();
  });

  it("block.ours の内容を表示する", () => {
    render(<ConflictBlockItem {...defaultProps} />);
    expect(screen.getByText("my content")).toBeInTheDocument();
  });

  it("block.theirs の内容を表示する", () => {
    render(<ConflictBlockItem {...defaultProps} />);
    expect(screen.getByText("their content")).toBeInTheDocument();
  });

  it("USE MINE ボタンクリックで onResolve(\"ours\") が呼ばれる", () => {
    const onResolve = vi.fn();
    render(<ConflictBlockItem {...defaultProps} onResolve={onResolve} />);
    fireEvent.click(screen.getByText("USE MINE"));
    expect(onResolve).toHaveBeenCalledWith("ours");
  });

  it("USE THEIRS ボタンクリックで onResolve(\"theirs\") が呼ばれる", () => {
    const onResolve = vi.fn();
    render(<ConflictBlockItem {...defaultProps} onResolve={onResolve} />);
    fireEvent.click(screen.getByText("USE THEIRS"));
    expect(onResolve).toHaveBeenCalledWith("theirs");
  });

  it("MANUAL ボタンクリックで onResolve(\"manual\", ...) が呼ばれる", () => {
    const onResolve = vi.fn();
    render(<ConflictBlockItem {...defaultProps} onResolve={onResolve} />);
    fireEvent.click(screen.getByText("MANUAL"));
    expect(onResolve).toHaveBeenCalledWith("manual", expect.anything());
  });

  it("resolution=\"manual\" のとき textarea が表示される", () => {
    render(<ConflictBlockItem {...defaultProps} resolution="manual" />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("resolution=\"ours\" のとき「OURS を選択」が表示される（解消済みバッジ）", () => {
    render(<ConflictBlockItem {...defaultProps} resolution="ours" />);
    expect(screen.getByText(/OURS を選択/)).toBeInTheDocument();
  });

  it("manual textarea 変更で onManualChange が呼ばれる (line 98)", () => {
    const onManualChange = vi.fn();
    render(<ConflictBlockItem {...defaultProps} resolution="manual" onManualChange={onManualChange} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "edited content" } });
    expect(onManualChange).toHaveBeenCalledWith("edited content");
  });
});
