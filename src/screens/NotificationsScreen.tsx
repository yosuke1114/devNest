import { useEffect } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useNotificationsStore } from "../stores/notificationsStore";
import { NotificationItem } from "../components/notifications/NotificationItem";
import { EmptyState } from "../components/notifications/EmptyState";
import { PermissionBanner } from "../components/notifications/PermissionBanner";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

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
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div data-testid="notifications-screen" className="flex-1 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">NOTIFICATIONS</span>
            {unreadCount > 0 && (
              <Badge className="px-1.5 py-0.5 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead(currentProject.id)}
            data-testid="notifications-mark-all-read"
            className="h-7 px-2.5 text-xs flex items-center gap-1.5"
          >
            <IconCheck size={11} /> MARK ALL READ
          </Button>
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
          <div className="p-4 text-xs text-muted-foreground text-center">読み込み中…</div>
        )}
        {listStatus === "error" && (
          <div className="flex items-center gap-2 px-4 py-3 bg-destructive/20 border-b border-destructive/40 text-xs text-destructive">
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
