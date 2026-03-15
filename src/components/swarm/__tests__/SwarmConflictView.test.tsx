import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SwarmConflictView } from "../SwarmConflictView";
import type { MergeOutcome } from "../../../stores/swarmStore";

const { mockInvoke, MockMergeView } = vi.hoisted(() => {
  class MockMergeView {
    b = { state: { doc: { toString: () => "manual content" } } };
    destroy = vi.fn();
  }
  return { mockInvoke: vi.fn(), MockMergeView };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

// @codemirror/merge の MergeView はDOM操作が必要なためモック
vi.mock("@codemirror/merge", () => ({
  MergeView: MockMergeView,
}));

const outcome: MergeOutcome = {
  branch: "swarm/worker-1",
  success: false,
  conflictFiles: ["src/foo.ts"],
  error: null,
};

describe("SwarmConflictView", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it("ローディング中にスピナーを表示する", () => {
    // invoke を pending のまま保持
    mockInvoke.mockReturnValue(new Promise(() => {}));
    render(
      <SwarmConflictView
        outcome={outcome}
        projectPath="/tmp/proj"
        onResolved={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/読み込み中/)).toBeTruthy();
  });

  it("コンフリクトブロックがない場合に「コンフリクトなし」を表示する", async () => {
    mockInvoke.mockResolvedValue([]);
    render(
      <SwarmConflictView
        outcome={outcome}
        projectPath="/tmp/proj"
        onResolved={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/コンフリクトなし/)).toBeTruthy();
    });
  });

  it("コンフリクトなし時に閉じるボタンが機能する", async () => {
    mockInvoke.mockResolvedValue([]);
    const onClose = vi.fn();
    render(
      <SwarmConflictView
        outcome={outcome}
        projectPath="/tmp/proj"
        onResolved={vi.fn()}
        onClose={onClose}
      />
    );
    await waitFor(() => screen.getByText(/コンフリクトなし/));
    fireEvent.click(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalled();
  });

  it("ブロックが1つある場合にtestidが表示される", async () => {
    mockInvoke.mockResolvedValue([
      { filePath: "src/foo.ts", ours: "a", theirs: "b", contextBefore: "", startLine: 10 },
    ]);
    render(
      <SwarmConflictView
        outcome={outcome}
        projectPath="/tmp/proj"
        onResolved={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId("swarm-conflict-view")).toBeTruthy();
    });
    expect(screen.getByTestId("take-ours-button")).toBeTruthy();
    expect(screen.getByTestId("take-theirs-button")).toBeTruthy();
    expect(screen.getByTestId("take-both-button")).toBeTruthy();
    expect(screen.getByTestId("take-manual-button")).toBeTruthy();
  });

  it("HEAD採用ボタンがresolve invokeを呼ぶ（最後のブロックはcommit+onResolved）", async () => {
    mockInvoke
      .mockResolvedValueOnce([
        { filePath: "src/foo.ts", ours: "a", theirs: "b", contextBefore: "", startLine: 10 },
      ])
      .mockResolvedValueOnce(undefined)  // orchestrator_resolve_conflict
      .mockResolvedValueOnce(undefined); // orchestrator_commit_resolution

    const onResolved = vi.fn();
    render(
      <SwarmConflictView
        outcome={outcome}
        projectPath="/tmp/proj"
        onResolved={onResolved}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => screen.getByTestId("take-ours-button"));
    fireEvent.click(screen.getByTestId("take-ours-button"));

    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(mockInvoke).toHaveBeenCalledWith("orchestrator_resolve_conflict", expect.objectContaining({
      filePath: "src/foo.ts",
      startLine: 10,
      resolution: { TakeOurs: null },
    }));
  });

  it("AI解決ボタンがai_resolve_conflictを呼び解決案を表示する", async () => {
    mockInvoke
      .mockResolvedValueOnce([
        { filePath: "src/foo.ts", ours: "a", theirs: "b", contextBefore: "", startLine: 10 },
      ])
      .mockResolvedValueOnce({
        resolvedCode: "const x = 1;",
        confidence: "high",
        reason: "両者が独立した変更のため統合可能",
      });

    render(
      <SwarmConflictView
        outcome={outcome}
        projectPath="/tmp/proj"
        onResolved={vi.fn()}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => screen.getByTestId("ai-resolve-button"));
    fireEvent.click(screen.getByTestId("ai-resolve-button"));

    await waitFor(() => screen.getByTestId("ai-resolution-panel"));
    expect(screen.getByTestId("confidence-badge").textContent).toContain("High");
    expect(screen.getByText("両者が独立した変更のため統合可能")).toBeTruthy();
    expect(screen.getByText("const x = 1;")).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith("orchestrator_ai_resolve_conflict", {
      filePath: "src/foo.ts",
      startLine: 10,
    });
  });

  it("AI承認ボタンがManual解決でコミットする", async () => {
    mockInvoke
      .mockResolvedValueOnce([
        { filePath: "src/foo.ts", ours: "a", theirs: "b", contextBefore: "", startLine: 10 },
      ])
      .mockResolvedValueOnce({
        resolvedCode: "const x = 1;",
        confidence: "medium",
        reason: "統合可能",
      })
      .mockResolvedValueOnce(undefined)  // orchestrator_resolve_conflict
      .mockResolvedValueOnce(undefined); // orchestrator_commit_resolution

    const onResolved = vi.fn();
    render(
      <SwarmConflictView
        outcome={outcome}
        projectPath="/tmp/proj"
        onResolved={onResolved}
        onClose={vi.fn()}
      />
    );
    await waitFor(() => screen.getByTestId("ai-resolve-button"));
    fireEvent.click(screen.getByTestId("ai-resolve-button"));
    await waitFor(() => screen.getByTestId("ai-approve-button"));
    fireEvent.click(screen.getByTestId("ai-approve-button"));

    await waitFor(() => expect(onResolved).toHaveBeenCalled());
    expect(mockInvoke).toHaveBeenCalledWith("orchestrator_resolve_conflict", expect.objectContaining({
      resolution: { Manual: "const x = 1;" },
    }));
  });

  it("×ボタンでonCloseが呼ばれる", async () => {
    mockInvoke.mockResolvedValue([
      { filePath: "src/foo.ts", ours: "a", theirs: "b", contextBefore: "", startLine: 10 },
    ]);
    const onClose = vi.fn();
    render(
      <SwarmConflictView
        outcome={outcome}
        projectPath="/tmp/proj"
        onResolved={vi.fn()}
        onClose={onClose}
      />
    );
    await waitFor(() => screen.getByTestId("swarm-conflict-view"));
    fireEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalled();
  });
});
