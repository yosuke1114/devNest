/**
 * AgentControlScreen テスト
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// TerminalScreen は xterm を使うためモック
vi.mock("../TerminalScreen", () => ({
  TerminalScreen: () => <div data-testid="terminal-screen">terminal</div>,
}));

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn(() => ({ currentProject: null })),
}));
vi.mock("../../stores/terminalStore", () => ({
  useTerminalStore: vi.fn(() => ({ setPendingPrompt: vi.fn(), pendingPrompt: null })),
}));
vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn(() => ({ navigate: vi.fn() })),
}));
vi.mock("../../lib/ipc", () => ({
  ipc: { invoke: vi.fn(() => Promise.resolve(null)) },
}));

import { AgentControlScreen } from "../AgentControlScreen";

describe("AgentControlScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("デフォルトで キュー タブが表示される", () => {
    render(<AgentControlScreen />);
    expect(screen.getByText("タスクキュー")).toBeInTheDocument();
    expect(screen.getByText("キューにタスクはありません")).toBeInTheDocument();
  });

  it("承認待ち タブに切り替えできる", () => {
    render(<AgentControlScreen />);
    fireEvent.click(screen.getByText("承認待ち"));
    expect(screen.getByText("承認待ちのアクションはありません")).toBeInTheDocument();
    expect(screen.getByText(/MCP ポリシー/)).toBeInTheDocument();
  });

  it("実行ログ タブに切り替えると TerminalScreen が表示される", () => {
    render(<AgentControlScreen />);
    fireEvent.click(screen.getByText("実行ログ"));
    expect(screen.getByTestId("terminal-screen")).toBeInTheDocument();
  });

  it("トリガー設定 タブに切り替えできる", () => {
    render(<AgentControlScreen />);
    fireEvent.click(screen.getByText("トリガー設定"));
    expect(screen.getByText("PR オープン時にレビュー")).toBeInTheDocument();
    expect(screen.getByText("CI 失敗時にデバッグ")).toBeInTheDocument();
    expect(screen.getByText("コンフリクト検出時に解決提案")).toBeInTheDocument();
    expect(screen.getByText("設計書の鮮度低下時に更新")).toBeInTheDocument();
  });

  it("トリガーのトグルを ON/OFF できる", () => {
    render(<AgentControlScreen />);
    fireEvent.click(screen.getByText("トリガー設定"));

    const toggleBtns = screen.getAllByRole("button", { name: "" });
    // トリガー設定タブのトグルボタン（最初の4つがタブボタン）
    const triggerToggles = toggleBtns.filter((btn) =>
      btn.style.borderRadius === "12px"
    );
    expect(triggerToggles.length).toBeGreaterThan(0);
    fireEvent.click(triggerToggles[0]);
    // 再クリックで OFF に戻る
    fireEvent.click(triggerToggles[0]);
  });

  it("TerminalScreen は 実行ログ タブ以外では非表示（DOM にはある）", () => {
    render(<AgentControlScreen />);
    // TerminalScreen は常時マウントされているが display: none
    const terminal = screen.getByTestId("terminal-screen");
    expect(terminal.closest("div[style]")).toBeTruthy();
  });
});
