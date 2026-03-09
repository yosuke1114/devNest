/**
 * S-01: 新プロジェクトの登録
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

test.describe("S-01 新プロジェクトの登録", () => {
  test("プロジェクトが 0 件のとき SetupScreen のステップ表示がある", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({ project_list: [] }));
    await page.goto("/");
    // SetupScreen: "Project" ステップラベルが表示される
    await expect(page.getByText("Project").first()).toBeVisible({ timeout: 5000 });
  });

  test("Step 1: プロジェクト名 input が存在する", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({ project_list: [] }));
    await page.goto("/");
    const nameInput = page.getByPlaceholder("MyApp").first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });

  test("Step 1: パス input が存在する", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({ project_list: [] }));
    await page.goto("/");
    const pathInput = page.getByPlaceholder(/projects\/myapp/i).first();
    await expect(pathInput).toBeVisible({ timeout: 5000 });
  });

  test("プロジェクト名を入力できる", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({ project_list: [] }));
    await page.goto("/");
    const nameInput = page.getByPlaceholder("MyApp").first();
    await nameInput.fill("devnest");
    await expect(nameInput).toHaveValue("devnest");
  });

  test("プロジェクトが存在するときは EditorScreen が表示される", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
    // EditorScreen のサイドバー "Documents" が表示される
    await expect(page.getByText("Documents")).toBeVisible({ timeout: 5000 });
  });

  test("セットアップ ステップドットが表示される", async ({ page }) => {
    await page.addInitScript(buildMockIpcScript({ project_list: [] }));
    await page.goto("/");
    // SetupStepDots の aria-label="step N"
    const stepBtn = page.locator("[aria-current='step']").first();
    await expect(stepBtn).toBeVisible({ timeout: 5000 });
  });
});
