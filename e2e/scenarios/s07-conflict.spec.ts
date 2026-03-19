/**
 * S-07: Pull したらコンフリクトが起きた
 *
 * ConflictScreen でコンフリクトファイル一覧を表示し、
 * ブロック単位で解消して SAVE & MERGE を実行するシナリオ。
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

test.describe("S-07 コンフリクト解消", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  async function navigateToConflict(page: Parameters<typeof test.beforeEach>[0]["page"]) {
    // GitHub アコーディオンを展開してからコンフリクトをクリック
    const githubBtn = page.locator("aside").getByRole("button", { name: "GitHub" }).first();
    if (await githubBtn.isVisible({ timeout: 3000 })) {
      await githubBtn.click();
      await page.waitForTimeout(150);
    }
    const conflictNav = page.locator("aside").getByText("コンフリクト").first();
    if (await conflictNav.isVisible()) {
      await conflictNav.click();
      await page.waitForTimeout(300);
    }
  }

  test("Conflict 画面が表示される", async ({ page }) => {
    await navigateToConflict(page);
    await expect(page.getByText("CONFLICT RESOLUTION")).toBeVisible({ timeout: 5000 });
  });

  test("コンフリクトファイル名が表示される", async ({ page }) => {
    await navigateToConflict(page);
    // ConflictFileListItem は basename を表示（docs/architecture.md → architecture.md）
    await expect(page.getByText("architecture.md").first()).toBeVisible({ timeout: 5000 });
  });

  test("ファイルを選択すると USE ALL MINE ボタンが表示される", async ({ page }) => {
    await navigateToConflict(page);
    // ファイルリストアイテムをクリック（button 要素）
    const fileItem = page.getByRole("button", { name: /architecture\.md/ }).first();
    if (await fileItem.isVisible({ timeout: 3000 })) {
      await fileItem.click();
    }
    const mineBtn = page.getByRole("button", { name: "USE ALL MINE" }).first();
    await expect(mineBtn).toBeVisible({ timeout: 5000 });
  });

  test("ファイルを選択すると USE ALL THEIRS ボタンが表示される", async ({ page }) => {
    await navigateToConflict(page);
    const fileItem = page.getByRole("button", { name: /architecture\.md/ }).first();
    if (await fileItem.isVisible({ timeout: 3000 })) {
      await fileItem.click();
    }
    const theirsBtn = page.getByRole("button", { name: "USE ALL THEIRS" }).first();
    await expect(theirsBtn).toBeVisible({ timeout: 5000 });
  });

  test("SAVE & MERGE ボタンが存在する", async ({ page }) => {
    await navigateToConflict(page);
    const saveBtn = page.getByRole("button", { name: /SAVE & MERGE/i }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
  });
});
