import { IconFileText, IconExternalLink } from "@tabler/icons-react";
import { highlightKeyword } from "../../lib/highlightKeyword";
import type { SearchResult } from "../../types";

export interface DocumentPreviewProps {
  result: SearchResult | null;
  keyword: string;
  onOpen: (documentId: number, startLine: number) => void;
}

export function DocumentPreview({ result, keyword, onOpen }: DocumentPreviewProps) {
  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
        検索結果を選択してプレビュー
      </div>
    );
  }

  const lines = result.content.split("\n");

  return (
    <div data-testid="document-preview" className="flex-1 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <IconFileText size={14} className="text-gray-400" />
          <span className="text-sm text-gray-200">{result.path}</span>
        </div>
        <button
          onClick={() => onOpen(result.document_id, result.start_line)}
          aria-label="エディタで開く"
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
