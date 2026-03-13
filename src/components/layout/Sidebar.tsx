import {
  IconAlertTriangle,
  IconBell,
  IconBooks,
  IconBrandGithub,
  IconChartBar,
  IconFileText,
  IconGitPullRequest,
  IconLayoutKanban,
  IconPlug,
  IconSearch,
  IconSettings,
  IconTerminal2,
  IconHeartRateMonitor,
  IconUsers,
} from "@tabler/icons-react";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { useNotificationsStore } from "../../stores/notificationsStore";
import { cn } from "../../lib/utils";
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
  { screen: "maintenance", label: "保守", icon: <IconHeartRateMonitor size={20} /> },
  { screen: "analytics", label: "分析", icon: <IconChartBar size={20} /> },
  { screen: "kanban", label: "かんばん", icon: <IconLayoutKanban size={20} /> },
  { screen: "mcp", label: "MCP", icon: <IconPlug size={20} /> },
  { screen: "collaboration", label: "コラボ", icon: <IconUsers size={20} /> },
  { screen: "settings", label: "設定", icon: <IconSettings size={20} /> },
];

export function Sidebar() {
  const { currentScreen, navigate, sidebarCollapsed } = useUiStore();
  const { projects, currentProject, selectProject } = useProjectStore();
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  return (
    <aside
      className="flex flex-col overflow-hidden transition-[width] duration-200 bg-background text-foreground min-h-screen"
      style={{ width: sidebarCollapsed ? 48 : 220 }}
    >
      {/* ロゴ */}
      <div className="px-3 py-4 font-bold text-lg text-primary whitespace-nowrap">
        {sidebarCollapsed ? "DN" : "DevNest"}
      </div>

      {/* プロジェクト選択 */}
      {!sidebarCollapsed && projects.length > 0 && (
        <div className="px-3 pb-2">
          <div className="text-[11px] text-muted-foreground mb-1">PROJECT</div>
          <select
            value={currentProject?.id ?? ""}
            onChange={(e) => {
              const p = projects.find((p) => p.id === Number(e.target.value));
              if (p) selectProject(p);
            }}
            className="w-full bg-secondary text-foreground border border-border rounded px-2 py-1 text-[13px]"
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
          className="mx-3 mb-2 px-2 py-1.5 bg-primary text-primary-foreground rounded text-[13px] cursor-pointer"
        >
          + プロジェクト追加
        </button>
      )}

      {/* ナビゲーション */}
      <nav className="flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = currentScreen === item.screen;
          return (
            <button
              key={item.screen}
              data-testid={`nav-${item.screen}`}
              onClick={() => navigate(item.screen)}
              className={cn(
                "flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-[14px] whitespace-nowrap transition-colors",
                isActive
                  ? "bg-secondary text-primary border-l-[3px] border-primary"
                  : "text-secondary-foreground border-l-[3px] border-transparent hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <span className="relative">
                {item.icon}
                {item.screen === "notifications" && unreadCount > 0 && (
                  <span
                    data-testid="nav-notifications-badge-dot"
                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary block"
                  />
                )}
              </span>
              {!sidebarCollapsed && item.label}
              {!sidebarCollapsed && item.screen === "notifications" && unreadCount > 0 && (
                <span
                  data-testid="nav-notifications-badge"
                  className="ml-auto px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold"
                >
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* プロジェクト追加（下部） */}
      {!sidebarCollapsed && projects.length > 0 && (
        <button
          onClick={() => navigate("setup")}
          className="mx-3 my-2 px-2 py-1.5 bg-transparent text-muted-foreground border border-border rounded text-[12px] flex items-center gap-1.5 cursor-pointer hover:text-foreground hover:border-border/80 transition-colors"
        >
          <IconBooks size={14} />
          プロジェクト管理
        </button>
      )}
    </aside>
  );
}
