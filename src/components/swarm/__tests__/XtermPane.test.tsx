import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { XtermPane } from "../XtermPane";
import type { WorkerInfo } from "../types";

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
    onData = vi.fn(() => ({ dispose: vi.fn() }));
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

describe("XtermPane", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
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
});
