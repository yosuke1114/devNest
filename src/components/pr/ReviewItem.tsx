import {
  IconCheck,
  IconX,
  IconMessageCircle,
  IconMinus,
} from "@tabler/icons-react";
import type { PrReview } from "../../types";

interface ReviewItemProps {
  review: PrReview;
}

function capitalizeState(state: PrReview["state"]): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function ReviewItem({ review }: ReviewItemProps) {
  const { reviewer_login, state, body } = review;

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-white/10 last:border-0">
      <div className="flex items-center gap-2">
        {state === "approved" && (
          <span data-testid="review-approved" className="text-green-400">
            <IconCheck size={14} />
          </span>
        )}
        {state === "changes_requested" && (
          <span data-testid="review-changes-requested" className="text-red-400">
            <IconX size={14} />
          </span>
        )}
        {state === "commented" && (
          <span data-testid="review-commented" className="text-blue-400">
            <IconMessageCircle size={14} />
          </span>
        )}
        {state === "dismissed" && (
          <span data-testid="review-dismissed" className="text-gray-400">
            <IconMinus size={14} />
          </span>
        )}
        <span className="text-xs font-medium text-gray-200">{reviewer_login}</span>
        <span className="text-xs text-gray-400">{capitalizeState(state)}</span>
      </div>
      {body && (
        <p className="text-xs text-gray-300 pl-6">{body}</p>
      )}
    </div>
  );
}
