import { useProjectStore } from "../../stores/projectStore";
import { TerminalGrid } from "./TerminalGrid";

export function SwarmPage() {
  const currentProject = useProjectStore((s) => s.currentProject);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: 16,
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
          marginBottom: 16,
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
          Phase 11-A
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

      <TerminalGrid workingDir={currentProject?.local_path ?? "/"} />
    </div>
  );
}
