import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DiffHunkWithComments } from "./DiffHunkWithComments";
import type { DiffHunk, DiffLine } from "../../lib/diffParser";
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

function makeHunk(lines: DiffLine[] = [], header = "@@ -1,3 +1,3 @@"): DiffHunk {
  return { header, lines };
}

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: 1,
    pr_id: 10,
    github_id: null,
    author_login: "alice",
    body: "Nice!",
    path: "src/foo.ts",
    line: 2,
    is_pending: false,
    synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("DiffHunkWithComments", () => {
  it("hunk.header を表示する", () => {
    const hunk = makeHunk([], "@@ -10,4 +10,4 @@");
    render(<DiffHunkWithComments hunk={hunk} comments={[]} />);
    expect(screen.getByText("@@ -10,4 +10,4 @@")).toBeInTheDocument();
  });

  it("add line に '+' プレフィックスを表示する", () => {
    const line = makeLine({ type: "add", content: "new line", newLineNo: 1, oldLineNo: null });
    const hunk = makeHunk([line]);
    render(<DiffHunkWithComments hunk={hunk} comments={[]} />);
    expect(screen.getByText("+")).toBeInTheDocument();
    expect(screen.getByText("new line")).toBeInTheDocument();
  });

  it("remove line に '-' プレフィックスを表示する", () => {
    const line = makeLine({ type: "remove", content: "old line", oldLineNo: 1, newLineNo: null });
    const hunk = makeHunk([line]);
    render(<DiffHunkWithComments hunk={hunk} comments={[]} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText("old line")).toBeInTheDocument();
  });

  it("context line に ' ' プレフィックスを表示する", () => {
    const line = makeLine({ type: "context", content: "same line", oldLineNo: 1, newLineNo: 1 });
    const hunk = makeHunk([line]);
    const { container } = render(<DiffHunkWithComments hunk={hunk} comments={[]} />);
    // prefix span should contain a space character
    const prefixSpans = container.querySelectorAll("span");
    const hasSpace = Array.from(prefixSpans).some((s) => s.textContent === " ");
    expect(hasSpace).toBe(true);
    expect(screen.getByText("same line")).toBeInTheDocument();
  });

  it("newLineNo が一致するコメントをその行の後に表示する", () => {
    const lines = [
      makeLine({ type: "add", content: "added", newLineNo: 2, oldLineNo: null }),
    ];
    const hunk = makeHunk(lines);
    const comment = makeComment({ line: 2, body: "Great addition!" });
    render(<DiffHunkWithComments hunk={hunk} comments={[comment]} />);
    expect(screen.getByText("Great addition!")).toBeInTheDocument();
  });

  it("newLineNo が異なるコメントは表示しない", () => {
    const lines = [
      makeLine({ type: "add", content: "added", newLineNo: 3, oldLineNo: null }),
    ];
    const hunk = makeHunk(lines);
    const comment = makeComment({ line: 5, body: "Not here" });
    render(<DiffHunkWithComments hunk={hunk} comments={[comment]} />);
    expect(screen.queryByText("Not here")).toBeNull();
  });

  it("onAddComment が渡されたとき、行クリックで onAddComment(newLineNo) を呼ぶ", () => {
    const onAddComment = vi.fn();
    const line = makeLine({ type: "add", content: "click me", newLineNo: 7, oldLineNo: null });
    const hunk = makeHunk([line]);
    render(<DiffHunkWithComments hunk={hunk} comments={[]} onAddComment={onAddComment} />);
    fireEvent.click(screen.getByText("click me"));
    expect(onAddComment).toHaveBeenCalledWith(7);
  });

  it("comments が空のとき何も表示しない（コメントエリアなし）", () => {
    const line = makeLine({ type: "context", content: "x", newLineNo: 1, oldLineNo: 1 });
    const hunk = makeHunk([line]);
    render(<DiffHunkWithComments hunk={hunk} comments={[]} />);
    expect(screen.queryByTestId("inline-comment")).toBeNull();
  });
});
