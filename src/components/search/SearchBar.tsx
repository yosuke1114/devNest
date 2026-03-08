import { useState } from "react";
import { IconSearch, IconX, IconClock } from "@tabler/icons-react";

export type SearchType = "keyword" | "semantic" | "both";

export interface SearchBarProps {
  query: string;
  searchType: SearchType;
  history: { query: string }[];
  isLoading: boolean;
  onQueryChange: (q: string) => void;
  onSearchTypeChange: (t: "keyword" | "semantic") => void;
  onSelectHistory: (q: string) => void;
}

export function SearchBar({
  query,
  searchType,
  history,
  isLoading,
  onQueryChange,
  onSearchTypeChange,
  onSelectHistory,
}: SearchBarProps) {
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
              aria-label="クリア"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <IconX size={12} />
            </button>
          )}
          {isLoading && (
            <div
              data-testid="search-loading"
              className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"
            />
          )}
        </div>

        {/* 検索タイプ切替 */}
        <div className="flex rounded border border-white/20 overflow-hidden text-xs">
          {(["keyword", "semantic"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onSearchTypeChange(t)}
              aria-pressed={searchType === t ? "true" : "false"}
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
