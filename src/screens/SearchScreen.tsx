import { useEffect, useRef, useState } from "react";
import {
  IconSearch,
  IconX,
  IconClock,
  IconFileText,
  IconExternalLink,
} from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useSearchStore } from "../stores/searchStore";
import { useDocumentStore } from "../stores/documentStore";
import { useUiStore } from "../stores/uiStore";
import type { SearchResult } from "../types";

// ─── ハイライト ───────────────────────────────────────────────────────────────

function highlightKeyword(text: string, keyword: string): React.ReactNode {
  if (!keyword.trim()) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-yellow-300/30 text-yellow-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

// ─── SearchBar ────────────────────────────────────────────────────────────────

type SearchType = "keyword" | "semantic" | "both";

function SearchBar({
  query,
  searchType,
  history,
  isLoading,
  onQueryChange,
  onSearchTypeChange,
  onSelectHistory,
}: {
  query: string;
  searchType: SearchType;
  history: { query: string }[];
  isLoading: boolean;
  onQueryChange: (q: string) => void;
  onSearchTypeChange: (t: SearchType) => void;
  onSelectHistory: (q: string) => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <div className="relative px-4 py-3 border-b border-white/10">
      <div className="flex items-center gap-2">
        {/* 検索入力 */}
        <div className="flex-1 relative">
          <IconSearch
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="設計書を検索…（例: git2-rs commit 処理）"
            className="w-full pl-8 pr-8 py-1.5 rounded bg-white/10 text-sm text-white placeholder-gray-500 border border-white/10 focus:border-blue-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <IconX size={12} />
            </button>
          )}
          {isLoading && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* 検索タイプ切替 */}
        <div className="flex rounded border border-white/20 overflow-hidden text-xs">
          {(["keyword", "semantic"] as SearchType[]).map((t) => (
            <button
              key={t}
              onClick={() => onSearchTypeChange(t)}
              className={`px-2.5 py-1.5 capitalize transition-colors ${
                searchType === t
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-white/10"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 履歴サジェスト */}
      {showSuggestions && history.length > 0 && !query && (
        <div className="absolute top-full left-4 right-4 mt-1 z-10 rounded-lg border border-white/10 bg-gray-900 shadow-xl overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-white/10">
            最近の検索
          </div>
          {history.slice(0, 5).map((h) => (
            <button
              key={h.query}
              onClick={() => onSelectHistory(h.query)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 transition-colors"
            >
              <IconClock size={11} className="text-gray-500 shrink-0" />
              {h.query}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SearchResultItem ─────────────────────────────────────────────────────────

function SearchResultItem({
  result,
  isActive,
  keyword,
  onClick,
}: {
  result: SearchResult;
  isActive: boolean;
  keyword: string;
  onClick: () => void;
}) {
  // filename: result.path.split("/").pop() ?? result.path;
  const preview = result.content.slice(0, 120);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-white/5 transition-colors hover:bg-white/5 ${
        isActive ? "bg-white/10 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <IconFileText size={11} className="text-gray-500 shrink-0" />
        <span className="text-[11px] text-gray-400 truncate">{result.path}</span>
      </div>
      {result.section_heading && (
        <div className="text-xs font-medium text-blue-300 truncate mb-0.5">
          {result.section_heading}
        </div>
      )}
      <div className="text-[11px] text-gray-400 line-clamp-2">
        {highlightKeyword(preview, keyword)}
      </div>
    </button>
  );
}

// ─── DocumentPreview ──────────────────────────────────────────────────────────

function DocumentPreview({
  result,
  keyword,
  onOpen,
}: {
  result: SearchResult | null;
  keyword: string;
  onOpen: (documentId: number, startLine: number) => void;
}) {
  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
        検索結果を選択してプレビュー
      </div>
    );
  }

  const lines = result.content.split("\n");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <IconFileText size={14} className="text-gray-400" />
          <span className="text-sm text-gray-200">{result.path}</span>
        </div>
        <button
          onClick={() => onOpen(result.document_id, result.start_line)}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <IconExternalLink size={11} />
          エディタで開く
        </button>
      </div>

      {/* チャンクプレビュー */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
        {result.section_heading && (
          <div className="text-blue-300 font-bold mb-2">{result.section_heading}</div>
        )}
        <div className="space-y-0.5">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-3">
              <span className="w-8 text-right text-gray-600 select-none shrink-0">
                {result.start_line + i}
              </span>
              <span className="text-gray-300 whitespace-pre-wrap flex-1">
                {highlightKeyword(line, keyword)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
        <div className="w-72 shrink-0 flex flex-col border-r border-white/10 overflow-y-auto">
          {searchStatus === "idle" && query.length < 2 ? (
            <div className="p-4 text-xs text-gray-500">2 文字以上入力して検索</div>
          ) : results.length === 0 && searchStatus === "success" ? (
            <div className="p-4 text-xs text-gray-500">
              「{query}」に一致する設計書が見つかりませんでした。
            </div>
          ) : (
            <>
              {results.length > 0 && (
                <div className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-white/10">
                  {results.length} 件
                </div>
              )}
              {results.map((r) => (
                <SearchResultItem
                  key={r.chunk_id}
                  result={r}
                  isActive={r.chunk_id === activeResultId}
                  keyword={query}
                  onClick={() => setActiveResult(r.chunk_id)}
                />
              ))}
            </>
          )}
        </div>

        {/* プレビュー */}
        <DocumentPreview result={activeResult} keyword={query} onOpen={handleOpen} />
      </div>
    </div>
  );
}
