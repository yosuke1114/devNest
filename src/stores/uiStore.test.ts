import { beforeEach, describe, it, expect } from "vitest";
import { useUiStore } from "./uiStore";
import type { Modal } from "../types";

function resetStore() {
  useUiStore.getState().reset();
}

describe("uiStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("初期状態", () => {
    it("currentScreen が setup", () => {
      expect(useUiStore.getState().currentScreen).toBe("setup");
    });

    it("previousScreen / navigateParams が null", () => {
      const s = useUiStore.getState();
      expect(s.previousScreen).toBeNull();
      expect(s.navigateParams).toBeNull();
    });

    it("sidebarCollapsed が false", () => {
      expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    });

    it("setupStep が 0", () => {
      expect(useUiStore.getState().setupStep).toBe(0);
    });

    it("activeModal / _modalResolve が null", () => {
      const s = useUiStore.getState();
      expect(s.activeModal).toBeNull();
      expect(s._modalResolve).toBeNull();
    });

    it("フラグ系が false / 0", () => {
      const s = useUiStore.getState();
      expect(s.isProjectSwitching).toBe(false);
      expect(s.conflictBadge).toBe(false);
      expect(s.indexingInProgress).toBe(false);
      expect(s.indexProgress).toBe(0);
    });
  });

  describe("navigate", () => {
    it("currentScreen を変更し previousScreen に前の画面をセットする", () => {
      useUiStore.getState().navigate("editor");
      const s = useUiStore.getState();
      expect(s.currentScreen).toBe("editor");
      expect(s.previousScreen).toBe("setup");
    });

    it("params なしで navigateParams が null", () => {
      useUiStore.getState().navigate("issues");
      expect(useUiStore.getState().navigateParams).toBeNull();
    });

    it("params あり で navigateParams がセットされる", () => {
      const params = { issueId: 42 };
      useUiStore.getState().navigate("issues", params);
      expect(useUiStore.getState().navigateParams).toEqual(params);
    });

    it("複数回遷移しても previousScreen は直前の画面", () => {
      useUiStore.getState().navigate("editor");
      useUiStore.getState().navigate("pr");
      expect(useUiStore.getState().currentScreen).toBe("pr");
      expect(useUiStore.getState().previousScreen).toBe("editor");
    });

    it.each([
      "setup", "editor", "issues", "settings",
      "terminal", "pr", "search", "notifications", "conflict",
    ] as const)('navigate("%s") が動作する', (screen) => {
      useUiStore.getState().navigate(screen);
      expect(useUiStore.getState().currentScreen).toBe(screen);
    });
  });

  describe("navigateBack", () => {
    it("previousScreen に戻り previousScreen が null になる", () => {
      useUiStore.getState().navigate("editor");
      useUiStore.getState().navigateBack();
      const s = useUiStore.getState();
      expect(s.currentScreen).toBe("setup");
      expect(s.previousScreen).toBeNull();
      expect(s.navigateParams).toBeNull();
    });

    it("previousScreen が null のときは何もしない", () => {
      useUiStore.getState().navigateBack();
      expect(useUiStore.getState().currentScreen).toBe("setup");
    });
  });

  describe("toggleSidebar", () => {
    it("false → true に切り替わる", () => {
      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    });

    it("true → false に戻る", () => {
      useUiStore.getState().toggleSidebar();
      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe("setSetupStep", () => {
    it("setupStep を変更できる", () => {
      useUiStore.getState().setSetupStep(2);
      expect(useUiStore.getState().setupStep).toBe(2);
    });
  });

  describe("showModal / closeModal", () => {
    const modal: Modal = { id: "confirm", props: { title: "確認", message: "削除しますか？" } };

    it("showModal で activeModal がセットされる", () => {
      useUiStore.getState().showModal(modal);
      expect(useUiStore.getState().activeModal).toEqual(modal);
    });

    it("closeModal で activeModal が null になる", () => {
      useUiStore.getState().showModal(modal);
      useUiStore.getState().closeModal("ok");
      expect(useUiStore.getState().activeModal).toBeNull();
    });

    it("closeModal の result が Promise で解決される", async () => {
      const promise = useUiStore.getState().showModal(modal);
      useUiStore.getState().closeModal("confirmed");
      const result = await promise;
      expect(result).toBe("confirmed");
    });

    it("result 省略時は 'cancel' で解決される", async () => {
      const promise = useUiStore.getState().showModal(modal);
      useUiStore.getState().closeModal();
      const result = await promise;
      expect(result).toBe("cancel");
    });

    it("closeModal 後は _modalResolve が null", () => {
      useUiStore.getState().showModal(modal);
      useUiStore.getState().closeModal();
      expect(useUiStore.getState()._modalResolve).toBeNull();
    });
  });

  describe("setProjectSwitching", () => {
    it("true にできる", () => {
      useUiStore.getState().setProjectSwitching(true);
      expect(useUiStore.getState().isProjectSwitching).toBe(true);
    });

    it("false に戻せる", () => {
      useUiStore.getState().setProjectSwitching(true);
      useUiStore.getState().setProjectSwitching(false);
      expect(useUiStore.getState().isProjectSwitching).toBe(false);
    });
  });

  describe("setConflictBadge", () => {
    it("true にできる", () => {
      useUiStore.getState().setConflictBadge(true);
      expect(useUiStore.getState().conflictBadge).toBe(true);
    });
  });

  describe("setIndexProgress", () => {
    it("indexProgress をセットできる", () => {
      useUiStore.getState().setIndexProgress(75);
      expect(useUiStore.getState().indexProgress).toBe(75);
    });
  });

  describe("setIndexingInProgress", () => {
    it("true にできる", () => {
      useUiStore.getState().setIndexingInProgress(true);
      expect(useUiStore.getState().indexingInProgress).toBe(true);
    });
  });

  describe("reset", () => {
    it("全状態を初期値に戻す", () => {
      const modal: Modal = { id: "confirm", props: { title: "test", message: "?" } };
      useUiStore.getState().navigate("editor");
      useUiStore.getState().toggleSidebar();
      useUiStore.getState().setSetupStep(3);
      useUiStore.getState().showModal(modal);
      useUiStore.getState().setProjectSwitching(true);
      useUiStore.getState().setConflictBadge(true);
      useUiStore.getState().setIndexProgress(50);
      useUiStore.getState().setIndexingInProgress(true);

      useUiStore.getState().reset();
      const s = useUiStore.getState();
      expect(s.currentScreen).toBe("setup");
      expect(s.previousScreen).toBeNull();
      expect(s.sidebarCollapsed).toBe(false);
      expect(s.setupStep).toBe(0);
      expect(s.activeModal).toBeNull();
      expect(s._modalResolve).toBeNull();
      expect(s.isProjectSwitching).toBe(false);
      expect(s.conflictBadge).toBe(false);
      expect(s.indexProgress).toBe(0);
      expect(s.indexingInProgress).toBe(false);
    });
  });
});
