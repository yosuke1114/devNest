/**
 * S-03: AI に Issue を下書きさせる
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

async function gotoIssues(page: import("@playwright/test").Page) {
  await page.addInitScript(buildMockIpcScript());
  await page.goto("/");
  await page.locator("aside").getByRole("button", { name: "Issues", exact: true }).click();
  await page.waitForTimeout(200);
}

test.describe("S-03 AI に Issue を下書きさせる", () => {
  test("Issues 画面に Issue タイトルが表示される", async ({ page }) => {
    await gotoIssues(page);
    await expect(page.getByText("feat: Auto git-commit on save")).toBeVisible({ timeout: 5000 });
  });

  test("Issue #43 の番号が表示される", async ({ page }) => {
    await gotoIssues(page);
    await expect(page.getByText(/#43/).first()).toBeVisible({ timeout: 5000 });
  });

  test("Issue をクリックすると IssueDetail に #43 が表示される", async ({ page }) => {
    await gotoIssues(page);
    await page.getByText("feat: Auto git-commit on save").click();
    await expect(page.getByText(/#43/).first()).toBeVisible({ timeout: 5000 });
  });

  test("Issue 詳細に Markdown 本文がレンダリングされる", async ({ page }) => {
    await gotoIssues(page);
    await page.getByText("feat: Auto git-commit on save").click();
    await expect(page.getByText(/Overview/).first()).toBeVisible({ timeout: 5000 });
  });

  test("同期ボタンが存在しクリックできる", async ({ page }) => {
    await gotoIssues(page);
    const syncBtn = page.getByRole("button", { name: /同期|sync/i }).first();
    await expect(syncBtn).toBeVisible({ timeout: 5000 });
    await syncBtn.click();
    await expect(page.locator("body")).toBeVisible();
  });

  test("+ NEW WITH AI ボタンが存在する", async ({ page }) => {
    await gotoIssues(page);
    const newBtn = page.getByRole("button", { name: /NEW WITH AI|AI/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 5000 });
  });

  test("AIウィザードに入るとテキストエリアが表示される", async ({ page }) => {
    await gotoIssues(page);
    // AI Wizard タブに切り替え
    const wizardTab = page.getByRole("button", { name: /AI Wizard/i }).first();
    await wizardTab.click();
    await page.waitForTimeout(300);
    // 既存のドラフトをクリックして選択（ドラフト選択後にフォームが表示される）
    const draftBtn = page.getByRole("button", { name: /feat: Auto git-commit|Auto git|無題/i }).first();
    if (await draftBtn.isVisible({ timeout: 2000 })) {
      await draftBtn.click();
      await page.waitForTimeout(200);
    }
    // フォーム内のテキスト入力欄（タイトル or コンテキスト）
    const textbox = page.getByRole("textbox").first();
    await expect(textbox).toBeVisible({ timeout: 5000 });
    await textbox.fill("エディタ保存時に自動でgit commitを走らせる機能を実装してほしい");
    await expect(textbox).toHaveValue("エディタ保存時に自動でgit commitを走らせる機能を実装してほしい");
  });

  test("Issue 詳細の Linked Issues セクションが表示される", async ({ page }) => {
    await gotoIssues(page);
    await page.getByText("feat: Auto git-commit on save").click();
    // IssueDetail 内に Linked Documents セクション
    await expect(page.getByText(/linked|doc|ドキュメント/i).first()).toBeVisible({ timeout: 5000 });
  });
});
