import { useState, useEffect } from "react";
import { IconCircleCheck, IconCircleDot, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import type { Issue } from "../../types";

interface LinkedIssuesPanelProps {
  issues: Issue[];
  loading: boolean;
  onIssueClick?: (issue: Issue) => void;
}

export function LinkedIssuesPanel({ issues, loading, onIssueClick }: LinkedIssuesPanelProps) {
  const [open, setOpen] = useState(false);

  // Issue が増えたら自動で開く、なくなったら閉じる
  useEffect(() => {
    if (!loading) setOpen(issues.length > 0);
  }, [issues.length, loading]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          fontSize: 11,
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: 1,
          background: "transparent",
          border: "none",
          borderTop: "1px solid #2a2a3a",
          borderBottom: open ? "1px solid #2a2a3a" : "none",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        <span>Linked Issues{issues.length > 0 ? ` (${issues.length})` : ""}</span>
        {open ? <IconChevronDown size={13} /> : <IconChevronUp size={13} />}
      </button>

      {loading ? (
        <div style={centerStyle}>読み込み中…</div>
      ) : issues.length === 0 ? (
        <div style={centerStyle}>Issue がありません</div>
      ) : open ? (
        <div style={{ maxHeight: 200, overflow: "auto" }}>
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onClick={onIssueClick} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IssueRow({
  issue,
  onClick,
}: {
  issue: Issue;
  onClick?: (issue: Issue) => void;
}) {
  return (
    <div
      onClick={() => onClick?.(issue)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 14px",
        borderBottom: "1px solid #1e1e2e",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {issue.status === "closed" ? (
        <IconCircleCheck
          data-testid="status-closed"
          data-status="closed"
          size={14}
          color="#8e44ad"
          style={{ marginTop: 2, flexShrink: 0 }}
        />
      ) : (
        <IconCircleDot
          data-testid="status-open"
          data-status="open"
          size={14}
          color="#2ecc71"
          style={{ marginTop: 2, flexShrink: 0 }}
        />
      )}
      <div>
        <div style={{ fontSize: 13, color: "#e0e0e0", lineHeight: 1.4 }}>
          {issue.title}
        </div>
        <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
          #{issue.github_number}
        </div>
      </div>
    </div>
  );
}

const centerStyle: React.CSSProperties = {
  padding: 16,
  color: "#666",
  fontSize: 13,
  textAlign: "center",
};
