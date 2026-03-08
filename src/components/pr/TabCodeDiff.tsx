import { IconFileCode } from "@tabler/icons-react";
import type { PrFile } from "../../types";
import { parseDiff } from "../../lib/diffParser";

interface TabCodeDiffProps {
  files: PrFile[];
  diff: string;
  filesStatus: string;
  diffStatus: string;
  onLoadFiles: () => void;
  onLoadDiff: () => void;
}

export function TabCodeDiff({
  files,
  diff,
  filesStatus,
  diffStatus,
  onLoadFiles,
  onLoadDiff,
}: TabCodeDiffProps) {
  const fileDiffs = diff ? parseDiff(diff) : [];

  if (filesStatus === "idle" && diffStatus === "idle") {
    return (
      <div className="p-4 space-y-2">
        <button
          onClick={() => {
            onLoadFiles();
            onLoadDiff();
          }}
          className="px-3 py-2 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
        >
          Load diff
        </button>
      </div>
    );
  }

  if (filesStatus === "loading" || diffStatus === "loading") {
    return <div className="p-4 text-xs text-gray-400">Loading...</div>;
  }

  return (
    <div className="overflow-y-auto p-4 space-y-4">
      {/* File summary */}
      {files.length > 0 && (
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs font-medium text-gray-400 mb-2">
            Files changed ({files.length})
          </div>
          <div className="space-y-1">
            {files.map((f) => (
              <div key={f.filename} className="flex items-center gap-2 text-xs">
                <IconFileCode size={12} className="text-gray-500 shrink-0" />
                <span className="font-mono text-gray-300 flex-1 truncate">{f.filename}</span>
                <span className="text-green-400 shrink-0">+{f.additions}</span>
                <span className="text-red-400 shrink-0">-{f.deletions}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diff hunks */}
      {fileDiffs.map((fd) => (
        <div key={fd.filename} className="rounded-lg border border-white/10 overflow-hidden">
          <div className="px-3 py-2 bg-white/5 text-xs font-mono text-gray-300 border-b border-white/10">
            {fd.filename}
          </div>
          {fd.hunks.map((hunk, hi) => (
            <div key={hi}>
              <div className="px-3 py-1 bg-blue-950/40 text-[10px] font-mono text-blue-300">
                {hunk.header}
              </div>
              <div className="font-mono text-[11px] leading-5">
                {hunk.lines.map((line, li) => (
                  <div
                    key={li}
                    className={`flex ${
                      line.type === "add"
                        ? "bg-green-950/40 text-green-300"
                        : line.type === "remove"
                        ? "bg-red-950/40 text-red-300"
                        : "text-gray-400"
                    }`}
                  >
                    <span className="w-10 px-2 text-right text-gray-600 select-none shrink-0">
                      {line.oldLineNo ?? ""}
                    </span>
                    <span className="w-10 px-2 text-right text-gray-600 select-none shrink-0">
                      {line.newLineNo ?? ""}
                    </span>
                    <span className="px-2 whitespace-pre flex-1 overflow-x-auto">
                      {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                      {line.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
