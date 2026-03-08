import { IconCircleDot, IconCircleCheck } from "@tabler/icons-react";
import type { Issue } from "../../types";

interface IssueListItemProps {
  issue: Issue;
  onClick?: (issue: Issue) => void;
}

export function IssueListItem({ issue, onClick }: IssueListItemProps) {
  const labels: string[] = (() => {
    try {
      return JSON.parse(issue.labels);
    } catch {
      return [];
    }
  })();

  return (
    <div
      onClick={() => onClick?.(issue)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        padding: "12px 16px",
        borderBottom: "1px solid #2a2a3a",
        gap: 12,
        cursor: "pointer",
      }}
    >
      {issue.status === "closed" ? (
        <IconCircleCheck
          data-testid="status-closed"
          size={18}
          color="#8e44ad"
          style={{ marginTop: 2, flexShrink: 0 }}
        />
      ) : (
        <IconCircleDot
          data-testid="status-open"
          size={18}
          color="#2ecc71"
          style={{ marginTop: 2, flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{issue.title}</span>
          {labels.map((l) => (
            <span
              key={l}
              data-testid="label-badge"
              style={{
                fontSize: 11,
                padding: "1px 6px",
                borderRadius: 10,
                background: "#2a3a4a",
                color: "#6ab0de",
                border: "1px solid #3a4a5a",
              }}
            >
              {l}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          #{issue.github_number} · {issue.author_login}
          {issue.assignee_login && ` → ${issue.assignee_login}`}
        </div>
      </div>
    </div>
  );
}
