import { beforeEach, describe, it, expect } from "vitest";
import { useUiStore } from "./uiStore";

// ─── uiStore ──────────────────────────────────────────────────────────────────

describe("uiStore", () => {
  beforeEach(() => {
    // 各テスト前に初期状態へリセット
    useUiStore.setState({
      currentScreen: "setup",
      sidebarCollapsed: false,
    });
  });

  // 🔴 Red: 初期画面が "setup" であること
  it('初期 currentScreen は "setup"', () => {
    expect(useUiStore.getState().currentScreen).toBe("setup");
  });

  // 🔴 Red: 初期状態でサイドバーは開いていること
  it("初期 sidebarCollapsed は false", () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  // 🔴 Red: navigate() で画面が切り替わること
  it('navigate("editor") で currentScreen が "editor" に変わる', () => {
    useUiStore.getState().navigate("editor");
    expect(useUiStore.getState().currentScreen).toBe("editor");
  });

  // 🔴 Red: navigate() で全画面名に遷移できること
  it.each([
    "setup", "editor", "issues", "settings",
    "terminal", "pr", "search", "notifications", "conflict",
  ] as const)('navigate("%s") が動作する', (screen) => {
    useUiStore.getState().navigate(screen);
    expect(useUiStore.getState().currentScreen).toBe(screen);
  });

  // 🔴 Red: toggleSidebar() で折りたたみ状態がトグルされること
  it("toggleSidebar() で sidebarCollapsed がトグルされる", () => {
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);

    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
  });

  // 🔴 Red: 連続 navigate() が正しく動作すること
  it("連続して navigate() しても最後の画面が保持される", () => {
    useUiStore.getState().navigate("issues");
    useUiStore.getState().navigate("pr");
    useUiStore.getState().navigate("search");
    expect(useUiStore.getState().currentScreen).toBe("search");
  });
});
