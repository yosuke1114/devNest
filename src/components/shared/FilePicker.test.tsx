import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilePicker } from "./FilePicker";

// Tauri dialog をモック（@tauri-apps/plugin-dialog は setup.ts 外）
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

import * as dialog from "@tauri-apps/plugin-dialog";
const mockOpen = vi.mocked(dialog.open);

describe("FilePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── 基本レンダリング ────────────────────────────────────────────────────

  it("ボタンが表示される", () => {
    render(<FilePicker onPick={vi.fn()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("label を表示できる", () => {
    render(<FilePicker onPick={vi.fn()} label="フォルダを選択" />);
    expect(screen.getByText("フォルダを選択")).toBeInTheDocument();
  });

  // ─── ダイアログ呼び出し ───────────────────────────────────────────────────

  it("クリック時に dialog.open が呼ばれる", async () => {
    mockOpen.mockResolvedValueOnce(null);
    render(<FilePicker onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("ディレクトリ選択モードを渡す", async () => {
    mockOpen.mockResolvedValueOnce(null);
    render(<FilePicker onPick={vi.fn()} directory />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true })
    );
  });

  it("ファイルが選択されたとき onPick が呼ばれる", async () => {
    mockOpen.mockResolvedValueOnce("/home/user/project");
    const onPick = vi.fn();
    render(<FilePicker onPick={onPick} />);
    fireEvent.click(screen.getByRole("button"));
    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith("/home/user/project"));
  });

  it("キャンセル（null）のとき onPick が呼ばれない", async () => {
    mockOpen.mockResolvedValueOnce(null);
    const onPick = vi.fn();
    render(<FilePicker onPick={onPick} />);
    fireEvent.click(screen.getByRole("button"));
    await vi.waitFor(() => expect(mockOpen).toHaveBeenCalled());
    expect(onPick).not.toHaveBeenCalled();
  });

  // ─── disabled ────────────────────────────────────────────────────────────

  it("disabled=true のときボタンが無効化される", () => {
    render(<FilePicker onPick={vi.fn()} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
