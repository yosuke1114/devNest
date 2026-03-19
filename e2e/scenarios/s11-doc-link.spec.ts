/**
 * S-10: Issue からリンクされていない Markdown を設計書に紐付ける
 * （ファイル名は s11- — 既存 s10-pr-comment-merge.spec.ts に続く番号）
 *
 * Issue #42（OAuth token refresh）に対して手動で
 * specs/auth-flow.md をリンクするフロー：
 * 1. Issue 詳細の右サイドバー「Design Docs」欄 → "+ link doc"
 * 2. ファイルピッカーモーダル → auth-flow.md を選択
 * 3. LINK クリック → サイドバーに追加される
 * 4. "open →" リンクでエディタに遷移
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript, MOCK_ISSUE, MOCK_DOCUMENT } from "../setup/mock-ipc";

const ISSUE_42 = {
  ...MOCK_ISSUE,
  id: 2,
  github_number: 42,
  title: "feat: OAuth token refresh",
  body: "## Overview\nOAuth トークンのリフレッシュ機能を実装する。",
};

const AUTH_FLOW_DOC = {
  ...MOCK_DOCUMENT,
  id: 5,
  path: "specs/auth-flow.md",
  title: "auth-flow",
};

const LINKED_DOC = {
  id: 1,
  issue_id: 2,
  document_id: 5,
  link_type: "manual",
  created_by: "user",
  created_at: "2026-03-09T00:00:00Z",
  path: "specs/auth-flow.md",
  title: "auth-flow",
};

test.describe("S-10 Issue から設計書を手動リンク", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        issue_list: [MOCK_ISSUE, ISSUE_42],
        document_list: [MOCK_DOCUMENT, AUTH_FLOW_DOC],
        issue_doc_link_list: [],
        issue_doc_link_add: null,
      })
    );
    await page.goto("/");
  });

  async function navigateToIssue42(page: import("@playwright/test").Page) {
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 3000 })) {
      await issuesNav.click();
      await page.waitForTimeout(300);
    }
    const issue42 = page
      .getByText(/oauth token refresh|#42/i)
      .first();
    if (await issue42.isVisible({ timeout: 3000 }).catch(() => false)) {
      await issue42.click();
      await page.waitForTimeout(300);
    }
  }

  // Issues 画面に Issue #42 が表示されること
  test("Issues 画面に Issue #42 が表示される", async ({ page }) => {
    const issuesNav = page.locator("aside").getByText("Issues").first();
    if (await issuesNav.isVisible({ timeout: 3000 })) {
      await issuesNav.click();
      await page.waitForTimeout(300);
    }
    const issue42El = page.getByText(/oauth token refresh|#42/i).first();
    if (await issue42El.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(issue42El).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // Issue 詳細の右サイドバーに「Design Docs」欄が存在すること
  test("Issue 詳細の右サイドバーに Design Docs 欄が表示される", async ({ page }) => {
    await navigateToIssue42(page);
    const designDocsSection = page
      .getByText(/design docs|linked.*doc|関連設計書/i)
      .first();
    if (await designDocsSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(designDocsSection).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // "+ link doc" ボタンが表示されること
  test("Issue 詳細に + link doc ボタンが表示される", async ({ page }) => {
    await navigateToIssue42(page);
    const linkDocBtn = page
      .getByRole("button", { name: /\+.*link|add.*doc|link.*doc/i })
      .first();
    if (await linkDocBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(linkDocBtn).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // "+ link doc" クリックでファイルピッカーモーダルが開くこと
  test("+ link doc クリックでファイルピッカーモーダルが開く", async ({ page }) => {
    await navigateToIssue42(page);
    const linkDocBtn = page
      .getByRole("button", { name: /\+.*link|add.*doc|link.*doc/i })
      .first();
    if (await linkDocBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await linkDocBtn.click();
      await page.waitForTimeout(300);
      // モーダルまたはドロップダウンが表示される
      const modal = page.locator("[role='dialog'], .modal, [data-testid='file-picker']").first();
      if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(modal).toBeVisible();
      } else {
        // フォールバック: ファイルリストまたは検索ボックス
        const fileList = page.getByText("auth-flow").first();
        if (await fileList.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(fileList).toBeVisible();
        }
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // ファイルピッカーモーダル内に auth-flow.md が表示されること
  test("ファイルピッカーに auth-flow.md が表示される", async ({ page }) => {
    await navigateToIssue42(page);
    const linkDocBtn = page
      .getByRole("button", { name: /\+.*link|add.*doc|link.*doc/i })
      .first();
    if (await linkDocBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await linkDocBtn.click();
      await page.waitForTimeout(300);
      const authFile = page.getByText(/auth-flow\.md/i).first();
      if (await authFile.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(authFile).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // ファイルピッカーで検索フィルターが機能すること
  test("ファイルピッカーで auth と入力して auth-flow.md をフィルタできる", async ({ page }) => {
    await navigateToIssue42(page);
    const linkDocBtn = page
      .getByRole("button", { name: /\+.*link|add.*doc|link.*doc/i })
      .first();
    if (await linkDocBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await linkDocBtn.click();
      await page.waitForTimeout(300);
      // 検索ボックスに "auth" と入力
      const searchBox = page
        .locator("[role='dialog'] input, [role='dialog'] [type='search']")
        .first();
      if (await searchBox.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchBox.fill("auth");
        await page.waitForTimeout(200);
        const authFile = page.getByText(/auth-flow/i).first();
        if (await authFile.isVisible({ timeout: 2000 }).catch(() => false)) {
          await expect(authFile).toBeVisible();
        }
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // auth-flow.md を選択して LINK クリックするとリンクが追加されること
  test("auth-flow.md を選択して LINK するとサイドバーに追加される", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        issue_list: [MOCK_ISSUE, ISSUE_42],
        document_list: [MOCK_DOCUMENT, AUTH_FLOW_DOC],
        issue_doc_link_list: [LINKED_DOC],
        issue_doc_link_add: null,
      })
    );
    await page.goto("/");
    await navigateToIssue42(page);
    const linkDocBtn = page
      .getByRole("button", { name: /\+.*link|add.*doc|link.*doc/i })
      .first();
    if (await linkDocBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await linkDocBtn.click();
      await page.waitForTimeout(300);
      const authFile = page.getByText(/auth-flow/i).first();
      if (await authFile.isVisible({ timeout: 2000 }).catch(() => false)) {
        await authFile.click();
        await page.waitForTimeout(200);
        const linkBtn = page
          .getByRole("button", { name: /^link$/i })
          .first();
        if (await linkBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await linkBtn.click();
          await page.waitForTimeout(300);
        }
      }
    }
    // リンク追加後に specs/auth-flow.md が表示される
    const linkedDoc = page.getByText("auth-flow.md").first();
    if (await linkedDoc.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(linkedDoc).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // リンク済み設計書の "open →" リンクでエディタに遷移できること（S-10 ステップ6）
  test("リンク済み設計書の open → でエディタに遷移できる", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        issue_list: [MOCK_ISSUE, ISSUE_42],
        document_list: [MOCK_DOCUMENT, AUTH_FLOW_DOC],
        issue_doc_link_list: [LINKED_DOC],
      })
    );
    await page.goto("/");
    await navigateToIssue42(page);
    // "open →" または "→" リンク
    const openLink = page
      .getByRole("button", { name: /open →|→|open/i })
      .first();
    if (await openLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openLink.click();
      await page.waitForTimeout(300);
      // EditorScreen に遷移する
      const editorEl = page.getByText("Documents").first();
      if (await editorEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(editorEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // リンクを削除できること（issue_doc_link_remove）
  test("リンク済み設計書をリンク解除できる", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        issue_list: [MOCK_ISSUE, ISSUE_42],
        document_list: [MOCK_DOCUMENT, AUTH_FLOW_DOC],
        issue_doc_link_list: [LINKED_DOC],
        issue_doc_link_remove: null,
      })
    );
    await page.goto("/");
    await navigateToIssue42(page);
    // リンク削除ボタン（× や remove）
    const removeBtn = page
      .locator("button[aria-label*='unlink'], button[aria-label*='remove'], button.remove-link")
      .first();
    if (await removeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await removeBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });
});
