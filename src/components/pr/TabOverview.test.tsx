import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
  const defaultProps = {
    detail: makeDetail(),
    reviewStatus: "idle" as const,
    mergeStatus: "idle" as const,
    onApprove: vi.fn(),
    onRequestChanges: vi.fn(),
    onMerge: vi.fn(),
  };

  // ─── PR メタ ─────────────────────────────────────────────────────────────

  it("PR タイトルを表示する", () => {
    render(<TabOverview {...defaultProps} />);
    expect(screen.getByText("Add feature X")).toBeInTheDocument();
  });

  it("PR github_number を #N 形式で表示する", () => {
    render(<TabOverview {...defaultProps} />);
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("PR author_login を表示する", () => {
    render(<TabOverview {...defaultProps} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("PR head_branch を表示する", () => {
    render(<TabOverview {...defaultProps} />);
    expect(screen.getByText("feat/42")).toBeInTheDocument();
  });

  // ─── Reviews ─────────────────────────────────────────────────────────────

  it("reviews=[] のとき No reviews yet を表示する", () => {
    render(<TabOverview {...defaultProps} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });

  it("review の reviewer_login を表示する", () => {
    const detail = makeDetail({ reviews: [makeReview({ reviewer_login: "bob" })] });
    render(<TabOverview {...defaultProps} detail={detail} />);
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("review の state を表示する", () => {
    const detail = makeDetail({ reviews: [makeReview({ state: "approved" })] });
    render(<TabOverview {...defaultProps} detail={detail} />);
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });

  // ─── Comments ────────────────────────────────────────────────────────────

  it("comments を表示する", () => {
    const detail = makeDetail({ comments: [makeComment({ body: "Great work!" })] });
    render(<TabOverview {...defaultProps} detail={detail} />);
    expect(screen.getByText("Great work!")).toBeInTheDocument();
  });

  it("comment の author_login を表示する", () => {
    const detail = makeDetail({ comments: [makeComment({ author_login: "dave" })] });
    render(<TabOverview {...defaultProps} detail={detail} />);
    expect(screen.getByText("dave")).toBeInTheDocument();
  });

  // ─── Review アクション ───────────────────────────────────────────────────

  it("state='open' のとき Approve ボタンが存在する", () => {
    render(<TabOverview {...defaultProps} />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
  });

  it("state='open' のとき Request changes ボタンが存在する", () => {
    render(<TabOverview {...defaultProps} />);
    expect(screen.getByRole("button", { name: /request changes/i })).toBeInTheDocument();
  });

  it("Approve ボタンクリックで onApprove が呼ばれる", () => {
    const onApprove = vi.fn();
    render(<TabOverview {...defaultProps} onApprove={onApprove} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("Request changes ボタンクリックで onRequestChanges が呼ばれる", () => {
    const onRequestChanges = vi.fn();
    render(<TabOverview {...defaultProps} onRequestChanges={onRequestChanges} />);
    fireEvent.click(screen.getByRole("button", { name: /request changes/i }));
    expect(onRequestChanges).toHaveBeenCalledTimes(1);
  });

  it("reviewStatus='loading' のとき Approve/Request ボタンが disabled", () => {
    render(<TabOverview {...defaultProps} reviewStatus="loading" />);
    expect(screen.getByRole("button", { name: /approve/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /request changes/i })).toBeDisabled();
  });

  // ─── Merge ───────────────────────────────────────────────────────────────

  it("state='open' のとき Merge ボタンが存在する", () => {
    render(<TabOverview {...defaultProps} />);
    expect(screen.getByRole("button", { name: /merge/i })).toBeInTheDocument();
  });

  it("Merge ボタンクリックで onMerge が呼ばれる", () => {
    const onMerge = vi.fn();
    render(<TabOverview {...defaultProps} onMerge={onMerge} />);
    fireEvent.click(screen.getByRole("button", { name: /merge/i }));
    expect(onMerge).toHaveBeenCalledTimes(1);
  });

  it("mergeStatus='loading' のとき Merge ボタンが disabled", () => {
    render(<TabOverview {...defaultProps} mergeStatus="loading" />);
    expect(screen.getByRole("button", { name: /merge/i })).toBeDisabled();
  });

  it("state='closed' のとき Review/Merge アクションを表示しない", () => {
    const detail = makeDetail({ pr: makePr({ state: "closed" }) });
    render(<TabOverview {...defaultProps} detail={detail} />);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /merge/i })).toBeNull();
  });

  it("state='merged' のとき Review/Merge アクションを表示しない", () => {
    const detail = makeDetail({ pr: makePr({ state: "merged" }) });
    render(<TabOverview {...defaultProps} detail={detail} />);
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /merge/i })).toBeNull();
  });
});
