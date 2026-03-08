import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AsyncButton } from "./AsyncButton";

describe("AsyncButton", () => {
  // ─── 基本レンダリング ────────────────────────────────────────────────────

  it("children を表示する", () => {
    render(<AsyncButton>保存</AsyncButton>);
    expect(screen.getByText("保存")).toBeInTheDocument();
  });

  it("通常時はクリックできる", () => {
    const onClick = vi.fn();
    render(<AsyncButton onClick={onClick}>Click</AsyncButton>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // ─── loading 状態 ─────────────────────────────────────────────────────────

  it("loading=true のときボタンが disabled になる", () => {
    render(<AsyncButton loading>保存</AsyncButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("loading=true のときクリックハンドラが呼ばれない", () => {
    const onClick = vi.fn();
    render(
      <AsyncButton loading onClick={onClick}>
        保存
      </AsyncButton>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading=true のとき loadingLabel を表示する", () => {
    render(<AsyncButton loading loadingLabel="処理中…">保存</AsyncButton>);
    expect(screen.getByText("処理中…")).toBeInTheDocument();
  });

  it("loading=false のとき children を表示する", () => {
    render(<AsyncButton loading={false}>保存</AsyncButton>);
    expect(screen.getByText("保存")).toBeInTheDocument();
  });

  // ─── disabled 状態 ────────────────────────────────────────────────────────

  it("disabled=true のときボタンが disabled になる", () => {
    render(<AsyncButton disabled>保存</AsyncButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  // ─── className / style ────────────────────────────────────────────────────

  it("className を追加できる", () => {
    render(<AsyncButton className="my-btn">OK</AsyncButton>);
    expect(screen.getByRole("button")).toHaveClass("my-btn");
  });

  it("variant='danger' を渡せる", () => {
    render(<AsyncButton variant="danger">削除</AsyncButton>);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
  });
});
