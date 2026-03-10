import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "./lib/ipc";
import { Sidebar } from "./components/layout/Sidebar";
import { SetupScreen } from "./screens/SetupScreen";
import { EditorScreen } from "./screens/EditorScreen";
import { IssuesScreen } from "./screens/IssuesScreen";
import { ConflictScreen } from "./screens/ConflictScreen";
import { NotificationsScreen } from "./screens/NotificationsScreen";
import { PRScreen } from "./screens/PRScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TerminalScreen } from "./screens/TerminalScreen";
import { useProjectStore } from "./stores/projectStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import { useNotificationsStore } from "./stores/notificationsStore";
import { useConflictStore } from "./stores/conflictStore";
import { usePrStore } from "./stores/prStore";
import { useTerminalStore } from "./stores/terminalStore";
import type { TerminalDonePayload } from "./types";

export default function App() {
  const { currentScreen } = useUiStore();
  const { fetchProjects, selectProject } = useProjectStore();
  const { fetchTheme } = useSettingsStore();
  const { listenEvents: listenNotificationEvents } = useNotificationsStore();
  const { listenEvents: listenTerminalEvents, onTerminalDone } = useTerminalStore();
  const { listenSyncDone: listenPrSyncDone } = usePrStore();

  // 起動時の初期化
  useEffect(() => {
    ipc.startupCleanup().catch(() => {});
    fetchTheme();

    // イベントリスナー
    const unlistenNotifications = listenNotificationEvents();
    const unlistenTerminal = listenTerminalEvents();
    const unlistenPrSync = listenPrSyncDone();

    // git_pull_done → コンフリクト自動検出
    let unlistenGitPullDone: (() => void) | undefined;
    listen<{ project_id: number; has_conflicts: boolean }>("git_pull_done", (ev) => {
      const projectId = useProjectStore.getState().currentProject?.id;
      if (ev.payload.has_conflicts && ev.payload.project_id === projectId) {
        useUiStore.getState().setConflictBadge(true);
        useConflictStore.getState().scanConflicts(ev.payload.project_id);
        // 通知を作成
        ipc.notificationPush(
          ev.payload.project_id,
          "conflict",
          "コンフリクトが検出されました",
          "git pull でコンフリクトが発生しました。解決してください。",
          "conflict",
        ).catch(() => {});
      }
    }).then((fn) => { unlistenGitPullDone = fn; });

    // terminal_done → has_doc_changes なら選択中 PR を自動更新（U-05）
    let unlistenTerminalDone: (() => void) | undefined;
    listen<TerminalDonePayload>("terminal_done", (ev) => {
      onTerminalDone(ev.payload);
      if (ev.payload.has_doc_changes) {
        const { selectedPrId, selectPr } = usePrStore.getState();
        const projectId = useProjectStore.getState().currentProject?.id;
        if (selectedPrId != null && projectId != null) {
          selectPr(selectedPrId, projectId);
        }
      }
    }).then((fn) => { unlistenTerminalDone = fn; });

    fetchProjects().then(() => {
      // プロジェクトが 1 件以上あれば最初のを選択
      const { projects } = useProjectStore.getState();
      if (projects.length > 0 && !useProjectStore.getState().currentProject) {
        selectProject(projects[0]);
        useUiStore.getState().navigate("editor");
      }
    });

    return () => {
      unlistenNotifications();
      unlistenTerminal();
      unlistenPrSync();
      unlistenTerminalDone?.();
      unlistenGitPullDone?.();
    };
  }, []);

  const renderScreen = () => {
    switch (currentScreen) {
      case "setup":
        return <SetupScreen />;
      case "editor":
        return <EditorScreen />;
      case "issues":
        return <IssuesScreen />;
      case "pr":
        return <PRScreen />;
      case "search":
        return <SearchScreen />;
      case "terminal":
        return <TerminalScreen />;
      case "settings":
        return <SettingsScreen />;
      case "conflict":
        return <ConflictScreen />;
      case "notifications":
        return <NotificationsScreen />;
      default:
        return (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#666",
              fontSize: 15,
            }}
          >
            {currentScreen} — 実装予定
          </div>
        );
    }
  };

  return (
    <div
      data-testid="app-root"
      style={{
        display: "flex",
        height: "100vh",
        background: "#13131f",
        color: "#e0e0e0",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <Sidebar />
      <main style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {renderScreen()}
      </main>
    </div>
  );
}
