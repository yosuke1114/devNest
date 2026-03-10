import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── store モック ──────────────────────────────────────────────────────────────
const mockProjectStore = {
  currentProject: { id: 1, name: "TestProject" } as { id: number; name: string } | null,
};

const mockSearchStore = {
  query: "",
  searchType: "keyword" as string,
  results: [] as { chunk_id: number; path: string; content: string }[],
  history: [] as string[],
  searchStatus: "idle" as string,
  activeResultId: null as number | null,
  setQuery: vi.fn(),
  setSearchType: vi.fn(),
  setActiveResult: vi.fn(),
  search: vi.fn(),
  loadHistory: vi.fn(),
  openInEditor: vi.fn(),
};

const mockDocumentStore = {
  openDocument: vi.fn(),
};

const mockUiStore = {
  navigate: vi.fn(),
};

vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/searchStore", () => ({
  useSearchStore: (sel?: (s: typeof mockSearchStore) => unknown) =>
    sel ? sel(mockSearchStore) : mockSearchStore,
}));
vi.mock("../stores/documentStore", () => ({
  useDocumentStore: (sel?: (s: typeof mockDocumentStore) => unknown) =>
    sel ? sel(mockDocumentStore) : mockDocumentStore,
}));
vi.mock("../stores/uiStore", () => ({
  useUiStore: (sel?: (s: typeof mockUiStore) => unknown) =>
    sel ? sel(mockUiStore) : mockUiStore,
}));
vi.mock("../components/search/SearchBar", () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));
vi.mock("../components/search/SearchResultList", () => ({
  SearchResultList: () => <div data-testid="search-result-list" />,
}));
vi.mock("../components/search/DocumentPreview", () => ({
  DocumentPreview: () => <div data-testid="document-preview" />,
}));

import { SearchScreen } from "./SearchScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("SearchScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.currentProject = { id: 1, name: "TestProject" };
    mockSearchStore.query = "";
    mockSearchStore.results = [];
    mockSearchStore.history = [];
    mockSearchStore.searchStatus = "idle";
    mockSearchStore.activeResultId = null;
  });

  it("currentProject が null の場合「プロジェクトを選択してください」が表示される", () => {
    mockProjectStore.currentProject = null;
    render(<SearchScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("初期マウント時に loadHistory が呼ばれる", () => {
    render(<SearchScreen />);
    expect(mockSearchStore.loadHistory).toHaveBeenCalledWith(1);
  });

  it("SearchBar が表示される", () => {
    render(<SearchScreen />);
    expect(screen.getByTestId("search-bar")).toBeInTheDocument();
  });

  it("SearchResultList が表示される", () => {
    render(<SearchScreen />);
    expect(screen.getByTestId("search-result-list")).toBeInTheDocument();
  });

  it("DocumentPreview が表示される", () => {
    render(<SearchScreen />);
    expect(screen.getByTestId("document-preview")).toBeInTheDocument();
  });
});
