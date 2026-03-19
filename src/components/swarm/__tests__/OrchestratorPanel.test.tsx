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

  // ─── SubTaskCard ───────────────────────────────────────────────

  async function renderWithTasks(tasks = [
    { id: 1, title: "Task A", files: [], instruction: "do A", dependsOn: [] },
  ]) {
    mockInvoke
      .mockResolvedValueOnce({ cpuPct: 20, memFreeGb: 8, spawnSuppressed: false })
      .mockResolvedValueOnce({ tasks, conflictWarnings: [], cycleError: null });
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.change(screen.getByTestId("task-input"), { target: { value: "prompt" } });
    fireEvent.click(screen.getByTestId("split-button"));
    await waitFor(() => screen.getByTestId("subtask-card-1"));
  }

  it("SubTaskCard クリックで展開する (line 350)", async () => {
    await renderWithTasks();
    fireEvent.click(screen.getByText("Task A").closest("div")!);
    // 展開後: task-input(textbox) + instruction textarea の計2つ
    const textboxes = screen.getAllByRole("textbox");
    expect(textboxes.length).toBeGreaterThanOrEqual(2);
  });

  it("SubTaskCard 削除ボタンクリックでタスクが消える (line 367)", async () => {
    await renderWithTasks();
    fireEvent.click(screen.getByRole("button", { name: "タスク 1 を削除" }));
    expect(screen.queryByTestId("subtask-card-1")).toBeNull();
  });

  it("SubTaskCard 展開後に instruction を編集できる (line 386)", async () => {
    await renderWithTasks();
    fireEvent.click(screen.getByText("Task A").closest("div")!);
    // task-input(input) + instruction(textarea) → textarea を TEXTAREA タグで特定
    const textboxes = screen.getAllByRole("textbox");
    const textarea = textboxes.find((el) => el.tagName === "TEXTAREA")! as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "updated instruction" } });
    expect(textarea.value).toBe("updated instruction");
  });

  it("SubTaskCard files あり: ファイル数を表示する (line 361-365)", async () => {
    await renderWithTasks([
      { id: 1, title: "Task A", files: ["src/main.rs", "lib.rs"], instruction: "do A", dependsOn: [] },
    ]);
    expect(screen.getByText("2 ファイル")).toBeInTheDocument();
  });

  it("SubTaskCard 展開後 files あり: ファイルタグを表示する (line 378-382)", async () => {
    await renderWithTasks([
      { id: 1, title: "Task A", files: ["src/main.rs"], instruction: "do A", dependsOn: [] },
    ]);
    fireEvent.click(screen.getByText("Task A").closest("div")!);
    expect(screen.getByText("src/main.rs")).toBeInTheDocument();
  });

  it("SubTaskCard dependsOn あり: 待機ラベルを表示する (line 356-359)", async () => {
    await renderWithTasks([
      { id: 1, title: "Task A", files: [], instruction: "do A", dependsOn: [] },
      { id: 2, title: "Task B", files: [], instruction: "do B", dependsOn: [1] },
    ]);
    expect(screen.getByText(/Task 1 待/)).toBeInTheDocument();
  });

  // ─── SettingsModal 詳細 ────────────────────────────────────────

  it("SettingsModal: キャンセルボタンで閉じる (line 527)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    fireEvent.click(screen.getByTestId("settings-cancel"));
    expect(screen.queryByTestId("settings-modal")).toBeNull();
  });

  it("SettingsModal: 閉じる(✕)ボタンで閉じる (line 417)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    fireEvent.click(screen.getByRole("button", { name: "設定を閉じる" }));
    expect(screen.queryByTestId("settings-modal")).toBeNull();
  });

  it("SettingsModal: タイムアウトスライダーを変更できる (line 447)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    const slider = screen.getByTestId("timeout-slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "60" } });
    expect(slider.value).toBe("60");
  });

  it("SettingsModal: ブランチプレフィックスを変更できる (line 457)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    const input = screen.getByTestId("branch-prefix-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "feature/" } });
    expect(input.value).toBe("feature/");
  });

  it("SettingsModal: Shell オプション bash を選択できる (line 471)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    fireEvent.click(screen.getByTestId("shell-option-bash"));
    expect(screen.getByTestId("shell-option-bash")).toHaveAttribute("aria-pressed", "true");
  });

  it("SettingsModal: プロンプトパターンを変更できる (line 486)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    const input = screen.getByRole("textbox", { name: /プロンプトパターン/ }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "$|>" } });
    expect(input.value).toBe("$|>");
  });

  it("SettingsModal: --dangerously-skip-permissions チェックを変更できる (line 498)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    const cb = screen.getByRole("checkbox", { name: "--dangerously-skip-permissions" }) as HTMLInputElement;
    const before = cb.checked;
    fireEvent.click(cb);
    expect(cb.checked).toBe(!before);
  });

  it("SettingsModal: --no-stream チェックを変更できる (line 507)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    const cb = screen.getByRole("checkbox", { name: "--no-stream" }) as HTMLInputElement;
    const before = cb.checked;
    fireEvent.click(cb);
    expect(cb.checked).toBe(!before);
  });

  it("SettingsModal: 自動承認チェックを変更できる (line 520)", () => {
    render(<OrchestratorPanel workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("settings-button"));
    const cb = screen.getByTestId("auto-approve-checkbox") as HTMLInputElement;
    const before = cb.checked;
    fireEvent.click(cb);
    expect(cb.checked).toBe(!before);
  });
});
