import {
  IconAlertTriangle,
  IconBell,
  IconBooks,
  IconBrandGithub,
  IconFileText,
  IconGitPullRequest,
  IconSearch,
  IconSettings,
  IconTerminal2,
} from "@tabler/icons-react";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { useNotificationsStore } from "../../stores/notificationsStore";
import type { ScreenName } from "../../types";

interface NavItem {
  screen: ScreenName;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { screen: "editor", label: "設計書", icon: <IconFileText size={20} /> },
  { screen: "issues", label: "Issues", icon: <IconBrandGithub size={20} /> },
  { screen: "pr", label: "Pull Requests", icon: <IconGitPullRequest size={20} /> },
  { screen: "search", label: "検索", icon: <IconSearch size={20} /> },
  { screen: "terminal", label: "Terminal", icon: <IconTerminal2 size={20} /> },
  { screen: "conflict", label: "コンフリクト", icon: <IconAlertTriangle size={20} /> },
  { screen: "notifications", label: "通知", icon: <IconBell size={20} /> },
  { screen: "settings", label: "設定", icon: <IconSettings size={20} /> },
];

export function Sidebar() {
  const { currentScreen, navigate, sidebarCollapsed } = useUiStore();
  const { projects, currentProject, selectProject } = useProjectStore();
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  return (
    <aside
      style={{
        width: sidebarCollapsed ? 48 : 220,
        minHeight: "100vh",
        background: "#1a1a2e",
        color: "#e0e0e0",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s",
        overflow: "hidden",
      }}
    >
      {/* ロゴ */}
      <div
        style={{
          padding: "16px 12px",
          fontWeight: 700,
          fontSize: 18,
          color: "#7c6cf2",
          whiteSpace: "nowrap",
        }}
      >
        {sidebarCollapsed ? "DN" : "DevNest"}
      </div>

      {/* プロジェクト選択 */}
      {!sidebarCollapsed && projects.length > 0 && (
        <div style={{ padding: "0 12px 8px" }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            PROJECT
          </div>
          <select
            value={currentProject?.id ?? ""}
            onChange={(e) => {
              const p = projects.find((p) => p.id === Number(e.target.value));
              if (p) selectProject(p);
            }}
            style={{
              width: "100%",
              background: "#2a2a42",
              color: "#e0e0e0",
              border: "1px solid #3a3a52",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 13,
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* プロジェクトなし → Setup へ */}
      {!sidebarCollapsed && projects.length === 0 && (
        <button
          onClick={() => navigate("setup")}
          style={{
            margin: "0 12px 8px",
            padding: "6px 8px",
            background: "#7c6cf2",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          + プロジェクト追加
        </button>
      )}

      {/* ナビゲーション */}
      <nav style={{ flex: 1 }}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.screen}
            onClick={() => navigate(item.screen)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "10px 16px",
              background:
                currentScreen === item.screen ? "#2a2a42" : "transparent",
              color: currentScreen === item.screen ? "#7c6cf2" : "#c0c0d0",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 14,
              whiteSpace: "nowrap",
              borderLeft:
                currentScreen === item.screen
                  ? "3px solid #7c6cf2"
                  : "3px solid transparent",
            }}
          >
            <span style={{ position: "relative" }}>
              {item.icon}
              {item.screen === "notifications" && unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#7c6cf2",
                    display: "block",
                  }}
                />
              )}
            </span>
            {!sidebarCollapsed && item.label}
            {!sidebarCollapsed && item.screen === "notifications" && unreadCount > 0 && (
              <span
                style={{
                  marginLeft: "auto",
                  padding: "1px 5px",
                  borderRadius: 8,
                  background: "#7c6cf2",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* プロジェクト追加（下部） */}
      {!sidebarCollapsed && projects.length > 0 && (
        <button
          onClick={() => navigate("setup")}
          style={{
            margin: "8px 12px",
            padding: "6px 8px",
            background: "transparent",
            color: "#888",
            border: "1px solid #3a3a52",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <IconBooks size={14} />
          プロジェクト管理
        </button>
      )}
    </aside>
  );
}
