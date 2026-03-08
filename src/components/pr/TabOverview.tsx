import type { PrDetail } from "../../types";
import { ReviewList } from "./ReviewList";
import { PRDescriptionPanel } from "./PRDescriptionPanel";
import { InlineComment } from "./InlineComment";

interface TabOverviewProps {
  detail: PrDetail;
}

export function TabOverview({ detail }: TabOverviewProps) {
  const { pr, reviews, comments } = detail;

  return (
    <div className="space-y-4">
      {/* PR メタグリッド */}
      <div className="rounded-lg border border-white/10 p-3 space-y-2">
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

        {/* PR 説明文 */}
        <PRDescriptionPanel body={pr.body} />
      </div>

      {/* Reviews */}
      <div className="rounded-lg border border-white/10 p-3">
        <ReviewList reviews={reviews} />
      </div>

      {/* Comments */}
      {comments.length > 0 && (
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs font-medium text-gray-400 mb-2">
            Comments ({comments.length})
          </div>
          <div className="space-y-2">
            {comments.map((c) => (
              <InlineComment key={c.id} comment={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
