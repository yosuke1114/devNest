import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../../../stores/uiStore", () => ({
  useUiStore: () => ({ navigate: mockNavigate }),
}));

import { invoke } from "@tauri-apps/api/core";
import { BrowserContextBar } from "../BrowserContextBar";

const mockInvoke = vi.mocked(invoke);

describe("BrowserContextBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("PR URLのとき PR番号とリポジトリが表示される", async () => {
    mockInvoke.mockResolvedValue({
      kind: "pull_request",
      prNumber: 42,
      owner: "octocat",
      repo: "hello-world",
      affectedDocPaths: [],
    });

    render(<BrowserContextBar url="https://github.com/octocat/hello-world/pull/42" />);

    await waitFor(() => {
      expect(screen.getByText(/PR #42/)).toBeInTheDocument();
      expect(screen.getByText("octocat/hello-world")).toBeInTheDocument();
    });
  });

  it("PR URLのとき AIレビューボタンが表示される", async () => {
    mockInvoke.mockResolvedValue({
      kind: "pull_request",
      prNumber: 1,
      owner: "user",
      repo: "repo",
      affectedDocPaths: [],
    });

    render(<BrowserContextBar url="https://github.com/user/repo/pull/1" />);

    await waitFor(() => {
      expect(screen.getByTestId("ai-review-button")).toBeInTheDocument();
    });
  });

  it("AIレビューボタンをクリックすると pr 画面に遷移する", async () => {
    mockInvoke.mockResolvedValue({
      kind: "pull_request",
      prNumber: 10,
      owner: "dev",
      repo: "app",
      affectedDocPaths: [],
    });

    render(<BrowserContextBar url="https://github.com/dev/app/pull/10" />);

    await waitFor(() => screen.getByTestId("ai-review-button"));
    await userEvent.click(screen.getByTestId("ai-review-button"));

    expect(mockNavigate).toHaveBeenCalledWith("pr");
  });

  it("Issue URLのとき Issue番号とリポジトリが表示される", async () => {
    mockInvoke.mockResolvedValue({
      kind: "issue",
      issueNumber: 99,
      owner: "myorg",
      repo: "myrepo",
      affectedDocPaths: [],
    });

    render(<BrowserContextBar url="https://github.com/myorg/myrepo/issues/99" />);

    await waitFor(() => {
      expect(screen.getByText(/Issue #99/)).toBeInTheDocument();
      expect(screen.getByText("myorg/myrepo")).toBeInTheDocument();
    });
  });

  it("kind が unknown のときは何も表示しない", async () => {
    mockInvoke.mockResolvedValue({ kind: "unknown", affectedDocPaths: [] });

    render(<BrowserContextBar url="https://example.com" />);

    await waitFor(() => {
      expect(screen.queryByTestId("browser-context-bar")).not.toBeInTheDocument();
    });
  });

  it("invoke がエラーのときは何も表示しない", async () => {
    mockInvoke.mockRejectedValue(new Error("failed"));

    render(<BrowserContextBar url="https://github.com/foo/bar/pull/1" />);

    await waitFor(() => {
      expect(screen.queryByTestId("browser-context-bar")).not.toBeInTheDocument();
    });
  });

  it("affectedDocPaths が非空のとき影響設計書が表示される (line 63-74)", async () => {
    mockInvoke.mockResolvedValue({
      kind: "pull_request",
      prNumber: 5,
      owner: "org",
      repo: "repo",
      affectedDocPaths: ["docs/design.md", "docs/api.md"],
    });

    render(<BrowserContextBar url="https://github.com/org/repo/pull/5" />);

    await waitFor(() => {
      expect(screen.getByText("影響設計書:")).toBeInTheDocument();
      expect(screen.getByText("docs/design.md")).toBeInTheDocument();
      expect(screen.getByText("docs/api.md")).toBeInTheDocument();
    });
  });
});
