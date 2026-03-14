/**
 * Project View
 *
 * 5 tabs: 概要, 保守, 分析, カンバン, AI レビュー
 */
import { useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { KanbanScreen } from "./KanbanScreen";
import { MaintenanceScreen } from "./MaintenanceScreen";
import { AnalyticsScreen } from "./AnalyticsScreen";
import { CollaborationScreen } from "./CollaborationScreen";

type Tab = "overview" | "maintenance" | "analytics" | "kanban" | "review";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview",     label: "概要" },
  { id: "maintenance",  label: "保守" },
  { id: "analytics",    label: "分析" },
  { id: "kanban",       label: "カンバン" },
  { id: "review",       label: "AI レビュー" },
];

function tabBtnStyle(active: boolean) {
  return {
    padding: "6px 16px",
    border: "none",
    borderRadius: "6px 6px 0 0",
    background: active ? "#1e1e32" : "transparent",
    color: active ? "#7c6af7" : "#888",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    borderBottom: active ? "2px solid #7c6af7" : "2px solid transparent",
    transition: "all 0.15s",
  } as const;
}

export function ProjectViewScreen() {
  const [tab, setTab] = useState<Tab>("overview");
  const { currentProject, currentStatus } = useProjectStore();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* タブバー */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "8px 16px 0",
          borderBottom: "1px solid #2a2a3f",
          background: "#13131f",
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tabBtnStyle(tab === t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "overview"     ? <OverviewTab project={currentProject} status={currentStatus} /> : null}
        {tab === "maintenance"  ? <MaintenanceScreen /> : null}
        {tab === "analytics"    ? <AnalyticsScreen /> : null}
        {tab === "kanban"       ? <KanbanScreen /> : null}
        {tab === "review"       ? <CollaborationScreen /> : null}
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

import type { Project, ProjectStatus } from "../types";

function OverviewTab({
  project,
  status,
}: {
  project: Project | null;
  status: ProjectStatus | null;
}) {
  if (!project) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>
        {project.name}
      </h2>

      {/* Basic info */}
      <div
        style={{
          background: "#1e1e32",
          border: "1px solid #2a2a3f",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px 20px",
        }}
      >
        <InfoRow label="リポジトリ" value={`${project.repo_owner}/${project.repo_name}`} />
        <InfoRow label="ローカルパス" value={project.local_path} />
        <InfoRow label="デフォルトブランチ" value={project.default_branch} />
        <InfoRow label="ドキュメントルート" value={project.docs_root} />
        <InfoRow label="同期モード" value={project.sync_mode === "auto" ? "自動" : "手動"} />
        {project.last_synced_at ? (
          <InfoRow label="最終同期" value={new Date(project.last_synced_at).toLocaleString("ja-JP")} />
        ) : null}
      </div>

      {/* Health stats */}
      {status ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatCard label="Issues" value={status.open_issue_count} color="#22c55e" />
          <StatCard label="ドキュメント" value={status.document_count} color="#7c6af7" />
          <StatCard label="未解決コンフリクト" value={status.hasUnresolvedConflict ? 1 : 0} color="#ef4444" />
          <StatCard label="AI レビュー待ち" value={status.pendingAiReviewCount} color="#eab308" />
        </div>
      ) : null}

      {/* Recent activity placeholder */}
      <div
        style={{
          background: "#1e1e32",
          border: "1px solid #2a2a3f",
          borderRadius: 8,
          padding: 16,
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#aaa" }}>
          最近のアクティビティ
        </h3>
        <div style={{ color: "#555", fontSize: 13 }}>
          分析タブから詳細なコミット履歴を確認できます。
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#ccc", wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "#1e1e32",
        border: "1px solid #2a2a3f",
        borderRadius: 8,
        padding: "12px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{label}</div>
    </div>
  );
}
