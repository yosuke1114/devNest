import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── xterm.js / addon モック ──────────────────────────────────────────────────
vi.mock("@xterm/xterm", () => {
  const Terminal = function (this: Record<string, unknown>) {
    this.loadAddon = vi.fn();
    this.open = vi.fn();
    this.onData = vi.fn();
    this.write = vi.fn();
    this.dispose = vi.fn();
  };
  return { Terminal };
});
vi.mock("@xterm/addon-fit", () => {
  const FitAddon = function (this: Record<string, unknown>) {
    this.fit = vi.fn();
  };
  return { FitAddon };
});
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

// ─── store モック ──────────────────────────────────────────────────────────────
const mockProjectStore = {
  currentProject: { id: 1, name: "TestProject", local_path: "/test/path" } as {
    id: number;
    name: string;
    local_path: string;
  } | null,
};

const mockTerminalStore = {
  session: null as {
    id: number;
    status: string;
    branch_name?: string;
  } | null,
  startStatus: "idle" as string,
  showPrReadyBanner: false,
  readyBranch: null as string | null,
  hasDocChanges: false,
  error: null as string | null,
  startSession: vi.fn(),
  stopSession: vi.fn(),
  dismissBanner: vi.fn(),
  listenEvents: vi.fn().mockReturnValue(() => {}),
  sendInput: vi.fn(),
};

const mockUiStore = {
  navigate: vi.fn(),
};

const mockPrStore = {
  syncPrs: vi.fn(),
  createPrFromBranch: vi.fn().mockResolvedValue(undefined),
  createStatus: "idle" as string,
  error: null as string | null,
};

vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/terminalStore", () => ({
  useTerminalStore: (sel?: (s: typeof mockTerminalStore) => unknown) =>
    sel ? sel(mockTerminalStore) : mockTerminalStore,
}));
vi.mock("../stores/uiStore", () => ({
  useUiStore: (sel?: (s: typeof mockUiStore) => unknown) =>
    sel ? sel(mockUiStore) : mockUiStore,
}));
vi.mock("../stores/prStore", () => ({
  usePrStore: (sel?: (s: typeof mockPrStore) => unknown) =>
    sel ? sel(mockPrStore) : mockPrStore,
}));
vi.mock("../components/terminal/PRCreateModal", () => ({
  PRCreateModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="pr-create-modal">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));
vi.mock("../components/terminal/PRReadyBanner", () => ({
  PRReadyBanner: ({
    onCreatePR,
    onDismiss,
  }: {
    onCreatePR: () => void;
    onDismiss: () => void;
  }) => (
    <div data-testid="pr-ready-banner">
      <button onClick={onCreatePR}>CREATE PR</button>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  ),
}));
vi.mock("../components/terminal/PRCreatedBanner", () => ({
  PRCreatedBanner: () => <div data-testid="pr-created-banner" />,
}));

import { TerminalScreen } from "./TerminalScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("TerminalScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.currentProject = {
      id: 1,
      name: "TestProject",
      local_path: "/test/path",
    };
    mockTerminalStore.session = null;
    mockTerminalStore.startStatus = "idle";
    mockTerminalStore.showPrReadyBanner = false;
    mockTerminalStore.readyBranch = null;
    mockTerminalStore.hasDocChanges = false;
    mockTerminalStore.error = null;
  });

  it("currentProject が null の場合「プロジェクトを選択してください」が表示される", () => {
    mockProjectStore.currentProject = null;
    render(<TerminalScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("初期マウント時に listenEvents が呼ばれる", () => {
    render(<TerminalScreen />);
    expect(mockTerminalStore.listenEvents).toHaveBeenCalled();
  });

  it("セッション未開始時に「START CLAUDE CODE」ボタンが表示される", () => {
    render(<TerminalScreen />);
    expect(screen.getByText("START CLAUDE CODE")).toBeInTheDocument();
  });

  it("「ready to start」ステータスが表示される（アイドル時）", () => {
    render(<TerminalScreen />);
    expect(screen.getByText("● ready to start")).toBeInTheDocument();
  });

  it("START ボタンクリックで startSession が呼ばれる", () => {
    render(<TerminalScreen />);
    fireEvent.click(screen.getByText("START CLAUDE CODE"));
    expect(mockTerminalStore.startSession).toHaveBeenCalledWith(1);
  });

  it("セッション実行中は STOP ボタンと running ステータスが表示される", () => {
    mockTerminalStore.session = { id: 1, status: "running" };
    render(<TerminalScreen />);
    expect(screen.getByText("STOP")).toBeInTheDocument();
    expect(screen.getByText("◌ running…")).toBeInTheDocument();
  });

  it("STOP ボタンクリックで stopSession が呼ばれる", () => {
    mockTerminalStore.session = { id: 1, status: "running" };
    render(<TerminalScreen />);
    fireEvent.click(screen.getByText("STOP"));
    expect(mockTerminalStore.stopSession).toHaveBeenCalled();
  });

  it("セッション完了時に「completed」ステータスが表示される", () => {
    mockTerminalStore.session = { id: 1, status: "completed" };
    render(<TerminalScreen />);
    expect(screen.getByText("● completed")).toBeInTheDocument();
  });

  it("セッション中断時に「stopped」ステータスが表示される", () => {
    mockTerminalStore.session = { id: 1, status: "aborted" };
    render(<TerminalScreen />);
    expect(screen.getByText("■ stopped")).toBeInTheDocument();
  });

  it("エラーがある場合にエラーメッセージが表示される", () => {
    mockTerminalStore.error = "Session failed to start";
    render(<TerminalScreen />);
    expect(screen.getByText("Session failed to start")).toBeInTheDocument();
  });

  it("PR Ready バナーが showPrReadyBanner=true のとき表示される", () => {
    mockTerminalStore.showPrReadyBanner = true;
    mockTerminalStore.readyBranch = "feature/test";
    render(<TerminalScreen />);
    expect(screen.getByTestId("pr-ready-banner")).toBeInTheDocument();
  });

  it("PR Ready バナー非表示時は表示されない", () => {
    mockTerminalStore.showPrReadyBanner = false;
    render(<TerminalScreen />);
    expect(screen.queryByTestId("pr-ready-banner")).not.toBeInTheDocument();
  });

  it("ローカルパスがヘッダーに表示される", () => {
    render(<TerminalScreen />);
    expect(screen.getByText("/test/path")).toBeInTheDocument();
  });

  it("セッション未起動時にガイドテキストが表示される", () => {
    render(<TerminalScreen />);
    expect(
      screen.getByText("Claude Code を起動して作業を始める")
    ).toBeInTheDocument();
  });

  it("セッション稼働中にPTYメッセージが表示される", () => {
    mockTerminalStore.session = { id: 1, status: "running" };
    render(<TerminalScreen />);
    expect(
      screen.getByText(/PTY セッション稼働中/)
    ).toBeInTheDocument();
  });
});
