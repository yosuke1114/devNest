import {
  IconCircleCheck,
  IconCircleX,
  IconGitPullRequest,
  IconUser,
  IconAlertTriangle,
} from "@tabler/icons-react";
import type { NotificationEventType } from "../../types";

interface EventTypeIconProps {
  eventType: NotificationEventType;
}

export function EventTypeIcon({ eventType }: EventTypeIconProps) {
  const size = 14;
  switch (eventType) {
    case "ci_pass":
      return (
        <span data-testid="icon-ci-pass">
          <IconCircleCheck size={size} className="text-green-400 shrink-0" />
        </span>
      );
    case "ci_fail":
      return (
        <span data-testid="icon-ci-fail">
          <IconCircleX size={size} className="text-red-400 shrink-0" />
        </span>
      );
    case "pr_comment":
    case "pr_opened":
      return (
        <span data-testid="icon-pr">
          <IconGitPullRequest size={size} className="text-purple-400 shrink-0" />
        </span>
      );
    case "issue_assigned":
      return (
        <span data-testid="icon-issue">
          <IconUser size={size} className="text-blue-400 shrink-0" />
        </span>
      );
    case "conflict":
      return (
        <span data-testid="icon-conflict">
          <IconAlertTriangle size={size} className="text-yellow-400 shrink-0" />
        </span>
      );
    case "ai_edit":
    default:
      return (
        <span data-testid="icon-ai-edit">
          <IconCircleCheck size={size} className="text-gray-400 shrink-0" />
        </span>
      );
  }
}
