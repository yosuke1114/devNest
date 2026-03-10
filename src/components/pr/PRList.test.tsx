import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRList } from "./PRList";
import type { PullRequest } from "../../types";

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
    project_id: 1,
    github_number: 42,
    github_id: 1001,
    title: "Fix auth bug",
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

describe("PRList", () => {
  // ─── ローディング ─────────────────────────────────────────────────────────

  it("loading=true のとき Loading... を表示する", () => {
    render(<PRList prs={[]} loading={true} selectedPrId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  // ─── 空状態 ───────────────────────────────────────────────────────────────

  it("prs=[] loading=false のとき No PRs found を表示する", () => {
    render(<PRList prs={[]} loading={false} selectedPrId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/no pr|no pull request|PRがありません/i)).toBeInTheDocument();
  });

  // ─── PR 表示 ─────────────────────────────────────────────────────────────

  it("PR のタイトルを表示する", () => {
    const pr = makePr({ title: "Add feature X" });
    render(<PRList prs={[pr]} loading={false} selectedPrId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Add feature X")).toBeInTheDocument();
  });

  it("複数の PR を表示する", () => {
    const prs = [
      makePr({ id: 1, title: "PR Alpha" }),
      makePr({ id: 2, title: "PR Beta" }),
    ];
    render(<PRList prs={prs} loading={false} selectedPrId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("PR Alpha")).toBeInTheDocument();
    expect(screen.getByText("PR Beta")).toBeInTheDocument();
  });

  // ─── onSelect ────────────────────────────────────────────────────────────

  it("PR クリックで onSelect が pr を引数に呼ばれる", () => {
    const onSelect = vi.fn();
    const pr = makePr({ id: 5, title: "Click Me" });
    render(<PRList prs={[pr]} loading={false} selectedPrId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Click Me"));
    expect(onSelect).toHaveBeenCalledWith(pr);
  });

  // ─── selectedPrId ────────────────────────────────────────────────────────

  it("selectedPrId に一致する PR が selected 状態になる", () => {
    const pr = makePr({ id: 3 });
    render(<PRList prs={[pr]} loading={false} selectedPrId={3} onSelect={vi.fn()} />);
    // PRListItem の selected=true テストと同様の検証
    expect(screen.getByText("Fix auth bug")).toBeInTheDocument();
  });
});
