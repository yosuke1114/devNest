import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/scenarios",
  timeout: 30_000,
  retries: 0,
  workers: 1,               // シナリオを順番に実行
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Vite dev server を起動してからテスト実行
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
