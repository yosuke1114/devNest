import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrchestratorPanel } from "../OrchestratorPanel";

const { mockInvoke, mockStartRun, mockListenEvents } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockStartRun: vi.fn(),
  mockListenEvents: vi.fn(() => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

const storeState = {
  currentRun: null as null,
  mergeReady: false,
  isStarting: false,
  isMerging: false,
  aggregatedResult: null as null,
  conflictOutcome: null as null,
  setConflictOutcome: vi.fn(),
  startRun: mockStartRun,
  cancelRun: vi.fn(),
  mergeAll: vi.fn(),
  reset: vi.fn(),
  listenOrchestratorEvents: mockListenEvents,
};

vi.mock("../../../stores/swarmStore", () => ({
  useSwarmStore: () => storeState,
}));

describe("OrchestratorPanel", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockStartRun.mockClear();
    // get_system_resources を返す
    mockInvoke.mockResolvedValue({ cpuPct: 20, memFreeGb: 8, spawnSuppressed: false });
  });

  it("初期状態でパネルが表示される", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    expect(screen.getByTestId("orchestrator-panel")).toBeTruthy();
    expect(screen.getByTestId("task-input")).toBeTruthy();
    expect(screen.getByTestId("split-button")).toBeTruthy();
  });

  it("テキストなしのsplitボタンはdisabled", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    const btn = screen.getByTestId("split-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("テキスト入力後にsplitボタンが有効になる", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "タスクを実行して" } });
    const btn = screen.getByTestId("split-button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("split_taskを呼んでタスクリストを表示する", async () => {
    mockInvoke
      .mockResolvedValueOnce({ cpuPct: 20, memFreeGb: 8, spawnSuppressed: false }) // get_system_resources
      .mockResolvedValueOnce({
        tasks: [
          { id: 1, title: "Task A", files: [], instruction: "do A", dependsOn: [] },
          { id: 2, title: "Task B", files: [], instruction: "do B", dependsOn: [1] },
        ],
        conflictWarnings: [],
        cycleError: null,
      });

    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "タスクを実行して" } });
    fireEvent.click(screen.getByTestId("split-button"));

    await waitFor(() => {
      expect(screen.getByText("Task A")).toBeTruthy();
      expect(screen.getByText("Task B")).toBeTruthy();
    });
  });

  it("cycleErrorがある場合に赤いエラーボックスを表示する", async () => {
    mockInvoke
      .mockResolvedValueOnce({ cpuPct: 20, memFreeGb: 8, spawnSuppressed: false })
      .mockResolvedValueOnce({
        tasks: [{ id: 1, title: "Task A", files: [], instruction: "do A", dependsOn: [1] }],
        conflictWarnings: [],
        cycleError: "循環依存: 1 → 1",
      });

    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "test" } });
    fireEvent.click(screen.getByTestId("split-button"));

    await waitFor(() => screen.getByTestId("cycle-error"));
    expect(screen.getByTestId("cycle-error").textContent).toContain("循環依存");
  });

  it("設定ボタンでSettingsModalが開く", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    expect(screen.getByTestId("settings-modal")).toBeTruthy();
  });

  it("SettingsModalでmaxWorkersを変更して保存できる", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    fireEvent.click(screen.getByText("8"));
    fireEvent.click(screen.getByTestId("settings-save"));
    expect(screen.queryByTestId("settings-modal")).toBeNull();
  });

  it("リソースインジケーターを表示する", async () => {
    mockInvoke.mockResolvedValue({ cpuPct: 45, memFreeGb: 6, spawnSuppressed: false });
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    await waitFor(() => screen.getByTestId("resource-indicator"));
    expect(screen.getByTestId("resource-indicator").textContent).toContain("45%");
  });

  it("起動抑制中は赤いインジケーターを表示する", async () => {
    mockInvoke.mockResolvedValue({ cpuPct: 88, memFreeGb: 0.5, spawnSuppressed: true });
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    await waitFor(() => screen.getByTestId("resource-indicator"));
    expect(screen.getByTestId("resource-indicator").textContent).toContain("⚠️");
  });
});
