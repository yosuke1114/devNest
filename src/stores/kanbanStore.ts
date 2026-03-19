import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type { AsyncStatus, KanbanBoard, KanbanCard, NewCard } from "../types";

interface KanbanState {
  board: KanbanBoard | null;
  status: AsyncStatus;
  fetchBoard: (projectPath: string, productId: string) => Promise<void>;
  moveCard: (projectPath: string, productId: string, cardId: string, toColumn: string) => Promise<void>;
  createCard: (projectPath: string, productId: string, card: NewCard) => Promise<KanbanCard | null>;
  deleteCard: (projectPath: string, productId: string, cardId: string) => Promise<void>;
}

export const useKanbanStore = create<KanbanState>((set) => ({
  board: null,
  status: "idle",
  fetchBoard: async (projectPath, productId) => {
    set({ status: "loading" });
    try {
      const board = await ipc.kanbanGetBoard(projectPath, productId);
      set({ board, status: "success" });
    } catch {
      set({ status: "error" });
    }
  },
  moveCard: async (projectPath, productId, cardId, toColumn) => {
    try {
      const board = await ipc.kanbanMoveCard(projectPath, productId, cardId, toColumn);
      set({ board });
    } catch {
      // ignore
    }
  },
  createCard: async (projectPath, productId, card) => {
    try {
      const newCard = await ipc.kanbanCreateCard(projectPath, productId, card);
      set((s) => ({
        board: s.board
          ? { ...s.board, cards: [...s.board.cards, newCard] }
          : s.board,
      }));
      return newCard;
    } catch {
      return null;
    }
  },
  deleteCard: async (projectPath, productId, cardId) => {
    try {
      const board = await ipc.kanbanDeleteCard(projectPath, productId, cardId);
      set({ board });
    } catch {
      // ignore
    }
  },
}));
