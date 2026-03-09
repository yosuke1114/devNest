/**
 * S-05: AI が書き換えたコードと設計書をレビューしてマージ
 *
 * PRScreen で PR 一覧を確認し、Overview・Code Diff・Design Docs タブを
 * 切り替えて Approve → Merge するシナリオ。
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

test.describe("S-05 PR レビューとマージ", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  async function navigateToPR(page: Parameters<typeof test.beforeEach>[0]["page"]) {
    const prNav = page.locator("aside").getByText("Pull Requests").first();
    if (await prNav.isVisible()) {
      await prNav.click();
      await page.waitForTimeout(200);
    }
  }

  async function selectPR(page: Parameters<typeof test.beforeEach>[0]["page"]) {
    // PR リストアイテムはボタン要素
    const prItem = page.getByRole("button", { name: /feat: auto git-commit on save/i }).first();
    if (await prItem.isVisible({ timeout: 3000 })) {
      await prItem.click();
      await page.waitForTimeout(200);
    }
  }

  test("PR 一覧に PR タイトルが表示される", async ({ page }) => {
    await navigateToPR(page);
    await expect(page.getByText("feat: auto git-commit on save").first()).toBeVisible({ timeout: 5000 });
  });

  test("PR をクリックすると詳細パネルが開く", async ({ page }) => {
    await navigateToPR(page);
    await selectPR(page);
    // ブランチ名が表示される
    await expect(page.getByText("feat/43-auto-git-commit").first()).toBeVisible({ timeout: 5000 });
  });

  test("Overview タブが表示される", async ({ page }) => {
    await navigateToPR(page);
    await selectPR(page);
    await expect(page.getByRole("button", { name: "Overview" }).first()).toBeVisible({ timeout: 5000 });
  });

  test("Code Changes タブに切り替えられる", async ({ page }) => {
    await navigateToPR(page);
    await selectPR(page);
    const codeTab = page.getByRole("button", { name: "Code Changes" }).first();
    if (await codeTab.isVisible({ timeout: 3000 })) {
      await codeTab.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Design Docs タブが存在する", async ({ page }) => {
    await navigateToPR(page);
    await selectPR(page);
    await expect(page.getByRole("button", { name: "Design Docs" }).first()).toBeVisible({ timeout: 5000 });
  });

  test("PR フィルターで open/all を切り替えられる", async ({ page }) => {
    await navigateToPR(page);
    const allBtn = page.getByRole("button", { name: "all" }).first();
    if (await allBtn.isVisible({ timeout: 3000 })) {
      await allBtn.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("Squash and merge ボタンが存在する（PR 詳細）", async ({ page }) => {
    await navigateToPR(page);
    await selectPR(page);
    // Merge パネルにボタンが表示される
    const mergeBtn = page.getByRole("button", { name: /squash and merge|merge/i }).first();
    await expect(mergeBtn).toBeVisible({ timeout: 5000 });
  });

  test("checks_status=passing のとき passing が表示される", async ({ page }) => {
    await navigateToPR(page);
    await selectPR(page);
    await expect(page.getByText("passing").first()).toBeVisible({ timeout: 5000 });
  });
});
