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
  // アプリが初期化されてサイドバーが表示されるまで待つ
  // uiStore.navigate を window 経由で呼ぶ（Zustand はグローバルに公開されていないため
  // sidebar の nav-swarm ボタンをクリックする。ボタンが見つからない場合は scroll して探す）
  await page.waitForTimeout(800);

  // nav-swarm ボタンをスクロールして探す
  const navBtn = page.locator('[data-testid="nav-swarm"]');
  await navBtn.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  if (await navBtn.isVisible({ timeout: 3000 })) {
    await navBtn.click();
    await page.waitForTimeout(400);
    return;
  }

  // フォールバック: テキスト "Swarm" を探す
  const swarmLink = page.getByText("Swarm").first();
  if (await swarmLink.isVisible({ timeout: 2000 })) {
    await swarmLink.click();
    await page.waitForTimeout(400);
  }
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
    await expect(page.locator('[data-testid="orchestrator-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="terminal-grid"]')).toBeVisible();
  });

  // ST-02: タスク入力 → 分解
  test("ST-02: タスク入力後に分解ボタンが有効になりタスクが表示される", async ({ page }) => {
    const splitBtn = page.locator('[data-testid="split-button"]');
    await expect(splitBtn).toBeDisabled();

    const textarea = page.locator('[data-testid="task-input"]');
    await textarea.fill("ユーザー認証機能を実装してテストを書いてください");

    await expect(splitBtn).toBeEnabled();
    await splitBtn.click();

    // split_task モックが tasks を返す
    const subtaskList = page.locator('[data-testid="subtask-list"]');
    await expect(subtaskList).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Task A: ユーザー認証実装")).toBeVisible();
    await expect(page.getByText("Task B: テスト追加")).toBeVisible();
  });

  // ST-03: 設定モーダル
  test("ST-03: 設定ボタンで Settings Modal が開く", async ({ page }) => {
    await page.locator('[data-testid="settings-button"]').click();
    await expect(page.locator('[data-testid="settings-modal"]')).toBeVisible();
  });

  // ST-04: 設定保存
  test("ST-04: Worker 上限を 8 に変更して保存できる", async ({ page }) => {
    await page.locator('[data-testid="settings-button"]').click();
    await page.locator('[data-testid="worker-limit-8"]').click();
    await page.locator('[data-testid="settings-save"]').click();
    await expect(page.locator('[data-testid="settings-modal"]')).not.toBeVisible();
  });

  // ST-05: 設定キャンセル
  test("ST-05: キャンセルボタンで Settings Modal が閉じる", async ({ page }) => {
    await page.locator('[data-testid="settings-button"]').click();
    await page.locator('[data-testid="settings-cancel"]').click();
    await expect(page.locator('[data-testid="settings-modal"]')).not.toBeVisible();
  });

  // ST-06: Shell 設定オプション
  test("ST-06: Shell オプションで bash を選択できる", async ({ page }) => {
    await page.locator('[data-testid="settings-button"]').click();
    await page.locator('[data-testid="shell-option-bash"]').click();
    const bashBtn = page.locator('[data-testid="shell-option-bash"]');
    await expect(bashBtn).toHaveAttribute("aria-pressed", "true");
  });

  // ST-07: リソースインジケーター
  test("ST-07: リソースインジケーターが表示される", async ({ page }) => {
    // get_system_resources モックは CPU 25% / 8GB free を返す
    const indicator = page.locator('[data-testid="resource-indicator"]');
    await expect(indicator).toBeVisible({ timeout: 5000 });
    await expect(indicator).toContainText("25%");
  });
});

test.describe("S-13 Swarm — TerminalGrid", () => {
  test.beforeEach(async ({ page }) => {
    // buildMockIpcScript に含まれる __fireEvent / transformCallback を使う
    await page.addInitScript(buildMockIpcScript());
    await page.goto("/");
    await navigateToSwarm(page);
  });

  // ST-08: エンプティステート
  test("ST-08: 初期状態でエンプティステートが表示される", async ({ page }) => {
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="worker-count"]')).toContainText("0 / 8 ペイン");
  });

  // ST-09: Shell 追加
  test("ST-09: Shell 追加ボタンで spawn_worker が呼ばれる", async ({ page }) => {
    const logs: string[] = [];
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
    // リスナーが登録されるまで少し待つ
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
