import { IconRefresh } from "@tabler/icons-react";

export type FilterValue = "open" | "closed" | "merged" | "all";

interface PRFilterBarProps {
  filter: FilterValue;
  onChange: (f: FilterValue) => void;
  onSync: () => void;
  syncing: boolean;
}

export function PRFilterBar({ filter, onChange, onSync, syncing }: PRFilterBarProps) {
  const filters: FilterValue[] = ["open", "closed", "merged", "all"];
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10" data-testid="pr-filter-bar">
      {filters.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          aria-pressed={filter === f}
          className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
            filter === f
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:bg-white/10"
          }`}
        >
          {f}
        </button>
      ))}
      <div className="ml-auto">
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors"
        >
          <IconRefresh size={12} className={syncing ? "animate-spin" : ""} />
          Sync
        </button>
      </div>
    </div>
  );
}
