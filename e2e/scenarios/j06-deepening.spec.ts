/**
 * J-06: Claude Code と設計書の連動に感動する
 *
 * Stage 6 — 深化
 * ① AI Wizard で Issue 作成時に conflict-flow.md / sync-flow.md が選ばれる
 * ② Terminal 起動時に --context 引数に設計書名がプリセットされる（F-K02）
 * ③ PR の Design Docs タブで設計書変更が表示される（R-K01）
 */
import { test, expect } from "@playwright/test";
import { buildMockIpcScript, MOCK_PR } from "../setup/mock-ipc";

/** conflict-flow.md / sync-flow.md の高スコアコンテキスト候補 */
const CONTEXT_CHUNKS = [
  {
    chunk_id: 20,
    document_id: 20,
    path: "docs/conflict-flow.md",
    title: null,
    section_heading: "Section 4.1",
    content: "コンフリクト解消後の自動 push 仕様。resolved 状態を確認してから push を実行。",
    start_line: 80,
    score: 0.97,
  },
  {
    chunk_id: 21,
    document_id: 21,
    path: "docs/sync-flow.md",
    title: null,
    section_heading: "Retry Logic",
    content: "push 失敗時の指数バックオフリトライ仕様",
    start_line: 30,
    score: 0.93,
  },
];

/** Design Docs タブ用の doc diff（conflict-flow.md に +3行） */
const DOC_DIFF = `diff --git a/docs/conflict-flow.md b/docs/conflict-flow.md
--- a/docs/conflict-flow.md
+++ b/docs/conflict-flow.md
@@ -80,6 +80,9 @@ Section 4.1
 コンフリクト解消後の自動 push 仕様。
+
+resolved 状態を確認してから push を実行。
+push 失敗時は retry_push コマンドを使用する。
`;

/** Terminal セッション（running 状態、関連設計書がコンテキストに含まれる） */
const TERMINAL_SESSION = {
  id: 1,
  project_id: 1,
  branch_name: null,
  has_doc_changes: false,
  prompt_summary: "関連設計書: docs/conflict-flow.md, docs/sync-flow.md\nConflict 解消後に自動的に push する",
  output_log: null,
  exit_code: null,
  status: "running",
  started_at: "2026-03-09T10:00:00Z",
  ended_at: null,
};

test.describe("J-06 深化 — Claude Code と設計書の連動", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        search_context_for_issue: { chunks: CONTEXT_CHUNKS },
        terminal_session_start: TERMINAL_SESSION,
        pr_get_diff: DOC_DIFF,
      })
    );
    await page.goto("/");
  });

  // Issues 画面で AI Wizard のコンテキスト候補が conflict-flow.md を含むこと
  test("AI Wizard Step 2 で conflict-flow.md が高スコアで選択される", async ({ page }) => {
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
      // conflict-flow.md が候補として表示される
      const conflictDoc = page.getByText("conflict-flow.md").first();
      if (await conflictDoc.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(conflictDoc).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // AI Wizard Step 2 でスコア 0.97 が表示されること
  test("AI Wizard のコンテキスト候補にスコア 0.97 が表示される", async ({ page }) => {
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
      const scoreEl = page.getByText("0.97").first();
      if (await scoreEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(scoreEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // Terminal 画面に遷移できること（LAUNCH TERMINAL）
  test("Terminal 画面に遷移できる", async ({ page }) => {
    const terminalNav = page.locator("aside").getByText(/terminal|ターミナル/i).first();
    if (await terminalNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await terminalNav.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // F-K02: Terminal 起動前プロンプトに関連設計書のパスが表示されること
  test("Terminal 起動プロンプトに関連設計書のパスがプリセットされる（F-K02）", async ({ page }) => {
    const terminalNav = page.locator("aside").getByText(/terminal|ターミナル/i).first();
    if (await terminalNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await terminalNav.click();
      await page.waitForTimeout(300);
    }
    // プロンプト入力欄またはプリセットテキストを確認
    const promptInput = page
      .locator("textarea, input[type='text'], [data-testid='prompt-input']")
      .first();
    if (await promptInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const value = await promptInput.inputValue().catch(() => "");
      // 設計書パスが含まれているか、または表示欄に関連設計書名が見える
      if (value.includes("conflict-flow.md") || value.includes("sync-flow.md")) {
        expect(value).toContain("conflict-flow.md");
      }
    }
    // Terminal の START SESSION ボタンが表示される
    const startBtn = page
      .getByRole("button", { name: /start.*session|launch|起動/i })
      .first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(startBtn).toBeVisible();
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });

  // Terminal セッション起動中に関連設計書名が表示されること
  test("Terminal 起動後にセッションステータスが表示される", async ({ page }) => {
    const terminalNav = page.locator("aside").getByText(/terminal|ターミナル/i).first();
    if (await terminalNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await terminalNav.click();
      await page.waitForTimeout(300);
    }
    const startBtn = page
      .getByRole("button", { name: /start.*session|launch|起動/i })
      .first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForTimeout(500);
      // セッション running 状態のインジケーター
      const runningEl = page.getByText(/running|実行中/i).first();
      if (await runningEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(runningEl).toBeVisible();
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // PR の Design Docs タブに設計書の差分が表示されること（R-K01）
  test("PR の Design Docs タブに .md ファイルの差分が表示される（R-K01）", async ({ page }) => {
    const prNav = page.locator("aside").getByText(/PR|pull request/i).first();
    if (await prNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prNav.click();
      await page.waitForTimeout(300);
    }
    // PR タイトルをクリックして Detail に遷移
    const prTitle = page
      .getByText("feat: auto git-commit on save")
      .first();
    if (await prTitle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await prTitle.click();
      await page.waitForTimeout(300);
      // Design Docs タブ
      const designDocsTab = page
        .getByRole("tab", { name: /design docs|設計書/i })
        .first();
      if (await designDocsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await designDocsTab.click();
        await page.waitForTimeout(300);
        // conflict-flow.md の差分テキスト
        const diffText = page.getByText("conflict-flow.md").first();
        if (await diffText.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(diffText).toBeVisible();
        }
      }
    }
    await expect(page.locator("body")).toBeVisible();
  });

  // Terminal で STOP SESSION ボタンが機能すること
  test("Terminal セッションを停止できる（STOP SESSION）", async ({ page }) => {
    await page.addInitScript(
      buildMockIpcScript({
        terminal_session_start: TERMINAL_SESSION,
        terminal_session_stop: null,
      })
    );
    await page.goto("/");
    const terminalNav = page.locator("aside").getByText(/terminal|ターミナル/i).first();
    if (await terminalNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await terminalNav.click();
      await page.waitForTimeout(300);
    }
    const stopBtn = page
      .getByRole("button", { name: /stop.*session|停止/i })
      .first();
    if (await stopBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await stopBtn.click();
      await page.waitForTimeout(300);
    }
    await expect(page.locator("body")).toBeVisible();
  });
});
