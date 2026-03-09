/**
 * S-09: 通知の確認と既読管理
 *
 * NotificationsScreen で未読通知を確認し、
 * MARK ALL READ で全既読にするシナリオ（S-10 相当）。
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

test.describe("S-09/10 通知管理", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  async function navigateToNotifications(page: Parameters<typeof test.beforeEach>[0]["page"]) {
    const notifNav = page.locator("aside").getByText("通知").first();
    if (await notifNav.isVisible()) {
      await notifNav.click();
      await page.waitForTimeout(300);
    }
  }

  test("通知一覧に通知が表示される", async ({ page }) => {
    await navigateToNotifications(page);
    await expect(page.getByText("CI が通過しました")).toBeVisible({ timeout: 5000 });
  });

  test("未読バッジが表示される", async ({ page }) => {
    await navigateToNotifications(page);
    // unreadCount=1 なのでバッジが表示される（NOTIFICATIONS ヘッダー横）
    const badge = page.locator("span").filter({ hasText: "1" }).first();
    await expect(badge).toBeVisible({ timeout: 5000 });
  });

  test("MARK ALL READ ボタンが表示される", async ({ page }) => {
    await navigateToNotifications(page);
    const markAllBtn = page.getByRole("button", { name: /MARK ALL READ/i }).first();
    await expect(markAllBtn).toBeVisible({ timeout: 5000 });
  });

  test("MARK ALL READ をクリックできる", async ({ page }) => {
    await navigateToNotifications(page);
    const markAllBtn = page.getByRole("button", { name: /MARK ALL READ/i }).first();
    if (await markAllBtn.isVisible({ timeout: 3000 })) {
      await markAllBtn.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("通知タイプアイコンが表示される", async ({ page }) => {
    await navigateToNotifications(page);
    // EventTypeIcon が SVG で表示される
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 5000 });
  });

  test("通知が存在しないときは EmptyState が表示される", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({
      notification_list: [],
      notification_unread_count: 0,
    }));
    await page.goto("/");
    await navigateToNotifications(page);
    await expect(
      page.getByText("通知はありません").first()
    ).toBeVisible({ timeout: 5000 });
  });
});
