import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResultSummaryPanel } from "../ResultSummaryPanel";
import type { OrchestratorRun, AggregatedResult, MergeOutcome } from "../../../stores/swarmStore";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("../../../stores/uiStore", () => ({
  useUiStore: (selector: (s: { navigate: typeof mockNavigate }) => unknown) =>
    selector({ navigate: mockNavigate }),
}));

function makeRun(overrides: Partial<OrchestratorRun> = {}): OrchestratorRun {
  return {
    runId: "run-1",
    status: "done",
    baseBranch: "main",
    projectPath: "/tmp/proj",
    total: 2,
    doneCount: 2,
    assignments: [
      { workerId: "w1", task: { id: 1, title: "Task A", files: [], instruction: "" }, branchName: "swarm/worker-1", status: "done" },
      { workerId: "w2", task: { id: 2, title: "Task B", files: [], instruction: "" }, branchName: "swarm/worker-2", status: "done" },
    ],
    mergeResults: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<AggregatedResult> = {}): AggregatedResult {
  return {
    workerDiffs: [{ workerId: "w1", branch: "swarm/worker-1", filesChanged: 3, insertions: 10, deletions: 2, changedFiles: [] }],
    succeededIds: ["w1"],
    failedIds: [],
    totalFilesChanged: 3,
    totalInsertions: 10,
    totalDeletions: 2,
    ...overrides,
  };
}

describe("ResultSummaryPanel", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("完了ステータスで✅ヘッダーを表示する", () => {
    render(
      <ResultSummaryPanel
        run={makeRun({ status: "done" })}
        result={null}
        onReset={vi.fn()}
        onOpenConflict={vi.fn()}
      />
    );
    expect(screen.getByText(/全タスク完了/)).toBeTruthy();
  });

  it("partialDoneで⚠️ヘッダーを表示する", () => {
    render(
      <ResultSummaryPanel
        run={makeRun({ status: "partialDone" })}
        result={null}
        onReset={vi.fn()}
        onOpenConflict={vi.fn()}
      />
    );
    expect(screen.getByText(/一部完了/)).toBeTruthy();
  });

  it("failedで❌ヘッダーを表示する", () => {
    render(
      <ResultSummaryPanel
        run={makeRun({ status: "failed" })}
        result={null}
        onReset={vi.fn()}
        onOpenConflict={vi.fn()}
      />
    );
    expect(screen.getByText(/全タスク失敗/)).toBeTruthy();
  });

  it("AggregatedResultがある場合にdiff統計を表示する", () => {
    render(
      <ResultSummaryPanel
        run={makeRun()}
        result={makeResult()}
        onReset={vi.fn()}
        onOpenConflict={vi.fn()}
      />
    );
    expect(screen.getByText("3")).toBeTruthy(); // totalFilesChanged
    expect(screen.getByText("10")).toBeTruthy(); // totalInsertions
    expect(screen.getByText("2")).toBeTruthy();  // totalDeletions
  });

  it("Worker結果リストを表示する", () => {
    render(
      <ResultSummaryPanel
        run={makeRun()}
        result={null}
        onReset={vi.fn()}
        onOpenConflict={vi.fn()}
      />
    );
    expect(screen.getByText("Task A")).toBeTruthy();
    expect(screen.getByText("Task B")).toBeTruthy();
  });

  it("コンフリクトファイルボタンをクリックするとonOpenConflictが呼ばれる", () => {
    const onOpenConflict = vi.fn();
    const conflictOutcome: MergeOutcome = {
      branch: "swarm/worker-1",
      success: false,
      conflictFiles: ["src/foo.ts"],
      error: null,
    };
    render(
      <ResultSummaryPanel
        run={makeRun({ mergeResults: [conflictOutcome] })}
        result={null}
        onReset={vi.fn()}
        onOpenConflict={onOpenConflict}
      />
    );
    const btn = screen.getByTestId("conflict-file-button");
    fireEvent.click(btn);
    expect(onOpenConflict).toHaveBeenCalledWith(conflictOutcome);
  });

  it("PR作成ボタンクリックでnavigate('pr')が呼ばれる", () => {
    render(
      <ResultSummaryPanel
        run={makeRun({ status: "done" })}
        result={null}
        onReset={vi.fn()}
        onOpenConflict={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("create-pr-button"));
    expect(mockNavigate).toHaveBeenCalledWith("pr");
  });

  it("リセットボタンクリックでonResetが呼ばれる", () => {
    const onReset = vi.fn();
    render(
      <ResultSummaryPanel
        run={makeRun()}
        result={null}
        onReset={onReset}
        onOpenConflict={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("reset-button"));
    expect(onReset).toHaveBeenCalled();
  });

  it("failedステータスではPR作成ボタンを表示しない", () => {
    render(
      <ResultSummaryPanel
        run={makeRun({ status: "failed" })}
        result={null}
        onReset={vi.fn()}
        onOpenConflict={vi.fn()}
      />
    );
    expect(screen.queryByTestId("create-pr-button")).toBeNull();
  });
});
