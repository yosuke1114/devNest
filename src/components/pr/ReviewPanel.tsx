import { useState } from "react";
import type { AsyncStatus } from "../../types";

interface ReviewPanelProps {
  reviewStatus: AsyncStatus;
  onSubmitReview: (state: "approved" | "changes_requested", body: string) => void;
}

export function ReviewPanel({ reviewStatus, onSubmitReview }: ReviewPanelProps) {
  const [body, setBody] = useState("");
  const [reviewState, setReviewState] = useState<"approved" | "changes_requested">("approved");

  const isLoading = reviewStatus === "loading";

  const handleSubmit = () => {
    onSubmitReview(reviewState, body);
  };

  return (
    <div className="rounded-lg border border-white/10 p-3 space-y-3" data-testid="review-panel">
      <div className="text-xs font-medium text-gray-400">Submit Review</div>

      {/* コメント textarea */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={isLoading}
        placeholder="Optional comment…"
        className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-gray-200 resize-none h-16 focus:outline-none focus:border-blue-500 disabled:opacity-50"
      />

      {/* ラジオボタン */}
      <div className="flex gap-4 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="review-state"
            value="approved"
            checked={reviewState === "approved"}
            onChange={() => setReviewState("approved")}
            disabled={isLoading}
            className="accent-green-500"
          />
          <span className="text-gray-300">Approve</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="review-state"
            value="changes_requested"
            checked={reviewState === "changes_requested"}
            onChange={() => setReviewState("changes_requested")}
            disabled={isLoading}
            className="accent-red-500"
          />
          <span className="text-gray-300">Request Changes</span>
        </label>
      </div>

      {/* エラーメッセージ */}
      {reviewStatus === "error" && (
        <div className="text-xs text-red-400">レビューの送信に失敗しました。もう一度お試しください。</div>
      )}

      {/* Submit ボタン */}
      <button
        onClick={handleSubmit}
        disabled={isLoading}
        data-testid="pr-approve"
        className="px-3 py-1.5 rounded text-xs bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
      >
        Submit Review{isLoading && "…"}
      </button>
    </div>
  );
}
