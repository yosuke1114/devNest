import { memo, useCallback, useEffect, useRef, useState } from "react";
import { IconBell } from "@tabler/icons-react";
import { useNotificationsStore } from "../../stores/notificationsStore";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import type { Notification } from "../../types";

// ─── Notification category colors ───────────────────────────────────────────

const CATEGORY_COLOR: Record<string, string> = {
  vulnerability: "#ef4444",
  agent: "#7c6af7",
  doc_staleness: "#eab308",
  github_event: "#22c55e",
};

function getCategoryColor(eventType: string): string {
  if (eventType.includes("vuln") || eventType.includes("conflict")) return CATEGORY_COLOR.vulnerability;
  if (eventType.includes("agent") || eventType.includes("ai_")) return CATEGORY_COLOR.agent;
  if (eventType.includes("doc") || eventType.includes("stale")) return CATEGORY_COLOR.doc_staleness;
  return CATEGORY_COLOR.github_event;
}

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "今";
  if (mins < 60) return `${mins}分前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}時間前`;
  return `${Math.floor(hrs / 24)}日前`;
}

// ─── NotificationItem ────────────────────────────────────────────────────────

interface NotificationItemProps {
  notification: Notification;
  projectId: number;
}

const NotificationItem = memo(function NotificationItem({
  notification: n,
  projectId,
}: NotificationItemProps) {
  const color = getCategoryColor(n.event_type);

  const handleClick = useCallback(() => {
    useNotificationsStore.getState().navigateTo(projectId, n.id);
  }, [projectId, n.id]);

  return (
    <button
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        padding: "10px 14px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid #2a2a3f",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1e1e32"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      {/* colored dot */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: n.is_read ? "transparent" : color,
          border: n.is_read ? "1px solid #444" : "none",
          flexShrink: 0,
          marginTop: 4,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600, color: "#e0e0e0", marginBottom: 2 }}>
          {n.title}
        </div>
        {n.body ? (
          <div style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {n.body}
          </div>
        ) : null}
        <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>
          {relativeTime(n.created_at)}
        </div>
      </div>
    </button>
  );
});

// ─── NotificationPanel ───────────────────────────────────────────────────────

interface NotificationPanelProps {
  onClose: () => void;
}

function NotificationPanel({ onClose }: NotificationPanelProps) {
  const notifications = useNotificationsStore((s) => s.notifications);
  const currentProject = useProjectStore((s) => s.currentProject);
  const projectId = currentProject?.id ?? 0;

  const handleMarkAllRead = useCallback(() => {
    if (projectId) {
      useNotificationsStore.getState().markAllRead(projectId);
    }
  }, [projectId]);

  const handleSettings = useCallback(() => {
    onClose();
    useUiStore.getState().navigate("settings");
  }, [onClose]);

  return (
    <div
      style={{
        position: "absolute",
        top: 48,
        right: 8,
        width: 360,
        maxHeight: 480,
        background: "#1e1e32",
        border: "1px solid #2a2a3f",
        borderRadius: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        zIndex: 1001,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid #2a2a3f",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14 }}>通知</span>
        <button
          onClick={handleMarkAllRead}
          style={{
            background: "none",
            border: "none",
            color: "#7c6af7",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          すべて既読にする
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {notifications.length === 0 ? (
          <div style={{ padding: 20, color: "#666", fontSize: 13, textAlign: "center" }}>
            通知はありません
          </div>
        ) : (
          notifications.slice(0, 20).map((n) => (
            <NotificationItem key={n.id} notification={n} projectId={projectId} />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #2a2a3f", flexShrink: 0 }}>
        <button
          onClick={handleSettings}
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "none",
            border: "none",
            color: "#7c6af7",
            fontSize: 12,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          設定 &gt; 通知 で配信ルールを管理 →
        </button>
      </div>
    </div>
  );
}

// ─── NotificationBell ────────────────────────────────────────────────────────

interface NotificationBellProps {
  unreadCount: number;
  onToggle: () => void;
}

const NotificationBell = memo(function NotificationBell({
  unreadCount,
  onToggle,
}: NotificationBellProps) {
  return (
    <button
      data-testid="notification-bell"
      onClick={onToggle}
      style={{
        position: "relative",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#e0e0e0",
        padding: "6px",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
      }}
    >
      <IconBell size={20} />
      {unreadCount > 0 ? (
        <span
          data-testid="notification-badge"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: "#ef4444",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
          }}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
});

// ─── Header ──────────────────────────────────────────────────────────────────

interface HeaderProps {
  onOpenCommandPalette: () => void;
}

export const Header = memo(function Header({ onOpenCommandPalette }: HeaderProps) {
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleLogoClick = useCallback(() => {
    useUiStore.getState().navigate("home");
  }, []);

  const handleTogglePanel = useCallback(() => {
    setPanelOpen((prev) => !prev);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  // ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenCommandPalette();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onOpenCommandPalette]);

  return (
    <header
      style={{
        height: 44,
        flexShrink: 0,
        background: "#0f0f1e",
        borderBottom: "1px solid #2a2a3f",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        position: "relative",
        zIndex: 100,
      }}
    >
      {/* Left: Logo */}
      <button
        onClick={handleLogoClick}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 16,
          color: "#7c6af7",
          letterSpacing: -0.5,
          padding: "0 4px",
        }}
      >
        DevNest
      </button>

      {/* Center: Search pill */}
      <button
        onClick={onOpenCommandPalette}
        data-testid="search-pill"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#1e1e32",
          border: "1px solid #2a2a3f",
          borderRadius: 20,
          padding: "4px 16px",
          color: "#888",
          cursor: "pointer",
          fontSize: 13,
          minWidth: 200,
        }}
      >
        <span>🔍</span>
        <span>検索...</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#555" }}>⌘K</span>
      </button>

      {/* Right: Notification bell */}
      <div ref={panelRef} style={{ position: "relative" }}>
        <NotificationBell unreadCount={unreadCount} onToggle={handleTogglePanel} />
        {panelOpen ? <NotificationPanel onClose={() => setPanelOpen(false)} /> : null}
      </div>
    </header>
  );
});
