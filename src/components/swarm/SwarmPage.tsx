import { useProjectStore } from "../../stores/projectStore";
import { OrchestratorPanel } from "./OrchestratorPanel";
import { TerminalGrid } from "./TerminalGrid";
import type { SubTask, SwarmSettings } from "./types";

export function SwarmPage() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const workingDir = currentProject?.local_path ?? "/";

  const handleRunSubtasks = (tasks: SubTask[], settings: SwarmSettings) => {
    // TerminalGrid は外部からの batch spawn を受け付ける
    // pendingSubtasks は TerminalGrid の ref 経由で渡す
    // → Step 11-D で Orchestrator エンジンと統合予定
    // 現フェーズでは TerminalGrid に直接 SubTask リストを渡してバッチ起動
    const event = new CustomEvent("devnest:run-subtasks", {
      detail: { tasks, settings, workingDir },
    });
    window.dispatchEvent(event);
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0d1117",
        overflow: "hidden",
      }}
    >
      {/* ヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 18 }}>🤖</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#e6edf3",
            fontFamily: "monospace",
          }}
        >
          DevNest Swarm
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#388bfd",
            border: "1px solid #1f6feb",
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          Phase 11-C
        </span>
        {currentProject && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#484f58",
              fontFamily: "monospace",
            }}
          >
            {currentProject.local_path}
          </span>
        )}
      </div>

      {/* メインコンテンツ: 左=Orchestrator / 右=TerminalGrid */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 左ペイン: Orchestratorパネル（固定幅 280px） */}
        <div style={{ width: 280, flexShrink: 0, position: "relative" }}>
          <OrchestratorPanel
            workingDir={workingDir}
            onRunSubtasks={handleRunSubtasks}
          />
        </div>

        {/* 右ペイン: TerminalGrid */}
        <div style={{ flex: 1, overflow: "hidden", padding: 12 }}>
          <TerminalGrid workingDir={workingDir} />
        </div>
      </div>
    </div>
  );
}
