import { useEffect } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useNotificationsStore } from "../stores/notificationsStore";
import { NotificationItem } from "../components/notifications/NotificationItem";
import { EmptyState } from "../components/notifications/EmptyState";
import { PermissionBanner } from "../components/notifications/PermissionBanner";

// ─── NotificationsScreen ───────────────────────────────────────────────────────

export function NotificationsScreen() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const {
    notifications,
    unreadCount,
    listStatus,
    permissionStatus,
    loadNotifications,
    markAllRead,
    navigateTo,
    requestPermission,
  } = useNotificationsStore();

  useEffect(() => {
    if (currentProject) {
      loadNotifications(currentProject.id);
    }
  }, [currentProject?.id]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div data-testid="notifications-screen" className="flex-1 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">NOTIFICATIONS</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-700 text-white font-medium">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead(currentProject.id)}
            data-testid="notifications-mark-all-read"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
          >
            <IconCheck size={11} /> MARK ALL READ
          </button>
        )}
      </div>

      {/* Permission banner */}
      <PermissionBanner
        permissionStatus={permissionStatus}
        onRequestPermission={requestPermission}
      />

      {/* リスト */}
      <div className="flex-1 overflow-y-auto">
        {listStatus === "loading" && (
          <div className="p-4 text-xs text-gray-500 text-center">読み込み中…</div>
        )}
        {listStatus === "error" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300">
            <IconX size={12} /> 通知の取得に失敗しました
          </div>
        )}
        {listStatus === "success" && notifications.length === 0 && <EmptyState />}
        {notifications.map((n) => (
          <NotificationItem
            key={n.id}
            notification={n}
            onNavigate={(id) => navigateTo(currentProject.id, id)}
          />
        ))}
      </div>
    </div>
  );
}
