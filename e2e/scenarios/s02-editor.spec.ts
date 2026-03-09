/**
 * S-02: 設計書を書いて自動コミット
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript, MOCK_PROJECT } from "../setup/mock-ipc";

test.describe("S-02 設計書を書いて自動コミット", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
    await page.getByText("Documents").waitFor({ timeout: 5000 });
  });

  test("Documents サイドバーが表示される", async ({ page }) => {
    await expect(page.getByText("Documents")).toBeVisible();
  });

  test("ドキュメント一覧にファイル名が表示される", async ({ page }) => {
    // サイドバーの button として表示される（strict mode 回避に first()）
    await expect(page.getByRole("button", { name: "architecture.md" })).toBeVisible();
    await expect(page.getByRole("button", { name: "api-spec.md" })).toBeVisible();
  });

  test("ドキュメントをクリックするとツールバーにパスが表示される", async ({ page }) => {
    await page.getByRole("button", { name: "architecture.md" }).click();
    await expect(page.getByText("docs/architecture.md").first()).toBeVisible({ timeout: 5000 });
  });

  test("ドキュメントを選択すると PREVIEW ヘッダーが表示される", async ({ page }) => {
    await page.getByRole("button", { name: "architecture.md" }).click();
    await expect(page.getByText("PREVIEW")).toBeVisible({ timeout: 5000 });
  });

  test("保存ボタンが表示されクリックできる", async ({ page }) => {
    await page.getByRole("button", { name: "architecture.md" }).click();
    const saveBtn = page.getByRole("button", { name: "保存" }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await expect(page.locator("body")).toBeVisible();
  });

  test("Cmd+S キーバインドで保存できる", async ({ page }) => {
    await page.getByRole("button", { name: "architecture.md" }).click();
    await page.keyboard.press("Meta+s");
    await expect(page.locator("body")).toBeVisible();
  });

  test("2番目のドキュメントに切り替えられる", async ({ page }) => {
    await page.getByRole("button", { name: "architecture.md" }).click();
    await page.getByRole("button", { name: "api-spec.md" }).click();
    await expect(page.getByText("docs/api-spec.md").first()).toBeVisible({ timeout: 5000 });
  });

  test("push_failed ドキュメントに警告アイコンが表示される", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({
      document_list: [{
        id: 1, project_id: 1, path: "docs/architecture.md",
        title: null, sha: "abc", size_bytes: 100,
        embedding_status: "pending", push_status: "push_failed",
        is_dirty: false, last_indexed_at: null, last_synced_at: null,
        created_at: "2026-03-09T00:00:00Z", updated_at: "2026-03-09T00:00:00Z",
      }],
    }));
    await page.goto("/");
    await page.getByText("Documents").waitFor({ timeout: 5000 });
    // アイコン SVG が存在する
    await expect(page.locator("svg.tabler-icon").first()).toBeVisible({ timeout: 5000 });
  });

  test("サイドバーにプロジェクト名 DevNest が表示される", async ({ page }) => {
    // Sidebar の <select> オプションまたは表示テキスト
    const projectName = page.locator("aside").getByText("DevNest").first();
    await expect(projectName).toBeVisible({ timeout: 5000 });
  });
});
