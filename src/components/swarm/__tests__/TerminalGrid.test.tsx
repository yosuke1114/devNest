import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TerminalGrid } from "../TerminalGrid";
import type { WorkerInfo } from "../types";

const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

// listen のモック: コールバックを保持してテストから呼べるようにする
let spawnedCb: ((event: { payload: WorkerInfo }) => void) | null = null;
let statusCb: ((event: { payload: { workerId: string; status: string } }) => void) | null = null;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, cb: unknown) => {
    if (event === "worker-spawned") spawnedCb = cb as typeof spawnedCb;
    if (event === "worker-status-changed") statusCb = cb as typeof statusCb;
    return Promise.resolve(() => {});
  }),
}));

vi.mock("../../stores/swarmStore", () => ({
  useSwarmStore: () => ({ notifyWorkerDone: vi.fn() }),
}));

// XtermPane をモック（xterm.js は JSDOM 非対応）
vi.mock("../XtermPane", () => ({
  XtermPane: ({ worker }: { worker: WorkerInfo }) => (
    <div data-testid={`worker-pane-${worker.id}`}>{worker.config.label}</div>
  ),
}));

const makeWorker = (id: string, kind: "shell" | "claudeCode" = "claudeCode"): WorkerInfo => ({
  id,
  config: {
    kind,
    mode: kind === "shell" ? "interactive" : "batch",
    label: kind === "shell" ? `Shell ${id}` : `Worker ${id}`,
    workingDir: "/tmp/proj",
    dependsOn: [],
    metadata: {},
  },
  status: "idle",
});

describe("TerminalGrid", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    spawnedCb = null;
    statusCb = null;
  });

  it("初期状態でエンプティステートを表示する", () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    expect(screen.getByTestId("empty-state")).toBeTruthy();
  });

  it("grid-toolbar が表示される", () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    expect(screen.getByTestId("grid-toolbar")).toBeTruthy();
  });

  it("add-shell-button と add-worker-button が表示される", () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    expect(screen.getByTestId("add-shell-button")).toBeTruthy();
    expect(screen.getByTestId("add-worker-button")).toBeTruthy();
  });

  it("worker-count に '0 / 8 ペイン' が表示される", () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    expect(screen.getByTestId("worker-count").textContent).toBe("0 / 8 ペイン");
  });

  it("Shell 追加ボタンクリックで spawn_worker を呼ぶ", async () => {
    mockInvoke.mockResolvedValue(undefined);
    render(<TerminalGrid workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("add-shell-button"));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("spawn_worker", expect.objectContaining({
        config: expect.objectContaining({ kind: "shell" }),
      }));
    });
  });

  it("Worker 追加ボタンクリックで spawn_worker を呼ぶ", async () => {
    mockInvoke.mockResolvedValue(undefined);
    render(<TerminalGrid workingDir="/tmp/proj" />);
    fireEvent.click(screen.getByTestId("add-worker-button"));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("spawn_worker", expect.objectContaining({
        config: expect.objectContaining({ kind: "claudeCode" }),
      }));
    });
  });

  it("worker-spawned イベントでペインが追加される", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);

    spawnedCb!({ payload: makeWorker("w-001", "claudeCode") });

    await waitFor(() => {
      expect(screen.getByTestId("worker-pane-w-001")).toBeTruthy();
    });
    expect(screen.getByTestId("worker-count").textContent).toBe("1 / 8 ペイン");
  });

  it("pane-grid が worker 追加後に表示される", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);

    spawnedCb!({ payload: makeWorker("w-002", "shell") });

    await waitFor(() => {
      expect(screen.getByTestId("pane-grid")).toBeTruthy();
    });
  });

  it("progress-bar は ClaudeCode Worker がいない場合は非表示", () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    expect(screen.queryByTestId("progress-bar-container")).toBeNull();
  });

  it("ClaudeCode Worker 追加後に progress-bar-container が表示される", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);

    spawnedCb!({ payload: makeWorker("w-003", "claudeCode") });

    await waitFor(() => {
      expect(screen.getByTestId("progress-bar-container")).toBeTruthy();
    });
    expect(screen.getByTestId("progress-text").textContent).toContain("0 / 1");
    expect(screen.getByTestId("progress-bar-fill").getAttribute("data-progress")).toBe("0");
  });

  it("done になると progress が 100% になる", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null && statusCb !== null);

    spawnedCb!({ payload: makeWorker("w-004", "claudeCode") });
    await waitFor(() => screen.getByTestId("progress-bar-container"));

    statusCb!({ payload: { workerId: "w-004", status: "done" } });

    await waitFor(() => {
      expect(screen.getByTestId("progress-bar-fill").getAttribute("data-progress")).toBe("100");
    });
    expect(screen.getByTestId("progress-text").textContent).toContain("1 / 1");
  });

  it("8つ追加でボタンが disabled になる", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);

    for (let i = 1; i <= 8; i++) {
      spawnedCb!({ payload: makeWorker(`w-${i}`, "shell") });
    }

    await waitFor(() => {
      const btn = screen.getByTestId("add-shell-button") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });
});
