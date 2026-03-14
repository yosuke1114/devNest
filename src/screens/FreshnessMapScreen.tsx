import { useCallback, useEffect } from "react";
import { useMaintenanceStore } from "../stores/maintenanceStore";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";
import type { DocStaleness } from "../types";

function getScoreColor(score: number): string {
  if (score < 0.3) return "#22c55e";
  if (score < 0.7) return "#eab308";
  return "#ef4444";
}

function getScoreIcon(score: number): string {
  if (score < 0.3) return "🟢";
  if (score < 0.7) return "🟡";
  return "🔴";
}

function groupByDirectory(docs: DocStaleness[]): Record<string, DocStaleness[]> {
  const groups: Record<string, DocStaleness[]> = {};
  for (const doc of docs) {
    const parts = doc.doc_path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!groups[dir]) groups[dir] = [];
    groups[dir].push(doc);
  }
  return groups;
}

export function FreshnessMapScreen() {
  const { currentProject } = useProjectStore();
  const { docStaleness, docStalenessStatus, scanDocStaleness } = useMaintenanceStore();

  const projectPath = currentProject?.local_path ?? "";

  useEffect(() => {
    if (!projectPath) return;
    if (docStaleness.length === 0 && docStalenessStatus === "idle") {
      scanDocStaleness(projectPath);
    }
  }, [projectPath]);

  const handleRescan = useCallback(() => {
    if (!projectPath) return;
    scanDocStaleness(projectPath);
  }, [projectPath]);

  const handleAiUpdate = useCallback(() => {
    useUiStore.getState().navigate("agent");
  }, []);

  if (!currentProject) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        プロジェクトを選択してください
      </div>
    );
  }

  if (docStalenessStatus === "loading") {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
        スキャン中...
      </div>
    );
  }

  const stale = docStaleness.filter((d) => d.staleness_score >= 0.3);
  const grouped = groupByDirectory(docStaleness);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #2a2a3f",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#e0e0e0" }}>
            設計書 鮮度マップ
          </h1>
          <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
            {docStaleness.length} 件のドキュメント
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {stale.length > 0 ? (
            <button
              onClick={handleAiUpdate}
              style={{
                padding: "7px 14px",
                background: "#7c6af7",
                border: "none",
                borderRadius: 6,
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              AI更新を実行
            </button>
          ) : null}
          <button
            onClick={handleRescan}
            style={{
              padding: "7px 14px",
              background: "#1e1e32",
              border: "1px solid #2a2a3f",
              borderRadius: 6,
              color: "#aaa",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            再スキャン
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {docStaleness.length === 0 ? (
          <div style={{ color: "#666", fontSize: 14, textAlign: "center", marginTop: 40 }}>
            設計書が見つかりませんでした。再スキャンしてください。
          </div>
        ) : (
          Object.entries(grouped).map(([dir, docs]) => (
            <div key={dir} style={{ marginBottom: 20 }}>
              {/* Directory header */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#555",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 6,
                  paddingBottom: 4,
                  borderBottom: "1px solid #2a2a3f",
                }}
              >
                {dir}
              </div>

              {/* Doc items */}
              {docs.map((doc) => (
                <DocRow key={doc.doc_path} doc={doc} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DocRow({ doc }: { doc: DocStaleness }) {
  const filename = doc.doc_path.split("/").pop() ?? doc.doc_path;
  const color = getScoreColor(doc.staleness_score);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 10px",
        borderRadius: 6,
        marginBottom: 4,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#1e1e32"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      <span style={{ fontSize: 14 }}>{getScoreIcon(doc.staleness_score)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#e0e0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {filename}
        </div>
        <div style={{ fontSize: 11, color: "#666" }}>
          {doc.doc_path}
        </div>
      </div>
      {/* Score bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div
          style={{
            width: 80,
            height: 4,
            background: "#2a2a3f",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(doc.staleness_score * 100)}%`,
              background: color,
              borderRadius: 2,
            }}
          />
        </div>
        <span style={{ fontSize: 11, color, width: 28, textAlign: "right" }}>
          {Math.round(doc.staleness_score * 100)}%
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#666", flexShrink: 0, width: 70, textAlign: "right" }}>
        {doc.days_since_sync}日前
      </div>
    </div>
  );
}
