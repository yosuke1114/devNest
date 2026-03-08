import type { DiffHunk } from "../../lib/diffParser";
import type { PrComment } from "../../types";
import { InlineComment } from "./InlineComment";

interface DiffHunkWithCommentsProps {
  hunk: DiffHunk;
  comments: PrComment[];
  onAddComment?: (line: number) => void;
}

export function DiffHunkWithComments({ hunk, comments, onAddComment }: DiffHunkWithCommentsProps) {
  return (
    <div>
      <div className="px-3 py-1 bg-blue-950/40 text-[10px] font-mono text-blue-300">
        {hunk.header}
      </div>
      <div className="font-mono text-[11px] leading-5">
        {hunk.lines.map((line, li) => {
          const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
          const lineComments = comments.filter((c) => c.line === line.newLineNo);

          return (
            <div key={li}>
              <div
                onClick={() => {
                  if (onAddComment && line.newLineNo !== null) {
                    onAddComment(line.newLineNo);
                  }
                }}
                className={`flex cursor-pointer ${
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
                  <span>{prefix}</span>
                  <span>{line.content}</span>
                </span>
              </div>
              {lineComments.map((comment) => (
                <InlineComment key={comment.id} comment={comment} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
