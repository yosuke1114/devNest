import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../lib/ipc";
import type { AppError, AsyncStatus, GitHubAuthStatus } from "../types";

interface SettingsState {
  theme: "system" | "light" | "dark";
  authStatus: GitHubAuthStatus | null;
  authStatus2: AsyncStatus;
  clientId: string;
  clientSecret: string;
  anthropicApiKey: string;
  error: AppError | null;

  // テーマ
  fetchTheme: () => Promise<void>;
  setTheme: (theme: "system" | "light" | "dark") => Promise<void>;

  // GitHub 認証
  fetchAuthStatus: (projectId: number) => Promise<void>;
  startAuth: (projectId: number) => Promise<void>;
  revokeAuth: (projectId: number) => Promise<void>;
  listenAuthDone: (projectId: number, onError?: (msg: string) => void) => Promise<() => void>;

  // API キー設定
  setClientId: (value: string) => void;
  setClientSecret: (value: string) => void;
  setAnthropicApiKey: (value: string) => void;
  saveGithubCredentials: (projectId: number) => Promise<void>;
  saveAnthropicKey: () => Promise<void>;
  loadCredentials: () => Promise<void>;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: "system",
  authStatus: null,
  authStatus2: "idle",
  clientId: "",
  clientSecret: "",
  anthropicApiKey: "",
  error: null,

  fetchTheme: async () => {
    const raw = await ipc.settingsGet("app.theme");
    if (raw) {
      const parsed = JSON.parse(raw) as "system" | "light" | "dark";
      set({ theme: parsed });
      applyTheme(parsed);
    }
  },

  setTheme: async (theme) => {
    set({ theme });
    applyTheme(theme);
    await ipc.settingsSet({ key: "app.theme", value: JSON.stringify(theme) });
  },

  fetchAuthStatus: async (projectId) => {
    set({ authStatus2: "loading" });
    try {
      const status = await ipc.githubAuthStatus(projectId);
      set({ authStatus: status, authStatus2: "success" });
    } catch (e) {
      set({ authStatus2: "error", error: e as AppError });
    }
  },

  startAuth: async (projectId) => {
    try {
      await ipc.githubAuthStart(projectId);
    } catch (e) {
      set({ error: e as AppError });
      throw e;
    }
  },

  revokeAuth: async (projectId) => {
    try {
      await ipc.githubAuthRevoke(projectId);
      set({ authStatus: { connected: false, user_login: null, avatar_url: null } });
    } catch (e) {
      set({ error: e as AppError });
      throw e;
    }
  },

  listenAuthDone: async (projectId, onError) => {
    const unlisten = await listen<{ success: boolean; error?: string }>(
      "github_auth_done",
      (event) => {
        if (event.payload.success) {
          get().fetchAuthStatus(projectId);
        } else {
          const msg = event.payload.error ?? "認証に失敗しました";
          set({ error: { code: "GitHub", message: msg } });
          onError?.(msg);
        }
      }
    );
    return unlisten;
  },

  setClientId: (value) => set({ clientId: value }),
  setClientSecret: (value) => set({ clientSecret: value }),
  setAnthropicApiKey: (value) => set({ anthropicApiKey: value }),

  saveGithubCredentials: async (_projectId) => {
    const { clientId, clientSecret } = get();
    await ipc.settingsSet({
      key: "github.client_id",
      value: JSON.stringify(clientId),
    });
    await ipc.settingsSet({
      key: "github.client_secret",
      value: JSON.stringify(clientSecret),
    });
  },

  saveAnthropicKey: async () => {
    const { anthropicApiKey } = get();
    await ipc.settingsSet({
      key: "anthropic.api_key",
      value: JSON.stringify(anthropicApiKey),
    });
  },

  loadCredentials: async () => {
    const [cidRaw, csRaw, apiKeyRaw] = await Promise.all([
      ipc.settingsGet("github.client_id"),
      ipc.settingsGet("github.client_secret"),
      ipc.settingsGet("anthropic.api_key"),
    ]);
    set({
      clientId: cidRaw ? JSON.parse(cidRaw) : "",
      clientSecret: csRaw ? JSON.parse(csRaw) : "",
      anthropicApiKey: apiKeyRaw ? JSON.parse(apiKeyRaw) : "",
    });
  },

  reset: () =>
    set({
      theme: "system",
      authStatus: null,
      authStatus2: "idle",
      clientId: "",
      clientSecret: "",
      anthropicApiKey: "",
      error: null,
    }),
}));

function applyTheme(theme: "system" | "light" | "dark") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}
