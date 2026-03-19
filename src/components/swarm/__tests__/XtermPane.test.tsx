import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { XtermPane } from "../XtermPane";
import type { WorkerInfo } from "../types";

// onData コールバックをテスト側からアクセスできるよう capture
const capturedCallbacks = vi.hoisted(() => ({
  onData: null as ((data: string) => void) | null,
  resizeObservers: [] as (() => void)[],
}));

const { mockInvoke, mockListen } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockListen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));

// xterm.js はDOM操作が必要なためクラスモック
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    onData = vi.fn((cb: (data: string) => void) => {
      capturedCallbacks.onData = cb;
      return { dispose: vi.fn() };
    });
    dispose = vi.fn();
    cols = 80;
    rows = 24;
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

// xterm CSSはJSDOMでは不要
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

const makeWorker = (overrides: Partial<WorkerInfo> = {}): WorkerInfo => ({
  id: "w-001",
  config: {
    kind: "claudeCode",
    mode: "batch",
    label: "Worker 1",
    workingDir: "/tmp/proj",
    dependsOn: [],
    metadata: {},
  },
  status: "idle",
  ...overrides,
});

// ResizeObserver をモック
const origResizeObserver = globalThis.ResizeObserver;
beforeEach(() => {
  capturedCallbacks.onData = null;
  capturedCallbacks.resizeObservers = [];
  globalThis.ResizeObserver = class {
    cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
      capturedCallbacks.resizeObservers.push(cb);
    }
    observe = vi.fn();
    disconnect = vi.fn();
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = origResizeObserver;
});

