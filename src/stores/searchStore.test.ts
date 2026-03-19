import { beforeEach, describe, it, expect, vi } from "vitest";
import { useSearchStore } from "./searchStore";
import * as ipc from "../lib/ipc";
import type { SearchResult, SearchHistory } from "../types";

vi.mock("../lib/ipc");
const mockIpc = vi.mocked(ipc);

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    document_id: 1,
    chunk_id: 10,
    path: "docs/spec.md",
    title: null,
    section_heading: "## Overview",
    content: "This is the content.",
    start_line: 5,
    score: 0.95,
    ...overrides,
  };
}

// ─── searchStore ──────────────────────────────────────────────────────────────

describe("searchStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchStore.setState({
      query: "",
      searchType: "keyword",
      results: [],
      history: [],
      searchStatus: "idle",
      historyStatus: "idle",
      activeResultId: null,
      error: null,
    });
  });

  // 🔴 Red: 初期状態が正しいこと
  it("初期状態が正しい", () => {
    const s = useSearchStore.getState();
    expect(s.query).toBe("");
    expect(s.results).toEqual([]);
    expect(s.searchStatus).toBe("idle");
    expect(s.activeResultId).toBeNull();
  });

  // 🔴 Red: setQuery() でクエリが更新されること
  it("setQuery() でクエリが更新される", () => {
    useSearchStore.getState().setQuery("architecture");
    expect(useSearchStore.getState().query).toBe("architecture");
  });

  // 🔴 Red: setSearchType() で検索タイプが変わること
  it("setSearchType('semantic') で searchType が変わる", () => {
    useSearchStore.getState().setSearchType("semantic");
    expect(useSearchStore.getState().searchType).toBe("semantic");
  });

  // 🔴 Red: 短いクエリ（2文字未満）は search() を実行しないこと
  it("クエリが 2 文字未満の場合 search() は何も呼ばない", async () => {
    useSearchStore.setState({ query: "a" });
    await useSearchStore.getState().search(1);
    expect(mockIpc.documentSearchKeyword).not.toHaveBeenCalled();
    expect(useSearchStore.getState().searchStatus).toBe("idle");
  });

  // 🔴 Red: 空クエリは search() を実行しないこと
  it("空クエリは search() を何も呼ばない", async () => {
    useSearchStore.setState({ query: "  " });
    await useSearchStore.getState().search(1);
    expect(mockIpc.documentSearchKeyword).not.toHaveBeenCalled();
  });

  // 🔴 Red: keyword 検索が documentSearchKeyword を呼ぶこと
  it("searchType='keyword' のとき documentSearchKeyword を呼ぶ", async () => {
    const results = [makeSearchResult()];
    mockIpc.documentSearchKeyword.mockResolvedValueOnce(results);

    useSearchStore.setState({ query: "git2-rs", searchType: "keyword" });
    await useSearchStore.getState().search(1);

    expect(mockIpc.documentSearchKeyword).toHaveBeenCalledWith(1, "git2-rs");
    expect(useSearchStore.getState().results).toEqual(results);
    expect(useSearchStore.getState().searchStatus).toBe("success");
  });

  // 🔴 Red: semantic 検索が documentSearchSemantic を呼ぶこと
  it("searchType='semantic' のとき documentSearchSemantic を呼ぶ", async () => {
    const results = [makeSearchResult({ chunk_id: 99 })];
    mockIpc.documentSearchSemantic.mockResolvedValueOnce(results);

    useSearchStore.setState({ query: "認証", searchType: "semantic" });
    await useSearchStore.getState().search(1);

    expect(mockIpc.documentSearchSemantic).toHaveBeenCalledWith(1, "認証");
    expect(useSearchStore.getState().results).toHaveLength(1);
  });

  // 🔴 Red: 検索成功時に activeResultId が最初の chunk_id になること
  it("検索成功後 activeResultId が最初の結果の chunk_id になる", async () => {
    const results = [makeSearchResult({ chunk_id: 42 })];
    mockIpc.documentSearchKeyword.mockResolvedValueOnce(results);

    useSearchStore.setState({ query: "test query", searchType: "keyword" });
    await useSearchStore.getState().search(1);

    expect(useSearchStore.getState().activeResultId).toBe(42);
  });

  // 🔴 Red: 検索結果が空のとき activeResultId が null になること
  it("検索結果が空のとき activeResultId は null", async () => {
    mockIpc.documentSearchKeyword.mockResolvedValueOnce([]);

    useSearchStore.setState({ query: "no-match", searchType: "keyword" });
    await useSearchStore.getState().search(1);

    expect(useSearchStore.getState().activeResultId).toBeNull();
  });

  // 🔴 Red: 検索失敗時に error がセットされること
  it("search() 失敗時に error がセットされる", async () => {
    mockIpc.documentSearchKeyword.mockRejectedValueOnce(new Error("DB error"));

    useSearchStore.setState({ query: "something", searchType: "keyword" });
    await useSearchStore.getState().search(1);

    expect(useSearchStore.getState().searchStatus).toBe("error");
    expect(useSearchStore.getState().error).toBeTruthy();
    expect(useSearchStore.getState().results).toEqual([]);
  });

  // 🔴 Red: reset() でクエリ・結果・activeResultId がリセットされること
  it("reset() でクエリと結果がクリアされる", () => {
    useSearchStore.setState({
      query: "old query",
      results: [makeSearchResult()],
      activeResultId: 10,
    });
    useSearchStore.getState().reset();

    expect(useSearchStore.getState().query).toBe("");
    expect(useSearchStore.getState().results).toEqual([]);
    expect(useSearchStore.getState().activeResultId).toBeNull();
  });

  // 🔴 Red: loadHistory() が searchHistoryList を呼ぶこと
  it("loadHistory() が searchHistoryList を呼ぶ", async () => {
    const history: SearchHistory[] = [
      { id: 1, project_id: 1, query: "git", search_type: "keyword", result_count: 3, created_at: "2026-01-01T00:00:00Z" },
    ];
    mockIpc.searchHistoryList.mockResolvedValueOnce(history);

    await useSearchStore.getState().loadHistory(1);

    expect(mockIpc.searchHistoryList).toHaveBeenCalledWith(1);
    expect(useSearchStore.getState().history).toEqual(history);
    expect(useSearchStore.getState().historyStatus).toBe("success");
  });

  // 🔴 Red: setActiveResult() で activeResultId が変わること
  it("setActiveResult() で activeResultId が変わる", () => {
    useSearchStore.getState().setActiveResult(77);
    expect(useSearchStore.getState().activeResultId).toBe(77);

    useSearchStore.getState().setActiveResult(null);
    expect(useSearchStore.getState().activeResultId).toBeNull();
  });

  // 🔴 Red: openInEditor() が navigateFn と openDocFn を呼ぶこと
  it("openInEditor() が navigateFn と openDocFn を呼ぶ", () => {
    const navigateFn = vi.fn();
    const openDocFn = vi.fn();

    useSearchStore.getState().openInEditor(42, 10, navigateFn, openDocFn);

    expect(openDocFn).toHaveBeenCalledWith(42);
    expect(navigateFn).toHaveBeenCalledWith("editor");
  });

  it("searchType='both' のとき keyword と semantic を並列で呼んで重複排除する", async () => {
    const r1 = makeSearchResult({ chunk_id: 1, score: 0.9 });
    const r2 = makeSearchResult({ chunk_id: 2, score: 0.8 });
    const r3 = makeSearchResult({ chunk_id: 1, score: 0.85 }); // chunk_id=1 の重複
    mockIpc.documentSearchKeyword.mockResolvedValueOnce([r1, r2]);
    mockIpc.documentSearchSemantic.mockResolvedValueOnce([r3, makeSearchResult({ chunk_id: 3, score: 0.7 })]);

    useSearchStore.setState({ query: "auth impl", searchType: "both" });
    await useSearchStore.getState().search(1);

    const results = useSearchStore.getState().results;
    expect(mockIpc.documentSearchKeyword).toHaveBeenCalled();
    expect(mockIpc.documentSearchSemantic).toHaveBeenCalled();
    // chunk_id=1 の重複が排除されて 3 件
    expect(results).toHaveLength(3);
    // スコア降順で並んでいる
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  it("loadHistory() 失敗時に historyStatus が idle に戻る", async () => {
    mockIpc.searchHistoryList.mockRejectedValueOnce(new Error("fail"));
    useSearchStore.setState({ historyStatus: "loading" });
    await useSearchStore.getState().loadHistory(1);
    expect(useSearchStore.getState().historyStatus).toBe("idle");
  });
});
