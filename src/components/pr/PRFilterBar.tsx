import { IconRefresh } from "@tabler/icons-react";

export type FilterValue = "open" | "closed" | "merged" | "all";

const LABELS: Record<FilterValue, string> = {
  open: "Open",
  closed: "Closed",
  merged: "Merged",
  all: "All",
};

interface PRFilterBarProps {
  filter: FilterValue;
  onChange: (f: FilterValue) => void;
  onSync: () => void;
  syncing: boolean;
}

export function PRFilterBar({ filter, onChange, onSync, syncing }: PRFilterBarProps) {
  const filters: FilterValue[] = ["open", "closed", "merged", "all"];
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 2,
      padding: "8px 8px",
      borderBottom: "1px solid #2a2a3a",
      background: "#1a1a2e",
      flexShrink: 0,
    }}>
      {filters.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          aria-pressed={filter === f}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: filter === f ? 600 : 400,
            border: "none",
            outline: "none",
            cursor: "pointer",
            background: filter === f ? "#7c6cf2" : "transparent",
            color: filter === f ? "#fff" : "#888",
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            if (filter !== f) e.currentTarget.style.background = "#2a2a3a";
          }}
          onMouseLeave={(e) => {
            if (filter !== f) e.currentTarget.style.background = "transparent";
          }}
        >
          {LABELS[f]}
        </button>
      ))}
      <div style={{ marginLeft: "auto" }}>
        <button
          onClick={onSync}
          disabled={syncing}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 12,
            border: "1px solid #3a3a52",
            outline: "none",
            cursor: syncing ? "default" : "pointer",
            background: "transparent",
            color: "#888",
            opacity: syncing ? 0.5 : 1,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (!syncing) e.currentTarget.style.background = "#2a2a3a"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <IconRefresh size={12} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
          Sync
        </button>
      </div>
    </div>
  );
}
