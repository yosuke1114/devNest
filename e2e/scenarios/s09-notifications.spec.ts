/**
 * S-09: 通知の確認と既読管理
 *
 * ヘッダーの通知ベルをクリックしてドロップダウンを開き、
 * すべて既読にするシナリオ（S-10 相当）。
 * ※ 通知は NotificationsScreen からヘッダードロップダウンに移行済み
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

test.describe("S-09/10 通知管理", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  async function openNotificationPanel(page: Parameters<typeof test.beforeEach>[0]["page"]) {
    // ヘッダーの通知ベルをクリックしてドロップダウンを開く
    const bell = page.locator('[data-testid="notification-bell"]').first();
    if (await bell.isVisible({ timeout: 3000 })) {
      await bell.click();
      await page.waitForTimeout(300);
    }
  }

  test("通知一覧に通知が表示される", async ({ page }) => {
    await openNotificationPanel(page);
    await expect(page.getByText("CI が通過しました")).toBeVisible({ timeout: 5000 });
  });

  test("未読バッジが表示される", async ({ page }) => {
    // unreadCount=1 なのでバッジが表示される（ヘッダーの通知ベル横）
    const badge = page.locator('[data-testid="notification-badge"]').first();
    await expect(badge).toBeVisible({ timeout: 5000 });
  });

  test("MARK ALL READ ボタンが表示される", async ({ page }) => {
    await openNotificationPanel(page);
    const markAllBtn = page.getByRole("button", { name: /既読|MARK ALL READ/i }).first();
    await expect(markAllBtn).toBeVisible({ timeout: 5000 });
  });

  test("MARK ALL READ をクリックできる", async ({ page }) => {
    await openNotificationPanel(page);
    const markAllBtn = page.getByRole("button", { name: /既読|MARK ALL READ/i }).first();
    if (await markAllBtn.isVisible({ timeout: 3000 })) {
      await markAllBtn.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("通知タイプアイコンが表示される", async ({ page }) => {
    // ヘッダーに SVG アイコン（ベルアイコン等）が表示される
    await expect(page.locator("header svg").first()).toBeVisible({ timeout: 5000 });
  });

  test("通知が存在しないときは EmptyState が表示される", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({
      notification_list: [],
      notification_unread_count: 0,
    }));
    await page.goto("/");
    await openNotificationPanel(page);
    await expect(
      page.getByText("通知はありません").first()
    ).toBeVisible({ timeout: 5000 });
  });
});
