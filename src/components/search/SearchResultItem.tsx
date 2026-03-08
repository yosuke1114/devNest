import { IconFileText } from "@tabler/icons-react";
import { highlightKeyword } from "../../lib/highlightKeyword";
import type { SearchResult } from "../../types";

export interface SearchResultItemProps {
  result: SearchResult;
  isActive: boolean;
  keyword: string;
  onClick: () => void;
}

export function SearchResultItem({ result, isActive, keyword, onClick }: SearchResultItemProps) {
  const preview = result.content.slice(0, 120);

  return (
    <button
      onClick={onClick}
      data-active={isActive ? "true" : "false"}
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
