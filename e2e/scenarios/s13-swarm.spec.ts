/**
 * S-13: DevNest Swarm — マルチ Worker 並列実行シナリオ (Phase 11-C / 12)
 *
 * OrchestratorPanel・TerminalGrid・XtermPane の E2E テスト。
 * Tauri IPC は buildMockIpcScript でスタブ化し、
 * Rust バックエンドなしで UI 動作を検証する。
 */

import { test, expect } from "@playwright/test";
import { buildMockIpcScript } from "../setup/mock-ipc";

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

async function navigateToSwarm(page: Parameters<typeof test.beforeEach>[0]["page"]) {
  await page.waitForTimeout(800);

  const navBtn = page.locator('[data-testid="nav-swarm"]');
  await navBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  if (await navBtn.isVisible({ timeout: 3000 })) {
    await navBtn.click();
    await page.waitForTimeout(400);
    return;
  }

  const swarmLink = page.getByText("Swarm").first();
  if (await swarmLink.isVisible({ timeout: 2000 })) {
    await swarmLink.click();
    await page.waitForTimeout(400);
  }
}

/** running タブへ切り替える */
async function navigateToRunningTab(page: Parameters<typeof test.beforeEach>[0]["page"]) {
  await page.locator('[data-testid="tab-running"]').click();
  await page.waitForTimeout(300);
}

/** worker-spawned イベントをフロントエンドへ発火する */
async function emitWorkerSpawned(
  page: Parameters<typeof test.beforeEach>[0]["page"],
  worker: { id: string; kind?: "shell" | "claudeCode"; label?: string }
) {
  const { id, kind = "claudeCode", label = `Worker ${id}` } = worker;
  await page.evaluate(
    ({ id, kind, label }) => {
      (window as unknown as { __fireEvent?: (e: string, p: unknown) => void }).__fireEvent?.(
        "worker-spawned",
        {
          id,
          config: { kind, mode: kind === "shell" ? "interactive" : "batch", label, workingDir: "/tmp/proj", dependsOn: [], metadata: {} },
          status: "idle",
        }
      );
    },
    { id, kind, label }
  );
}

/** worker-status-changed イベントをフロントエンドへ発火する */
async function emitWorkerStatus(
  page: Parameters<typeof test.beforeEach>[0]["page"],
  workerId: string,
  status: "idle" | "running" | "done" | "error"
) {
  await page.evaluate(
    ({ workerId, status }) => {
      (window as unknown as { __fireEvent?: (e: string, p: unknown) => void }).__fireEvent?.(
        "worker-status-changed",
        { workerId, status }
      );
    },
    { workerId, status }
  );
}

// ─── テスト ──────────────────────────────────────────────────────────────────

test.describe("S-13 Swarm — OrchestratorPanel", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
    await navigateToSwarm(page);
  });

  // ST-01: Swarm 画面表示
  test("ST-01: Swarm 画面が表示される", async ({ page }) => {
    await expect(page.locator('[data-testid="swarm-page"]')).toBeVisible({ timeout: 5000 });
    // split タブ（デフォルト）が表示されている
    await expect(page.locator('[data-testid="swarm-split-tab"]')).toBeVisible();
    // running タブに切り替えると TerminalGrid が表示される
    await navigateToRunningTab(page);
    await expect(page.locator('[data-testid="terminal-grid"]')).toBeVisible({ timeout: 5000 });
  });

  // ST-02: タスク入力 → 分解
  test("ST-02: タスク入力後に分解ボタンが有効になりタスクが表示される", async ({ page }) => {
    const splitBtn = page.locator('[data-testid="split-button"]');
    await expect(splitBtn).toBeDisabled();

    const textarea = page.locator('[data-testid="split-prompt-input"]');
    await textarea.fill("ユーザー認証機能を実装してテストを書いてください");

    await expect(splitBtn).toBeEnabled();
    await splitBtn.click();

    // split_task モックが tasks を返す
    const resultSection = page.locator('[data-testid="split-result-section"]');
    await expect(resultSection).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Task A: ユーザー認証実装")).toBeVisible();
    await expect(page.getByText("Task B: テスト追加")).toBeVisible();
  });

  // ST-03: 設定パネル展開
  test("ST-03: 設定ボタンで Settings パネルが開く", async ({ page }) => {
    // 設定セクションのヘッダーをクリックして展開
    await page.getByText("⚙️ 設定").click();
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible();
  });

  // ST-04: 設定保存（Worker 上限変更）
  test("ST-04: Worker 上限を 8 に変更できる", async ({ page }) => {
    await page.getByText("⚙️ 設定").click();
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible();
    await page.locator('[data-testid="max-workers-8"]').click();
    await expect(page.locator('[data-testid="max-workers-8"]')).toHaveAttribute("aria-pressed", "true");
    // 設定を閉じる
    await page.getByText("⚙️ 設定").click();
    await expect(page.locator('[data-testid="settings-panel"]')).not.toBeVisible();
  });

  // ST-05: 設定パネルを閉じる
  test("ST-05: 設定ヘッダー再クリックで Settings パネルが閉じる", async ({ page }) => {
    await page.getByText("⚙️ 設定").click();
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible();
    await page.getByText("⚙️ 設定").click();
    await expect(page.locator('[data-testid="settings-panel"]')).not.toBeVisible();
  });

  // ST-06: skip-permissions チェックボックスを確認
  test("ST-06: skip-permissions チェックボックスが操作できる", async ({ page }) => {
    await page.getByText("⚙️ 設定").click();
    const checkbox = page.locator('[data-testid="skip-permissions-checkbox"]');
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });

  // ST-07: running タブ内の TerminalGrid が表示される
  test("ST-07: running タブに TerminalGrid と空スタテが表示される", async ({ page }) => {
    await navigateToRunningTab(page);
    await expect(page.locator('[data-testid="terminal-grid"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="running-tab-empty"]')).toBeVisible();
  });
});

