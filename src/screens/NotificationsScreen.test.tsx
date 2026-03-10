import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── store モック ──────────────────────────────────────────────────────────────
interface MockNotification {
  id: number;
  event_type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

const mockNotifications: MockNotification[] = [
  {
    id: 1,
    event_type: "ci_success",
    title: "CI passed",
    body: "All checks passed",
    is_read: false,
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: 2,
    event_type: "pr_comment",
    title: "New comment",
    body: "Looks good!",
    is_read: true,
    created_at: "2024-01-02T00:00:00Z",
  },
];

const mockProjectStore = {
  currentProject: { id: 1, name: "TestProject" } as { id: number; name: string } | null,
};

const mockNotificationsStore = {
  notifications: [] as MockNotification[],
  unreadCount: 0,
  listStatus: "idle" as string,
  permissionStatus: "default" as string,
  loadNotifications: vi.fn(),
  markAllRead: vi.fn(),
  navigateTo: vi.fn(),
  requestPermission: vi.fn(),
};

vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/notificationsStore", () => ({
  useNotificationsStore: (sel?: (s: typeof mockNotificationsStore) => unknown) =>
    sel ? sel(mockNotificationsStore) : mockNotificationsStore,
}));
vi.mock("../components/notifications/NotificationItem", () => ({
  NotificationItem: ({
    notification,
    onNavigate,
  }: {
    notification: MockNotification;
    onNavigate: (id: number) => void;
  }) => (
    <div data-testid={`notification-${notification.id}`} onClick={() => onNavigate(notification.id)}>
      {notification.title}
    </div>
  ),
}));
vi.mock("../components/notifications/EmptyState", () => ({
  EmptyState: () => <div data-testid="empty-state">通知はありません</div>,
}));
vi.mock("../components/notifications/PermissionBanner", () => ({
  PermissionBanner: () => <div data-testid="permission-banner" />,
}));

import { NotificationsScreen } from "./NotificationsScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("NotificationsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.currentProject = { id: 1, name: "TestProject" };
    mockNotificationsStore.notifications = [];
    mockNotificationsStore.unreadCount = 0;
    mockNotificationsStore.listStatus = "idle";
    mockNotificationsStore.permissionStatus = "default";
  });

  it("currentProject が null の場合「プロジェクトを選択してください」が表示される", () => {
    mockProjectStore.currentProject = null;
    render(<NotificationsScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("初期マウント時に loadNotifications が呼ばれる", () => {
    render(<NotificationsScreen />);
    expect(mockNotificationsStore.loadNotifications).toHaveBeenCalledWith(1);
  });

  it("NOTIFICATIONS ヘッダーが表示される", () => {
    render(<NotificationsScreen />);
    expect(screen.getByText("NOTIFICATIONS")).toBeInTheDocument();
  });

  it("通知一覧が表示される", () => {
    mockNotificationsStore.notifications = mockNotifications;
    render(<NotificationsScreen />);
    expect(screen.getByText("CI passed")).toBeInTheDocument();
    expect(screen.getByText("New comment")).toBeInTheDocument();
  });

  it("unreadCount > 0 のときバッジが表示される", () => {
    mockNotificationsStore.unreadCount = 3;
    render(<NotificationsScreen />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("unreadCount > 0 のとき MARK ALL READ ボタンが表示される", () => {
    mockNotificationsStore.unreadCount = 1;
    render(<NotificationsScreen />);
    expect(screen.getByText("MARK ALL READ")).toBeInTheDocument();
  });

  it("unreadCount === 0 のとき MARK ALL READ ボタンが非表示", () => {
    mockNotificationsStore.unreadCount = 0;
    render(<NotificationsScreen />);
    expect(screen.queryByText("MARK ALL READ")).not.toBeInTheDocument();
  });

  it("MARK ALL READ クリックで markAllRead が呼ばれる", () => {
    mockNotificationsStore.unreadCount = 2;
    render(<NotificationsScreen />);
    fireEvent.click(screen.getByText("MARK ALL READ"));
    expect(mockNotificationsStore.markAllRead).toHaveBeenCalledWith(1);
  });

  it("listStatus が loading の場合「読み込み中…」が表示される", () => {
    mockNotificationsStore.listStatus = "loading";
    render(<NotificationsScreen />);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("listStatus が error の場合エラーメッセージが表示される", () => {
    mockNotificationsStore.listStatus = "error";
    render(<NotificationsScreen />);
    expect(screen.getByText("通知の取得に失敗しました")).toBeInTheDocument();
  });

  it("通知 0 件で success の場合 EmptyState が表示される", () => {
    mockNotificationsStore.listStatus = "success";
    mockNotificationsStore.notifications = [];
    render(<NotificationsScreen />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("通知クリックで navigateTo が呼ばれる", () => {
    mockNotificationsStore.notifications = mockNotifications;
    render(<NotificationsScreen />);
    fireEvent.click(screen.getByTestId("notification-1"));
    expect(mockNotificationsStore.navigateTo).toHaveBeenCalledWith(1, 1);
  });

  it("PermissionBanner が表示される", () => {
    render(<NotificationsScreen />);
    expect(screen.getByTestId("permission-banner")).toBeInTheDocument();
  });
});
