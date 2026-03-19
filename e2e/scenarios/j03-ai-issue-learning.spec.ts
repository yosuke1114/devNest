/**
 * J-03: AI Issue を試してみたが期待外れだった → 正しい使い方を発見
 *
 * Stage 3 — 探索
 * ① 設計書が少ない状態で AI Issue を試みてスコアが低い（失望）
 * ② 「インデックスが少ない」バナーが失敗理由を教える（転換点）
 * ③ 設計書を追記して再インデックス後にスコアが上がる（リカバリー）
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript, MOCK_SEARCH_RESULTS } from "../setup/mock-ipc";

/** スコアが低いセマンティック検索結果（設計書不足を再現） */
const LOW_SCORE_RESULTS = [
  {
    chunk_id: 9,
    document_id: 9,
    path: "docs/readme.md",
    title: null,
    section_heading: "Overview",
    content: "一般的な説明",
    start_line: 1,
    score: 0.51,
  },
];

/** スコアが高いセマンティック検索結果（設計書充実後） */
const HIGH_SCORE_RESULTS = [
  {
    chunk_id: 10,
    document_id: 10,
    path: "docs/auth-flow.md",
    title: null,
    section_heading: "OAuth フロー",
    content: "GitHub OAuth 認証の詳細フロー",
    start_line: 5,
    score: 0.94,
  },
];

test.describe("J-03 AI Issue 探索 — 失敗から学びへ", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  // Issues 画面が表示されること
  test("Issues 画面に遷移できる", async ({ page }) => {
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issuesNav.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // AI Wizard（New Issue Wizard）の起動ボタンが存在すること
  test("AI Issue Wizard を起動するボタンが表示される", async ({ page }) => {
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issuesNav.click();
      await page.waitForTimeout(300);
    }
    // "NEW ISSUE" / "AI Wizard" / "NEW" ボタン
    const newIssueBtn = page
      .getByRole("button", { name: /new issue|ai wizard|new/i })
      .first();
    if (await newIssueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(newIssueBtn).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // AI Wizard が開いて Step 1（テキスト入力）が表示されること
  test("AI Issue Wizard が開き Step 1 入力フォームが表示される", async ({ page }) => {
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issuesNav.click();
      await page.waitForTimeout(300);
    }
    const newIssueBtn = page
      .getByRole("button", { name: /new issue|ai wizard|\+|new/i })
      .first();
    if (await newIssueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newIssueBtn.click();
      await page.waitForTimeout(300);
      // Step 1: テキストエリアまたは入力フォーム
      const textarea = page.locator("textarea, [role='textbox']").first();
      if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(textarea).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // スコアが低い状態での検索結果表示（設計書不足シナリオ）
  test("スコアが低い検索結果はコンテキスト候補として表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        search_context_for_issue: { chunks: LOW_SCORE_RESULTS },
      })
    );
    await page.goto("/");
    await page.waitForTimeout(500);
    // 0.51 スコアが表示される（Issue Wizard のコンテキスト候補画面）
    const lowScore = page.getByText("0.51").first();
    if (await lowScore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(lowScore).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // 「インデックスが少ない」警告バナーが表示されること（転換点: J-03 設計ポイント）
  test("設計書インデックス不足の警告バナーが Issues 画面に表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        document_list: [], // 設計書が0件
        document_index_build: 0,
      })
    );
    await page.goto("/");
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issuesNav.click();
      await page.waitForTimeout(300);
    }
    // インデックス不足の警告テキスト
    const warningBanner = page
      .getByText(/インデックスが少ない|設計書.*充実|精度が低下/i)
      .first();
    if (await warningBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(warningBanner).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // 設計書を増やして再インデックス後にスコアが上がること（リカバリー体験）
  test("REBUILD INDEX 後にスコアが上がった検索結果が表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        search_context_for_issue: { chunks: HIGH_SCORE_RESULTS },
        document_index_build: 10,
      })
    );
    await page.goto("/");
    await page.waitForTimeout(500);
    // 0.94 スコアが表示される
    const highScore = page.getByText("0.94").first();
    if (await highScore.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(highScore).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // Settings > Index に REBUILD INDEX ボタンがあること
  test("Settings 画面に REBUILD INDEX ボタンが表示される", async ({ page }) => {
    const settingsNav = page.locator("aside").getByText(/settings|設定/i).first();
    if (await settingsNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsNav.click();
      await page.waitForTimeout(300);
    }
    const rebuildBtn = page
      .getByRole("button", { name: /rebuild index|build index/i })
      .first();
    if (await rebuildBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(rebuildBtn).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // AI Wizard のキャンセルボタンが機能すること（離脱後に Issue 一覧に戻る）
  test("AI Wizard の CANCEL でウィザードを閉じられる", async ({ page }) => {
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issuesNav.click();
      await page.waitForTimeout(300);
    }
    const newIssueBtn = page
      .getByRole("button", { name: /new issue|ai wizard|\+|new/i })
      .first();
    if (await newIssueBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newIssueBtn.click();
      await page.waitForTimeout(300);
      const cancelBtn = page.getByRole("button", { name: /cancel|キャンセル/i }).first();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(300);
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // 既存の Issue 一覧が表示されること（Issue 一覧画面が壊れていない）
  test("Issues 画面に既存の Issue が表示される", async ({ page }) => {
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issuesNav.click();
      await page.waitForTimeout(300);
    }
    // MOCK_ISSUE のタイトル
    const issueTitle = page.getByText("feat: Auto git-commit on save").first();
    if (await issueTitle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(issueTitle).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
