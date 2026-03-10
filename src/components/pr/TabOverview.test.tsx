import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TabOverview } from "./TabOverview";
import type { PrDetail, PullRequest, PrReview, PrComment } from "../../types";

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
    project_id: 1,
    github_number: 42,
    github_id: 1001,
    title: "Add feature X",
    body: null,
    state: "open",
    head_branch: "feat/42",
    base_branch: "main",
    author_login: "alice",
    checks_status: "passing",
    linked_issue_number: null,
    created_by: "user",
    draft: false,
    merged_at: null,
    github_created_at: "2026-01-01T00:00:00Z",
    github_updated_at: "2026-01-01T00:00:00Z",
    synced_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeReview(overrides: Partial<PrReview> = {}): PrReview {
  return {
    id: 1,
    pr_id: 1,
    github_id: null,
    reviewer_login: "bob",
    state: "approved",
    body: null,
    submitted_at: null,
    submit_status: "submitted",
    synced_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeComment(overrides: Partial<PrComment> = {}): PrComment {
  return {
    id: 1,
    pr_id: 1,
    github_id: null,
    author_login: "carol",
    body: "LGTM!",
    path: null,
    line: null,
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

function makeDetail(overrides: Partial<PrDetail> = {}): PrDetail {
  return {
    pr: makePr(),
    reviews: [],
    comments: [],
    ...overrides,
  };
}

describe("TabOverview", () => {
  // ─── PR メタ ─────────────────────────────────────────────────────────────

  it("PR author_login を表示する", () => {
    render(<TabOverview detail={makeDetail()} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("PR head_branch を表示する", () => {
    render(<TabOverview detail={makeDetail()} />);
    expect(screen.getByText("feat/42")).toBeInTheDocument();
  });

  it("PR base_branch を表示する", () => {
    render(<TabOverview detail={makeDetail()} />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("PR checks_status を表示する", () => {
    render(<TabOverview detail={makeDetail()} />);
    expect(screen.getByText("passing")).toBeInTheDocument();
  });

  // ─── Reviews ─────────────────────────────────────────────────────────────

  it("reviews=[] のとき No reviews yet を表示する", () => {
    render(<TabOverview detail={makeDetail()} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });

  it("review の reviewer_login を表示する", () => {
    const detail = makeDetail({ reviews: [makeReview({ reviewer_login: "bob" })] });
    render(<TabOverview detail={detail} />);
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("review の state を表示する", () => {
    const detail = makeDetail({ reviews: [makeReview({ state: "approved" })] });
    render(<TabOverview detail={detail} />);
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });

  // ─── Comments ────────────────────────────────────────────────────────────

  it("comments を表示する", () => {
    const detail = makeDetail({ comments: [makeComment({ body: "Great work!" })] });
    render(<TabOverview detail={detail} />);
    expect(screen.getByText("Great work!")).toBeInTheDocument();
  });

  it("comment の author_login を表示する", () => {
    const detail = makeDetail({ comments: [makeComment({ author_login: "dave" })] });
    render(<TabOverview detail={detail} />);
    expect(screen.getByText("dave")).toBeInTheDocument();
  });

  it("comments=[] のとき Comments セクションを表示しない", () => {
    render(<TabOverview detail={makeDetail()} />);
    expect(screen.queryByText(/^Comments/)).toBeNull();
  });
});