test.describe("S-13 Swarm — TerminalGrid", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
    await navigateToSwarm(page);
    // TerminalGrid は running タブに表示される
    await navigateToRunningTab(page);
  });

  // ST-08: エンプティステート
  test("ST-08: 初期状態でエンプティステートが表示される", async ({ page }) => {
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="worker-count"]')).toContainText("0 / 8 ペイン");
  });

  // ST-09: Shell 追加
  test("ST-09: Shell 追加ボタンで spawn_worker が呼ばれる", async ({ page }) => {
    await page.evaluate(() => {
      const orig = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as { invoke: (cmd: string) => unknown };
      const origInvoke = orig.invoke.bind(orig);
      orig.invoke = (cmd: string, ...args: unknown[]) => {
        if (cmd === "spawn_worker") (window as unknown as { __spawnCalled__: boolean }).__spawnCalled__ = true;
        return origInvoke(cmd, ...args);
      };
    });

    await page.locator('[data-testid="add-shell-button"]').click();
    await page.waitForTimeout(300);

    const called = await page.evaluate(() => !!(window as unknown as { __spawnCalled__?: boolean }).__spawnCalled__);
    expect(called).toBe(true);
  });

  // ST-10: Worker イベント経由でペインが追加される
  test("ST-10: worker-spawned イベントでペインが追加される", async ({ page }) => {
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);

    await emitWorkerSpawned(page, { id: "w-e2e-001", kind: "claudeCode", label: "Worker 1" });

    await expect(page.locator('[data-testid="worker-pane-w-e2e-001"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="worker-count"]')).toContainText("1 / 8 ペイン");
  });

  // ST-11: 進捗バー表示
  test("ST-11: ClaudeCode Worker 追加で進捗バーが表示される", async ({ page }) => {
    await page.waitForTimeout(500);
    await emitWorkerSpawned(page, { id: "w-e2e-002", kind: "claudeCode", label: "Worker 2" });

    await expect(page.locator('[data-testid="progress-bar-container"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="progress-text"]')).toContainText("0 / 1");
  });

  // ST-12: Worker 完了で進捗 100%
  test("ST-12: worker done で進捗バーが 100% になる", async ({ page }) => {
    await page.waitForTimeout(500);
    await emitWorkerSpawned(page, { id: "w-e2e-003", kind: "claudeCode", label: "Worker 3" });
    await expect(page.locator('[data-testid="progress-bar-container"]')).toBeVisible({ timeout: 5000 });

    await emitWorkerStatus(page, "w-e2e-003", "done");

    await expect(page.locator('[data-testid="progress-text"]')).toContainText("1 / 1", { timeout: 5000 });
    const fill = page.locator('[data-testid="progress-bar-fill"]');
    await expect(fill).toHaveAttribute("data-progress", "100");
  });
});
