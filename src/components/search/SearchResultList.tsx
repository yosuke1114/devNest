import type { SearchResult } from "../../types";
import { SearchResultItem } from "./SearchResultItem";

export interface SearchResultListProps {
  results: SearchResult[];
  status: string;
  query: string;
  activeResultId: number | null;
  keyword: string;
  onSelect: (chunkId: number) => void;
}

export function SearchResultList({
  results,
  status,
  query,
  activeResultId,
  keyword,
  onSelect,
}: SearchResultListProps) {
  if (status === "idle" && query.length < 2) {
    return (
      <div className="p-4 text-xs text-gray-500">2 文字以上入力して検索</div>
    );
  }

  if (results.length === 0 && status === "success") {
    return (
      <div className="p-4 text-xs text-gray-500">
        「{query}」に一致する設計書が見つかりませんでした。
      </div>
    );
  }

  return (
    <div data-testid="search-result-list">
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
          keyword={keyword}
          onClick={() => onSelect(r.chunk_id)}
        />
      ))}
    </div>
  );
}
