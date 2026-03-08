import { beforeEach, describe, it, expect, vi } from "vitest";
import { useNotificationsStore } from "./notificationsStore";
import { useUiStore } from "./uiStore";
import * as ipc from "../lib/ipc";
import type { Notification } from "../types";

vi.mock("../lib/ipc");
// prStore は複雑なので navigateTo テストでは mock する
vi.mock("./prStore", () => ({
  usePrStore: {
    getState: vi.fn(() => ({
      selectPr: vi.fn(),
    })),
  },
}));

const mockIpc = vi.mocked(ipc);

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    project_id: 1,
    event_type: "pr_comment",
    title: "New PR comment",
    body: "Someone commented on your PR",
    dest_screen: "pr",
    dest_resource_id: 42,
    is_read: false,
    os_notified: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("notificationsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationsStore.setState({
      notifications: [],
      unreadCount: 0,
      listStatus: "idle",
      permissionStatus: "unknown",
      error: null,
    });
    useUiStore.setState({ currentScreen: "setup", sidebarCollapsed: false });
  });

  // ─── 初期状態 ───────────────────────────────────────────────────────────────

  it("初期状態が正しい", () => {
    const s = useNotificationsStore.getState();
    expect(s.notifications).toEqual([]);
    expect(s.unreadCount).toBe(0);
    expect(s.listStatus).toBe("idle");
  });

  // ─── loadNotifications ────────────────────────────────────────────────────

  it("loadNotifications() が notificationList と notificationUnreadCount を呼ぶ", async () => {
    mockIpc.notificationList.mockResolvedValueOnce([]);
    mockIpc.notificationUnreadCount.mockResolvedValueOnce(0);

    await useNotificationsStore.getState().loadNotifications(1);

    expect(mockIpc.notificationList).toHaveBeenCalledWith(1);
    expect(mockIpc.notificationUnreadCount).toHaveBeenCalledWith(1);
  });

  it("loadNotifications() 成功時に notifications と unreadCount がセットされる", async () => {
    const notifs = [makeNotification({ id: 1 }), makeNotification({ id: 2 })];
    mockIpc.notificationList.mockResolvedValueOnce(notifs);
    mockIpc.notificationUnreadCount.mockResolvedValueOnce(2);

    await useNotificationsStore.getState().loadNotifications(1);

    expect(useNotificationsStore.getState().notifications).toHaveLength(2);
    expect(useNotificationsStore.getState().unreadCount).toBe(2);
    expect(useNotificationsStore.getState().listStatus).toBe("success");
  });

  it("loadNotifications() 失敗時に error がセットされる", async () => {
    mockIpc.notificationList.mockRejectedValueOnce(new Error("fail"));
    mockIpc.notificationUnreadCount.mockRejectedValueOnce(new Error("fail"));

    await useNotificationsStore.getState().loadNotifications(1);

    expect(useNotificationsStore.getState().listStatus).toBe("error");
    expect(useNotificationsStore.getState().error).toBeTruthy();
  });

  // ─── markRead ─────────────────────────────────────────────────────────────

  it("markRead() が notificationMarkRead を呼ぶ", async () => {
    mockIpc.notificationMarkRead.mockResolvedValueOnce(undefined);
    await useNotificationsStore.getState().markRead(1);
    expect(mockIpc.notificationMarkRead).toHaveBeenCalledWith(1);
  });

  it("markRead() 後に対象通知が is_read: true になる", async () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 1, is_read: false })],
      unreadCount: 1,
    });
    mockIpc.notificationMarkRead.mockResolvedValueOnce(undefined);

    await useNotificationsStore.getState().markRead(1);

    expect(useNotificationsStore.getState().notifications[0].is_read).toBe(true);
  });

  it("markRead() 後に unreadCount が 1 減る", async () => {
    useNotificationsStore.setState({ unreadCount: 3 });
    mockIpc.notificationMarkRead.mockResolvedValueOnce(undefined);

    await useNotificationsStore.getState().markRead(1);

    expect(useNotificationsStore.getState().unreadCount).toBe(2);
  });

  it("markRead() で unreadCount が 0 未満にはならない", async () => {
    useNotificationsStore.setState({ unreadCount: 0 });
    mockIpc.notificationMarkRead.mockResolvedValueOnce(undefined);

    await useNotificationsStore.getState().markRead(1);

    expect(useNotificationsStore.getState().unreadCount).toBe(0);
  });

  // ─── markAllRead ──────────────────────────────────────────────────────────

  it("markAllRead() が notificationMarkAllRead を呼ぶ", async () => {
    mockIpc.notificationMarkAllRead.mockResolvedValueOnce(undefined);
    await useNotificationsStore.getState().markAllRead(1);
    expect(mockIpc.notificationMarkAllRead).toHaveBeenCalledWith(1);
  });

  it("markAllRead() 後に全通知が is_read: true になる", async () => {
    useNotificationsStore.setState({
      notifications: [
        makeNotification({ id: 1, is_read: false }),
        makeNotification({ id: 2, is_read: false }),
      ],
      unreadCount: 2,
    });
    mockIpc.notificationMarkAllRead.mockResolvedValueOnce(undefined);

    await useNotificationsStore.getState().markAllRead(1);

    const s = useNotificationsStore.getState();
    expect(s.notifications.every((n) => n.is_read)).toBe(true);
    expect(s.unreadCount).toBe(0);
  });

  // ─── onNotificationNew ────────────────────────────────────────────────────

  it("onNotificationNew() で unreadCount が 1 増える", () => {
    useNotificationsStore.setState({ unreadCount: 2 });
    useNotificationsStore.getState().onNotificationNew({ notificationId: 99, title: "New event" });
    expect(useNotificationsStore.getState().unreadCount).toBe(3);
  });

  it("onNotificationNew() で通知がリスト先頭に追加される", () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 1 })],
    });
    useNotificationsStore.getState().onNotificationNew({ notificationId: 100, title: "Alert!" });

    const notifs = useNotificationsStore.getState().notifications;
    expect(notifs).toHaveLength(2);
    expect(notifs[0].id).toBe(100);
    expect(notifs[0].title).toBe("Alert!");
    expect(notifs[0].is_read).toBe(false);
  });

  it("onNotificationNew() で追加された通知は is_read: false", () => {
    useNotificationsStore.getState().onNotificationNew({ notificationId: 5, title: "Test" });
    expect(useNotificationsStore.getState().notifications[0].is_read).toBe(false);
  });
});
