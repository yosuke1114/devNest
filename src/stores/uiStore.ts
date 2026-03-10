import { create } from "zustand";
import type { Modal, NavigateParams, ScreenName, SetupStep } from "../types";

interface UiState {
  currentScreen: ScreenName;
  previousScreen: ScreenName | null;
  navigateParams: NavigateParams | null;
  sidebarCollapsed: boolean;

  // Setup
  setupStep: SetupStep;

  // Modal system
  activeModal: Modal | null;
  _modalResolve: ((value: string) => void) | null;

  // Status indicators
  isProjectSwitching: boolean;
  conflictBadge: boolean;
  indexingInProgress: boolean;
  indexProgress: number; // 0–100

  // Actions
  navigate: (screen: ScreenName, params?: NavigateParams) => void;
  navigateBack: () => void;
  toggleSidebar: () => void;

  setSetupStep: (step: SetupStep) => void;

  showModal: (modal: Modal) => Promise<string>;
  closeModal: (result?: string) => void;

  setProjectSwitching: (v: boolean) => void;
  setConflictBadge: (v: boolean) => void;
  setIndexProgress: (progress: number) => void;
  setIndexingInProgress: (v: boolean) => void;

  reset: () => void;
}

const initialState = {
  currentScreen: "setup" as ScreenName,
  previousScreen: null as ScreenName | null,
  navigateParams: null as NavigateParams | null,
  sidebarCollapsed: false,
  setupStep: 0 as SetupStep,
  activeModal: null as Modal | null,
  _modalResolve: null as ((value: string) => void) | null,
  isProjectSwitching: false,
  conflictBadge: false,
  indexingInProgress: false,
  indexProgress: 0,
};

export const useUiStore = create<UiState>((set, get) => ({
  ...initialState,

  navigate: (screen, params) =>
    set({
      previousScreen: get().currentScreen,
      currentScreen: screen,
      navigateParams: params ?? null,
    }),

  navigateBack: () => {
    const prev = get().previousScreen;
    if (prev) {
      set({ currentScreen: prev, previousScreen: null, navigateParams: null });
    }
  },

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setSetupStep: (step) => set({ setupStep: step }),

  showModal: (modal) => {
    return new Promise<string>((resolve) => {
      set({ activeModal: modal, _modalResolve: resolve });
    });
  },

  closeModal: (result) => {
    const resolve = get()._modalResolve;
    if (resolve) resolve(result ?? "cancel");
    set({ activeModal: null, _modalResolve: null });
  },

  setProjectSwitching: (v) => set({ isProjectSwitching: v }),
  setConflictBadge: (v) => set({ conflictBadge: v }),
  setIndexProgress: (progress) => set({ indexProgress: progress }),
  setIndexingInProgress: (v) => set({ indexingInProgress: v }),

  reset: () => set({ ...initialState, _modalResolve: null }),
}));
