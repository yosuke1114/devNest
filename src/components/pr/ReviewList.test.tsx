import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReviewList } from "./ReviewList";
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

describe("ReviewList", () => {
  it("reviews=[] のとき「No reviews yet」を表示する", () => {
    render(<ReviewList reviews={[]} />);
    expect(screen.getByText("No reviews yet")).toBeInTheDocument();
  });

  it("件数を「Reviews (N)」形式で表示する（0件）", () => {
    render(<ReviewList reviews={[]} />);
    expect(screen.getByText("Reviews (0)")).toBeInTheDocument();
  });

  it("件数を「Reviews (N)」形式で表示する（2件）", () => {
    const reviews = [
      makePrReview({ id: 1, reviewer_login: "alice" }),
      makePrReview({ id: 2, reviewer_login: "bob" }),
    ];
    render(<ReviewList reviews={reviews} />);
    expect(screen.getByText("Reviews (2)")).toBeInTheDocument();
  });

  it("各 review を ReviewItem で表示する", () => {
    const reviews = [
      makePrReview({ id: 1, reviewer_login: "alice" }),
      makePrReview({ id: 2, reviewer_login: "bob" }),
    ];
    render(<ReviewList reviews={reviews} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
  });
});
