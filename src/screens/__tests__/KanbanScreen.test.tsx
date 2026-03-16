/**
 * KanbanScreen テスト
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProject = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest", default_branch: "main",
  repo_owner: "yo", repo_name: "devnest", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const col1 = { id: "col-1", name: "Todo", order: 0, wip_limit: null };
const col2 = { id: "col-2", name: "In Progress", order: 1, wip_limit: 1 };
const col3 = { id: "col-3", name: "Done", order: 2, wip_limit: null };

const card1 = {
  id: "card-1", column_id: "col-1", title: "タスクA",
  description: null, priority: "high" as const,
  assignee: null, labels: ["bug", "ux"], issue_number: 42,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};
const card2 = {
  id: "card-2", column_id: "col-2", title: "タスクB",
  description: "説明", priority: "low" as const,
  assignee: "alice", labels: [], issue_number: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};
// card3 in col-2 → overWip since wip_limit=1
const card3 = {
  id: "card-3", column_id: "col-2", title: "タスクC",
  description: null, priority: "critical" as const,
  assignee: null, labels: [], issue_number: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockBoard = {
  product_id: "prod-1",
  columns: [col1, col2, col3],
  cards: [card1, card2, card3],
};

// ─── モック状態 ──────────────────────────────────────────────────────────────

const projectState = { currentProject: mockProject as typeof mockProject | null };
const kanbanState = {
  board: mockBoard as typeof mockBoard | null,
  status: "success" as string,
  fetchBoard: vi.fn(() => Promise.resolve()),
  moveCard: vi.fn(() => Promise.resolve()),
  createCard: vi.fn(() => Promise.resolve(null)),
  deleteCard: vi.fn(() => Promise.resolve()),
};

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn(() => projectState),
}));

vi.mock("../../stores/kanbanStore", () => ({
  useKanbanStore: vi.fn(() => kanbanState),
}));

import { KanbanScreen } from "../KanbanScreen";

describe("KanbanScreen", () => {
  beforeEach(() => {
    projectState.currentProject = mockProject;
    kanbanState.board = mockBoard;
    kanbanState.status = "success";
    vi.clearAllMocks();
    kanbanState.fetchBoard = vi.fn(() => Promise.resolve());
    kanbanState.moveCard = vi.fn(() => Promise.resolve());
    kanbanState.createCard = vi.fn(() => Promise.resolve(null));
    kanbanState.deleteCard = vi.fn(() => Promise.resolve());
  });

  it("プロジェクト未選択時は案内文を表示", () => {
    projectState.currentProject = null;
    render(<KanbanScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("board=null の場合はボード未表示", () => {
    kanbanState.board = null;
    render(<KanbanScreen />);
    expect(screen.getByText("かんばんボード")).toBeInTheDocument();
    expect(screen.queryByText("Todo")).not.toBeInTheDocument();
  });

  it("status=loading のときローディング表示", () => {
    kanbanState.status = "loading";
    render(<KanbanScreen />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("board ありでカラムが表示される", () => {
    render(<KanbanScreen />);
    expect(screen.getByText("Todo")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("カードが表示される", () => {
    render(<KanbanScreen />);
    expect(screen.getByText("タスクA")).toBeInTheDocument();
    expect(screen.getByText("タスクB")).toBeInTheDocument();
    expect(screen.getByText("タスクC")).toBeInTheDocument();
  });

  it("ラベルが表示される", () => {
    render(<KanbanScreen />);
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("ux")).toBeInTheDocument();
  });

  it("WIP 超過カラムは赤枠になる (col-2 は wip_limit=1 で card が 2 枚)", () => {
    render(<KanbanScreen />);
    // overWip = col2 に card2 + card3 (2枚) > wip_limit=1
    expect(screen.getByText("2/1")).toBeInTheDocument();
  });

  it("マウント時に fetchBoard が呼ばれる", () => {
    render(<KanbanScreen />);
    expect(kanbanState.fetchBoard).toHaveBeenCalledWith("/tmp/devnest", "1");
  });

  it("← ボタンでカードを左に移動できる", () => {
    render(<KanbanScreen />);
    // card2 は col-2 (order=1)。← ボタンを押すと col-1 に移動
    const leftBtns = screen.getAllByText("←");
    fireEvent.click(leftBtns[0]);
    expect(kanbanState.moveCard).toHaveBeenCalledWith("/tmp/devnest", "1", "card-2", "col-1");
  });

  it("→ ボタンでカードを右に移動できる", () => {
    render(<KanbanScreen />);
    // card1 は col-1 (order=0)。→ ボタンを押すと col-2 に移動
    const rightBtns = screen.getAllByText("→");
    fireEvent.click(rightBtns[0]);
    expect(kanbanState.moveCard).toHaveBeenCalledWith("/tmp/devnest", "1", "card-1", "col-2");
  });

  it("× ボタンでカードを削除できる", () => {
    render(<KanbanScreen />);
    const deleteBtns = screen.getAllByText("×");
    fireEvent.click(deleteBtns[0]);
    expect(kanbanState.deleteCard).toHaveBeenCalled();
  });

  it("+ カードを追加 ボタンでインライン入力を表示", () => {
    render(<KanbanScreen />);
    const addBtns = screen.getAllByText("+ カードを追加");
    fireEvent.click(addBtns[0]);
    expect(screen.getByPlaceholderText("カードタイトルを入力...")).toBeInTheDocument();
    expect(screen.getByText("追加")).toBeInTheDocument();
    expect(screen.getByText("キャンセル")).toBeInTheDocument();
  });

  it("カード入力後 キャンセル で入力を閉じる", () => {
    render(<KanbanScreen />);
    const addBtns = screen.getAllByText("+ カードを追加");
    fireEvent.click(addBtns[0]);
    fireEvent.click(screen.getByText("キャンセル"));
    expect(screen.queryByPlaceholderText("カードタイトルを入力...")).not.toBeInTheDocument();
  });

  it("Escape キーで入力を閉じる", () => {
    render(<KanbanScreen />);
    const addBtns = screen.getAllByText("+ カードを追加");
    fireEvent.click(addBtns[0]);
    const input = screen.getByPlaceholderText("カードタイトルを入力...");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("カードタイトルを入力...")).not.toBeInTheDocument();
  });

  it("タイトルを入力して Enter でカードを作成", async () => {
    render(<KanbanScreen />);
    const addBtns = screen.getAllByText("+ カードを追加");
    fireEvent.click(addBtns[0]);
    const input = screen.getByPlaceholderText("カードタイトルを入力...");
    fireEvent.change(input, { target: { value: "新カード" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(kanbanState.createCard).toHaveBeenCalledWith(
      "/tmp/devnest", "1",
      expect.objectContaining({ title: "新カード", column_id: "col-1" })
    );
  });

  it("タイトルが空の場合はカードを作成しない", () => {
    render(<KanbanScreen />);
    const addBtns = screen.getAllByText("+ カードを追加");
    fireEvent.click(addBtns[0]);
    const input = screen.getByPlaceholderText("カードタイトルを入力...");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(kanbanState.createCard).not.toHaveBeenCalled();
  });

  it("追加 ボタンクリックでカードを作成", () => {
    render(<KanbanScreen />);
    const addBtns = screen.getAllByText("+ カードを追加");
    fireEvent.click(addBtns[0]);
    const input = screen.getByPlaceholderText("カードタイトルを入力...");
    fireEvent.change(input, { target: { value: "ボタン追加" } });
    fireEvent.click(screen.getByText("追加"));
    expect(kanbanState.createCard).toHaveBeenCalled();
  });
});
