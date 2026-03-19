import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// ─── Tauri API モック ──────────────────────────────────────────────────────────
// テスト環境では Tauri ランタイムが存在しないため、モジュールごとスタブ化する。

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  requestPermission: vi.fn(() => Promise.resolve("granted")),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    create: vi.fn(),
    sidecar: vi.fn(),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

// ─── Browser API ポリフィル ─────────────────────────────────────────────────
// JSDOM に存在しない Web API をスタブ化する
if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  };
}
