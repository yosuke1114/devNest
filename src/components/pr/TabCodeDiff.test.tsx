import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabCodeDiff } from "./TabCodeDiff";
import type { PrFile, PrComment } from "../../types";

function makeFile(overrides: Partial<PrFile> = {}): PrFile {
  return {
    filename: "src/auth.ts",
    status: "modified",
    additions: 10,
    deletions: 3,
    patch: null,
    ...overrides,
  };
}

describe("TabCodeDiff", () => {
  const defaultProps = {
    files: [],
    diff: "",
    filesStatus: "idle" as const,
    diffStatus: "idle" as const,
    onLoadFiles: vi.fn(),
    onLoadDiff: vi.fn(),
  };

  // ─── idle 状態 ──────────────────────────────────────────────────────────

  it("filesStatus='idle' のとき Load diff ボタンを表示する", () => {
    render(<TabCodeDiff {...defaultProps} />);
    expect(screen.getByRole("button", { name: /load diff/i })).toBeInTheDocument();
  });

  it("Load diff ボタンクリックで onLoadFiles と onLoadDiff が呼ばれる", () => {
    const onLoadFiles = vi.fn();
    const onLoadDiff = vi.fn();
    render(<TabCodeDiff {...defaultProps} onLoadFiles={onLoadFiles} onLoadDiff={onLoadDiff} />);
    fireEvent.click(screen.getByRole("button", { name: /load diff/i }));
    expect(onLoadFiles).toHaveBeenCalledTimes(1);
    expect(onLoadDiff).toHaveBeenCalledTimes(1);
  });

  // ─── loading 状態 ────────────────────────────────────────────────────────

  it("filesStatus='loading' のとき Loading... を表示する", () => {
    render(<TabCodeDiff {...defaultProps} filesStatus="loading" diffStatus="loading" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  // ─── ファイル一覧 ────────────────────────────────────────────────────────

  it("ファイル名を表示する", () => {
    const file = makeFile({ filename: "src/main.ts" });
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[file]}
        filesStatus="success"
        diffStatus="success"
        diff=""
      />
    );
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("additions と deletions を表示する", () => {
    const file = makeFile({ additions: 15, deletions: 7 });
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[file]}
        filesStatus="success"
        diffStatus="success"
        diff=""
      />
    );
    expect(screen.getByText(/\+15/)).toBeInTheDocument();
    expect(screen.getByText(/-7/)).toBeInTheDocument();
  });

  it("Files changed (N) を表示する", () => {
    const files = [makeFile(), makeFile({ filename: "src/other.ts" })];
    render(
      <TabCodeDiff
        {...defaultProps}
        files={files}
        filesStatus="success"
        diffStatus="success"
        diff=""
      />
    );
    expect(screen.getByText(/files changed \(2\)/i)).toBeInTheDocument();
  });

  // ─── diff パース ────────────────────────────────────────────────────────

  it("diff が空のとき diff セクションを表示しない", () => {
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[]}
        filesStatus="success"
        diffStatus="success"
        diff=""
      />
    );
    // クラッシュしない
    expect(screen.queryByText(/files changed/i)).toBeNull();
  });

  // ─── インラインコメント ────────────────────────────────────────────────────

  const SIMPLE_DIFF = [
    "diff --git a/src/auth.ts b/src/auth.ts",
    "index abc..def 100644",
    "--- a/src/auth.ts",
    "+++ b/src/auth.ts",
    "@@ -1,3 +1,4 @@",
    " const a = 1;",
    "+const b = 2;",
    " const c = 3;",
  ].join("\n");

  it("onAddComment が提供されていない場合 comment フォームは非表示", () => {
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[]}
        filesStatus="success"
        diffStatus="success"
        diff={SIMPLE_DIFF}
      />
    );
    expect(screen.queryByPlaceholderText(/コメントを入力/)).toBeNull();
  });

  it("diff 行をクリックするとコメント入力フォームが表示される", () => {
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[]}
        filesStatus="success"
        diffStatus="success"
        diff={SIMPLE_DIFF}
        onAddComment={vi.fn()}
      />
    );
    // "+const b = 2;" の行をクリック
    const addedLine = screen.getByText("const b = 2;");
    fireEvent.click(addedLine);
    expect(screen.getByPlaceholderText(/コメントを入力/)).toBeInTheDocument();
  });

  it("コメント送信で onAddComment が呼ばれる", () => {
    const onAddComment = vi.fn().mockResolvedValue(undefined);
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[]}
        filesStatus="success"
        diffStatus="success"
        diff={SIMPLE_DIFF}
        onAddComment={onAddComment}
      />
    );
    fireEvent.click(screen.getByText("const b = 2;"));
    const textarea = screen.getByPlaceholderText(/コメントを入力/);
    fireEvent.change(textarea, { target: { value: "Nice addition!" } });
    fireEvent.click(screen.getByRole("button", { name: /add.*comment|送信/i }));
    expect(onAddComment).toHaveBeenCalledWith("src/auth.ts", 2, "Nice addition!");
  });

  it("CANCEL ボタンでコメントフォームが閉じる", () => {
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[]}
        filesStatus="success"
        diffStatus="success"
        diff={SIMPLE_DIFF}
        onAddComment={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("const b = 2;"));
    expect(screen.getByPlaceholderText(/コメントを入力/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByPlaceholderText(/コメントを入力/)).toBeNull();
  });

  it("既存コメントを comments prop から表示する", () => {
    const comment: PrComment = {
      id: 1,
      pr_id: 1,
      github_id: null,
      author_login: "alice",
      body: "Looks good!",
      path: "src/auth.ts",
      line: 2,
      comment_type: "issue_comment",
      diff_hunk: null,
      resolved: false,
      in_reply_to_id: null,
      is_pending: false,
      synced_at: null,
      created_at: "2026-01-01T00:00:00Z",
    };
    render(
      <TabCodeDiff
        {...defaultProps}
        files={[]}
        filesStatus="success"
        diffStatus="success"
        diff={SIMPLE_DIFF}
        comments={[comment]}
        onAddComment={vi.fn()}
      />
    );
    expect(screen.getByText("Looks good!")).toBeInTheDocument();
  });
});
