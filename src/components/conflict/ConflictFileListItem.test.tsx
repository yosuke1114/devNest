import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConflictFileListItem } from "./ConflictFileListItem";
import type { ConflictFile } from "../../types";

function makeFile(overrides: Partial<ConflictFile> = {}): ConflictFile {
  return {
    id: 1,
    project_id: 1,
    file_path: "docs/design/overview.md",
    is_managed: true,
    resolution: null,
    resolved_at: null,
    blocks: [
      { index: 0, ours: "a", theirs: "b" },
      { index: 1, ours: "c", theirs: "d" },
    ],
    ...overrides,
  };
}

describe("ConflictFileListItem", () => {
  const defaultProps = {
    file: makeFile(),
    isActive: false,
    resolvedCount: 0,
    onClick: vi.fn(),
  };

  it("file_path のファイル名部分（basename）を表示する", () => {
    render(<ConflictFileListItem {...defaultProps} />);
    expect(screen.getByText("overview.md")).toBeInTheDocument();
  });

  it("isActive=true のとき選択状態を示す（data-active=\"true\"）", () => {
    const { container } = render(<ConflictFileListItem {...defaultProps} isActive={true} />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("data-active")).toBe("true");
  });

  it("全ブロック解消済みのとき「ready」を表示する", () => {
    render(<ConflictFileListItem {...defaultProps} resolvedCount={2} />);
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("未解消ブロック数「{N} conflicts」を表示する（全解消前）", () => {
    render(<ConflictFileListItem {...defaultProps} resolvedCount={0} />);
    expect(screen.getByText(/2 conflicts/)).toBeInTheDocument();
  });

  it("クリックで onClick が呼ばれる", () => {
    const onClick = vi.fn();
    render(<ConflictFileListItem {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByText("overview.md"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
