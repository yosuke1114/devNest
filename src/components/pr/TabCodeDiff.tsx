import { useState } from "react";
import { IconFileCode, IconSend, IconX } from "@tabler/icons-react";
import type { PrFile, PrComment } from "../../types";
import { parseDiff } from "../../lib/diffParser";
import { FileDiff } from "./FileDiff";

interface TabCodeDiffProps {
  files: PrFile[];
  diff: string;
  filesStatus: string;
  diffStatus: string;
  comments?: PrComment[];
  onLoadFiles: () => void;
  onLoadDiff: () => void;
  onAddComment?: (path: string, line: number, body: string) => Promise<void>;
}

interface CommentTarget {
  path: string;
  line: number;
}

function InlineCommentForm({
  target,
  onSubmit,
  onCancel,
}: {
  target: CommentTarget;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="border border-blue-700/40 rounded-lg p-3 bg-blue-950/20 space-y-2 mt-2">
      <div className="text-[11px] text-blue-300 font-mono">
        {target.path}:{target.line}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="コメントを入力…"
        className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-gray-200 resize-none h-16 focus:outline-none focus:border-blue-500"
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-white/10 transition-colors"
        >
          CANCEL
        </button>
        <button
          onClick={() => { if (text.trim()) onSubmit(text.trim()); }}
          disabled={!text.trim()}
          className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
        >
          <IconSend size={11} /> ADD COMMENT
        </button>
      </div>
    </div>
  );
}

export function TabCodeDiff({
  files,
  diff,
  filesStatus,
  diffStatus,
  comments = [],
  onLoadFiles,
  onLoadDiff,
  onAddComment,
}: TabCodeDiffProps) {
  const fileDiffs = diff ? parseDiff(diff) : [];
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);

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

  const handleAddComment = onAddComment
    ? (path: string, line: number) => setCommentTarget({ path, line })
    : undefined;

  const handleSubmit = async (body: string) => {
    if (!commentTarget || !onAddComment) return;
    await onAddComment(commentTarget.path, commentTarget.line, body);
    setCommentTarget(null);
  };

  return (
    <div className="overflow-y-auto p-4 space-y-4" data-testid="tab-code-diff">
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
        <FileDiff
          key={fd.filename}
          fileDiff={fd}
          comments={comments.filter((c) => c.path === fd.filename)}
          onAddComment={handleAddComment}
        />
      ))}

      {/* Inline comment form */}
      {commentTarget && (
        <InlineCommentForm
          target={commentTarget}
          onSubmit={handleSubmit}
          onCancel={() => setCommentTarget(null)}
        />
      )}

      {/* Clear X icon for active comment target */}
      {commentTarget && (
        <button
          className="hidden"
          aria-label="close comment"
          onClick={() => setCommentTarget(null)}
        >
          <IconX size={12} />
        </button>
      )}
    </div>
  );
}
