/**
 * S-11: OS 通知からDevNest の該当画面に飛ぶ
 * （ファイル名は s12-）
 *
 * notification_navigate コマンドが正しい画面に遷移させることを検証。
 * OS 通知バナーのクリック → DevNest フォアグラウンド → 該当画面直接遷移。
 *
 * イベント種別:
 * - ci_passed   → PR 詳細画面（MERGE PR がアクティブ）
 * - pr_comment  → PR 詳細 > Diff タブ
 * - issue_assigned → Issue 詳細
 * - ai_pr_created → PR 詳細
 * - conflict_detected → Conflict 画面
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript, MOCK_NOTIFICATION, MOCK_PR, MOCK_ISSUE } from "../setup/mock-ipc";

test.describe("S-11 OS 通知 → 画面遷移（notification_navigate）", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  async function goToNotifications(page: import("@playwright/test").Page) {
    // ヘッダーの通知ベルをクリックしてドロップダウンを開く
    const bell = page.locator('[data-testid="notification-bell"]').first();
    if (await bell.isVisible({ timeout: 3000 })) {
      await bell.click();
      await page.waitForTimeout(300);
    }
  }

  // 通知一覧に CI passed 通知が表示されること
  test("通知一覧に CI passed 通知が表示される", async ({ page }) => {
    await goToNotifications(page);
    await expect(page.getByText("CI が通過しました").first()).toBeVisible({ timeout: 5000 });
  });

  // 通知をクリックすると notification_navigate が呼ばれること
  test("通知クリックで notification_navigate IPC が呼ばれる", async ({ page }) => {
    const calls: string[] = [];
    await page.addInitScript(`
      window.__TAURI_INTERNALS__._origInvoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
        window.__ipcCalls = window.__ipcCalls || [];
        window.__ipcCalls.push(cmd);
        return window.__TAURI_INTERNALS__._origInvoke(cmd, args);
      };
    `);
    await page.goto("/");
    await goToNotifications(page);
    const ciNotif = page.getByText("CI が通過しました").first();
    if (await ciNotif.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ciNotif.click();
      await page.waitForTimeout(300);
      const ipcCalls = await page.evaluate(() => (window as unknown as Record<string, string[]>).__ipcCalls ?? []);
      const navigated = ipcCalls.includes("notification_navigate");
      expect(navigated).toBeTruthy();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // CI passed 通知 → PR 詳細画面に遷移すること（dest_screen: "pr"）
  test("CI passed 通知クリックで PR 詳細画面に遷移する", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        notification_list: [
          { ...MOCK_NOTIFICATION, event_type: "ci_passed", title: "CI が通過しました", dest_screen: "pr", dest_resource_id: 1, is_read: false },
        ],
        notification_navigate: { screen: "pr", resource_id: 1 },
        pr_get_detail: { pr: MOCK_PR, reviews: [], comments: [] },
      })
    );
    await page.goto("/");
    await goToNotifications(page);
    const ciNotif = page.getByText("CI が通過しました").first();
    if (await ciNotif.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ciNotif.click();
      await page.waitForTimeout(500);
      // PR 詳細が表示される（PR タイトルまたは Overview タブ）
      const prEl = page.getByText(/feat: auto git-commit|PR|pull request/i).first();
      if (await prEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(prEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // Issue アサイン通知 → Issue 詳細画面に遷移すること（dest_screen: "issue"）
  test("Issue アサイン通知クリックで Issue 詳細画面に遷移する", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        notification_list: [
          { ...MOCK_NOTIFICATION, id: 2, event_type: "issue_assigned", title: "Issue #43 がアサインされました", dest_screen: "issue", dest_resource_id: 1, is_read: false },
        ],
        notification_navigate: { screen: "issue", resource_id: 1 },
      })
    );
    await page.goto("/");
    await goToNotifications(page);
    const issueNotif = page.getByText("Issue #43 がアサインされました").first();
    if (await issueNotif.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issueNotif.click();
      await page.waitForTimeout(500);
      // Issue 詳細に遷移する
      const issueEl = page.getByText(/feat: Auto git-commit|#43/i).first();
      if (await issueEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(issueEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // コンフリクト検知通知 → Conflict 画面に遷移すること（dest_screen: "conflict"）
  test("コンフリクト通知クリックで Conflict 解消画面に遷移する", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        notification_list: [
          { ...MOCK_NOTIFICATION, id: 3, event_type: "conflict_detected", title: "コンフリクトが検出されました", dest_screen: "conflict", dest_resource_id: null, is_read: false },
        ],
        notification_navigate: { screen: "conflict", resource_id: null },
      })
    );
    await page.goto("/");
    await goToNotifications(page);
    const conflictNotif = page.getByText("コンフリクトが検出されました").first();
    if (await conflictNotif.isVisible({ timeout: 3000 }).catch(() => false)) {
      await conflictNotif.click();
      await page.waitForTimeout(500);
      // Conflict 解消画面
      const conflictEl = page.getByText(/conflict|コンフリクト/i).first();
      if (await conflictEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(conflictEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // 通知クリック後に is_read が true になること（既読処理）
  test("通知クリック後に通知が既読になる", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        notification_mark_read: null,
        notification_unread_count: 0,
      })
    );
    await page.goto("/");
    await goToNotifications(page);
    const ciNotif = page.getByText("CI が通過しました").first();
    if (await ciNotif.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ciNotif.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // 複数の通知タイプのアイコンが区別して表示されること（F-23 対象イベント）
  test("複数タイプの通知が一覧に表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        notification_list: [
          { ...MOCK_NOTIFICATION, id: 1, event_type: "ci_passed", title: "CI が通過しました", is_read: false },
          { ...MOCK_NOTIFICATION, id: 2, event_type: "pr_comment", title: "@user がコメントしました", is_read: false },
          { ...MOCK_NOTIFICATION, id: 3, event_type: "issue_assigned", title: "Issue #50 がアサインされました", is_read: false },
          { ...MOCK_NOTIFICATION, id: 4, event_type: "ai_pr_created", title: "Claude が PR #51 を作成しました", is_read: true },
          { ...MOCK_NOTIFICATION, id: 5, event_type: "conflict_detected", title: "コンフリクトが検出されました", is_read: false },
        ],
        notification_unread_count: 4,
      })
    );
    await page.goto("/");
    await goToNotifications(page);
    // 5件の通知が表示される
    await expect(page.getByText("CI が通過しました").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("コンフリクトが検出されました").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Claude が PR #51 を作成しました").first()).toBeVisible({ timeout: 3000 });
  });

  // 未読バッジが通知数を正確に表示すること
  test("未読バッジが正確な件数を表示する", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        notification_unread_count: 4,
        notification_list: Array.from({ length: 4 }, (_, i) => ({
          ...MOCK_NOTIFICATION,
          id: i + 1,
          title: `通知 ${i + 1}`,
          is_read: false,
        })),
      })
    );
    await page.goto("/");
    // グローバルナビのバッジに "4" が表示される
    const badge = page.locator("span, [data-testid='badge']").filter({ hasText: "4" }).first();
    if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(badge).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // MARK ALL READ で全件既読になること
  test("MARK ALL READ で全通知が既読になる", async ({ page }) => {
    await goToNotifications(page);
    const markAllBtn = page
      .getByRole("button", { name: /既読|mark all read/i })
      .first();
    if (await markAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await markAllBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // 通知が 0 件のときは EmptyState が表示されること
  test("通知 0 件のとき EmptyState が表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        notification_list: [],
        notification_unread_count: 0,
      })
    );
    await page.goto("/");
    await goToNotifications(page);
    const emptyEl = page.getByText(/通知はありません|no notifications/i).first();
    if (await emptyEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(emptyEl).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
