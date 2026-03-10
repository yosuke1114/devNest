import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { InlineComment } from "./InlineComment";
import type { PrComment } from "../../types";

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: 1,
    pr_id: 10,
    github_id: null,
    author_login: "alice",
    body: "Looks good!",
    path: "src/foo.ts",
    line: 42,
    comment_type: "issue_comment",
    diff_hunk: null,
    resolved: false,
    in_reply_to_id: null,
    is_pending: false,
    synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("InlineComment", () => {
  it("author_login を表示する", () => {
    render(<InlineComment comment={makeComment({ author_login: "bob" })} />);
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("body を表示する", () => {
    render(<InlineComment comment={makeComment({ body: "Please fix this." })} />);
    expect(screen.getByText("Please fix this.")).toBeInTheDocument();
  });

  it("is_pending=true のとき pending バッジを表示する", () => {
    render(<InlineComment comment={makeComment({ is_pending: true })} />);
    expect(screen.getByTestId("pending-badge")).toBeInTheDocument();
  });

  it("is_pending=false のとき pending バッジを表示しない", () => {
    render(<InlineComment comment={makeComment({ is_pending: false })} />);
    expect(screen.queryByTestId("pending-badge")).toBeNull();
  });
});
