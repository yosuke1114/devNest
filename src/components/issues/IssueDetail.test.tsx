import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { IssueDetail } from "./IssueDetail";
import type { Issue, IssueDocLink } from "../../types";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    project_id: 1,
    github_number: 42,
    github_id: 1001,
    title: "Fix the auth bug",
    body: "Users cannot log in when token expires.",
    status: "open",
    author_login: "alice",
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

function makeLink(overrides: Partial<IssueDocLink> = {}): IssueDocLink {
  return {
    id: 1,
    issue_id: 1,
    document_id: 10,
    link_type: "manual",
    created_by: "user",
    created_at: "2026-01-01T00:00:00Z",
    path: "docs/auth.md",
    title: "Auth Design",
    ...overrides,
  };
}

describe("IssueDetail", () => {
  const noop = () => {};
  const asyncNoop = async () => {};

  // ─── 基本表示 ──────────────────────────────────────────────────────────────

  it("Issue タイトルを表示する", () => {
    render(
      <IssueDetail
        issue={makeIssue()}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(screen.getByText("Fix the auth bug")).toBeInTheDocument();
  });

  it("Issue #番号を表示する", () => {
    render(
      <IssueDetail
        issue={makeIssue({ github_number: 42 })}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("Issue body を表示する", () => {
    render(
      <IssueDetail
        issue={makeIssue({ body: "Users cannot log in when token expires." })}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(
      screen.getByText("Users cannot log in when token expires.")
    ).toBeInTheDocument();
  });

  it("body が null のとき説明なしプレースホルダーを表示する", () => {
    render(
      <IssueDetail
        issue={makeIssue({ body: null })}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(screen.getByText(/説明なし/)).toBeInTheDocument();
  });

  it("status=open のとき open バッジを表示する", () => {
    render(
      <IssueDetail
        issue={makeIssue({ status: "open" })}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("status=closed のとき closed バッジを表示する", () => {
    render(
      <IssueDetail
        issue={makeIssue({ status: "closed" })}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  // ─── DocLinkPanel ─────────────────────────────────────────────────────────

  it("links=[] のとき「リンクなし」を表示する", () => {
    render(
      <IssueDetail
        issue={makeIssue()}
        links={[]}
        linksStatus="success"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(screen.getByText(/リンクなし/)).toBeInTheDocument();
  });

  it("links にドキュメントがある場合 path を表示する", () => {
    const link = makeLink({ path: "docs/auth.md" });
    render(
      <IssueDetail
        issue={makeIssue()}
        links={[link]}
        linksStatus="success"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(screen.getByText("docs/auth.md")).toBeInTheDocument();
  });

  it("リンクの削除ボタンを押すと onRemoveLink が呼ばれる", () => {
    const onRemoveLink = vi.fn().mockResolvedValue(undefined);
    const link = makeLink({ issue_id: 1, document_id: 10 });
    render(
      <IssueDetail
        issue={makeIssue({ id: 1 })}
        links={[link]}
        linksStatus="success"
        onAddLink={asyncNoop}
        onRemoveLink={onRemoveLink}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /remove|×|削除/i }));
    expect(onRemoveLink).toHaveBeenCalledWith(1, 10);
  });

  it("ドキュメント名をクリックすると onOpenDocument が呼ばれる", () => {
    const onOpenDocument = vi.fn();
    const link = makeLink({ document_id: 10, path: "docs/auth.md" });
    render(
      <IssueDetail
        issue={makeIssue()}
        links={[link]}
        linksStatus="success"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={onOpenDocument}
      />
    );
    fireEvent.click(screen.getByText("docs/auth.md"));
    expect(onOpenDocument).toHaveBeenCalledWith(10);
  });

  // ─── IssueActions ─────────────────────────────────────────────────────────

  it("LAUNCH TERMINAL ボタンが表示される", () => {
    render(
      <IssueDetail
        issue={makeIssue()}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(
      screen.getByRole("button", { name: /launch terminal/i })
    ).toBeInTheDocument();
  });

  it("LAUNCH TERMINAL ボタンを押すと onLaunchTerminal が呼ばれる", () => {
    const onLaunchTerminal = vi.fn();
    render(
      <IssueDetail
        issue={makeIssue({ id: 1 })}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={onLaunchTerminal}
        onOpenDocument={noop}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /launch terminal/i }));
    expect(onLaunchTerminal).toHaveBeenCalledWith(1);
  });

  it("status=closed のとき LAUNCH TERMINAL が disabled になる", () => {
    render(
      <IssueDetail
        issue={makeIssue({ status: "closed" })}
        links={[]}
        linksStatus="idle"
        onAddLink={asyncNoop}
        onRemoveLink={asyncNoop}
        onLaunchTerminal={noop}
        onOpenDocument={noop}
      />
    );
    expect(
      screen.getByRole("button", { name: /launch terminal/i })
    ).toBeDisabled();
  });
});
