import { useProjectStore } from "../../stores/projectStore";
import { SwarmScreen } from "./SwarmScreen";

export function SwarmPage() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const workingDir = currentProject?.local_path ?? "/";

  return (
    <div
      data-testid="swarm-page"
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
        <span style={{ fontSize: 18 }}>🐝</span>
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
          Phase 12
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

      {/* SwarmScreen (4タブ) */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <SwarmScreen workingDir={workingDir} />
      </div>
    </div>
  );
}
