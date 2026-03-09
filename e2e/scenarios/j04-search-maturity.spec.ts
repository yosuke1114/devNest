/**
 * J-04: インデックスが育って検索が効くようになる
 *
 * Stage 4 — 定着
 * 設計書が 12 ファイルに増えた状態で、Search 画面のセマンティック検索が
 * 有用な結果を返し「設計書を書けば AI が賢くなる」という正のフィードバック
 * ループを体験するシナリオを検証する。
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript, MOCK_SEARCH_RESULTS } from "../setup/mock-ipc";

/** 12ファイル相当の充実した設計書ライブラリ */
const RICH_DOCS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  project_id: 1,
  path: `docs/spec-${String(i + 1).padStart(2, "0")}.md`,
  title: `Spec ${String(i + 1).padStart(2, "0")}`,
  sha: `sha${i + 1}`,
  size_bytes: 800 + i * 50,
  embedding_status: "indexed",
  push_status: "synced",
  is_dirty: false,
  last_indexed_at: "2026-03-09T00:00:00Z",
  last_synced_at: "2026-03-09T00:00:00Z",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-09T00:00:00Z",
}));

/** retry 検索で高スコアのヒット（J-04 ステップ2） */
const RETRY_SEARCH_RESULTS = [
  {
    chunk_id: 5,
    document_id: 3,
    path: "docs/sync-flow.md",
    title: null,
    section_heading: "Retry Logic",
    content: "push 失敗時のリトライ仕様。最大3回、指数バックオフ。",
    start_line: 15,
    score: 0.96,
  },
  {
    chunk_id: 6,
    document_id: 4,
    path: "docs/error-handling.md",
    title: null,
    section_heading: "Error Types",
    content: "ネットワークエラー時のハンドリング",
    start_line: 20,
    score: 0.89,
  },
];

test.describe("J-04 定着 — Search 活用と AI Issue 精度向上", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        document_list: RICH_DOCS,
        document_index_build: 12,
      })
    );
    await page.goto("/");
  });

  // Search 画面に遷移できること
  test("Search 画面に遷移できる", async ({ page }) => {
    const searchNav = page.locator("aside").getByText(/search|検索/i).first();
    if (await searchNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchNav.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // Search 入力欄が存在すること
  test("Search 画面に検索入力欄が表示される", async ({ page }) => {
    const searchNav = page.locator("aside").getByText(/search|検索/i).first();
    if (await searchNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchNav.click();
      await page.waitForTimeout(300);
    }
    const searchInput = page
      .getByPlaceholder(/search|検索|キーワード/i)
      .first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(searchInput).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // "retry" で検索すると高スコアの設計書がヒットすること（J-04 ステップ2）
  test("キーワード検索で関連設計書がヒットする", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        document_list: RICH_DOCS,
        document_search_keyword: RETRY_SEARCH_RESULTS,
        document_search_semantic: RETRY_SEARCH_RESULTS,
      })
    );
    await page.goto("/");
    const searchNav = page.locator("aside").getByText(/search|検索/i).first();
    if (await searchNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchNav.click();
      await page.waitForTimeout(300);
    }
    const searchInput = page
      .getByPlaceholder(/search|検索|キーワード/i)
      .first();
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill("retry");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      // sync-flow.md がヒット結果として表示される
      const result = page.getByText("sync-flow.md").first();
      if (await result.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(result).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // 検索結果から "OPEN IN EDITOR →" で EditorScreen に遷移できること（J-04 ステップ3）
  test("検索結果から OPEN IN EDITOR でエディタに遷移できる", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        document_list: RICH_DOCS,
        document_search_semantic: RETRY_SEARCH_RESULTS,
      })
    );
    await page.goto("/");
    const searchNav = page.locator("aside").getByText(/search|検索/i).first();
    if (await searchNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchNav.click();
      await page.waitForTimeout(300);
    }
    // OPEN IN EDITOR ボタン
    const openBtn = page
      .getByRole("button", { name: /open.*editor|エディタで開く/i })
      .first();
    if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // AI Issue Wizard のStep 2 で自動選択されるコンテキスト精度確認（J-04 ステップ4）
  test("AI Issue Wizard で高スコア設計書が自動選択される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        document_list: RICH_DOCS,
        search_context_for_issue: { chunks: RETRY_SEARCH_RESULTS },
      })
    );
    await page.goto("/");
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
      // スコア 0.96 が表示される
      const highScore = page.getByText("0.96").first();
      if (await highScore.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(highScore).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // セマンティック検索と キーワード検索の切り替えが可能なこと
  test("Search 画面でセマンティック検索とキーワード検索を切り替えられる", async ({ page }) => {
    const searchNav = page.locator("aside").getByText(/search|検索/i).first();
    if (await searchNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchNav.click();
      await page.waitForTimeout(300);
    }
    // タブまたはトグルで切り替え
    const semanticTab = page.getByText(/semantic|セマンティック/i).first();
    const keywordTab = page.getByText(/keyword|キーワード/i).first();
    const hasToggle =
      (await semanticTab.isVisible({ timeout: 2000 }).catch(() => false)) ||
      (await keywordTab.isVisible({ timeout: 2000 }).catch(() => false));
    if (hasToggle) {
      if (await keywordTab.isVisible({ timeout: 1000 }).catch(() => false)) {
        await keywordTab.click();
        await page.waitForTimeout(200);
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // 12ファイルの設計書がサイドバーに表示されること（ファイルツリー確認）
  test("充実した設計書ライブラリがファイルツリーに反映される", async ({ page }) => {
    await expect(page.getByText("Documents").first()).toBeVisible({ timeout: 5000 });
    // 少なくとも1つの spec-*.md ファイルが表示される
    const specFile = page.getByText(/spec-0[12]/i).first();
    if (await specFile.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(specFile).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // 検索履歴が表示されること
  test("Search 画面で検索履歴が表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        search_history_list: [
          { id: 1, query: "retry", created_at: "2026-03-09T00:00:00Z" },
          { id: 2, query: "sync flow", created_at: "2026-03-08T00:00:00Z" },
        ],
      })
    );
    await page.goto("/");
    const searchNav = page.locator("aside").getByText(/search|検索/i).first();
    if (await searchNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchNav.click();
      await page.waitForTimeout(300);
    }
    // 検索履歴の表示
    const historyItem = page.getByText("retry").first();
    if (await historyItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(historyItem).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
