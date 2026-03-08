import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../lib/ipc";
import type { AsyncStatus, Notification } from "../types";
import { useUiStore } from "./uiStore";
import { usePrStore } from "./prStore";

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  listStatus: AsyncStatus;
  permissionStatus: "granted" | "denied" | "skipped" | "unknown";
  error: string | null;

  loadNotifications: (projectId: number) => Promise<void>;
  markRead: (notificationId: number) => Promise<void>;
  markAllRead: (projectId: number) => Promise<void>;
  navigateTo: (projectId: number, notificationId: number) => Promise<void>;
  requestPermission: () => Promise<void>;
  listenEvents: () => () => void;
  onNotificationNew: (payload: { notificationId: number; title: string }) => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  listStatus: "idle",
  permissionStatus: "unknown",
  error: null,

  loadNotifications: async (projectId) => {
    set({ listStatus: "loading", error: null });
    try {
      const [notifications, unreadCount] = await Promise.all([
        ipc.notificationList(projectId),
        ipc.notificationUnreadCount(projectId),
      ]);
      set({ notifications, unreadCount, listStatus: "success" });
    } catch (e) {
      set({ listStatus: "error", error: String(e) });
    }
  },

  markRead: async (notificationId) => {
    await ipc.notificationMarkRead(notificationId).catch(() => {});
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === notificationId ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },

  markAllRead: async (projectId) => {
    await ipc.notificationMarkAllRead(projectId).catch(() => {});
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
  },

  navigateTo: async (projectId, notificationId) => {
    const { markRead } = get();
    const notif = get().notifications.find((n) => n.id === notificationId);
    if (!notif) return;

    if (!notif.is_read) {
      await markRead(notificationId);
    }

    const target = await ipc.notificationNavigate(notificationId).catch(() => null);
    if (!target) return;

    const ui = useUiStore.getState();
    if (target.screen === "pr" && target.resource_id != null) {
      const prStore = usePrStore.getState();
      const prs = await ipc.prList(projectId).catch(() => []);
      const pr = prs.find((p) => p.github_number === target.resource_id);
      if (pr) await prStore.selectPr(pr.id, projectId);
    }

    ui.navigate(target.screen as Parameters<typeof ui.navigate>[0]);
  },

  onNotificationNew: (payload) => {
    set((s) => ({ unreadCount: s.unreadCount + 1 }));
    // 一覧先頭に仮エントリとして追加（詳細は次回 loadNotifications で補完）
    const now = new Date().toISOString();
    const stub: Notification = {
      id: payload.notificationId,
      project_id: 0,
      event_type: "ai_edit",
      title: payload.title,
      body: null,
      dest_screen: null,
      dest_resource_id: null,
      is_read: false,
      os_notified: false,
      created_at: now,
    };
    set((s) => ({ notifications: [stub, ...s.notifications] }));
  },

  requestPermission: async () => {
    const status = await ipc.notificationPermissionRequest();
    set({ permissionStatus: status as NotificationsState["permissionStatus"] });
  },

  listenEvents: () => {
    const unlisteners: (() => void)[] = [];

    listen<{ notificationId: number; title: string }>("notification_new", (ev) => {
      get().onNotificationNew(ev.payload);
    }).then((fn) => unlisteners.push(fn));

    return () => unlisteners.forEach((f) => f());
  },
}));
