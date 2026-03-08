import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NotificationItem } from "./NotificationItem";
import type { Notification } from "../../types";

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    project_id: 10,
    event_type: "ci_pass",
    title: "CI passed",
    body: "All checks passed",
    is_read: false,
    dest_screen: null,
    dest_resource_id: null,
    os_notified: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("NotificationItem", () => {
  it("notification.title を表示する", () => {
    render(<NotificationItem notification={makeNotification()} onNavigate={vi.fn()} />);
    expect(screen.getByText("CI passed")).toBeInTheDocument();
  });

  it("notification.body がある場合に表示する", () => {
    render(<NotificationItem notification={makeNotification({ body: "Build #42 succeeded" })} onNavigate={vi.fn()} />);
    expect(screen.getByText("Build #42 succeeded")).toBeInTheDocument();
  });

  it("notification.body が null の場合に表示しない", () => {
    render(<NotificationItem notification={makeNotification({ body: null })} onNavigate={vi.fn()} />);
    expect(screen.queryByText("All checks passed")).not.toBeInTheDocument();
  });

  it('is_read=false のとき未読スタイル (data-unread="true") を持つ', () => {
    render(<NotificationItem notification={makeNotification({ is_read: false })} onNavigate={vi.fn()} />);
    const el = screen.getByTestId("notification-item");
    expect(el).toHaveAttribute("data-unread", "true");
  });

  it('is_read=true のとき既読スタイル (data-unread="false") を持つ', () => {
    render(<NotificationItem notification={makeNotification({ is_read: true })} onNavigate={vi.fn()} />);
    const el = screen.getByTestId("notification-item");
    expect(el).toHaveAttribute("data-unread", "false");
  });

  it("クリックで onNavigate(notification.id) が呼ばれる", () => {
    const onNavigate = vi.fn();
    render(<NotificationItem notification={makeNotification({ id: 7 })} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId("notification-item"));
    expect(onNavigate).toHaveBeenCalledWith(7);
  });

  it("矢印ボタンクリックでも onNavigate(notification.id) が呼ばれる", () => {
    const onNavigate = vi.fn();
    render(<NotificationItem notification={makeNotification({ id: 7 })} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId("notification-arrow"));
    expect(onNavigate).toHaveBeenCalledWith(7);
  });
});
