import { create } from "zustand";
import type { ScreenName } from "../types";

interface UiState {
  currentScreen: ScreenName;
  sidebarCollapsed: boolean;
  navigate: (screen: ScreenName) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  currentScreen: "setup",
  sidebarCollapsed: false,
  navigate: (screen) => set({ currentScreen: screen }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
