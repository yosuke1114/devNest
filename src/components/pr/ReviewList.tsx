import type { PrReview } from "../../types";
import { ReviewItem } from "./ReviewItem";

interface ReviewListProps {
  reviews: PrReview[];
}

export function ReviewList({ reviews }: ReviewListProps) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-gray-400">Reviews ({reviews.length})</div>
      {reviews.length === 0 ? (
        <p className="text-xs text-gray-500">No reviews yet</p>
      ) : (
        <div>
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );
}
