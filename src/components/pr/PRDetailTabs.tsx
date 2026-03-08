export type PRTabId = "overview" | "code-diff" | "design-docs";

interface Tab {
  id: PRTabId;
  label: string;
  phase: 2 | 4;
}

const TABS: Tab[] = [
  { id: "overview", label: "Overview", phase: 2 },
  { id: "code-diff", label: "Code Changes", phase: 2 },
  { id: "design-docs", label: "Design Docs", phase: 4 },
];

interface PRDetailTabsProps {
  activeTab: PRTabId;
  onChange: (tab: PRTabId) => void;
  codeFileCount?: number;
}

export function PRDetailTabs({ activeTab, onChange, codeFileCount = 0 }: PRDetailTabsProps) {
  return (
    <div className="flex border-b border-white/10 px-4">
      {TABS.map((tab) => {
        const isEnabled = tab.phase <= 2;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => isEnabled && onChange(tab.id)}
            disabled={!isEnabled}
            aria-selected={isActive}
            data-active={isActive ? "true" : "false"}
            title={!isEnabled ? "Phase 4 から利用可能" : undefined}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
              isActive
                ? "border-blue-500 text-white"
                : isEnabled
                ? "border-transparent text-gray-400 hover:text-gray-200"
                : "border-transparent text-gray-600 cursor-not-allowed opacity-50"
            }`}
          >
            {tab.label}
            {tab.id === "code-diff" && codeFileCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-white/10 text-gray-400">
                {codeFileCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