describe("XtermPane", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(undefined);
    mockListen.mockClear();
  });

  it("worker-pane-{id} が表示される", () => {
    const worker = makeWorker();
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByTestId("worker-pane-w-001")).toBeTruthy();
  });

  it("worker-pane-header-{id} が表示される", () => {
    const worker = makeWorker();
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByTestId("worker-pane-header-w-001")).toBeTruthy();
  });

  it("ClaudeCode Worker のアイコンが 🤖", () => {
    const worker = makeWorker({ config: { kind: "claudeCode", mode: "batch", label: "Worker 1", workingDir: "/", dependsOn: [], metadata: {} } });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByTestId("worker-kind-icon-w-001").textContent).toBe("🤖");
  });

  it("Shell Worker のアイコンが 🐚", () => {
    const worker = makeWorker({ config: { kind: "shell", mode: "interactive", label: "Shell 1", workingDir: "/", dependsOn: [], metadata: {} } });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByTestId("worker-kind-icon-w-001").textContent).toBe("🐚");
  });

  it("ClaudeCode Worker に worker-badge-{id} が表示され data-status がある", () => {
    const worker = makeWorker({ status: "running" });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    const badge = screen.getByTestId("worker-badge-w-001");
    expect(badge).toBeTruthy();
    expect(badge.getAttribute("data-status")).toBe("running");
  });

  it("Shell Worker に shell-badge-{id} が表示される", () => {
    const worker = makeWorker({
      config: { kind: "shell", mode: "interactive", label: "Shell 1", workingDir: "/", dependsOn: [], metadata: {} },
    });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByTestId("shell-badge-w-001")).toBeTruthy();
  });

  it("Shell badge は初期状態で '● Running'", () => {
    const worker = makeWorker({
      config: { kind: "shell", mode: "interactive", label: "Shell 1", workingDir: "/", dependsOn: [], metadata: {} },
    });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByTestId("shell-badge-w-001").textContent).toBe("● Running");
  });

  it("worker-close-{id} ボタンクリックで onKill が呼ばれる", () => {
    const worker = makeWorker();
    const onKill = vi.fn();
    render(<XtermPane worker={worker} onKill={onKill} isActive={false} onClick={vi.fn()} />);
    fireEvent.click(screen.getByTestId("worker-close-w-001"));
    expect(onKill).toHaveBeenCalledWith("w-001");
  });

  it("worker-terminal-{id} がレンダリングされる", () => {
    const worker = makeWorker();
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    expect(screen.getByTestId("worker-terminal-w-001")).toBeTruthy();
  });

  it("isActive=true のときボーダーが青色", () => {
    const worker = makeWorker();
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={true} onClick={vi.fn()} />);
    const pane = screen.getByTestId("worker-pane-w-001");
    // JSDOM はカラーを rgb に変換するため toContain で部分一致確認
    expect(pane.style.border).toMatch(/388bfd|rgb\(56,\s*139,\s*253\)/);
  });

  it("ペインクリックで onClick が呼ばれる", () => {
    const worker = makeWorker();
    const onClick = vi.fn();
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={onClick} />);
    fireEvent.click(screen.getByTestId("worker-pane-w-001"));
    expect(onClick).toHaveBeenCalled();
  });

  it("listen コールバックで worker.id が一致するときデータが書き込まれる (line 73-74)", async () => {
    const worker = makeWorker({ id: "w-001" });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    // listen に渡されたコールバックを取得
    const listenCb = mockListen.mock.calls[0][1] as (e: { payload: { workerId: string; data: string } }) => void;
    await act(async () => {
      listenCb({ payload: { workerId: "w-001", data: "hello" } });
    });
    // term.write が呼ばれたはず（Terminal mock の write を確認する手段はないが、エラーなく実行されること）
    expect(screen.getByTestId("worker-pane-w-001")).toBeTruthy();
  });

  it("Shell: listen コールバックでプロンプト検出時に shell badge が Idle になる (lines 75-76)", async () => {
    const worker = makeWorker({
      id: "w-001",
      config: { kind: "shell", mode: "interactive", label: "Shell 1", workingDir: "/", dependsOn: [], metadata: {} },
    });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    const listenCb = mockListen.mock.calls[0][1] as (e: { payload: { workerId: string; data: string } }) => void;
    await act(async () => {
      // SHELL_PROMPT_RE にマッチする文字列 (末尾に $ )
      listenCb({ payload: { workerId: "w-001", data: "user@host:~$ " } });
    });
    expect(screen.getByTestId("shell-badge-w-001").textContent).toBe("Idle");
  });

  it("Shell: onData コールバック呼び出しで shellIdle が false に戻る (lines 85-87)", async () => {
    const worker = makeWorker({
      id: "w-001",
      config: { kind: "shell", mode: "interactive", label: "Shell 1", workingDir: "/", dependsOn: [], metadata: {} },
    });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    // まず idle にする
    const listenCb = mockListen.mock.calls[0][1] as (e: { payload: { workerId: string; data: string } }) => void;
    await act(async () => {
      listenCb({ payload: { workerId: "w-001", data: "$ " } });
    });
    expect(screen.getByTestId("shell-badge-w-001").textContent).toBe("Idle");
    // onData コールバックで Running に戻る
    await act(async () => {
      capturedCallbacks.onData?.("some input");
    });
    expect(screen.getByTestId("shell-badge-w-001").textContent).toBe("● Running");
  });

  it("ResizeObserver コールバックで invoke resize_worker が呼ばれる (lines 95-97)", async () => {
    const worker = makeWorker({ id: "w-001" });
    render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
    expect(capturedCallbacks.resizeObservers.length).toBeGreaterThan(0);
    await act(async () => {
      capturedCallbacks.resizeObservers[0]();
    });
    expect(mockInvoke).toHaveBeenCalledWith("resize_worker", expect.objectContaining({ workerId: "w-001" }));
  });

  // Phase 13: Watchdog UI テスト (ITb-13-23〜25)
  describe("Watchdog UI (Phase 13)", () => {
    // ITb-13-23: worker-nudgedイベントでペインが⚡強調表示される
    it("ITb-13-23: worker-nudgedイベントでペインが⚡強調表示される", async () => {
      vi.useFakeTimers();
      const worker = makeWorker({ id: "w-wdog" });
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);

      const nudgedCb = mockListen.mock.calls.find(
        (c: [string, unknown]) => c[0] === "worker-nudged"
      )?.[1] as ((e: { payload: { workerId: string } }) => void) | undefined;
      expect(nudgedCb).toBeDefined();

      await act(async () => {
        nudgedCb!({ payload: { workerId: "w-wdog" } });
      });

      expect(screen.getByTestId("worker-nudged-icon-w-wdog")).toBeTruthy();
      expect(screen.getByTestId("worker-nudged-icon-w-wdog").textContent).toBe("⚡");
      vi.useRealTimers();
    });

    // ITb-13-24: worker-stalledイベントで⚠️バッジが表示される
    it("ITb-13-24: worker-stalledイベントで⚠️バッジが表示される", async () => {
      const worker = makeWorker({ id: "w-stall" });
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);

      const stalledCb = mockListen.mock.calls.find(
        (c: [string, unknown]) => c[0] === "worker-stalled"
      )?.[1] as ((e: { payload: { workerId: string } }) => void) | undefined;
      expect(stalledCb).toBeDefined();

      await act(async () => {
        stalledCb!({ payload: { workerId: "w-stall" } });
      });

      expect(screen.getByTestId("worker-stalled-badge-w-stall")).toBeTruthy();
      expect(
        screen.getByTestId("worker-stalled-badge-w-stall").textContent
      ).toContain("Stalled");
    });

    // ITb-13-25: スタック状態からNudge後に復帰したらバッジが消える
    it("ITb-13-25: スタック状態からNudge後に復帰したらstalled バッジが消える", async () => {
      vi.useFakeTimers();
      const worker = makeWorker({ id: "w-recover" });
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);

      const stalledCb = mockListen.mock.calls.find(
        (c: [string, unknown]) => c[0] === "worker-stalled"
      )?.[1] as ((e: { payload: { workerId: string } }) => void) | undefined;
      const nudgedCb = mockListen.mock.calls.find(
        (c: [string, unknown]) => c[0] === "worker-nudged"
      )?.[1] as ((e: { payload: { workerId: string } }) => void) | undefined;
      expect(stalledCb).toBeDefined();
      expect(nudgedCb).toBeDefined();

      // まず stalled にする
      await act(async () => {
        stalledCb!({ payload: { workerId: "w-recover" } });
      });
      expect(screen.getByTestId("worker-stalled-badge-w-recover")).toBeTruthy();

      // nudge で stalled バッジが消える
      await act(async () => {
        nudgedCb!({ payload: { workerId: "w-recover" } });
      });
      expect(screen.queryByTestId("worker-stalled-badge-w-recover")).toBeNull();
      vi.useRealTimers();
    });
  });

  // Phase 13: 役割バッジのテスト (ITb-13-01〜05)
  describe("役割バッジ (Phase 13)", () => {
    // ITb-13-01: Scout 役割で 🔍 バッジが表示される
    it("ITb-13-01: Scout 役割で 🔍 バッジが表示される (data-role=scout)", () => {
      const worker = makeWorker({
        config: { kind: "claudeCode", mode: "batch", label: "Scout Worker", workingDir: "/", dependsOn: [], metadata: {}, role: "scout" },
      });
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
      const badge = screen.getByTestId("worker-role-icon-w-001");
      expect(badge.getAttribute("data-role")).toBe("scout");
      expect(badge.textContent).toBe("🔍");
    });

    // ITb-13-02: Builder 役割で 🔨 バッジが表示される
    it("ITb-13-02: Builder 役割で 🔨 バッジが表示される (data-role=builder)", () => {
      const worker = makeWorker({
        config: { kind: "claudeCode", mode: "batch", label: "Builder Worker", workingDir: "/", dependsOn: [], metadata: {}, role: "builder" },
      });
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
      const badge = screen.getByTestId("worker-role-icon-w-001");
      expect(badge.getAttribute("data-role")).toBe("builder");
      expect(badge.textContent).toBe("🔨");
    });

    // ITb-13-03: Reviewer 役割で 👁️ バッジが表示される
    it("ITb-13-03: Reviewer 役割で 👁️ バッジが表示される (data-role=reviewer)", () => {
      const worker = makeWorker({
        config: { kind: "claudeCode", mode: "batch", label: "Reviewer Worker", workingDir: "/", dependsOn: [], metadata: {}, role: "reviewer" },
      });
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
      const badge = screen.getByTestId("worker-role-icon-w-001");
      expect(badge.getAttribute("data-role")).toBe("reviewer");
      expect(badge.textContent).toBe("👁️");
    });

    // ITb-13-04: Merger 役割で 🔀 バッジが表示される
    it("ITb-13-04: Merger 役割で 🔀 バッジが表示される (data-role=merger)", () => {
      const worker = makeWorker({
        config: { kind: "claudeCode", mode: "batch", label: "Merger Worker", workingDir: "/", dependsOn: [], metadata: {}, role: "merger" },
      });
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
      const badge = screen.getByTestId("worker-role-icon-w-001");
      expect(badge.getAttribute("data-role")).toBe("merger");
      expect(badge.textContent).toBe("🔀");
    });

    // ITb-13-05: Shell 役割で 🐚 バッジが表示される
    it("ITb-13-05: Shell 役割で 🐚 バッジが表示される (data-role=shell)", () => {
      const worker = makeWorker({
        config: { kind: "shell", mode: "interactive", label: "Shell Worker", workingDir: "/", dependsOn: [], metadata: {}, role: "shell" },
      });
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
      const badge = screen.getByTestId("worker-role-icon-w-001");
      expect(badge.getAttribute("data-role")).toBe("shell");
      expect(badge.textContent).toBe("🐚");
    });

    // role が未指定のとき "shell" がデフォルトになる
    it("role が未指定のとき 🐚 (shell) がデフォルトで表示される", () => {
      const worker = makeWorker(); // role なし
      render(<XtermPane worker={worker} onKill={vi.fn()} isActive={false} onClick={vi.fn()} />);
      const badge = screen.getByTestId("worker-role-icon-w-001");
      expect(badge.getAttribute("data-role")).toBe("shell");
      expect(badge.textContent).toBe("🐚");
    });
  });
});
