import {
  IconGitPullRequest,
  IconGitMerge,
  IconGitPullRequestClosed,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconArrowRight,
} from "@tabler/icons-react";
import type { PullRequest } from "../../types";

function StateIcon({ state }: { state: PullRequest["state"] }) {
  if (state === "open")
    return <IconGitPullRequest size={16} className="text-green-400 shrink-0" />;
  if (state === "merged")
    return <IconGitMerge size={16} className="text-purple-400 shrink-0" />;
  return <IconGitPullRequestClosed size={16} className="text-red-400 shrink-0" />;
}

function ChecksBadge({ status }: { status: PullRequest["checks_status"] }) {
  if (status === "passing")
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-400">
        <IconCircleCheck size={11} /> passing
      </span>
    );
  if (status === "failing")
    return (
      <span className="flex items-center gap-1 text-[10px] text-red-400">
        <IconCircleX size={11} /> failing
      </span>
    );
  if (status === "pending")
    return (
      <span className="flex items-center gap-1 text-[10px] text-yellow-400">
        <IconClock size={11} /> pending
      </span>
    );
  return (
    <span className="text-[10px] text-gray-500">unknown</span>
  );
}

interface PRDetailHeaderProps {
  pr: PullRequest;
}

export function PRDetailHeader({ pr }: PRDetailHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-white/10 space-y-1.5">
      {/* タイトル行 */}
      <div className="flex items-start gap-2">
        <StateIcon state={pr.state} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-white leading-snug">
            {pr.title}
          </span>
          {pr.draft && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
              Draft
            </span>
          )}
          <span className="ml-2 text-xs text-gray-500">#{pr.github_number}</span>
        </div>
      </div>

      {/* メタ情報行 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 pl-6">
        {/* ブランチ */}
        <span className="flex items-center gap-1 font-mono">
          <span className="text-blue-300">{pr.head_branch}</span>
          <IconArrowRight size={10} className="text-gray-600" />
          <span>{pr.base_branch}</span>
        </span>

        {/* author */}
        <span className="text-gray-500">by <span className="text-gray-300">{pr.author_login}</span></span>

        {/* checks */}
        <ChecksBadge status={pr.checks_status} />

        {/* linked issue */}
        {pr.linked_issue_number != null && (
          <span className="text-gray-500">
            Issue <span className="text-gray-300">#{pr.linked_issue_number}</span>
          </span>
        )}
      </div>
    </div>
  );
}
