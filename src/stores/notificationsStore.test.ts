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

  // ─── requestPermission ────────────────────────────────────────────────────

  it("requestPermission() が notificationPermissionRequest を呼ぶ", async () => {
    mockIpc.notificationPermissionRequest.mockResolvedValueOnce("granted");
    await useNotificationsStore.getState().requestPermission();
    expect(mockIpc.notificationPermissionRequest).toHaveBeenCalledTimes(1);
  });

  it("requestPermission() 成功後に permissionStatus が 'granted' になる", async () => {
    mockIpc.notificationPermissionRequest.mockResolvedValueOnce("granted");
    await useNotificationsStore.getState().requestPermission();
    expect(useNotificationsStore.getState().permissionStatus).toBe("granted");
  });

  // ─── navigateTo ───────────────────────────────────────────────────────────

  it("navigateTo() が対象通知を見つけられない場合は何もしない", async () => {
    useNotificationsStore.setState({ notifications: [] });
    // 例外が発生しないこと
    await useNotificationsStore.getState().navigateTo(1, 999);
    expect(mockIpc.notificationMarkRead).not.toHaveBeenCalled();
    expect(mockIpc.notificationNavigate).not.toHaveBeenCalled();
  });

  it("navigateTo() が未読通知を markRead する", async () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 5, is_read: false })],
      unreadCount: 1,
    });
    mockIpc.notificationMarkRead.mockResolvedValueOnce(undefined);
    mockIpc.notificationNavigate.mockResolvedValueOnce({ screen: "pr", resource_id: null });

    await useNotificationsStore.getState().navigateTo(1, 5);

    expect(mockIpc.notificationMarkRead).toHaveBeenCalledWith(5);
  });

  it("navigateTo() が既読通知では markRead を呼ばない", async () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 5, is_read: true })],
      unreadCount: 0,
    });
    mockIpc.notificationNavigate.mockResolvedValueOnce({ screen: "pr", resource_id: null });

    await useNotificationsStore.getState().navigateTo(1, 5);

    expect(mockIpc.notificationMarkRead).not.toHaveBeenCalled();
  });

  it("navigateTo() が notificationNavigate を呼ぶ", async () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 7, is_read: true })],
    });
    mockIpc.notificationNavigate.mockResolvedValueOnce({ screen: "notifications", resource_id: null });

    await useNotificationsStore.getState().navigateTo(1, 7);

    expect(mockIpc.notificationNavigate).toHaveBeenCalledWith(7);
  });

  it("navigateTo() が navigate ターゲットの画面に遷移する", async () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 8, is_read: true })],
    });
    mockIpc.notificationNavigate.mockResolvedValueOnce({ screen: "conflict", resource_id: null });

    await useNotificationsStore.getState().navigateTo(1, 8);

    expect(useUiStore.getState().currentScreen).toBe("conflict");
  });

  it("navigateTo() が null を返した場合は遷移しない", async () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 9, is_read: true })],
    });
    mockIpc.notificationNavigate.mockResolvedValueOnce(null as never);

    await useNotificationsStore.getState().navigateTo(1, 9);

    // currentScreen は setup のまま（navigate は呼ばれない）
    expect(useUiStore.getState().currentScreen).toBe("setup");
  });

  it("navigateTo() で screen=pr かつ resource_id が null の場合も pr に遷移する", async () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 10, is_read: true })],
    });
    mockIpc.notificationNavigate.mockResolvedValueOnce({ screen: "pr", resource_id: null });

    await useNotificationsStore.getState().navigateTo(1, 10);

    expect(useUiStore.getState().currentScreen).toBe("pr");
  });

  it("navigateTo() で screen=pr かつ resource_id がある場合 prList を取得して selectPr を呼ぶ", async () => {
    useNotificationsStore.setState({
      notifications: [makeNotification({ id: 11, is_read: true })],
    });
    mockIpc.notificationNavigate.mockResolvedValueOnce({ screen: "pr", resource_id: 44 });
    mockIpc.prList.mockResolvedValueOnce([
      {
        id: 1,
        project_id: 1,
        github_number: 44,
        github_id: 1044,
        title: "feat: auto",
        body: "",
        state: "open",
        head_branch: "feat/44",
        base_branch: "main",
        author_login: "user",
        checks_status: "passing",
        linked_issue_number: null,
        draft: false,
        merged_at: null,
        github_created_at: "2026-01-01T00:00:00Z",
        github_updated_at: "2026-01-01T00:00:00Z",
        synced_at: "2026-01-01T00:00:00Z",
      },
    ]);

    // prStore mock の selectPr を確認できるよう取得
    const { usePrStore } = await import("./prStore");
    const mockSelectPr = vi.fn();
    vi.mocked(usePrStore.getState).mockReturnValueOnce({
      selectPr: mockSelectPr,
    } as never);

    await useNotificationsStore.getState().navigateTo(1, 11);

    expect(mockIpc.prList).toHaveBeenCalledWith(1);
    expect(mockSelectPr).toHaveBeenCalledWith(1, 1);
    expect(useUiStore.getState().currentScreen).toBe("pr");
  });
});
