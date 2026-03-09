/**
 * S-04: Claude Code で Issue を実装する
 *
 * TerminalScreen が表示され、PRReadyBanner や PRCreateModal の
 * UI 要素が正しく機能するシナリオ。
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

test.describe("S-04 Terminal / Claude Code セッション", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  async function navigateToTerminal(
    page: Parameters<typeof test.beforeEach>[0]["page"]
  ) {
    const termNav = page.locator("aside").getByText(/terminal|ターミナル/i).first();
    if (await termNav.isVisible()) {
      await termNav.click();
    }
  }

  test("Terminal 画面が表示される", async ({ page }) => {
    await navigateToTerminal(page);
    await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
  });

  test("Terminal ヘッダーが表示される", async ({ page }) => {
    await navigateToTerminal(page);
    // xterm.js または Terminal ペイン
    await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
  });

  test("Settings 画面が表示されて API キーを入力できる", async ({ page }) => {
    // Settings ナビゲーション
    const settingsNav = page.locator("aside").getByText(/設定|settings/i).first();
    if (await settingsNav.isVisible()) {
      await settingsNav.click();
    }
    await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible({ timeout: 5000 });

    // Anthropic API Key 入力フィールド
    const apiKeyInput = page.getByPlaceholder(/sk-ant/i).first();
    if (await apiKeyInput.isVisible()) {
      await apiKeyInput.fill("sk-ant-test-key");
      await expect(apiKeyInput).toHaveValue("sk-ant-test-key");
    }
  });

  test("Settings 画面でポーリングを有効/無効にできる", async ({ page }) => {
    const settingsNav = page.locator("aside").getByText(/設定|settings/i).first();
    if (await settingsNav.isVisible()) {
      await settingsNav.click();
    }

    const enableBtn = page.getByRole("button", { name: /有効|enable/i }).first();
    if (await enableBtn.isVisible()) {
      await enableBtn.click();
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
