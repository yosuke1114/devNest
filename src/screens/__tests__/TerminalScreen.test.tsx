/**
 * TerminalScreen 追加テスト — handleReviewChanges / PRCreateModal / pendingPrompt
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// xterm モック
vi.mock("@xterm/xterm", () => {
  const Terminal = function (this: Record<string, unknown>) {
    this.loadAddon = vi.fn();
    this.open = vi.fn();
    this.onData = vi.fn(() => ({ dispose: vi.fn() }));
    this.onResize = vi.fn(() => ({ dispose: vi.fn() }));
    this.write = vi.fn();
    this.refresh = vi.fn();
    this.dispose = vi.fn();
    this.rows = 24;
    this.cols = 80;
  };
  return { Terminal };
});
vi.mock("@xterm/addon-fit", () => {
  const FitAddon = function (this: Record<string, unknown>) { this.fit = vi.fn(); };
  return { FitAddon };
});
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// ─── モック状態 ──────────────────────────────────────────────────────────────

const mockProject = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest", default_branch: "main",
  repo_owner: "yo", repo_name: "devnest", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const projectState = {
  currentProject: mockProject as typeof mockProject | null,
};

const terminalState = {
  session: null as { id: number; status: string; branch_name?: string } | null,
  startStatus: "idle" as string,
  showPrReadyBanner: false,
  readyBranch: null as string | null,
  hasDocChanges: false,
  error: null as string | null,
  pendingPrompt: null as string | null,
  startSession: vi.fn(() => Promise.resolve()),
  stopSession: vi.fn(),
  dismissBanner: vi.fn(),
  sendInput: vi.fn(),
  sendResize: vi.fn(),
  setPendingPrompt: vi.fn(),
};

const prState = {
  syncPrs: vi.fn(),
  createPrFromBranch: vi.fn(() => Promise.resolve({ prNumber: 42, title: "feat: x" })),
  createStatus: "idle" as string,
  error: null as string | null,
};

const uiState = { navigate: vi.fn(), currentScreen: "terminal" };

vi.mock("../../stores/projectStore", () => {
  const hook = vi.fn((sel?: (s: typeof projectState) => unknown) =>
    sel ? sel(projectState) : projectState
  ) as ReturnType<typeof vi.fn> & { getState?: () => typeof projectState };
  hook.getState = () => projectState;
  return { useProjectStore: hook };
});

vi.mock("../../stores/terminalStore", () => {
  const hook = vi.fn((sel?: (s: typeof terminalState) => unknown) =>
    sel ? sel(terminalState) : terminalState
  ) as ReturnType<typeof vi.fn> & { getState?: () => typeof terminalState };
  hook.getState = () => terminalState;
  return { useTerminalStore: hook };
});

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn((sel?: (s: typeof uiState) => unknown) =>
    sel ? sel(uiState) : uiState
  ),
}));

vi.mock("../../stores/prStore", () => {
  const hook = vi.fn((sel?: (s: typeof prState) => unknown) =>
    sel ? sel(prState) : prState
  ) as ReturnType<typeof vi.fn> & { getState?: () => typeof prState };
  hook.getState = () => prState;
  return { usePrStore: hook };
});

// PRReadyBanner: exposes onReviewChanges callback
vi.mock("../../components/terminal/PRReadyBanner", () => ({
  PRReadyBanner: ({
    onCreatePR,
    onReviewChanges,
    onDismiss,
  }: {
    branchName: string;
    hasDocChanges: boolean;
    onCreatePR: () => void;
    onReviewChanges: () => void;
    onDismiss: () => void;
  }) => (
    <div data-testid="pr-ready-banner">
      <button onClick={onCreatePR}>create-pr</button>
      <button onClick={onReviewChanges}>review-changes</button>
      <button onClick={onDismiss}>dismiss</button>
    </div>
  ),
}));

// PRCreateModal: exposes onSubmit callback
vi.mock("../../components/terminal/PRCreateModal", () => ({
  PRCreateModal: ({
    onSubmit,
    onClose,
  }: {
    branchName: string;
    createStatus: string;
    error: string | null;
    onSubmit: (title: string, body: string) => Promise<void>;
    onClose: () => void;
  }) => (
    <div data-testid="pr-create-modal">
      <button onClick={() => onSubmit("PR Title", "PR Body")}>submit-pr</button>
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

vi.mock("../../components/terminal/PRCreatedBanner", () => ({
  PRCreatedBanner: ({ onOpenPR, onDismiss }: {
    prNumber: number; title: string; hasDocChanges: boolean;
    onOpenPR: () => void; onDismiss: () => void;
  }) => (
    <div data-testid="pr-created-banner">
      <button onClick={onOpenPR}>open-pr</button>
      <button onClick={onDismiss}>dismiss-created</button>
    </div>
  ),
}));

import { TerminalScreen } from "../TerminalScreen";

describe("TerminalScreen — 追加カバレッジ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    terminalState.session = null;
    terminalState.startStatus = "idle";
    terminalState.showPrReadyBanner = false;
    terminalState.readyBranch = null;
    terminalState.hasDocChanges = false;
    terminalState.error = null;
    terminalState.pendingPrompt = null;
    terminalState.startSession = vi.fn(() => Promise.resolve());
    terminalState.stopSession = vi.fn();
    terminalState.dismissBanner = vi.fn();
    terminalState.setPendingPrompt = vi.fn();
    prState.syncPrs = vi.fn();
    prState.createPrFromBranch = vi.fn(() => Promise.resolve({ prNumber: 42, title: "feat: x" }));
    prState.createStatus = "idle";
    uiState.navigate = vi.fn();
  });

  it("PRReadyBanner の review-changes で syncPrs + navigate(pr) が呼ばれる", () => {
    terminalState.showPrReadyBanner = true;
    render(<TerminalScreen />);
    fireEvent.click(screen.getByText("review-changes"));
    expect(prState.syncPrs).toHaveBeenCalledWith(1);
    expect(uiState.navigate).toHaveBeenCalledWith("pr");
  });

  it("PRReadyBanner の dismiss で dismissBanner が呼ばれる", () => {
    terminalState.showPrReadyBanner = true;
    render(<TerminalScreen />);
    fireEvent.click(screen.getByText("dismiss"));
    expect(terminalState.dismissBanner).toHaveBeenCalled();
  });

  it("PRReadyBanner の create-pr で PRCreateModal が表示される", () => {
    terminalState.showPrReadyBanner = true;
    render(<TerminalScreen />);
    fireEvent.click(screen.getByText("create-pr"));
    expect(screen.getByTestId("pr-create-modal")).toBeInTheDocument();
  });

  it("PRCreateModal の close-modal でモーダルが閉じる", () => {
    terminalState.showPrReadyBanner = true;
    render(<TerminalScreen />);
    fireEvent.click(screen.getByText("create-pr"));
    expect(screen.getByTestId("pr-create-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-modal"));
    expect(screen.queryByTestId("pr-create-modal")).not.toBeInTheDocument();
  });

  it("PRCreateModal の submit-pr で createPrFromBranch が呼ばれ navigate(pr)", async () => {
    terminalState.showPrReadyBanner = true;
    render(<TerminalScreen />);
    fireEvent.click(screen.getByText("create-pr"));
    fireEvent.click(screen.getByText("submit-pr"));
    await waitFor(() => {
      expect(prState.createPrFromBranch).toHaveBeenCalledWith(1, "", "PR Title", "PR Body");
      expect(uiState.navigate).toHaveBeenCalledWith("pr");
    });
  });

  it("pendingPrompt あり + session なし のとき startSession が呼ばれる", async () => {
    terminalState.pendingPrompt = "fix the bug";
    render(<TerminalScreen />);
    await waitFor(() => {
      expect(terminalState.startSession).toHaveBeenCalledWith(
        1, "fix the bug", expect.anything()
      );
    });
  });

  it("pendingPrompt なしのとき startSession は呼ばれない", () => {
    terminalState.pendingPrompt = null;
    render(<TerminalScreen />);
    expect(terminalState.startSession).not.toHaveBeenCalled();
  });

  it("session=running + pendingPrompt では startSession を呼ばない", () => {
    terminalState.pendingPrompt = "do something";
    terminalState.session = { id: 1, status: "running" };
    render(<TerminalScreen />);
    // running なので startSession は呼ばれない
    expect(terminalState.startSession).not.toHaveBeenCalled();
  });
});
