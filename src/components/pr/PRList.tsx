import type { PullRequest } from "../../types";
import { PRListItem } from "./PRListItem";

interface PRListProps {
  prs: PullRequest[];
  loading: boolean;
  selectedPrId: number | null;
  onSelect: (pr: PullRequest) => void;
}

export function PRList({ prs, loading, selectedPrId, onSelect }: PRListProps) {
  if (loading) {
    return <div className="p-4 text-xs text-gray-500">Loading...</div>;
  }

  if (prs.length === 0) {
    return <div className="p-4 text-xs text-gray-500">No PRs found</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {prs.map((pr) => (
        <PRListItem
          key={pr.id}
          pr={pr}
          selected={pr.id === selectedPrId}
          onSelect={() => onSelect(pr)}
        />
      ))}
    </div>
  );
}
