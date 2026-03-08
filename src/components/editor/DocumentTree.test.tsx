import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DocumentTree } from "./DocumentTree";
import type { Document } from "../../types";

function makeDoc(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    project_id: 1,
    path: "docs/spec.md",
    title: "Spec",
    sha: null,
    size_bytes: null,
    embedding_status: "pending",
    push_status: "synced",
    is_dirty: false,
    last_indexed_at: null,
    last_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("DocumentTree", () => {
  // ─── 空の状態 ─────────────────────────────────────────────────────────────

  it("documents が空のとき空メッセージを表示する", () => {
    render(<DocumentTree documents={[]} onSelect={vi.fn()} selectedId={null} />);
    expect(screen.getByText(/ファイルがありません|no document/i)).toBeInTheDocument();
  });

  // ─── ドキュメント一覧 ──────────────────────────────────────────────────────

  it("documents の path を表示する", () => {
    const docs = [makeDoc({ path: "docs/spec.md" })];
    render(<DocumentTree documents={docs} onSelect={vi.fn()} selectedId={null} />);
    expect(screen.getByText("spec.md")).toBeInTheDocument();
  });

  it("docs/ プレフィックスを除いて表示する", () => {
    const docs = [makeDoc({ path: "docs/architecture.md" })];
    render(<DocumentTree documents={docs} onSelect={vi.fn()} selectedId={null} />);
    expect(screen.getByText("architecture.md")).toBeInTheDocument();
  });

  it("複数のドキュメントを列挙する", () => {
    const docs = [
      makeDoc({ id: 1, path: "docs/spec.md" }),
      makeDoc({ id: 2, path: "docs/api.md" }),
    ];
    render(<DocumentTree documents={docs} onSelect={vi.fn()} selectedId={null} />);
    expect(screen.getByText("spec.md")).toBeInTheDocument();
    expect(screen.getByText("api.md")).toBeInTheDocument();
  });

  // ─── 選択状態 ─────────────────────────────────────────────────────────────

  it("selectedId に一致するドキュメントが選択スタイルになる", () => {
    const docs = [makeDoc({ id: 1, path: "docs/spec.md" })];
    render(<DocumentTree documents={docs} onSelect={vi.fn()} selectedId={1} />);
    const btn = screen.getByRole("button", { name: /spec\.md/ });
    // 選択状態を示すクラスまたは aria-selected
    expect(btn).toHaveAttribute("aria-selected", "true");
  });

  it("selectedId が null のとき aria-selected は false", () => {
    const docs = [makeDoc({ id: 1, path: "docs/spec.md" })];
    render(<DocumentTree documents={docs} onSelect={vi.fn()} selectedId={null} />);
    const btn = screen.getByRole("button", { name: /spec\.md/ });
    expect(btn).toHaveAttribute("aria-selected", "false");
  });

  // ─── クリック ──────────────────────────────────────────────────────────────

  it("ドキュメントをクリックすると onSelect が呼ばれる", () => {
    const onSelect = vi.fn();
    const doc = makeDoc({ id: 1 });
    render(<DocumentTree documents={[doc]} onSelect={onSelect} selectedId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /spec\.md/ }));
    expect(onSelect).toHaveBeenCalledWith(doc);
  });

  // ─── is_dirty バッジ ───────────────────────────────────────────────────────

  it("is_dirty=true のとき未保存インジケーターを表示する", () => {
    const doc = makeDoc({ is_dirty: true });
    render(<DocumentTree documents={[doc]} onSelect={vi.fn()} selectedId={null} />);
    // ● や dot などの表示
    const btn = screen.getByRole("button");
    expect(btn.textContent).toMatch(/●|•|\*/);
  });

  it("is_dirty=false のとき未保存インジケーターを表示しない", () => {
    const doc = makeDoc({ is_dirty: false });
    render(<DocumentTree documents={[doc]} onSelect={vi.fn()} selectedId={null} />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).not.toMatch(/●|•/);
  });

  // ─── push_failed バッジ ────────────────────────────────────────────────────

  it("push_status='push_failed' のとき警告アイコンのエリアが存在する", () => {
    const doc = makeDoc({ push_status: "push_failed" });
    const { container } = render(
      <DocumentTree documents={[doc]} onSelect={vi.fn()} selectedId={null} />
    );
    // SVG アイコン or data-testid
    const icon = container.querySelector("[data-testid='push-failed-icon'], svg");
    expect(icon).toBeInTheDocument();
  });
});
