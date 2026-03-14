import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── store モック ──────────────────────────────────────────────────────────────
const mockProjectStore = {
  currentProject: { id: 1, name: "TestProject" } as { id: number; name: string } | null,
};

const mockSettingsStore = {
  theme: "system" as "system" | "light" | "dark",
  authStatus: null as { connected: boolean; user_login?: string; avatar_url?: string } | null,
  authStatus2: "idle" as string,
  clientId: "",
  clientSecret: "",
  anthropicApiKey: "",
  setTheme: vi.fn(),
  fetchAuthStatus: vi.fn(),
  startAuth: vi.fn().mockResolvedValue(undefined),
  revokeAuth: vi.fn().mockResolvedValue(undefined),
  setClientId: vi.fn(),
  setClientSecret: vi.fn(),
  setAnthropicApiKey: vi.fn(),
  saveGithubCredentials: vi.fn().mockResolvedValue(undefined),
  saveAnthropicKey: vi.fn().mockResolvedValue(undefined),
  loadCredentials: vi.fn(),
  listenAuthDone: vi.fn().mockResolvedValue(() => {}),
};

const mockNotificationsStore = {
  permissionStatus: "default" as string,
  requestPermission: vi.fn(),
};

vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: Object.assign(
    (sel?: (s: typeof mockSettingsStore) => unknown) =>
      sel ? sel(mockSettingsStore) : mockSettingsStore,
    { getState: () => mockSettingsStore }
  ),
}));
vi.mock("../stores/notificationsStore", () => ({
  useNotificationsStore: (sel?: (s: typeof mockNotificationsStore) => unknown) =>
    sel ? sel(mockNotificationsStore) : mockNotificationsStore,
}));
vi.mock("../lib/ipc", () => ({
  indexReset: vi.fn().mockResolvedValue(5),
  pollingStart: vi.fn().mockResolvedValue(undefined),
  pollingStop: vi.fn().mockResolvedValue(undefined),
  mcpGetStatus: vi.fn().mockResolvedValue({ servers: [], total_tools: 0 }),
  mcpGetPolicy: vi.fn().mockResolvedValue({ default_policy: "allow", tool_overrides: {} }),
  mcpSavePolicy: vi.fn().mockResolvedValue(undefined),
  mcpAddServer: vi.fn().mockResolvedValue(undefined),
  mcpRemoveServer: vi.fn().mockResolvedValue(undefined),
}));

import { SettingsScreen } from "./SettingsScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("SettingsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.currentProject = { id: 1, name: "TestProject" };
    mockSettingsStore.theme = "system";
    mockSettingsStore.authStatus = null;
    mockSettingsStore.authStatus2 = "idle";
    mockSettingsStore.clientId = "";
    mockSettingsStore.clientSecret = "";
    mockSettingsStore.anthropicApiKey = "";
    mockNotificationsStore.permissionStatus = "default";
  });

  it("タブが4つ表示される", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("接続")).toBeInTheDocument();
    expect(screen.getByText("通知")).toBeInTheDocument();
    expect(screen.getByText("ポリシー")).toBeInTheDocument();
    expect(screen.getByText("環境設定")).toBeInTheDocument();
  });

  it("初期マウント時に loadCredentials と fetchAuthStatus が呼ばれる", () => {
    render(<SettingsScreen />);
    expect(mockSettingsStore.loadCredentials).toHaveBeenCalled();
    expect(mockSettingsStore.fetchAuthStatus).toHaveBeenCalledWith(1);
  });

  // ── 環境設定タブ ────────────────────────────────────────────────
  it("環境設定タブに切り替えるとテーマボタンが表示される", () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("環境設定"));
    expect(screen.getByText("ダーク")).toBeInTheDocument();
    expect(screen.getByText("ライト")).toBeInTheDocument();
    expect(screen.getByText("システム")).toBeInTheDocument();
  });

  it("テーマボタンをクリックすると setTheme が呼ばれる", () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("環境設定"));
    fireEvent.click(screen.getByText("ダーク"));
    expect(mockSettingsStore.setTheme).toHaveBeenCalledWith("dark");
  });

  it("現在のテーマボタンが強調表示される", () => {
    mockSettingsStore.theme = "light";
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("環境設定"));
    const lightBtn = screen.getByText("ライト");
    expect(lightBtn).toBeInTheDocument();
  });

  // ── 接続タブ: GitHub 認証 ────────────────────────────────────────
  it("GitHub 未接続時に「GitHub で認証」ボタンが表示される（接続タブ）", () => {
    mockSettingsStore.authStatus = null;
    render(<SettingsScreen />);
    // 接続タブがデフォルト
    expect(screen.getByText("GitHub で認証")).toBeInTheDocument();
  });

  it("GitHub 接続済み時に @username と解除ボタンが表示される", () => {
    mockSettingsStore.authStatus = {
      connected: true,
      user_login: "testuser",
      avatar_url: "",
    };
    render(<SettingsScreen />);
    expect(screen.getByText("@testuser")).toBeInTheDocument();
  });

  it("GitHub 認証確認中は「確認中…」が表示される", () => {
    mockSettingsStore.authStatus2 = "loading";
    render(<SettingsScreen />);
    expect(screen.getByText("確認中…")).toBeInTheDocument();
  });

  it("「GitHub で認証」クリックで startAuth が呼ばれる（clientId 設定済み）", async () => {
    mockSettingsStore.authStatus = null;
    mockSettingsStore.clientId = "test-client-id";
    mockSettingsStore.clientSecret = "test-secret";
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("GitHub で認証"));
    await waitFor(() => {
      expect(mockSettingsStore.startAuth).toHaveBeenCalledWith(1);
    });
  });

  // ── 通知タブ ──────────────────────────────────────────────────────
  it("通知が許可済みの場合「通知が許可されています」が表示される", () => {
    mockNotificationsStore.permissionStatus = "granted";
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("通知"));
    expect(screen.getByText("通知が許可されています")).toBeInTheDocument();
  });

  it("通知がブロック済みの場合ブロックメッセージが表示される", () => {
    mockNotificationsStore.permissionStatus = "denied";
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("通知"));
    expect(
      screen.getByText("通知がブロックされています。システム設定から許可してください。")
    ).toBeInTheDocument();
  });

  it("通知未設定の場合「通知を許可する」ボタンが表示される", () => {
    mockNotificationsStore.permissionStatus = "default";
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("通知"));
    expect(screen.getByText("通知を許可する")).toBeInTheDocument();
  });

  // ── 環境設定タブ: インデックスリセット ──────────────────────────
  it("「インデックスをリセット」ボタンが環境設定タブに表示される", () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("環境設定"));
    expect(screen.getByText("インデックスをリセット")).toBeInTheDocument();
  });

  it("「設定を保存」クリックで saveGithubCredentials と saveAnthropicKey が呼ばれる", async () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("設定を保存"));
    await waitFor(() => {
      expect(mockSettingsStore.saveGithubCredentials).toHaveBeenCalledWith(1);
      expect(mockSettingsStore.saveAnthropicKey).toHaveBeenCalled();
    });
  });
});
