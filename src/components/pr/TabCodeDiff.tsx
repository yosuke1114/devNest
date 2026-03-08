import { IconFileCode } from "@tabler/icons-react";
import type { PrFile } from "../../types";
import { parseDiff } from "../../lib/diffParser";
import { FileDiff } from "./FileDiff";

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

      {/* Diff hunks via FileDiff */}
      {fileDiffs.map((fd) => (
        <FileDiff key={fd.filename} fileDiff={fd} />
      ))}
    </div>
  );
}
