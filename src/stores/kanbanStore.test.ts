import { beforeEach, describe, it, expect, vi } from "vitest";
import { useKanbanStore } from "./kanbanStore";
import type { KanbanBoard, KanbanCard, KanbanColumn, NewCard } from "../types";

const mockIpc = vi.hoisted(() => ({
  kanbanGetBoard: vi.fn(),
  kanbanMoveCard: vi.fn(),
  kanbanCreateCard: vi.fn(),
  kanbanDeleteCard: vi.fn(),
}));

vi.mock("../lib/ipc", () => mockIpc);

// ─── ヘルパー ──────────────────────────────────────────────────────

const projectPath = "/tmp/proj";
const productId = "prod-001";

const mockColumns: KanbanColumn[] = [
  { id: "todo", name: "Todo", order: 0 },
  { id: "in_progress", name: "In Progress", order: 1 },
  { id: "done", name: "Done", order: 2 },
];

const mockCard: KanbanCard = {
  id: "card-1",
  column_id: "todo",
  title: "タスク A",
  description: "説明",
  priority: "medium",
  labels: [],
  created_at: "2026-01-01",
  moved_at: "2026-01-01",
};

const mockCard2: KanbanCard = {
  ...mockCard,
  id: "card-2",
  title: "タスク B",
  column_id: "in_progress",
};

const mockBoard: KanbanBoard = {
  id: "board-1",
  product_id: productId,
  columns: mockColumns,
  cards: [mockCard, mockCard2],
};

function resetStore() {
  useKanbanStore.setState({ board: null, status: "idle" });
}

// ─── テスト ─────────────────────────────────────────────────────────

describe("kanbanStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ─ 初期状態 ──────────────────────────────────────────────────────

  describe("初期状態", () => {
    it("board が null", () => {
      expect(useKanbanStore.getState().board).toBeNull();
    });

    it("status が idle", () => {
      expect(useKanbanStore.getState().status).toBe("idle");
    });
  });

  // ─ fetchBoard ────────────────────────────────────────────────────

  describe("fetchBoard", () => {
    it("成功時に board と status=success がセットされる", async () => {
      mockIpc.kanbanGetBoard.mockResolvedValue(mockBoard);
      await useKanbanStore.getState().fetchBoard(projectPath, productId);
      const s = useKanbanStore.getState();
      expect(s.board).toEqual(mockBoard);
      expect(s.status).toBe("success");
    });

    it("loading → success の遷移", async () => {
      let capturedStatus: string | null = null;
      mockIpc.kanbanGetBoard.mockImplementation(async () => {
        capturedStatus = useKanbanStore.getState().status;
        return mockBoard;
      });
      await useKanbanStore.getState().fetchBoard(projectPath, productId);
      expect(capturedStatus).toBe("loading");
      expect(useKanbanStore.getState().status).toBe("success");
    });

    it("失敗時に status=error がセットされる", async () => {
      mockIpc.kanbanGetBoard.mockRejectedValue(new Error("fail"));
      await useKanbanStore.getState().fetchBoard(projectPath, productId);
      expect(useKanbanStore.getState().status).toBe("error");
      expect(useKanbanStore.getState().board).toBeNull();
    });

    it("正しい引数を渡す", async () => {
      mockIpc.kanbanGetBoard.mockResolvedValue(mockBoard);
      await useKanbanStore.getState().fetchBoard(projectPath, productId);
      expect(mockIpc.kanbanGetBoard).toHaveBeenCalledWith(projectPath, productId);
    });
  });

  // ─ moveCard ──────────────────────────────────────────────────────

  describe("moveCard", () => {
    const movedBoard: KanbanBoard = {
      ...mockBoard,
      cards: [{ ...mockCard, column_id: "in_progress" }, mockCard2],
    };

    it("成功時に board が更新される", async () => {
      useKanbanStore.setState({ board: mockBoard });
      mockIpc.kanbanMoveCard.mockResolvedValue(movedBoard);
      await useKanbanStore.getState().moveCard(projectPath, productId, "card-1", "in_progress");
      expect(useKanbanStore.getState().board).toEqual(movedBoard);
    });

    it("失敗時は board を変更しない", async () => {
      useKanbanStore.setState({ board: mockBoard });
      mockIpc.kanbanMoveCard.mockRejectedValue(new Error("fail"));
      await useKanbanStore.getState().moveCard(projectPath, productId, "card-1", "in_progress");
      expect(useKanbanStore.getState().board).toEqual(mockBoard);
    });

    it("正しい引数を渡す", async () => {
      mockIpc.kanbanMoveCard.mockResolvedValue(movedBoard);
      await useKanbanStore.getState().moveCard(projectPath, productId, "card-1", "done");
      expect(mockIpc.kanbanMoveCard).toHaveBeenCalledWith(projectPath, productId, "card-1", "done");
    });
  });

  // ─ createCard ────────────────────────────────────────────────────

  describe("createCard", () => {
    const newCardInput: NewCard = {
      column_id: "todo",
      title: "新しいカード",
      priority: "low",
      labels: [],
    };

    const createdCard: KanbanCard = {
      ...mockCard,
      id: "card-new",
      title: "新しいカード",
    };

    it("成功時に board.cards に追加され card を返す", async () => {
      useKanbanStore.setState({ board: mockBoard });
      mockIpc.kanbanCreateCard.mockResolvedValue(createdCard);
      const result = await useKanbanStore.getState().createCard(projectPath, productId, newCardInput);
      expect(result).toEqual(createdCard);
      const cards = useKanbanStore.getState().board?.cards;
      expect(cards).toHaveLength(3);
      expect(cards?.find((c) => c.id === "card-new")).toBeDefined();
    });

    it("board が null の場合は変更しない", async () => {
      useKanbanStore.setState({ board: null });
      mockIpc.kanbanCreateCard.mockResolvedValue(createdCard);
      await useKanbanStore.getState().createCard(projectPath, productId, newCardInput);
      expect(useKanbanStore.getState().board).toBeNull();
    });

    it("失敗時に null を返す", async () => {
      mockIpc.kanbanCreateCard.mockRejectedValue(new Error("fail"));
      const result = await useKanbanStore.getState().createCard(projectPath, productId, newCardInput);
      expect(result).toBeNull();
    });
  });

  // ─ deleteCard ────────────────────────────────────────────────────

  describe("deleteCard", () => {
    const boardAfterDelete: KanbanBoard = {
      ...mockBoard,
      cards: [mockCard2],
    };

    it("成功時に board が更新される", async () => {
      useKanbanStore.setState({ board: mockBoard });
      mockIpc.kanbanDeleteCard.mockResolvedValue(boardAfterDelete);
      await useKanbanStore.getState().deleteCard(projectPath, productId, "card-1");
      expect(useKanbanStore.getState().board?.cards).toHaveLength(1);
    });

    it("失敗時は board を変更しない", async () => {
      useKanbanStore.setState({ board: mockBoard });
      mockIpc.kanbanDeleteCard.mockRejectedValue(new Error("fail"));
      await useKanbanStore.getState().deleteCard(projectPath, productId, "card-1");
      expect(useKanbanStore.getState().board).toEqual(mockBoard);
    });
  });
});
