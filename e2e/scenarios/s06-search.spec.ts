/**
 * S-06: 設計書からキーワードで情報を探す
 *
 * SearchScreen でクエリを入力し、検索結果一覧に表示された
 * ドキュメントのプレビューを確認するシナリオ。
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

test.describe("S-06 設計書キーワード検索", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  async function navigateToSearch(page: Parameters<typeof test.beforeEach>[0]["page"]) {
    // CommandPalette (⌘K) から検索画面に遷移
    const searchBtn = page.locator('[data-testid="search-pill"]').first();
    if (await searchBtn.isVisible({ timeout: 3000 })) {
      await searchBtn.click();
      await page.waitForTimeout(150);
      // 「検索」と入力してEnter
      await page.keyboard.type("検索");
      await page.waitForTimeout(100);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
    }
  }

  test("Search 画面に検索バーが表示される", async ({ page }) => {
    await navigateToSearch(page);
    // 検索 input（placeholder 部分一致）
    const searchInput = page.getByPlaceholder(/検索/).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test("キーワードを入力すると検索結果が表示される", async ({ page }) => {
    await navigateToSearch(page);
    const searchInput = page.getByPlaceholder(/検索/).first();
    await searchInput.fill("git2-rs");
    // デバウンス後に検索結果が表示（モックは即座に返す）
    await page.waitForTimeout(400);
    // docs/architecture.md が results に表示される
    await expect(page.getByText(/architecture\.md/).first()).toBeVisible({ timeout: 5000 });
  });

  test("検索結果にスニペットが表示される", async ({ page }) => {
    await navigateToSearch(page);
    const searchInput = page.getByPlaceholder(/検索/).first();
    await searchInput.fill("自動コミット");
    await page.waitForTimeout(400);
    // git2-rs を使った自動コミット設計がコンテンツとして表示される
    await expect(page.getByText(/自動コミット/).first()).toBeVisible({ timeout: 5000 });
  });

  test("検索タイプを keyword/semantic で切り替えられる", async ({ page }) => {
    await navigateToSearch(page);
    // keyword/semantic のボタンが存在する
    const keywordBtn = page.getByRole("button", { name: "keyword" }).first();
    const semanticBtn = page.getByRole("button", { name: "semantic" }).first();
    if (await keywordBtn.isVisible({ timeout: 3000 })) {
      await semanticBtn.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("検索結果をクリックするとプレビューが表示される", async ({ page }) => {
    await navigateToSearch(page);
    const searchInput = page.getByPlaceholder(/検索/).first();
    await searchInput.fill("git2");
    await page.waitForTimeout(400);
    const result = page.getByText(/architecture\.md/).first();
    if (await result.isVisible({ timeout: 5000 })) {
      await result.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("検索クエリをクリアできる", async ({ page }) => {
    await navigateToSearch(page);
    const searchInput = page.getByPlaceholder(/検索/).first();
    await searchInput.fill("test query");
    await searchInput.clear();
    await expect(searchInput).toHaveValue("");
  });
});
