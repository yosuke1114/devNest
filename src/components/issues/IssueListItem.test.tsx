import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { IssueListItem } from "./IssueListItem";
import type { Issue } from "../../types";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    project_id: 1,
    github_number: 42,
    github_id: 1000,
    title: "テスト Issue",
    body: null,
    status: "open",
    author_login: "testuser",
    assignee_login: null,
    labels: "[]",
    milestone: null,
    linked_pr_number: null,
    created_by: "user",
    github_created_at: "2026-01-01T00:00:00Z",
    github_updated_at: "2026-01-01T00:00:00Z",
    synced_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("IssueListItem", () => {
  it("タイトルを表示する", () => {
    const issue = makeIssue({ title: "バグ修正" });
    render(<IssueListItem issue={issue} />);
    expect(screen.getByText("バグ修正")).toBeInTheDocument();
  });

  it("github_number を #42 形式で表示する", () => {
    const issue = makeIssue({ github_number: 42 });
    render(<IssueListItem issue={issue} />);
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("status='open' で緑の dot アイコン相当が表示される", () => {
    const issue = makeIssue({ status: "open" });
    const { container } = render(<IssueListItem issue={issue} />);
    const icon = container.querySelector("[data-testid='status-open'], svg");
    expect(icon).toBeInTheDocument();
  });

  it("status='closed' で閉じた icon 相当が表示される", () => {
    const issue = makeIssue({ status: "closed" });
    const { container } = render(<IssueListItem issue={issue} />);
    const icon = container.querySelector("[data-testid='status-closed'], svg");
    expect(icon).toBeInTheDocument();
  });

  it("labels JSON をバッジ表示する", () => {
    const issue = makeIssue({ labels: '["bug","feat"]' });
    render(<IssueListItem issue={issue} />);
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("feat")).toBeInTheDocument();
  });

  it("labels が空配列のときバッジなし", () => {
    const issue = makeIssue({ labels: "[]" });
    const { container } = render(<IssueListItem issue={issue} />);
    const badges = container.querySelectorAll("[data-testid='label-badge']");
    expect(badges.length).toBe(0);
  });

  it("クリックで onClick が呼ばれる", () => {
    const onClick = vi.fn();
    const issue = makeIssue();
    render(<IssueListItem issue={issue} onClick={onClick} />);
    fireEvent.click(screen.getByText("テスト Issue"));
    expect(onClick).toHaveBeenCalledWith(issue);
  });

  it("author_login を表示する", () => {
    const issue = makeIssue({ author_login: "octocat" });
    render(<IssueListItem issue={issue} />);
    expect(screen.getByText(/octocat/)).toBeInTheDocument();
  });
});
