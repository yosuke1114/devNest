import { IconArrowRight } from "@tabler/icons-react";
import { EventTypeIcon } from "./EventTypeIcon";
import { relativeTime } from "../../lib/relativeTime";
import type { Notification } from "../../types";

interface NotificationItemProps {
  notification: Notification;
  onNavigate: (id: number) => void;
}

export function NotificationItem({ notification, onNavigate }: NotificationItemProps) {
  return (
    <div
      data-testid="notification-item"
      data-unread={notification.is_read ? "false" : "true"}
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
        data-testid="notification-arrow"
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
