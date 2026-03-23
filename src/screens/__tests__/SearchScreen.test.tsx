/**
 * SearchScreen 追加テスト — コールバック経由で未カバー行をカバー
 */
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProject = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest", default_branch: "main",
  repo_owner: "yo", repo_name: "devnest", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockResult = {
  chunk_id: 1, document_id: 10,
  path: "docs/foo.md", title: "Foo", content: "bar baz", score: 0.9,
  start_line: 5,
};

// ─── モック状態 ──────────────────────────────────────────────────────────────

const projectState = { currentProject: mockProject as typeof mockProject | null };
const searchState = {
  query: "",
  searchType: "keyword" as string,
  results: [] as typeof mockResult[],
  history: [] as string[],
  searchStatus: "idle" as string,
  activeResultId: null as number | null,
  setQuery: vi.fn(),
  setSearchType: vi.fn(),
  setActiveResult: vi.fn(),
  search: vi.fn(() => Promise.resolve()),
  loadHistory: vi.fn(),
  openInEditor: vi.fn(),
};

const documentState = { openDocument: vi.fn() };
const uiState = { navigate: vi.fn() };

// Mocks that expose props as callable buttons

vi.mock("../../components/search/SearchBar", () => ({
  SearchBar: ({
    onQueryChange,
    onSelectHistory,
    onSearchTypeChange,
  }: {
    onQueryChange: (v: string) => void;
    onSelectHistory: (q: string) => void;
    onSearchTypeChange: (t: string) => void;
    query: string;
    searchType: string;
    history: string[];
    isLoading: boolean;
  }) => (
    <div data-testid="search-bar">
      <button onClick={() => onQueryChange("te")}>short-query</button>
      <button onClick={() => onQueryChange("tauri search")}>long-query</button>
      <button onClick={() => onSelectHistory("history-query")}>select-history</button>
      <button onClick={() => onSearchTypeChange("semantic")}>change-type</button>
    </div>
  ),
}));

vi.mock("../../components/search/SearchResultList", () => ({
  SearchResultList: () => <div data-testid="search-result-list" />,
}));

vi.mock("../../components/search/DocumentPreview", () => ({
  DocumentPreview: ({
    result,
    onOpen,
  }: {
    result: typeof mockResult | null;
    keyword: string;
    onOpen: (documentId: number, startLine: number) => void;
  }) => (
    <div data-testid="document-preview">
      {result && (
        <button onClick={() => onOpen(result.document_id, result.start_line)}>
          open-doc
        </button>
      )}
    </div>
  ),
}));

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn((sel?: (s: typeof projectState) => unknown) =>
    sel ? sel(projectState) : projectState
  ),
}));

vi.mock("../../stores/searchStore", () => ({
  useSearchStore: vi.fn((sel?: (s: typeof searchState) => unknown) =>
    sel ? sel(searchState) : searchState
  ),
}));

vi.mock("../../stores/documentStore", () => ({
  useDocumentStore: vi.fn((sel?: (s: typeof documentState) => unknown) =>
    sel ? sel(documentState) : documentState
  ),
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn((sel?: (s: typeof uiState) => unknown) =>
    sel ? sel(uiState) : uiState
  ),
}));

import { SearchScreen } from "../SearchScreen";

describe("SearchScreen — コールバックカバレッジ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    searchState.query = "";
    searchState.results = [];
    searchState.history = [];
    searchState.searchStatus = "idle";
    searchState.activeResultId = null;
    searchState.setQuery = vi.fn();
    searchState.setSearchType = vi.fn();
    searchState.setActiveResult = vi.fn();
    searchState.search = vi.fn(() => Promise.resolve());
    searchState.loadHistory = vi.fn();
    searchState.openInEditor = vi.fn();
    documentState.openDocument = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("マウント時に loadHistory が呼ばれる", () => {
    render(<SearchScreen />);
    expect(searchState.loadHistory).toHaveBeenCalledWith(1);
  });

  it("短いクエリ変更 (<2文字) では search を呼ばない", () => {
    render(<SearchScreen />);
    fireEvent.click(screen.getByText("short-query"));
    expect(searchState.setQuery).toHaveBeenCalledWith("te");
    expect(searchState.search).not.toHaveBeenCalled();
  });

  it("長いクエリ変更 (>=2文字) で debounce 後に search が呼ばれる", async () => {
    vi.useFakeTimers();
    render(<SearchScreen />);
    fireEvent.click(screen.getByText("long-query"));
    expect(searchState.setQuery).toHaveBeenCalledWith("tauri search");
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(searchState.search).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });

  it("履歴選択で setQuery と search が呼ばれる", () => {
    render(<SearchScreen />);
    fireEvent.click(screen.getByText("select-history"));
    expect(searchState.setQuery).toHaveBeenCalledWith("history-query");
    expect(searchState.search).toHaveBeenCalledWith(1);
  });

  it("searchType 変更で setSearchType が呼ばれる", () => {
    render(<SearchScreen />);
    fireEvent.click(screen.getByText("change-type"));
    expect(searchState.setSearchType).toHaveBeenCalledWith("semantic");
  });

  it("searchType 変更で query>=2 のとき search が呼ばれる", () => {
    searchState.query = "tauri";
    render(<SearchScreen />);
    fireEvent.click(screen.getByText("change-type"));
    expect(searchState.search).toHaveBeenCalledWith(1);
  });

  it("searchType 変更で query<2 のとき search を呼ばない", () => {
    searchState.query = "t";
    render(<SearchScreen />);
    fireEvent.click(screen.getByText("change-type"));
    expect(searchState.search).not.toHaveBeenCalled();
  });

  it("結果ありのときにプレビューの open で openInEditor が呼ばれる", () => {
    searchState.results = [mockResult];
    render(<SearchScreen />);
    fireEvent.click(screen.getByText("open-doc"));
    expect(searchState.openInEditor).toHaveBeenCalledWith(
      10, 5, uiState.navigate, documentState.openDocument
    );
  });

  it("activeResultId に一致する結果がアクティブになる", () => {
    const r2 = { ...mockResult, chunk_id: 2, document_id: 20, start_line: 10 };
    searchState.results = [mockResult, r2];
    searchState.activeResultId = 2;
    render(<SearchScreen />);
    // DocumentPreview に activeResult = r2 が渡される → onOpen で document_id=20
    fireEvent.click(screen.getByText("open-doc"));
    expect(searchState.openInEditor).toHaveBeenCalledWith(
      20, 10, uiState.navigate, documentState.openDocument
    );
  });
});
