import { useEffect } from "react";
import {
  IconBell,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconGitPullRequest,
  IconUser,
  IconCircleCheck,
  IconCircleX,
  IconArrowRight,
} from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useNotificationsStore } from "../stores/notificationsStore";
import type { Notification, NotificationEventType } from "../types";

// ─── EventTypeIcon ─────────────────────────────────────────────────────────────

function EventTypeIcon({ eventType }: { eventType: NotificationEventType }) {
  const size = 14;
  switch (eventType) {
    case "ci_pass":
      return <IconCircleCheck size={size} className="text-green-400 shrink-0" />;
    case "ci_fail":
      return <IconCircleX size={size} className="text-red-400 shrink-0" />;
    case "pr_comment":
    case "pr_opened":
      return <IconGitPullRequest size={size} className="text-purple-400 shrink-0" />;
    case "issue_assigned":
      return <IconUser size={size} className="text-blue-400 shrink-0" />;
    case "conflict":
      return <IconAlertTriangle size={size} className="text-yellow-400 shrink-0" />;
    case "ai_edit":
    default:
      return <IconCircleCheck size={size} className="text-gray-400 shrink-0" />;
  }
}

// ─── RelativeTime ──────────────────────────────────────────────────────────────

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── NotificationItem ──────────────────────────────────────────────────────────

function NotificationItem({
  notification,
  onNavigate,
}: {
  notification: Notification;
  onNavigate: (id: number) => void;
}) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
      style={{
        background: notification.is_read ? "transparent" : "rgba(124,108,242,0.06)",
        borderLeft: notification.is_read ? "3px solid transparent" : "3px solid #7c6cf2",
      }}
      onClick={() => onNavigate(notification.id)}
    >
      <div className="mt-0.5">
        <EventTypeIcon eventType={notification.event_type} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium truncate"
          style={{ color: notification.is_read ? "#999" : "#e0e0e0" }}
        >
          {notification.title}
        </div>
        {notification.body && (
          <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</div>
        )}
        <div className="text-[10px] text-gray-600 mt-1">{relativeTime(notification.created_at)}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(notification.id);
        }}
        className="mt-0.5 text-gray-600 hover:text-gray-300 transition-colors shrink-0"
      >
        <IconArrowRight size={13} />
      </button>
    </div>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <IconBell size={32} className="text-gray-700 mb-3" />
      <div className="text-sm text-gray-500 mb-1">通知はありません</div>
      <div className="text-[11px] text-gray-700">
        CI 結果・PR コメント・Conflict 検知などをここで受け取れます
      </div>
    </div>
  );
}

// ─── NotificationsScreen ───────────────────────────────────────────────────────

export function NotificationsScreen() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const { notifications, unreadCount, listStatus, loadNotifications, markAllRead, navigateTo } =
    useNotificationsStore();

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
    <div className="flex-1 flex flex-col overflow-hidden">
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
          >
            <IconCheck size={11} /> MARK ALL READ
          </button>
        )}
      </div>

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
