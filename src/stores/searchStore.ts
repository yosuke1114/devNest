import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type { AsyncStatus, SearchHistory, SearchResult } from "../types";

type SearchType = "keyword" | "semantic" | "both";

interface SearchState {
  query: string;
  searchType: SearchType;
  results: SearchResult[];
  history: SearchHistory[];
  searchStatus: AsyncStatus;
  historyStatus: AsyncStatus;
  activeResultId: number | null; // chunk_id
  error: string | null;

  setQuery: (q: string) => void;
  setSearchType: (t: SearchType) => void;
  setActiveResult: (chunkId: number | null) => void;
  search: (projectId: number) => Promise<void>;
  loadHistory: (projectId: number) => Promise<void>;
  openInEditor: (
    documentId: number,
    startLine: number,
    navigateFn: (screen: import("../types").ScreenName) => void,
    openDocFn: (docId: number) => void
  ) => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  searchType: "keyword",
  results: [],
  history: [],
  searchStatus: "idle",
  historyStatus: "idle",
  activeResultId: null,
  error: null,

  setQuery: (query) => set({ query }),

  setSearchType: (searchType) => set({ searchType }),

  setActiveResult: (chunkId) => set({ activeResultId: chunkId }),

  search: async (projectId) => {
    const { query, searchType } = get();
    if (query.trim().length < 2) return;

    set({ searchStatus: "loading", error: null });
    try {
      let results: SearchResult[];
      if (searchType === "semantic") {
        results = await ipc.documentSearchSemantic(projectId, query);
      } else {
        results = await ipc.documentSearchKeyword(projectId, query);
      }
      set({ results, searchStatus: "success", activeResultId: results[0]?.chunk_id ?? null });
    } catch (e) {
      set({ searchStatus: "error", error: String(e), results: [] });
    }
  },

  loadHistory: async (projectId) => {
    set({ historyStatus: "loading" });
    try {
      const history = await ipc.searchHistoryList(projectId);
      set({ history, historyStatus: "success" });
    } catch (e) {
      set({ historyStatus: "idle" });
    }
  },

  openInEditor: (documentId, startLine, navigateFn, openDocFn) => {
    void openDocFn(documentId);
    navigateFn("editor");
    // scrollToLine は EditorScreen 側で startLine を受け取る仕組みが必要
    // 現時点はドキュメントを開くのみ
    void startLine;
  },

  reset: () => set({ query: "", results: [], activeResultId: null }),
}));
