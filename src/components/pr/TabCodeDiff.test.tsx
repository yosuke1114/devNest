import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabCodeDiff } from "./TabCodeDiff";
import type { PrFile } from "../../types";

function makeFile(overrides: Partial<PrFile> = {}): PrFile {
  return {
    filename: "src/auth.ts",
    status: "modified",
    additions: 10,
    deletions: 3,
    patch: null,
    ...overrides,
  };
}

describe("TabCodeDiff", () => {
  const defaultProps = {
    files: [],
    diff: "",
    filesStatus: "idle" as const,
    diffStatus: "idle" as const,
    onLoadFiles: vi.fn(),
    onLoadDiff: vi.fn(),
  };

  // ─── idle 状態 ──────────────────────────────────────────────────────────

  it("filesStatus='idle' のとき Load diff ボタンを表示する", () => {
    render(<TabCodeDiff {...defaultProps} />);
    expect(screen.getByRole("button", { name: /load diff/i })).toBeInTheDocument();
  });

  it("Load diff ボタンクリックで onLoadFiles と onLoadDiff が呼ばれる", () => {
    const onLoadFiles = vi.fn();
    const onLoadDiff = vi.fn();
    render(<TabCodeDiff {...defaultProps} onLoadFiles={onLoadFiles} onLoadDiff={onLoadDiff} />);
    fireEvent.click(screen.getByRole("button", { name: /load diff/i }));
    expect(onLoadFiles).toHaveBeenCalledTimes(1);
    expect(onLoadDiff).toHaveBeenCalledTimes(1);
  });

  // ─── loading 状態 ────────────────────────────────────────────────────────

  it("filesStatus='loading' のとき Loading... を表示する", () => {
    render(<TabCodeDiff {...defaultProps} filesStatus="loading" diffStatus="loading" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  // ─── ファイル一覧 ────────────────────────────────────────────────────────

  it("ファイル名を表示する", () => {
    const file = makeFile({ filename: "src/main.ts" });
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[file]}
        filesStatus="success"
        diffStatus="success"
        diff=""
      />
    );
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("additions と deletions を表示する", () => {
    const file = makeFile({ additions: 15, deletions: 7 });
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[file]}
        filesStatus="success"
        diffStatus="success"
        diff=""
      />
    );
    expect(screen.getByText(/\+15/)).toBeInTheDocument();
    expect(screen.getByText(/-7/)).toBeInTheDocument();
  });

  it("Files changed (N) を表示する", () => {
    const files = [makeFile(), makeFile({ filename: "src/other.ts" })];
    render(
      <TabCodeDiff
        {...defaultProps}
        files={files}
        filesStatus="success"
        diffStatus="success"
        diff=""
      />
    );
    expect(screen.getByText(/files changed \(2\)/i)).toBeInTheDocument();
  });

  // ─── diff パース ────────────────────────────────────────────────────────

  it("diff が空のとき diff セクションを表示しない", () => {
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[]}
        filesStatus="success"
        diffStatus="success"
        diff=""
      />
    );
    // クラッシュしない
    expect(screen.queryByText(/files changed/i)).toBeNull();
  });
});
