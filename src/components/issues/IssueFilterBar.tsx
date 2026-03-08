import { IconRefresh } from "@tabler/icons-react";

interface IssueFilterBarProps {
  statusFilter: string;
  syncing: boolean;
  onFilterChange: (v: string) => void;
  onSync: () => void;
}

const selectStyle: React.CSSProperties = {
  background: "#2a2a42",
  color: "#e0e0e0",
  border: "1px solid #3a3a52",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 13,
  marginRight: 8,
};

const actionBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #3a3a52",
  borderRadius: 4,
  color: "#aaa",
  cursor: "pointer",
  padding: 6,
  display: "flex",
  alignItems: "center",
};

export function IssueFilterBar({
  statusFilter,
  syncing,
  onFilterChange,
  onSync,
}: IssueFilterBarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <select
        value={statusFilter}
        onChange={(e) => onFilterChange(e.target.value)}
        style={selectStyle}
      >
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="">すべて</option>
      </select>
      <button
        onClick={onSync}
        disabled={syncing}
        style={actionBtnStyle}
        title="GitHub から同期"
      >
        <IconRefresh
          size={16}
          style={{
            animation: syncing ? "spin 1s linear infinite" : undefined,
          }}
        />
      </button>
    </div>
  );
}
