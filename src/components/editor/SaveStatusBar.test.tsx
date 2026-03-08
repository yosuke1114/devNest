import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SaveStatusBar } from "./SaveStatusBar";
import type { DocSaveProgress } from "../../types";

describe("SaveStatusBar", () => {
  // ─── ファイルパス表示 ──────────────────────────────────────────────────────

  it("currentPath が null のとき placeholder を表示する", () => {
    render(
      <SaveStatusBar
        currentPath={null}
        saveStatus="idle"
        saveProgress={null}
        onSave={vi.fn()}
        canSave={false}
      />
    );
    expect(screen.getByText(/ファイルを選択|select file/i)).toBeInTheDocument();
  });

  it("currentPath を表示する", () => {
    render(
      <SaveStatusBar
        currentPath="docs/spec.md"
        saveStatus="idle"
        saveProgress={null}
        onSave={vi.fn()}
        canSave={true}
      />
    );
    expect(screen.getByText("docs/spec.md")).toBeInTheDocument();
  });

  // ─── 保存ボタン ──────────────────────────────────────────────────────────

  it("保存ボタンが存在する", () => {
    render(
      <SaveStatusBar
        currentPath="docs/spec.md"
        saveStatus="idle"
        saveProgress={null}
        onSave={vi.fn()}
        canSave={true}
      />
    );
    expect(screen.getByRole("button", { name: /保存|save/i })).toBeInTheDocument();
  });

  it("保存ボタンクリックで onSave が呼ばれる", () => {
    const onSave = vi.fn();
    render(
      <SaveStatusBar
        currentPath="docs/spec.md"
        saveStatus="idle"
        saveProgress={null}
        onSave={onSave}
        canSave={true}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /保存|save/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("canSave=false のとき保存ボタンが disabled になる", () => {
    render(
      <SaveStatusBar
        currentPath={null}
        saveStatus="idle"
        saveProgress={null}
        onSave={vi.fn()}
        canSave={false}
      />
    );
    expect(screen.getByRole("button", { name: /保存|save/i })).toBeDisabled();
  });

  it("saveStatus='loading' のとき保存ボタンが disabled になる", () => {
    render(
      <SaveStatusBar
        currentPath="docs/spec.md"
        saveStatus="loading"
        saveProgress={null}
        onSave={vi.fn()}
        canSave={true}
      />
    );
    expect(screen.getByRole("button", { name: /保存|save/i })).toBeDisabled();
  });

  // ─── saveProgress バッジ ──────────────────────────────────────────────────

  it("saveProgress.status='committing' のとき進捗を表示する", () => {
    const progress: DocSaveProgress = { status: "committing", message: "コミット中" };
    render(
      <SaveStatusBar
        currentPath="docs/spec.md"
        saveStatus="loading"
        saveProgress={progress}
        onSave={vi.fn()}
        canSave={true}
      />
    );
    expect(screen.getByText(/コミット中|committ/i)).toBeInTheDocument();
  });

  it("saveProgress が null のとき進捗バッジを表示しない", () => {
    render(
      <SaveStatusBar
        currentPath="docs/spec.md"
        saveStatus="idle"
        saveProgress={null}
        onSave={vi.fn()}
        canSave={true}
      />
    );
    expect(screen.queryByText(/コミット中|プッシュ中/)).not.toBeInTheDocument();
  });

  // ─── retryPush ────────────────────────────────────────────────────────────

  it("showRetry=true のとき再試行ボタンが表示される", () => {
    render(
      <SaveStatusBar
        currentPath="docs/spec.md"
        saveStatus="idle"
        saveProgress={null}
        onSave={vi.fn()}
        canSave={true}
        showRetry={true}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /再プッシュ|retry/i })).toBeInTheDocument();
  });

  it("onRetry クリックで onRetry が呼ばれる", () => {
    const onRetry = vi.fn();
    render(
      <SaveStatusBar
        currentPath="docs/spec.md"
        saveStatus="idle"
        saveProgress={null}
        onSave={vi.fn()}
        canSave={true}
        showRetry={true}
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /再プッシュ|retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
