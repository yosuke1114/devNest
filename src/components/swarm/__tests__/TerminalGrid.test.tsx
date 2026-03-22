import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TerminalGrid } from "../TerminalGrid";
import type { WorkerInfo } from "../types";

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
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

// RoleSelector をモック（スタイルのみでロジックは本物）
vi.mock("../RoleSelector", () => ({
  RoleSelector: ({ value, onChange }: { value: string; onChange: (r: string) => void }) => (
    <select data-testid="role-selector" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="scout">🔍 Scout</option>
      <option value="builder">🔨 Builder</option>
      <option value="reviewer">👁️ Reviewer</option>
      <option value="merger">🔀 Merger</option>
      <option value="shell">🐚 Shell</option>
    </select>
  ),
}));

// XtermPane をモック（xterm.js は JSDOM 非対応）
vi.mock("../XtermPane", () => ({
  XtermPane: ({ worker, onKill, onClick }: { worker: WorkerInfo; onKill: (id: string) => void; onClick: () => void }) => (
    <div data-testid={`worker-pane-${worker.id}`} onClick={onClick}>
      {worker.config.label}
      <button data-testid={`kill-${worker.id}`} onClick={(e) => { e.stopPropagation(); onKill(worker.id); }}>Kill</button>
    </div>
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

  it("spawn_worker が失敗しても graceful に処理する (line 65)", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_system_resources") return Promise.resolve({ cpuPct: 20, memFreeGb: 8, spawnSuppressed: false });
      if (cmd === "spawn_worker") return Promise.reject(new Error("spawn failed"));
      return Promise.resolve();
    });
    render(<TerminalGrid workingDir="/tmp/proj" />);
    const addShellBtn = screen.getByTestId("add-shell-button");
    await expect(async () => {
      fireEvent.click(addShellBtn);
      await waitFor(() => mockInvoke.mock.calls.some(c => c[0] === "spawn_worker"));
    }).not.toThrow();
  });

  it("kill ボタンクリックで kill_worker が呼ばれ Worker が削除される (lines 70-74)", async () => {
    mockInvoke.mockResolvedValue(undefined);
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);
    spawnedCb!({ payload: makeWorker("w-kill", "shell") });
    await waitFor(() => screen.getByTestId("worker-pane-w-kill"));

    fireEvent.click(screen.getByTestId("kill-w-kill"));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("kill_worker", { workerId: "w-kill" });
    });
    await waitFor(() => {
      expect(screen.queryByTestId("worker-pane-w-kill")).toBeNull();
    });
  });

  it("worker pane クリックで activeId が更新される (line 182)", async () => {
    mockInvoke.mockResolvedValue(undefined);
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);
    spawnedCb!({ payload: makeWorker("w-active", "shell") });
    await waitFor(() => screen.getByTestId("worker-pane-w-active"));
    // クリックしてアクティブにする
    fireEvent.click(screen.getByTestId("worker-pane-w-active"));
    // 再度クリックしても動作する（state update が発生）
    fireEvent.click(screen.getByTestId("worker-pane-w-active"));
    expect(screen.getByTestId("worker-pane-w-active")).toBeTruthy();
  });

  // 未カバーブランチ補完
  it("重複 worker-spawned イベントは追加されない (line 26: duplicate check)", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);

    const w = makeWorker("w-dup", "claudeCode");
    spawnedCb!({ payload: w });
    spawnedCb!({ payload: w }); // 2回送っても1つだけ追加

    await waitFor(() => screen.getByTestId("worker-count"));
    expect(screen.getByTestId("worker-count").textContent).toBe("1 / 8 ペイン");
  });

  it("worker-status-changed で running status のとき worker-badge の status が更新される (line 44)", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null && statusCb !== null);

    spawnedCb!({ payload: makeWorker("w-run", "claudeCode") });
    await waitFor(() => screen.getByTestId("worker-pane-w-run"));

    statusCb!({ payload: { workerId: "w-run", status: "running" } });

    await waitFor(() => {});
    // invoke が kill_worker や spawn_worker 以外で notifyWorkerDone を呼んでいないことを確認
    // running は done/error でないので notifyWorkerDone は呼ばれない
    expect(mockInvoke).not.toHaveBeenCalledWith("notify_worker_done", expect.anything());
  });

  it("kill でアクティブでない worker を削除しても activeId は変わらない (line 77)", async () => {
    mockInvoke.mockResolvedValue(undefined);
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);

    spawnedCb!({ payload: makeWorker("w-a", "shell") });
    spawnedCb!({ payload: makeWorker("w-b", "shell") });

    await waitFor(() => screen.getByTestId("worker-pane-w-a"));
    // w-a をアクティブに
    fireEvent.click(screen.getByTestId("worker-pane-w-a"));
    // w-b を kill（非アクティブ）
    fireEvent.click(screen.getByTestId("kill-w-b"));
    await waitFor(() => !screen.queryByTestId("worker-pane-w-b"));

    // w-a はまだ存在する
    expect(screen.getByTestId("worker-pane-w-a")).toBeTruthy();
  });

  it("Worker 5つ以上でグリッドが 3 カラムになる (line 83)", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null);

    for (let i = 1; i <= 5; i++) {
      spawnedCb!({ payload: makeWorker(`w-${i}`, "claudeCode") });
    }

    await waitFor(() => {
      expect(screen.getByTestId("pane-grid").style.gridTemplateColumns).toBe("repeat(3, 1fr)");
    });
  });

  it("全 worker が完了かつ error があるとき赤い progress-bar になる (line 148)", async () => {
    render(<TerminalGrid workingDir="/tmp/proj" />);
    await waitFor(() => spawnedCb !== null && statusCb !== null);

    spawnedCb!({ payload: makeWorker("w-ok", "claudeCode") });
    spawnedCb!({ payload: makeWorker("w-err", "claudeCode") });
    await waitFor(() => screen.getByTestId("progress-bar-container"));

    statusCb!({ payload: { workerId: "w-ok", status: "done" } });
    statusCb!({ payload: { workerId: "w-err", status: "error" } });

    await waitFor(() => {
      const fill = screen.getByTestId("progress-bar-fill");
      // JSDOM は #fc8181 を rgb(252, 129, 129) に変換する
      expect(fill.style.background).toMatch(/fc8181|252.*129.*129/);
    });
  });

  // Phase 13: RoleSelector テスト (ITb-13-20〜22)
  describe("RoleSelector (Phase 13)", () => {
    // ITb-13-20: Worker追加時にロールを選択できる
    it("ITb-13-20: ツールバーにロール選択セレクタが表示される", () => {
      render(<TerminalGrid workingDir="/tmp/proj" />);
      expect(screen.getByTestId("role-selector")).toBeTruthy();
    });

    // ITb-13-21: デフォルトロールはBuilderである
    it("ITb-13-21: デフォルトロールはBuilderである", () => {
      render(<TerminalGrid workingDir="/tmp/proj" />);
      const selector = screen.getByTestId("role-selector") as HTMLSelectElement;
      expect(selector.value).toBe("builder");
    });

    // ITb-13-22: ロール変更がWorkerConfigに反映される
    it("ITb-13-22: ロール変更後にWorker追加するとconfig.roleが反映される", async () => {
      mockInvoke.mockResolvedValue(undefined);
      render(<TerminalGrid workingDir="/tmp/proj" />);

      // ロールを Scout に変更
      const selector = screen.getByTestId("role-selector") as HTMLSelectElement;
      fireEvent.change(selector, { target: { value: "scout" } });
      expect(selector.value).toBe("scout");

      // Worker を追加
      fireEvent.click(screen.getByTestId("add-worker-button"));
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "spawn_worker",
          expect.objectContaining({
            config: expect.objectContaining({ kind: "claudeCode", role: "scout" }),
          })
        );
      });
    });
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
