import { useState } from "react";
import { useSwarmStore } from "../../stores/swarmStore";
import { SwarmSplitTab } from "./SwarmSplitTab";
import { SwarmRunningTab } from "./SwarmRunningTab";
import { SwarmConflictsTab } from "./SwarmConflictsTab";
import { SwarmHistoryTab } from "./SwarmHistoryTab";

// ─── タブ定義 ─────────────────────────────────────────────────

type TabId = "split" | "running" | "conflicts" | "history";

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: "split",     icon: "✂️",  label: "タスク分解" },
  { id: "running",   icon: "▶",   label: "実行中" },
  { id: "conflicts", icon: "⚠️",  label: "コンフリクト" },
  { id: "history",   icon: "📋",  label: "履歴" },
];

// ─── Component ────────────────────────────────────────────────

interface SwarmScreenProps {
  workingDir: string;
  projectPath?: string;
}

export function SwarmScreen({ workingDir, projectPath }: SwarmScreenProps) {
  const [activeTab, setActiveTab] = useState<TabId>("split");
  const { currentRun } = useSwarmStore();

  // 実行中タブのバッジ（実行中worker数 / 合計タスク数）
  const runningBadge = (() => {
    if (!currentRun) return null;
    if (currentRun.status === "done" || currentRun.status === "partialDone" ||
        currentRun.status === "failed" || currentRun.status === "cancelled") return null;
    const runningCount = currentRun.assignments.filter(
      (a) => a.executionState === "running"
    ).length;
    return `${runningCount}/${currentRun.total}`;
  })();

  // コンフリクトタブのバッジ
  const conflictCount = useSwarmStore((s) => s.conflictOutcome?.conflictFiles.length ?? 0);

  const handleRunStarted = () => {
    setActiveTab("running");
  };

  return (
    <div style={screenStyle} data-testid="swarm-screen">
      {/* タブバー */}
      <div style={tabBarStyle} data-testid="swarm-tab-bar">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const badge =
            tab.id === "running" ? runningBadge :
            tab.id === "conflicts" && conflictCount > 0 ? String(conflictCount) :
            null;
          return (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...tabButtonStyle,
                borderBottom: isActive ? "2px solid #1f6feb" : "2px solid transparent",
                color: isActive ? "#e6edf3" : "#8b949e",
                background: isActive ? "#161b2240" : "transparent",
              }}
            >
              <span style={{ marginRight: 5 }}>{tab.icon}</span>
              {tab.label}
              {badge && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    background: tab.id === "conflicts" ? "#f6ad5530" : "#1f6feb30",
                    color: tab.id === "conflicts" ? "#f6ad55" : "#58a6ff",
                    border: `1px solid ${tab.id === "conflicts" ? "#f6ad5540" : "#1f6feb40"}`,
                    borderRadius: 10,
                    padding: "1px 6px",
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}

        {/* プロジェクトパス */}
        {projectPath && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#484f58",
              fontFamily: "monospace",
              padding: "0 12px",
              alignSelf: "center",
            }}
          >
            {projectPath}
          </span>
        )}
      </div>

      {/* タブコンテンツ */}
      <div style={tabContentStyle} data-testid="swarm-tab-content">
        {activeTab === "split" && (
          <SwarmSplitTab workingDir={workingDir} onRunStarted={handleRunStarted} />
        )}
        {activeTab === "running" && (
          <SwarmRunningTab workingDir={workingDir} />
        )}
        {activeTab === "conflicts" && (
          <SwarmConflictsTab />
        )}
        {activeTab === "history" && (
          <SwarmHistoryTab />
        )}
      </div>
    </div>
  );
}

// ─── スタイル ─────────────────────────────────────────────────

const screenStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  background: "#0d1117",
  overflow: "hidden",
};

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  borderBottom: "1px solid #21262d",
  flexShrink: 0,
  background: "#0d1117",
};

const tabButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "10px 16px",
  border: "none",
  borderBottom: "2px solid transparent",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "monospace",
  transition: "color 0.15s, border-color 0.15s",
  whiteSpace: "nowrap",
};

const tabContentStyle: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
};
