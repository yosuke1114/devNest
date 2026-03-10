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
  useSettingsStore: (sel?: (s: typeof mockSettingsStore) => unknown) =>
    sel ? sel(mockSettingsStore) : mockSettingsStore,
}));
vi.mock("../stores/notificationsStore", () => ({
  useNotificationsStore: (sel?: (s: typeof mockNotificationsStore) => unknown) =>
    sel ? sel(mockNotificationsStore) : mockNotificationsStore,
}));
vi.mock("../lib/ipc", () => ({
  indexReset: vi.fn().mockResolvedValue(5),
  pollingStart: vi.fn().mockResolvedValue(undefined),
  pollingStop: vi.fn().mockResolvedValue(undefined),
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

  it("「設定」ヘッダーが表示される", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("設定")).toBeInTheDocument();
  });

  it("初期マウント時に loadCredentials と fetchAuthStatus が呼ばれる", () => {
    render(<SettingsScreen />);
    expect(mockSettingsStore.loadCredentials).toHaveBeenCalled();
    expect(mockSettingsStore.fetchAuthStatus).toHaveBeenCalledWith(1);
  });

  // ── テーマ切り替え ────────────────────────────────────────────────
  it("テーマボタンをクリックすると setTheme が呼ばれる", () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("ダーク"));
    expect(mockSettingsStore.setTheme).toHaveBeenCalledWith("dark");
  });

  it("現在のテーマボタンが強調表示される", () => {
    mockSettingsStore.theme = "light";
    render(<SettingsScreen />);
    const lightBtn = screen.getByText("ライト");
    expect(lightBtn).toHaveStyle({ fontWeight: 600 });
  });

  // ── 設定保存 ──────────────────────────────────────────────────────
  it("「設定を保存」クリックで saveGithubCredentials と saveAnthropicKey が呼ばれる", async () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("設定を保存"));
    await waitFor(() => {
      expect(mockSettingsStore.saveGithubCredentials).toHaveBeenCalledWith(1);
      expect(mockSettingsStore.saveAnthropicKey).toHaveBeenCalled();
    });
  });

  it("保存成功後「保存しました」メッセージが表示される", async () => {
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("設定を保存"));
    await waitFor(() => {
      expect(screen.getByText("保存しました")).toBeInTheDocument();
    });
  });

  // ── GitHub 認証 ────────────────────────────────────────────────────
  it("GitHub 未接続時に「GitHub で認証する」ボタンが表示される", () => {
    mockSettingsStore.authStatus = null;
    render(<SettingsScreen />);
    expect(screen.getByText("GitHub で認証する")).toBeInTheDocument();
  });

  it("GitHub 接続済み時に「接続済み」表示とユーザー名と解除ボタンが表示される", () => {
    mockSettingsStore.authStatus = {
      connected: true,
      user_login: "testuser",
      avatar_url: "",
    };
    render(<SettingsScreen />);
    expect(screen.getByText("接続済み")).toBeInTheDocument();
    expect(screen.getByText("@testuser")).toBeInTheDocument();
    expect(screen.getByText(/認証を解除/)).toBeInTheDocument();
  });

  it("GitHub 認証確認中は「確認中…」が表示される", () => {
    mockSettingsStore.authStatus2 = "loading";
    render(<SettingsScreen />);
    expect(screen.getByText("確認中…")).toBeInTheDocument();
  });

  it("「GitHub で認証する」クリックで startAuth が呼ばれる", async () => {
    mockSettingsStore.authStatus = null;
    render(<SettingsScreen />);
    fireEvent.click(screen.getByText("GitHub で認証する"));
    await waitFor(() => {
      expect(mockSettingsStore.startAuth).toHaveBeenCalledWith(1);
    });
  });

  // ── OS 通知 ──────────────────────────────────────────────────────
  it("通知が許可済みの場合「通知が許可されています」が表示される", () => {
    mockNotificationsStore.permissionStatus = "granted";
    render(<SettingsScreen />);
    expect(screen.getByText("通知が許可されています")).toBeInTheDocument();
  });

  it("通知がブロック済みの場合ブロックメッセージが表示される", () => {
    mockNotificationsStore.permissionStatus = "denied";
    render(<SettingsScreen />);
    expect(
      screen.getByText("通知がブロックされています。システム設定から許可してください。")
    ).toBeInTheDocument();
  });

  it("通知未設定の場合 ALLOW NOTIFICATIONS ボタンが表示される", () => {
    mockNotificationsStore.permissionStatus = "default";
    render(<SettingsScreen />);
    expect(screen.getByText("ALLOW NOTIFICATIONS")).toBeInTheDocument();
  });

  // ── 検索インデックス ──────────────────────────────────────────────
  it("プロジェクト未選択時は「プロジェクトを選択してください」と表示される（検索インデックスセクション）", () => {
    mockProjectStore.currentProject = null;
    render(<SettingsScreen />);
    const msgs = screen.getAllByText("プロジェクトを選択してください");
    expect(msgs.length).toBeGreaterThanOrEqual(1);
  });

  it("「インデックスをリセット」ボタンが表示される", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("インデックスをリセット")).toBeInTheDocument();
  });
});
