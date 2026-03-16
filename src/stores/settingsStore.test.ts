import { beforeEach, describe, it, expect, vi } from "vitest";
import { useSettingsStore } from "./settingsStore";
import * as ipc from "../lib/ipc";

vi.mock("../lib/ipc");
const mockIpc = vi.mocked(ipc);

describe("settingsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      theme: "system",
      authStatus: null,
      authStatus2: "idle",
      clientId: "",
      clientSecret: "",
      anthropicApiKey: "",
      error: null,
    });
  });

  // ─── 初期状態 ───────────────────────────────────────────────────────────────

  it("初期状態が正しい", () => {
    const s = useSettingsStore.getState();
    expect(s.theme).toBe("system");
    expect(s.authStatus).toBeNull();
    expect(s.clientId).toBe("");
  });

  // ─── setClientId / setClientSecret / setAnthropicApiKey ──────────────────

  it("setClientId() で clientId が更新される", () => {
    useSettingsStore.getState().setClientId("my-client-id");
    expect(useSettingsStore.getState().clientId).toBe("my-client-id");
  });

  it("setClientSecret() で clientSecret が更新される", () => {
    useSettingsStore.getState().setClientSecret("secret123");
    expect(useSettingsStore.getState().clientSecret).toBe("secret123");
  });

  it("setAnthropicApiKey() で anthropicApiKey が更新される", () => {
    useSettingsStore.getState().setAnthropicApiKey("sk-ant-xxx");
    expect(useSettingsStore.getState().anthropicApiKey).toBe("sk-ant-xxx");
  });

  // ─── fetchTheme ────────────────────────────────────────────────────────────

  it("fetchTheme() が settingsGet('app.theme') を呼ぶ", async () => {
    mockIpc.settingsGet.mockResolvedValueOnce(null);
    await useSettingsStore.getState().fetchTheme();
    expect(mockIpc.settingsGet).toHaveBeenCalledWith("app.theme");
  });

  it("fetchTheme() で保存済みテーマが読み込まれる", async () => {
    mockIpc.settingsGet.mockResolvedValueOnce(JSON.stringify("dark"));
    await useSettingsStore.getState().fetchTheme();
    expect(useSettingsStore.getState().theme).toBe("dark");
  });

  it("fetchTheme() で設定なし（null）のとき theme は変わらない", async () => {
    mockIpc.settingsGet.mockResolvedValueOnce(null);
    await useSettingsStore.getState().fetchTheme();
    expect(useSettingsStore.getState().theme).toBe("system");
  });

  // ─── setTheme ─────────────────────────────────────────────────────────────

  it("setTheme() が settingsSet を呼ぶ", async () => {
    mockIpc.settingsSet.mockResolvedValueOnce(undefined);
    await useSettingsStore.getState().setTheme("dark");
    expect(mockIpc.settingsSet).toHaveBeenCalledWith({
      key: "app.theme",
      value: JSON.stringify("dark"),
    });
  });

  it("setTheme() で theme が即座に更新される", async () => {
    mockIpc.settingsSet.mockResolvedValueOnce(undefined);
    await useSettingsStore.getState().setTheme("light");
    expect(useSettingsStore.getState().theme).toBe("light");
  });

  // ─── fetchAuthStatus ──────────────────────────────────────────────────────

  it("fetchAuthStatus() が githubAuthStatus を呼ぶ", async () => {
    mockIpc.githubAuthStatus.mockResolvedValueOnce({
      connected: true,
      user_login: "octocat",
      avatar_url: "https://example.com/avatar",
    });
    await useSettingsStore.getState().fetchAuthStatus(1);
    expect(mockIpc.githubAuthStatus).toHaveBeenCalledWith(1);
  });

  it("fetchAuthStatus() 成功時に authStatus がセットされる", async () => {
    const status = { connected: true, user_login: "octocat", avatar_url: null };
    mockIpc.githubAuthStatus.mockResolvedValueOnce(status);

    await useSettingsStore.getState().fetchAuthStatus(1);

    expect(useSettingsStore.getState().authStatus).toEqual(status);
    expect(useSettingsStore.getState().authStatus2).toBe("success");
  });

  it("fetchAuthStatus() 失敗時に authStatus2 が 'error' になる", async () => {
    mockIpc.githubAuthStatus.mockRejectedValueOnce({ code: "GitHub", message: "error" });

    await useSettingsStore.getState().fetchAuthStatus(1);

    expect(useSettingsStore.getState().authStatus2).toBe("error");
  });

  // ─── revokeAuth ───────────────────────────────────────────────────────────

  it("revokeAuth() が githubAuthRevoke を呼ぶ", async () => {
    mockIpc.githubAuthRevoke.mockResolvedValueOnce(undefined);
    await useSettingsStore.getState().revokeAuth(1);
    expect(mockIpc.githubAuthRevoke).toHaveBeenCalledWith(1);
  });

  it("revokeAuth() 後に authStatus が disconnected になる", async () => {
    useSettingsStore.setState({
      authStatus: { connected: true, user_login: "octocat", avatar_url: null },
    });
    mockIpc.githubAuthRevoke.mockResolvedValueOnce(undefined);

    await useSettingsStore.getState().revokeAuth(1);

    expect(useSettingsStore.getState().authStatus?.connected).toBe(false);
    expect(useSettingsStore.getState().authStatus?.user_login).toBeNull();
  });

  // ─── saveGithubCredentials ────────────────────────────────────────────────

  it("saveGithubCredentials() が clientId と clientSecret を保存する", async () => {
    useSettingsStore.setState({ clientId: "cid", clientSecret: "csec" });
    mockIpc.settingsSet.mockResolvedValue(undefined);

    await useSettingsStore.getState().saveGithubCredentials(1);

    expect(mockIpc.settingsSet).toHaveBeenCalledWith({
      key: "github.client_id",
      value: JSON.stringify("cid"),
    });
    expect(mockIpc.settingsSet).toHaveBeenCalledWith({
      key: "github.client_secret",
      value: JSON.stringify("csec"),
    });
  });

  // ─── saveAnthropicKey ─────────────────────────────────────────────────────

  it("saveAnthropicKey() が anthropicApiKey を保存する", async () => {
    useSettingsStore.setState({ anthropicApiKey: "sk-ant-test" });
    mockIpc.settingsSet.mockResolvedValueOnce(undefined);

    await useSettingsStore.getState().saveAnthropicKey();

    expect(mockIpc.settingsSet).toHaveBeenCalledWith({
      key: "anthropic.api_key",
      value: JSON.stringify("sk-ant-test"),
    });
  });

  // ─── loadCredentials ──────────────────────────────────────────────────────

  it("loadCredentials() が 3 つの設定キーを読み込む", async () => {
    mockIpc.settingsGet
      .mockResolvedValueOnce(JSON.stringify("my-client-id"))
      .mockResolvedValueOnce(JSON.stringify("my-secret"))
      .mockResolvedValueOnce(JSON.stringify("sk-ant-key"));

    await useSettingsStore.getState().loadCredentials();

    expect(useSettingsStore.getState().clientId).toBe("my-client-id");
    expect(useSettingsStore.getState().clientSecret).toBe("my-secret");
    expect(useSettingsStore.getState().anthropicApiKey).toBe("sk-ant-key");
  });

  it("loadCredentials() で設定なし（null）のとき空文字になる", async () => {
    mockIpc.settingsGet.mockResolvedValue(null);

    await useSettingsStore.getState().loadCredentials();

    expect(useSettingsStore.getState().clientId).toBe("");
    expect(useSettingsStore.getState().clientSecret).toBe("");
    expect(useSettingsStore.getState().anthropicApiKey).toBe("");
  });

  it("listenAuthDone() 失敗ペイロードで error がセットされ onError が呼ばれる", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    let capturedCb: ((ev: unknown) => void) | undefined;
    vi.mocked(listen).mockImplementationOnce(async (_event, cb) => {
      capturedCb = cb as (ev: unknown) => void;
      return vi.fn();
    });

    const onError = vi.fn();
    await useSettingsStore.getState().listenAuthDone(1, onError);

    capturedCb?.({ payload: { success: false, error: "token expired" } });

    expect(useSettingsStore.getState().error?.message).toBe("token expired");
    expect(onError).toHaveBeenCalledWith("token expired");
  });

  it("listenAuthDone() error フィールドなしの失敗でデフォルトメッセージ", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    let capturedCb: ((ev: unknown) => void) | undefined;
    vi.mocked(listen).mockImplementationOnce(async (_event, cb) => {
      capturedCb = cb as (ev: unknown) => void;
      return vi.fn();
    });

    await useSettingsStore.getState().listenAuthDone(1);
    capturedCb?.({ payload: { success: false } });

    expect(useSettingsStore.getState().error?.message).toBe("認証に失敗しました");
  });

  it("reset() で全状態が初期値に戻る", () => {
    useSettingsStore.setState({
      theme: "dark",
      authStatus: { connected: true, user_login: "alice", avatar_url: null },
      authStatus2: "success",
      clientId: "cid",
      clientSecret: "cs",
      anthropicApiKey: "key",
      error: { code: "GitHub", message: "err" } as never,
    });

    useSettingsStore.getState().reset();
    const s = useSettingsStore.getState();
    expect(s.theme).toBe("system");
    expect(s.authStatus).toBeNull();
    expect(s.authStatus2).toBe("idle");
    expect(s.clientId).toBe("");
    expect(s.clientSecret).toBe("");
    expect(s.anthropicApiKey).toBe("");
    expect(s.error).toBeNull();
  });

  it("setTheme('light') で dark クラスが除去される", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.settingsSet.mockResolvedValueOnce(undefined);
    document.documentElement.classList.add("dark");

    await useSettingsStore.getState().setTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme('system') で matchMedia に基づいてクラスが設定される", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.settingsSet.mockResolvedValueOnce(undefined);
    // JSDOM には matchMedia がないため stub する
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    await useSettingsStore.getState().setTheme("system");
    expect(useSettingsStore.getState().theme).toBe("system");
  });
});
