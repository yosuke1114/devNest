import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PRListItem } from "./PRListItem";
import type { PullRequest } from "../../types";

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
    project_id: 1,
    github_number: 42,
    github_id: 1001,
    title: "Fix authentication bug",
    body: null,
    state: "open",
    head_branch: "feat/42-auth-fix",
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

describe("PRListItem", () => {
  const defaultProps = {
    pr: makePr(),
    selected: false,
    onSelect: vi.fn(),
  };

  // ─── 表示 ────────────────────────────────────────────────────────────────

  it("PR タイトルを表示する", () => {
    render(<PRListItem {...defaultProps} />);
    expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
  });

  it("github_number を #N 形式で表示する", () => {
    render(<PRListItem {...defaultProps} />);
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("author_login を表示する", () => {
    render(<PRListItem {...defaultProps} />);
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("head_branch を表示する", () => {
    render(<PRListItem {...defaultProps} />);
    expect(screen.getByText("feat/42-auth-fix")).toBeInTheDocument();
  });

  // ─── state アイコン ───────────────────────────────────────────────────────

  it("state='open' のとき open 状態のアイコンを持つ", () => {
    const { container } = render(<PRListItem {...defaultProps} pr={makePr({ state: "open" })} />);
    expect(container.querySelector("[data-state='open'], [data-testid='state-open']")).not.toBeNull();
  });

  it("state='merged' のとき merged 状態のアイコンを持つ", () => {
    const { container } = render(
      <PRListItem {...defaultProps} pr={makePr({ state: "merged" })} />
    );
    expect(
      container.querySelector("[data-state='merged'], [data-testid='state-merged']")
    ).not.toBeNull();
  });

  it("state='closed' のとき closed 状態のアイコンを持つ", () => {
    const { container } = render(
      <PRListItem {...defaultProps} pr={makePr({ state: "closed" })} />
    );
    expect(
      container.querySelector("[data-state='closed'], [data-testid='state-closed']")
    ).not.toBeNull();
  });

  // ─── Draft ───────────────────────────────────────────────────────────────

  it("draft=true のとき Draft バッジを表示する", () => {
    render(<PRListItem {...defaultProps} pr={makePr({ draft: true })} />);
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  it("draft=false のとき Draft バッジを表示しない", () => {
    render(<PRListItem {...defaultProps} pr={makePr({ draft: false })} />);
    expect(screen.queryByText(/draft/i)).toBeNull();
  });

  // ─── selected ────────────────────────────────────────────────────────────

  it("selected=true のとき data-selected 属性または selected クラスを持つ", () => {
    const { container } = render(<PRListItem {...defaultProps} selected={true} />);
    const el = container.firstChild as HTMLElement;
    const hasSelected =
      el?.getAttribute("data-selected") === "true" ||
      el?.className?.includes("bg-white/10") ||
      el?.className?.includes("selected");
    expect(hasSelected).toBe(true);
  });

  // ─── クリック ─────────────────────────────────────────────────────────────

  it("クリックで onSelect が呼ばれる", () => {
    const onSelect = vi.fn();
    render(<PRListItem {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Fix authentication bug"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
