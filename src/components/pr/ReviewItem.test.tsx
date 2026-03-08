import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReviewItem } from "./ReviewItem";
import type { PrReview } from "../../types";

function makePrReview(overrides: Partial<PrReview> = {}): PrReview {
  return {
    id: 1,
    pr_id: 10,
    github_id: 999,
    reviewer_login: "alice",
    state: "approved",
    body: null,
    submitted_at: "2026-01-01T00:00:00Z",
    synced_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ReviewItem", () => {
  it("reviewer_login を表示する", () => {
    render(<ReviewItem review={makePrReview({ reviewer_login: "bob" })} />);
    expect(screen.getByText("bob")).toBeInTheDocument();
  });

  it("state='approved' のとき data-testid='review-approved' のアイコンを表示する", () => {
    render(<ReviewItem review={makePrReview({ state: "approved" })} />);
    expect(screen.getByTestId("review-approved")).toBeInTheDocument();
  });

  it("state='changes_requested' のとき data-testid='review-changes-requested' のアイコンを表示する", () => {
    render(<ReviewItem review={makePrReview({ state: "changes_requested" })} />);
    expect(screen.getByTestId("review-changes-requested")).toBeInTheDocument();
  });

  it("state='commented' のとき data-testid='review-commented' のアイコンを表示する", () => {
    render(<ReviewItem review={makePrReview({ state: "commented" })} />);
    expect(screen.getByTestId("review-commented")).toBeInTheDocument();
  });

  it("state='dismissed' のとき data-testid='review-dismissed' のアイコンを表示する", () => {
    render(<ReviewItem review={makePrReview({ state: "dismissed" })} />);
    expect(screen.getByTestId("review-dismissed")).toBeInTheDocument();
  });

  it("state を capitalize して表示する（approved → Approved）", () => {
    render(<ReviewItem review={makePrReview({ state: "approved" })} />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("state='changes_requested' を capitalize して表示する", () => {
    render(<ReviewItem review={makePrReview({ state: "changes_requested" })} />);
    expect(screen.getByText(/changes_requested/i)).toBeInTheDocument();
  });

  it("body があるとき本文を表示する", () => {
    render(<ReviewItem review={makePrReview({ body: "Looks good to me!" })} />);
    expect(screen.getByText("Looks good to me!")).toBeInTheDocument();
  });

  it("body=null のとき本文を表示しない", () => {
    render(<ReviewItem review={makePrReview({ body: null })} />);
    expect(screen.queryByRole("paragraph")).toBeNull();
  });
});
