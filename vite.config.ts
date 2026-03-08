import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// @ts-ignore — Vitest 型は vitest パッケージが提供
/// <reference types="vitest" />

const __dirname = dirname(fileURLToPath(import.meta.url));

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          codemirror: ["codemirror", "@codemirror/lang-markdown", "@codemirror/view", "@codemirror/state", "@codemirror/language", "@codemirror/theme-one-dark"],
          tauri: ["@tauri-apps/api"],
          icons: ["@tabler/icons-react"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    alias: {
      "@tauri-apps/plugin-dialog": resolve(__dirname, "src/test/__mocks__/@tauri-apps/plugin-dialog.ts"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
