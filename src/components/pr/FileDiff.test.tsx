import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FileDiff } from "./FileDiff";
import type { FileDiffResult, DiffLine } from "../../lib/diffParser";
import type { PrComment } from "../../types";

function makeLine(overrides: Partial<DiffLine> = {}): DiffLine {
  return {
    type: "context",
    content: "const x = 1;",
    oldLineNo: 1,
    newLineNo: 1,
    ...overrides,
  };
}

function makeFileDiff(overrides: Partial<FileDiffResult> = {}): FileDiffResult {
  return {
    filename: "src/foo.ts",
    oldFilename: null,
    hunks: [
      {
        header: "@@ -1,3 +1,3 @@",
        lines: [
          makeLine({ type: "add", content: "added line", newLineNo: 1, oldLineNo: null }),
        ],
      },
    ],
    ...overrides,
  };
}

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: 1,
    pr_id: 10,
    github_id: null,
    author_login: "alice",
    body: "LGTM",
    path: "src/foo.ts",
    line: 1,
    is_pending: false,
    synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("FileDiff", () => {
  it("filename を表示する", () => {
    render(<FileDiff fileDiff={makeFileDiff()} />);
    expect(screen.getByText("src/foo.ts")).toBeInTheDocument();
  });

  it("hunk の header を表示する", () => {
    render(<FileDiff fileDiff={makeFileDiff()} />);
    expect(screen.getByText("@@ -1,3 +1,3 @@")).toBeInTheDocument();
  });

  it("hunk の diff line を表示する", () => {
    render(<FileDiff fileDiff={makeFileDiff()} />);
    expect(screen.getByText("added line")).toBeInTheDocument();
  });

  it("hunks が空のとき「No changes」を表示する", () => {
    const fileDiff = makeFileDiff({ hunks: [] });
    render(<FileDiff fileDiff={fileDiff} />);
    expect(screen.getByText(/no changes/i)).toBeInTheDocument();
  });

  it("comments を DiffHunkWithComments に渡して表示する", () => {
    const comment = makeComment({ line: 1, body: "Nice code!" });
    render(<FileDiff fileDiff={makeFileDiff()} comments={[comment]} />);
    expect(screen.getByText("Nice code!")).toBeInTheDocument();
  });

  it("onAddComment が渡されたとき行クリックで (path, line) を引数に呼ぶ", () => {
    const onAddComment = vi.fn();
    render(
      <FileDiff fileDiff={makeFileDiff()} onAddComment={onAddComment} />
    );
    fireEvent.click(screen.getByText("added line"));
    expect(onAddComment).toHaveBeenCalledWith("src/foo.ts", 1);
  });
});
