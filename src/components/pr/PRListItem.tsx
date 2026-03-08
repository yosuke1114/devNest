import {
  IconGitPullRequest,
  IconGitMerge,
  IconGitPullRequestClosed,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconChevronRight,
} from "@tabler/icons-react";
import type { PullRequest } from "../../types";

function StateIcon({ state }: { state: PullRequest["state"] }) {
  if (state === "open")
    return (
      <IconGitPullRequest
        size={14}
        className="text-green-400"
        data-testid="state-open"
        data-state="open"
      />
    );
  if (state === "merged")
    return (
      <IconGitMerge
        size={14}
        className="text-purple-400"
        data-testid="state-merged"
        data-state="merged"
      />
    );
  return (
    <IconGitPullRequestClosed
      size={14}
      className="text-red-400"
      data-testid="state-closed"
      data-state="closed"
    />
  );
}

function ChecksIcon({ status }: { status: PullRequest["checks_status"] }) {
  if (status === "passing") return <IconCircleCheck size={12} className="text-green-400" />;
  if (status === "failing") return <IconCircleX size={12} className="text-red-400" />;
  if (status === "pending") return <IconClock size={12} className="text-yellow-400" />;
  return null;
}

interface PRListItemProps {
  pr: PullRequest;
  selected: boolean;
  onSelect: () => void;
}

export function PRListItem({ pr, selected, onSelect }: PRListItemProps) {
  return (
    <button
      onClick={onSelect}
      data-selected={selected ? "true" : "false"}
      className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors ${
        selected ? "bg-white/10" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          <StateIcon state={pr.state} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs font-medium text-white truncate">{pr.title}</span>
            {pr.draft && (
              <span className="text-[10px] px-1 rounded bg-gray-700 text-gray-400 shrink-0">
                Draft
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <span>#{pr.github_number}</span>
            <span className="truncate">{pr.author_login}</span>
            <span className="truncate">{pr.head_branch}</span>
            <ChecksIcon status={pr.checks_status} />
          </div>
        </div>
        <IconChevronRight size={12} className="text-gray-500 mt-0.5 shrink-0" />
      </div>
    </button>
  );
}
