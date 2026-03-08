import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LinkedIssuesPanel } from "./LinkedIssuesPanel";
import type { Issue } from "../../types";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    project_id: 1,
    github_number: 42,
    github_id: 100,
    title: "Fix the bug",
    body: null,
    status: "open",
    author_login: "user",
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

describe("LinkedIssuesPanel", () => {
  // ─── ローディング状態 ──────────────────────────────────────────────────────

  it("loading=true のとき読み込み中を表示する", () => {
    render(<LinkedIssuesPanel issues={[]} loading={true} />);
    expect(screen.getByText(/読み込み中|loading/i)).toBeInTheDocument();
  });

  // ─── 空状態 ───────────────────────────────────────────────────────────────

  it("issues=[] のとき空メッセージを表示する", () => {
    render(<LinkedIssuesPanel issues={[]} loading={false} />);
    expect(screen.getByText(/issue がありません|no issue|リンクなし/i)).toBeInTheDocument();
  });

  // ─── Issue 表示 ───────────────────────────────────────────────────────────

  it("issue のタイトルを表示する", () => {
    const issue = makeIssue({ title: "バグを修正する" });
    render(<LinkedIssuesPanel issues={[issue]} loading={false} />);
    expect(screen.getByText("バグを修正する")).toBeInTheDocument();
  });

  it("issue の github_number を表示する（#42 形式）", () => {
    const issue = makeIssue({ github_number: 42 });
    render(<LinkedIssuesPanel issues={[issue]} loading={false} />);
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("複数の issue を表示する", () => {
    const issues = [
      makeIssue({ id: 1, title: "Issue A", github_number: 1 }),
      makeIssue({ id: 2, title: "Issue B", github_number: 2 }),
    ];
    render(<LinkedIssuesPanel issues={issues} loading={false} />);
    expect(screen.getByText("Issue A")).toBeInTheDocument();
    expect(screen.getByText("Issue B")).toBeInTheDocument();
  });

  it("status='open' の issue は open アイコン相当を持つ", () => {
    const issue = makeIssue({ status: "open" });
    const { container } = render(<LinkedIssuesPanel issues={[issue]} loading={false} />);
    expect(container.querySelector("[data-testid='status-open'], [data-status='open']")).not.toBeNull();
  });

  it("status='closed' の issue は closed アイコン相当を持つ", () => {
    const issue = makeIssue({ status: "closed" });
    const { container } = render(<LinkedIssuesPanel issues={[issue]} loading={false} />);
    expect(container.querySelector("[data-testid='status-closed'], [data-status='closed']")).not.toBeNull();
  });

  // ─── onIssueClick ────────────────────────────────────────────────────────

  it("issue をクリックすると onIssueClick が呼ばれる", () => {
    const onIssueClick = vi.fn();
    const issue = makeIssue({ id: 5 });
    render(
      <LinkedIssuesPanel issues={[issue]} loading={false} onIssueClick={onIssueClick} />
    );
    fireEvent.click(screen.getByText("Fix the bug"));
    expect(onIssueClick).toHaveBeenCalledWith(issue);
  });

  // ─── パネルヘッダー ────────────────────────────────────────────────────────

  it("Linked Issues ヘッダーを表示する", () => {
    render(<LinkedIssuesPanel issues={[]} loading={false} />);
    expect(screen.getByText(/linked issues/i)).toBeInTheDocument();
  });
});
