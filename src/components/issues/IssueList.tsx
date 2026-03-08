import type { Issue } from "../../types";
import { IssueListItem } from "./IssueListItem";

interface IssueListProps {
  issues: Issue[];
  loading: boolean;
  onSelect?: (issue: Issue) => void;
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#666",
  fontSize: 14,
  padding: 32,
};

export function IssueList({ issues, loading, onSelect }: IssueListProps) {
  if (loading) {
    return <div style={centerStyle}>読み込み中…</div>;
  }
  if (issues.length === 0) {
    return (
      <div style={centerStyle}>
        Issue がありません。右上の ↻ で GitHub から同期してください。
      </div>
    );
  }
  return (
    <div style={{ overflow: "auto", flex: 1 }}>
      {issues.map((issue) => (
        <IssueListItem key={issue.id} issue={issue} onClick={onSelect} />
      ))}
    </div>
  );
}
