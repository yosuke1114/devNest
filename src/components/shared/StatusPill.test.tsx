import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusPill } from "./StatusPill";
import type { AsyncStatus } from "../../types";

describe("StatusPill", () => {
  // ─── 初期状態 ──────────────────────────────────────────────────────────────

  it("status='idle' のとき何も表示しない", () => {
    const { container } = render(<StatusPill status="idle" />);
    expect(container.firstChild).toBeNull();
  });

  // ─── loading ─────────────────────────────────────────────────────────────

  it("status='loading' のとき読み込み中テキストを表示する", () => {
    render(<StatusPill status="loading" />);
    expect(screen.getByText(/loading|読み込み|処理中/i)).toBeInTheDocument();
  });

  it("status='loading' のとき label を上書きできる", () => {
    render(<StatusPill status="loading" label="同期中…" />);
    expect(screen.getByText("同期中…")).toBeInTheDocument();
  });

  // ─── success ─────────────────────────────────────────────────────────────

  it("status='success' のとき成功テキストを表示する", () => {
    render(<StatusPill status="success" />);
    expect(screen.getByText(/success|完了|成功/i)).toBeInTheDocument();
  });

  it("status='success' のとき label を上書きできる", () => {
    render(<StatusPill status="success" label="保存済み" />);
    expect(screen.getByText("保存済み")).toBeInTheDocument();
  });

  // ─── error ───────────────────────────────────────────────────────────────

  it("status='error' のときエラーテキストを表示する", () => {
    render(<StatusPill status="error" />);
    expect(screen.getByText(/error|エラー|失敗/i)).toBeInTheDocument();
  });

  it("status='error' のとき label を上書きできる", () => {
    render(<StatusPill status="error" label="接続失敗" />);
    expect(screen.getByText("接続失敗")).toBeInTheDocument();
  });

  // ─── className ────────────────────────────────────────────────────────────

  it("className を追加できる", () => {
    const { container } = render(
      <StatusPill status="success" className="my-pill" />
    );
    expect(container.querySelector(".my-pill")).toBeInTheDocument();
  });

  // ─── 型チェック: 全ステータスをレンダリングできる ────────────────────────

  it.each<AsyncStatus>(["idle", "loading", "success", "error"])(
    "status='%s' でクラッシュしない",
    (status) => {
      expect(() => render(<StatusPill status={status} />)).not.toThrow();
    }
  );
});
