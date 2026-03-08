import type { PrComment } from "../../types";

interface InlineCommentProps {
  comment: PrComment;
}

export function InlineComment({ comment }: InlineCommentProps) {
  const { author_login, body, is_pending } = comment;

  return (
    <div data-testid="inline-comment" className="px-3 py-2 bg-blue-950/30 border-l-2 border-blue-400/50 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-gray-200">{author_login}</span>
        {is_pending && (
          <span
            data-testid="pending-badge"
            className="px-1 py-0.5 rounded text-[10px] bg-yellow-900/50 text-yellow-400 border border-yellow-700/50"
          >
            Pending
          </span>
        )}
      </div>
      <p className="text-gray-300">{body}</p>
    </div>
  );
}
