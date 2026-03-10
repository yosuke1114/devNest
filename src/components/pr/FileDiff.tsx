import type { FileDiffResult } from "../../lib/diffParser";
import type { PrComment } from "../../types";
import { FileDiffHeader } from "./FileDiffHeader";
import { DiffHunkWithComments } from "./DiffHunkWithComments";

interface FileDiffProps {
  fileDiff: FileDiffResult;
  comments?: PrComment[];
  onAddComment?: (path: string, line: number) => void;
}

export function FileDiff({ fileDiff, comments = [], onAddComment }: FileDiffProps) {
  const fileComments = comments.filter((c) => c.path === fileDiff.filename);

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden" data-testid="file-diff">
      <FileDiffHeader
        filename={fileDiff.filename}
        additions={0}
        deletions={0}
      />
      {fileDiff.hunks.length === 0 ? (
        <div className="px-3 py-4 text-xs text-gray-400">No changes</div>
      ) : (
        fileDiff.hunks.map((hunk, hi) => (
          <DiffHunkWithComments
            key={hi}
            hunk={hunk}
            comments={fileComments}
            onAddComment={
              onAddComment
                ? (line: number) => onAddComment(fileDiff.filename, line)
                : undefined
            }
          />
        ))
      )}
    </div>
  );
}
