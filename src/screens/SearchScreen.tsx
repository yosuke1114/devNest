import { useEffect, useRef } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useSearchStore } from "../stores/searchStore";
import { useDocumentStore } from "../stores/documentStore";
import { useUiStore } from "../stores/uiStore";
import { SearchBar } from "../components/search/SearchBar";
import { SearchResultList } from "../components/search/SearchResultList";
import { DocumentPreview } from "../components/search/DocumentPreview";

// ─── SearchScreen ─────────────────────────────────────────────────────────────

export function SearchScreen() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const { query, searchType, results, history, searchStatus, activeResultId } = useSearchStore();
  const { setQuery, setSearchType, setActiveResult, search, loadHistory, openInEditor } =
    useSearchStore();
  const openDocument = useDocumentStore((s) => s.openDocument);
  const navigate = useUiStore((s) => s.navigate);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentProject) {
      loadHistory(currentProject.id);
    }
  }, [currentProject, loadHistory]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2 && currentProject) {
      debounceRef.current = setTimeout(() => {
        search(currentProject.id);
      }, 300);
    }
  };

  const handleSelectHistory = (q: string) => {
    setQuery(q);
    if (currentProject) search(currentProject.id);
  };

  const handleOpen = (documentId: number, startLine: number) => {
    openInEditor(documentId, startLine, navigate, openDocument);
  };

  const activeResult =
    results.find((r) => r.chunk_id === activeResultId) ?? results[0] ?? null;

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div data-testid="search-screen" className="flex-1 flex flex-col overflow-hidden">
      <SearchBar
        query={query}
        searchType={searchType}
        history={history}
        isLoading={searchStatus === "loading"}
        onQueryChange={handleQueryChange}
        onSearchTypeChange={(t) => {
          setSearchType(t);
          if (query.trim().length >= 2) search(currentProject.id);
        }}
        onSelectHistory={handleSelectHistory}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 結果リスト */}
        <div className="w-72 shrink-0 flex flex-col border-r border-border overflow-y-auto">
          <SearchResultList
            results={results}
            status={searchStatus}
            query={query}
            activeResultId={activeResultId}
            keyword={query}
            onSelect={setActiveResult}
          />
        </div>

        {/* プレビュー */}
        <DocumentPreview result={activeResult} keyword={query} onOpen={handleOpen} />
      </div>
    </div>
  );
}
