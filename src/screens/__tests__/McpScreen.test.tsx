/**
 * McpScreen テスト
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProject = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest", default_branch: "main",
  repo_owner: "yo", repo_name: "devnest", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockStatus = {
  servers: [
    { name: "mcp-fs", status: { type: "connected" as const }, tools: ["read_file", "write_file"] },
    { name: "mcp-db", status: { type: "disconnected" as const }, tools: [] },
  ],
  total_tools: 2,
};

const mockPolicy = {
  default_policy: "allow" as const,
  tool_overrides: {},
};

const mockIpc = vi.hoisted(() => ({
  mcpGetStatus: vi.fn(),
  mcpGetPolicy: vi.fn(),
  mcpAddServer: vi.fn(),
  mcpRemoveServer: vi.fn(),
  mcpSavePolicy: vi.fn(),
}));

vi.mock("../../lib/ipc", () => mockIpc);

const projectState = { currentProject: mockProject as typeof mockProject | null };

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn(() => projectState),
}));

import { McpScreen } from "../McpScreen";

describe("McpScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    mockIpc.mcpGetStatus.mockResolvedValue(mockStatus);
    mockIpc.mcpGetPolicy.mockResolvedValue(mockPolicy);
    mockIpc.mcpAddServer.mockResolvedValue(null);
    mockIpc.mcpRemoveServer.mockResolvedValue(null);
    mockIpc.mcpSavePolicy.mockResolvedValue(null);
  });

  it("プロジェクト未選択時は案内文を表示", () => {
    projectState.currentProject = null;
    render(<McpScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("ヘッダーが表示される", () => {
    render(<McpScreen />);
    expect(screen.getByText("MCP 統合")).toBeInTheDocument();
  });

  it("マウント時に mcpGetStatus と mcpGetPolicy が呼ばれる", async () => {
    render(<McpScreen />);
    await waitFor(() => {
      expect(mockIpc.mcpGetStatus).toHaveBeenCalledWith("/tmp/devnest");
      expect(mockIpc.mcpGetPolicy).toHaveBeenCalledWith("/tmp/devnest");
    });
  });

  it("サーバー一覧が表示される", async () => {
    render(<McpScreen />);
    await waitFor(() => {
      expect(screen.getByText("mcp-fs")).toBeInTheDocument();
      expect(screen.getByText("mcp-db")).toBeInTheDocument();
    });
  });

  it("接続中サーバーに 接続中 を表示", async () => {
    render(<McpScreen />);
    await waitFor(() => expect(screen.getByText("接続中")).toBeInTheDocument());
  });

  it("未接続サーバーに 未接続 を表示", async () => {
    render(<McpScreen />);
    await waitFor(() => expect(screen.getByText("未接続")).toBeInTheDocument());
  });

  it("ツール数が表示される", async () => {
    render(<McpScreen />);
    await waitFor(() => expect(screen.getByText("2 ツール")).toBeInTheDocument());
  });

  it("サーバー数が MCPサーバー (2台) として表示される", async () => {
    render(<McpScreen />);
    await waitFor(() => expect(screen.getByText("MCPサーバー (2台)")).toBeInTheDocument());
  });

  it("status.servers が空のとき 未設定メッセージを表示", async () => {
    mockIpc.mcpGetStatus.mockResolvedValue({ servers: [], total_tools: 0 });
    render(<McpScreen />);
    await waitFor(() => expect(screen.getByText("MCPサーバーが設定されていません")).toBeInTheDocument());
  });

  it("削除ボタンで mcpRemoveServer が呼ばれる", async () => {
    render(<McpScreen />);
    await waitFor(() => screen.getByText("mcp-fs"));
    const deleteBtns = screen.getAllByText("削除");
    fireEvent.click(deleteBtns[0]);
    await waitFor(() => expect(mockIpc.mcpRemoveServer).toHaveBeenCalledWith("/tmp/devnest", "mcp-fs"));
  });

  it("+ 追加 ボタンで追加フォームを表示", () => {
    render(<McpScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    expect(screen.getByPlaceholderText("サーバー名")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/エンドポイント/)).toBeInTheDocument();
  });

  it("キャンセル ボタンでフォームを閉じる", () => {
    render(<McpScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    fireEvent.click(screen.getByText("キャンセル"));
    expect(screen.queryByPlaceholderText("サーバー名")).not.toBeInTheDocument();
  });

  it("transport を SSE に変更できる", () => {
    render(<McpScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "sse" } });
    expect((select as HTMLSelectElement).value).toBe("sse");
  });

  it("名前とエンドポイントを入力して追加できる", async () => {
    render(<McpScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    fireEvent.change(screen.getByPlaceholderText("サーバー名"), { target: { value: "my-server" } });
    fireEvent.change(screen.getByPlaceholderText(/エンドポイント/), { target: { value: "/usr/bin/mcp" } });
    fireEvent.click(screen.getByText("追加"));
    await waitFor(() => expect(mockIpc.mcpAddServer).toHaveBeenCalledWith(
      "/tmp/devnest",
      expect.objectContaining({ name: "my-server", endpoint: "/usr/bin/mcp" })
    ));
  });

  it("名前またはエンドポイントが空のときは追加しない", async () => {
    render(<McpScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    fireEvent.click(screen.getByText("追加"));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockIpc.mcpAddServer).not.toHaveBeenCalled();
  });

  it("ポリシーセクションが表示される", async () => {
    render(<McpScreen />);
    await waitFor(() => expect(screen.getByText("ツールポリシー")).toBeInTheDocument());
    expect(screen.getByText("許可")).toBeInTheDocument();
    expect(screen.getByText("承認必須")).toBeInTheDocument();
    expect(screen.getByText("拒否")).toBeInTheDocument();
  });

  it("ポリシーを 承認必須 に変更できる", async () => {
    render(<McpScreen />);
    await waitFor(() => screen.getByText("承認必須"));
    fireEvent.click(screen.getByText("承認必須"));
    expect(mockIpc.mcpSavePolicy).toHaveBeenCalledWith(
      "/tmp/devnest",
      expect.objectContaining({ default_policy: "require_approval" })
    );
  });
});
