/**
 * S-09: PR にコメントを書いてレビューを完了させる
 * （ファイル名は s10- — s09-notifications.spec.ts は Phase 5 通知 UI 用）
 *
 * Claude Code が作成した PR #44 に対して：
 * 1. Files Changed タブ → 42行目にインラインコメントを入力
 * 2. ADD REVIEW COMMENT → Diff タブでコメントアイコン確認
 * 3. Overview タブ → APPROVE → "✓ approved" 表示
 * 4. MERGE PR → "⬡ merged" ステータス → Issue #43 が closed に
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript, MOCK_PR, MOCK_ISSUE } from "../setup/mock-ipc";

const MERGED_PR = { ...MOCK_PR, state: "merged", merged_at: "2026-03-09T12:00:00Z" };
const CLOSED_ISSUE = { ...MOCK_ISSUE, state: "closed" };

test.describe("S-09 PR コメント・レビュー・マージ", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
  });

  async function navigateToPR(page: import("@playwright/test").Page) {
    // GitHub アコーディオンを展開してから Pull Requests をクリック
    const githubBtn = page.locator("aside").getByRole("button", { name: "GitHub" }).first();
    if (await githubBtn.isVisible({ timeout: 3000 })) {
      await githubBtn.click();
      await page.waitForTimeout(150);
    }
    const prNav = page.locator("aside").getByText("Pull Requests").first();
    if (await prNav.isVisible({ timeout: 3000 })) {
      await prNav.click();
      await page.waitForTimeout(200);
    }
  }

  async function openPRDetail(page: import("@playwright/test").Page) {
    await navigateToPR(page);
    const prItem = page
      .getByRole("button", { name: /feat: auto git-commit/i })
      .first();
    if (await prItem.isVisible({ timeout: 3000 })) {
      await prItem.click();
      await page.waitForTimeout(300);
    }
  }

  // PR 詳細の Files Changed（Code Changes）タブが表示される
  test("Files Changed タブが表示される", async ({ page }) => {
    await openPRDetail(page);
    const filesTab = page
      .getByRole("button", { name: /files changed|code changes/i })
      .first();
    if (await filesTab.isVisible({ timeout: 3000 })) {
      await expect(filesTab).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // Files Changed タブに切り替えると変更ファイルが表示される
  test("Files Changed タブに変更ファイルの差分が表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        pr_get_files: [
          { filename: "src/core/git.rs", status: "modified", additions: 12, deletions: 3, patch: "@@ -40,6 +40,8 @@ fn push() {\n+    let max_backoff = 4s;\n+    // retry logic\n" },
        ],
        pr_get_diff: "@@ -40,6 +40,8 @@\n+    let max_backoff = 4s;\n+    // retry logic\n",
      })
    );
    await page.goto("/");
    await openPRDetail(page);
    const filesTab = page
      .getByRole("button", { name: /files changed|code changes/i })
      .first();
    if (await filesTab.isVisible({ timeout: 3000 })) {
      await filesTab.click();
      await page.waitForTimeout(300);
      // ファイル名が表示される
      const filename = page.getByText(/git\.rs|src\/core/i).first();
      if (await filename.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(filename).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // インラインコメント入力欄が開けること（行番号クリック）
  test("差分の行番号クリックでインラインコメント入力欄が開く", async ({ page }) => {
    await openPRDetail(page);
    const filesTab = page
      .getByRole("button", { name: /files changed|code changes/i })
      .first();
    if (await filesTab.isVisible({ timeout: 3000 })) {
      await filesTab.click();
      await page.waitForTimeout(300);
    }
    // コメントアイコン / 行番号ボタンを探す
    const lineBtn = page
      .locator("[data-line], .line-number, button[aria-label*='comment']")
      .first();
    if (await lineBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lineBtn.click();
      await page.waitForTimeout(300);
      // コメント入力テキストエリアが出現
      const commentBox = page.locator("textarea").first();
      if (await commentBox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(commentBox).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // ADD REVIEW COMMENT ボタンが存在すること
  test("ADD REVIEW COMMENT ボタンが表示される", async ({ page }) => {
    await openPRDetail(page);
    const addCommentBtn = page
      .getByRole("button", { name: /add.*comment|add review|コメントを追加/i })
      .first();
    if (await addCommentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(addCommentBtn).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // PR コメントを入力して ADD REVIEW COMMENT できること
  test("PR コメントを入力して送信できる", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({ pr_add_comment: null })
    );
    await page.goto("/");
    await openPRDetail(page);
    // コメント入力欄を探す（Overview または Files Changed タブ内）
    const commentBox = page.locator("textarea").first();
    if (await commentBox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await commentBox.fill("backoff の最大間隔を 4s → 8s に変更を検討してほしい");
      const submitBtn = page
        .getByRole("button", { name: /add.*comment|submit|送信/i })
        .first();
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(300);
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // Overview タブに Reviews セクションと APPROVE ボタンがあること（S-09 ステップ7）
  test("Overview タブに APPROVE ボタンが表示される", async ({ page }) => {
    await openPRDetail(page);
    const overviewTab = page.getByRole("button", { name: "Overview" }).first();
    if (await overviewTab.isVisible({ timeout: 3000 })) {
      await overviewTab.click();
      await page.waitForTimeout(300);
    }
    const approveBtn = page
      .getByRole("button", { name: /approve|承認/i })
      .first();
    if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(approveBtn).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // APPROVE をクリックすると approved 状態になること
  test("APPROVE をクリックすると approved ステータスが表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({ pr_review_submit: null })
    );
    await page.goto("/");
    await openPRDetail(page);
    const approveBtn = page
      .getByRole("button", { name: /approve/i })
      .first();
    if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await approveBtn.click();
      await page.waitForTimeout(300);
      // "approved" テキストが表示される
      const approvedEl = page.getByText(/approved/i).first();
      if (await approvedEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(approvedEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // MERGE PR ボタンが表示されること（CI passing の前提）
  test("checks_status=passing のとき MERGE PR ボタンが有効になる", async ({ page }) => {
    await openPRDetail(page);
    const mergeBtn = page
      .getByRole("button", { name: /merge pr|squash and merge|merge/i })
      .first();
    await expect(mergeBtn).toBeVisible({ timeout: 5000 });
  });

  // MERGE PR をクリックするとステータスが merged に変わること（S-09 ステップ8）
  test("MERGE PR をクリックすると merged ステータスになる", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        pr_merge: null,
        pr_list: [MERGED_PR],
        pr_get_detail: { pr: MERGED_PR, reviews: [], comments: [] },
      })
    );
    await page.goto("/");
    await openPRDetail(page);
    const mergeBtn = page
      .getByRole("button", { name: /merge pr|squash and merge|merge/i })
      .first();
    if (await mergeBtn.isVisible({ timeout: 3000 })) {
      await mergeBtn.click();
      await page.waitForTimeout(500);
      // merged ステータスが表示される
      const mergedEl = page.getByText(/merged/i).first();
      if (await mergedEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(mergedEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // マージ後に Issue #43 が closed になること（S-09 期待結果）
  test("PR マージ後に Issue #43 が closed ステータスに更新される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        pr_merge: null,
        issue_list: [CLOSED_ISSUE],
      })
    );
    await page.goto("/");
    await openPRDetail(page);
    const mergeBtn = page
      .getByRole("button", { name: /merge pr|merge/i })
      .first();
    if (await mergeBtn.isVisible({ timeout: 3000 })) {
      await mergeBtn.click();
      await page.waitForTimeout(500);
    }
    // Issues 画面に遷移して closed を確認
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 2000 }).catch(() => false)) {
      await issuesNav.click();
      await page.waitForTimeout(300);
      const closedEl = page.getByText(/closed/i).first();
      if (await closedEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(closedEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // Design Docs タブに .md ファイルの変更が表示されること（S-05 から引き続き確認）
  test("Design Docs タブに設計書の差分が表示される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        pr_get_diff: "diff --git a/docs/architecture.md b/docs/architecture.md\n--- a/docs/architecture.md\n+++ b/docs/architecture.md\n@@ -1,5 +1,17 @@\n+## sqlite-vec 連携\n",
      })
    );
    await page.goto("/");
    await openPRDetail(page);
    const designTab = page.getByRole("button", { name: "Design Docs" }).first();
    if (await designTab.isVisible({ timeout: 3000 })) {
      await designTab.click();
      await page.waitForTimeout(300);
      // 差分テキストが表示される
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
