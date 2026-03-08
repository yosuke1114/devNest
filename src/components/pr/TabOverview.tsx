import {
  IconGitPullRequest,
  IconGitMerge,
  IconGitPullRequestClosed,
  IconMessageCircle,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import type { AsyncStatus, PrDetail } from "../../types";

function StateIcon({ state }: { state: "open" | "closed" | "merged" }) {
  if (state === "open")
    return <IconGitPullRequest size={14} className="text-green-400" />;
  if (state === "merged")
    return <IconGitMerge size={14} className="text-purple-400" />;
  return <IconGitPullRequestClosed size={14} className="text-red-400" />;
}

interface TabOverviewProps {
  detail: PrDetail;
  reviewStatus: AsyncStatus;
  mergeStatus: AsyncStatus;
  onApprove: () => void;
  onRequestChanges: () => void;
  onMerge: () => void;
}

export function TabOverview({
  detail,
  reviewStatus,
  mergeStatus,
  onApprove,
  onRequestChanges,
  onMerge,
}: TabOverviewProps) {
  const { pr, reviews, comments } = detail;

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {/* PR メタ */}
      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <StateIcon state={pr.state} />
          <span className="text-sm font-semibold text-white">{pr.title}</span>
          <span className="text-xs text-gray-400">#{pr.github_number}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
          <div>
            <span className="text-gray-500">Author</span>{" "}
            <span className="text-gray-200">{pr.author_login}</span>
          </div>
          <div>
            <span className="text-gray-500">Branch</span>{" "}
            <span className="text-gray-200 font-mono">{pr.head_branch}</span>
          </div>
          <div>
            <span className="text-gray-500">Base</span>{" "}
            <span className="text-gray-200 font-mono">{pr.base_branch}</span>
          </div>
          <div>
            <span className="text-gray-500">Checks</span>{" "}
            <span className="text-gray-200 capitalize">{pr.checks_status}</span>
          </div>
        </div>
        {pr.body && (
          <p className="text-xs text-gray-300 whitespace-pre-wrap border-t border-white/10 pt-2">
            {pr.body}
          </p>
        )}
      </div>

      {/* Reviews */}
      <div className="rounded-lg border border-white/10 p-3">
        <div className="text-xs font-medium text-gray-400 mb-2">
          Reviews ({reviews.length})
        </div>
        {reviews.length === 0 ? (
          <div className="text-xs text-gray-500">No reviews yet</div>
        ) : (
          <div className="space-y-1">
            {reviews.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                {r.state === "approved" ? (
                  <IconCheck size={12} className="text-green-400 shrink-0" />
                ) : r.state === "changes_requested" ? (
                  <IconX size={12} className="text-red-400 shrink-0" />
                ) : (
                  <IconMessageCircle size={12} className="text-gray-400 shrink-0" />
                )}
                <span className="text-gray-300">{r.reviewer_login}</span>
                <span className="text-gray-500 capitalize">{r.state}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs font-medium text-gray-400 mb-2">
            Comments ({comments.length})
          </div>
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="text-xs border-b border-white/5 pb-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-300 font-medium">{c.author_login}</span>
                  {c.path && (
                    <span className="text-gray-500 font-mono">
                      {c.path}:{c.line}
                    </span>
                  )}
                  {c.is_pending && (
                    <span className="text-[10px] px-1 rounded bg-yellow-900/50 text-yellow-400">
                      pending
                    </span>
                  )}
                </div>
                <p className="text-gray-400 whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review actions */}
      {pr.state === "open" && (
        <div className="rounded-lg border border-white/10 p-3 space-y-2">
          <div className="text-xs font-medium text-gray-400">Review</div>
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              disabled={reviewStatus === "loading"}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-green-700 hover:bg-green-600 text-white disabled:opacity-50 transition-colors"
            >
              <IconCheck size={12} /> Approve
            </button>
            <button
              onClick={onRequestChanges}
              disabled={reviewStatus === "loading"}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-red-800 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
            >
              <IconX size={12} /> Request changes
            </button>
          </div>
        </div>
      )}

      {/* Merge */}
      {pr.state === "open" && (
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs font-medium text-gray-400 mb-2">Merge</div>
          <button
            onClick={onMerge}
            disabled={mergeStatus === "loading"}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors"
          >
            <IconGitMerge size={12} /> Squash and merge
          </button>
        </div>
      )}
    </div>
  );
}
