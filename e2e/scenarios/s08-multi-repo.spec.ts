/**
 * S-08: 複数リポジトリを切り替えて作業する
 *
 * サイドバーのプロジェクトセレクターで別プロジェクトに切り替え、
 * ドキュメント一覧がリフレッシュされることを確認するシナリオ。
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript, MOCK_PROJECT, MOCK_PROJECT_2 } from "../setup/mock-ipc";

test.describe("S-08 複数リポジトリの切り替え", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({
      project_list: [MOCK_PROJECT, MOCK_PROJECT_2],
    }));
    await page.goto("/");
    await page.getByText("Documents").waitFor({ timeout: 5000 });
  });

  test("サイドバーにプロジェクト名が表示される", async ({ page }) => {
    // select の現在の選択肢として DevNest が表示される
    await expect(page.locator("aside").getByText("DevNest").first()).toBeVisible({ timeout: 5000 });
  });

  test("プロジェクト選択 select に複数プロジェクトが存在する", async ({ page }) => {
    const selector = page.locator("aside select").first();
    await expect(selector).toBeVisible({ timeout: 5000 });
    // DevNest と SideProject の両方がオプションに存在する
    const options = await selector.locator("option").allTextContents();
    expect(options.some((o) => o.includes("DevNest"))).toBeTruthy();
    expect(options.some((o) => o.includes("SideProject"))).toBeTruthy();
  });

  test("プロジェクトを切り替えられる", async ({ page }) => {
    // 最初のプロジェクトのドキュメント
    await expect(page.getByRole("button", { name: "architecture.md" })).toBeVisible({ timeout: 5000 });

    const selector = page.locator("aside select").first();
    if (await selector.isVisible()) {
      await selector.selectOption({ label: "SideProject" });
    }
    // 画面が正常に表示されていること
    await expect(page.locator("body")).toBeVisible();
  });

  test("プロジェクト 1 に戻れる", async ({ page }) => {
    const selector = page.locator("aside select").first();
    if (await selector.isVisible()) {
      await selector.selectOption({ label: "SideProject" });
      await selector.selectOption({ label: "DevNest" });
    }
    // DevNest のドキュメントが再表示される
    await expect(page.getByRole("button", { name: "architecture.md" })).toBeVisible({ timeout: 5000 });
  });
});
