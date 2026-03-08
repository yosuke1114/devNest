import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EventTypeIcon } from "./EventTypeIcon";

describe("EventTypeIcon", () => {
  it('eventType="ci_pass" のとき data-testid="icon-ci-pass" が存在する', () => {
    render(<EventTypeIcon eventType="ci_pass" />);
    expect(screen.getByTestId("icon-ci-pass")).toBeInTheDocument();
  });

  it('eventType="ci_fail" のとき data-testid="icon-ci-fail" が存在する', () => {
    render(<EventTypeIcon eventType="ci_fail" />);
    expect(screen.getByTestId("icon-ci-fail")).toBeInTheDocument();
  });

  it('eventType="pr_comment" のとき data-testid="icon-pr" が存在する', () => {
    render(<EventTypeIcon eventType="pr_comment" />);
    expect(screen.getByTestId("icon-pr")).toBeInTheDocument();
  });

  it('eventType="pr_opened" のとき data-testid="icon-pr" が存在する', () => {
    render(<EventTypeIcon eventType="pr_opened" />);
    expect(screen.getByTestId("icon-pr")).toBeInTheDocument();
  });

  it('eventType="conflict" のとき data-testid="icon-conflict" が存在する', () => {
    render(<EventTypeIcon eventType="conflict" />);
    expect(screen.getByTestId("icon-conflict")).toBeInTheDocument();
  });

  it('eventType="issue_assigned" のとき data-testid="icon-issue" が存在する', () => {
    render(<EventTypeIcon eventType="issue_assigned" />);
    expect(screen.getByTestId("icon-issue")).toBeInTheDocument();
  });
});
