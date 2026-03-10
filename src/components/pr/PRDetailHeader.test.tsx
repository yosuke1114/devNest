import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PRDetailHeader } from "./PRDetailHeader";
import type { PullRequest } from "../../types";

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
    project_id: 1,
    github_number: 42,
    github_id: 1001,
    title: "Add OAuth login",
    body: "This PR adds OAuth.",
    state: "open",
    head_branch: "feat/42-oauth",
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

describe("PRDetailHeader", () => {
  it("PR タイトルを表示する", () => {
    render(<PRDetailHeader pr={makePr()} />);
    expect(screen.getByText("Add OAuth login")).toBeInTheDocument();
  });

  it("github_number を #N 形式で表示する", () => {
    render(<PRDetailHeader pr={makePr()} />);
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("head_branch → base_branch を表示する", () => {
    render(<PRDetailHeader pr={makePr()} />);
    expect(screen.getByText(/feat\/42-oauth/)).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
  });

  it("checks_status='passing' のとき passing を表示する", () => {
    render(<PRDetailHeader pr={makePr({ checks_status: "passing" })} />);
    expect(screen.getByText(/passing/i)).toBeInTheDocument();
  });

  it("checks_status='failing' のとき failing を表示する", () => {
    render(<PRDetailHeader pr={makePr({ checks_status: "failing" })} />);
    expect(screen.getByText(/failing/i)).toBeInTheDocument();
  });

  it("linked_issue_number がある場合に #N を表示する", () => {
    render(<PRDetailHeader pr={makePr({ linked_issue_number: 7 })} />);
    expect(screen.getByText(/#7/)).toBeInTheDocument();
  });

  it("linked_issue_number が null の場合は Issue 番号を表示しない", () => {
    render(<PRDetailHeader pr={makePr({ linked_issue_number: null })} />);
    // #7 のような linked issue 表示がないこと（#42 は PR 番号として存在）
    expect(screen.queryByText(/Issue #/i)).toBeNull();
  });

  it("draft=true のとき Draft バッジを表示する", () => {
    render(<PRDetailHeader pr={makePr({ draft: true })} />);
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  it("author_login を表示する", () => {
    render(<PRDetailHeader pr={makePr({ author_login: "bob" })} />);
    expect(screen.getByText(/bob/)).toBeInTheDocument();
  });
});
