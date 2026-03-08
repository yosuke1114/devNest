import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { IssueList } from "./IssueList";
import type { Issue } from "../../types";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    project_id: 1,
    github_number: 1,
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

describe("IssueList", () => {
  it("loading=true のとき「読み込み中」を表示", () => {
    render(<IssueList issues={[]} loading={true} />);
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
  });

  it("issues=[] のとき空メッセージを表示", () => {
    render(<IssueList issues={[]} loading={false} />);
    expect(screen.getByText(/Issue|ありません|empty/i)).toBeInTheDocument();
  });

  it("issues がある場合、各 issue のタイトルを表示", () => {
    const issues = [
      makeIssue({ id: 1, title: "最初の Issue" }),
      makeIssue({ id: 2, title: "2番目の Issue" }),
    ];
    render(<IssueList issues={issues} loading={false} />);
    expect(screen.getByText("最初の Issue")).toBeInTheDocument();
    expect(screen.getByText("2番目の Issue")).toBeInTheDocument();
  });

  it("onSelect を各行に渡す", () => {
    const onSelect = vi.fn();
    const issue = makeIssue({ id: 1, title: "クリックテスト" });
    render(<IssueList issues={[issue]} loading={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("クリックテスト"));
    expect(onSelect).toHaveBeenCalledWith(issue);
  });
});
