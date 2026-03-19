/**
 * 🏠 Home Dashboard
 *
 * ポートフォリオ概要 + 要注意項目 + エージェント活動サマリー。
 * 設計書: docs/08-ui-component-design.md §6 ホーム
 */
import { memo, useEffect } from "react";
import {
  IconAlertTriangle,
  IconGitPullRequest,
  IconHeartRateMonitor,
  IconLayoutKanban,
  IconTerminal2,
} from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { usePrStore } from "../stores/prStore";
import { useUiStore } from "../stores/uiStore";
import { useMaintenanceStore } from "../stores/maintenanceStore";
import type { Project } from "../types";

// ─── HealthOverview ────────────────────────────────────────────────────────────

interface HealthOverviewProps {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
}

const HealthOverview = memo(function HealthOverview({
  total,
  healthy,
  warning,
  critical,
}: HealthOverviewProps) {
  return (
    <div
      style={{
        background: "#1e1e32",
        border: "1px solid #2a2a3f",
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 24,
      }}
    >
      <div style={{ fontSize: 13, color: "#888" }}>
        Total: <span style={{ color: "#e0e0e0", fontWeight: 600 }}>{total}</span> projects
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 600 }}>🟢 {healthy}</span>
        <span style={{ color: "#eab308", fontSize: 13, fontWeight: 600 }}>🟡 {warning}</span>
        <span style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>🔴 {critical}</span>
      </div>
    </div>
  );
});

// ─── ProductTable ──────────────────────────────────────────────────────────────

interface ProductTableProps {
  projects: Project[];
  currentProjectId: number | undefined;
  openPrs: number;
  debtScore: number;
  outdatedDeps: number;
  coverage: number;
  docCount: number;
  onSelect: (p: Project) => void;
}

const ProductTable = memo(function ProductTable({
  projects,
  currentProjectId,
  openPrs,
  debtScore,
  outdatedDeps,
  coverage,
  docCount,
  onSelect,
}: ProductTableProps) {
  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: "1px solid #2a2a3f",
  };
  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    color: "#ccc",
    borderBottom: "1px solid #1a1a2e",
  };

  return (
    <div
      style={{
        background: "#1e1e32",
        border: "1px solid #2a2a3f",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>プロダクト</th>
            <th style={thStyle}>ヘルス</th>
            <th style={thStyle}>古い依存</th>
            <th style={thStyle}>技術的負債</th>
            <th style={thStyle}>カバレッジ</th>
            <th style={thStyle}>ドキュメント</th>
            <th style={thStyle}>PR</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const isSelected = p.id === currentProjectId;
            const health = debtScore > 60 || outdatedDeps > 5 ? "🔴" : outdatedDeps > 2 ? "🟡" : "🟢";
            return (
              <tr
                key={p.id}
                onClick={() => onSelect(p)}
                style={{
                  cursor: "pointer",
                  background: isSelected ? "#2a2a4a" : "transparent",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "#252540"; }}
                onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
              >
                <td style={{ ...tdStyle, color: "#e0e0e0", fontWeight: isSelected ? 600 : 400 }}>
                  {isSelected ? "★ " : ""}{p.name}
                </td>
                <td style={tdStyle}>{isSelected ? health : "🟢"}</td>
                <td style={{ ...tdStyle, color: isSelected && outdatedDeps > 0 ? "#f97316" : "#ccc" }}>
                  {isSelected ? `${outdatedDeps} ⚠` : "—"}
                </td>
                <td style={{ ...tdStyle, color: isSelected && debtScore > 50 ? "#ef4444" : "#ccc" }}>
                  {isSelected ? debtScore : "—"}
                </td>
                <td style={{ ...tdStyle, color: isSelected && coverage < 60 ? "#eab308" : "#ccc" }}>
                  {isSelected ? `${coverage}%` : "—"}
                </td>
                <td style={tdStyle}>{isSelected ? docCount : "—"}</td>
                <td style={{ ...tdStyle, color: isSelected && openPrs > 0 ? "#7c6af7" : "#ccc" }}>
                  {isSelected ? openPrs : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

// ─── AgentActivityPanel ────────────────────────────────────────────────────────

const AgentActivityPanel = memo(function AgentActivityPanel() {
  return (
    <div
      style={{
        background: "#1e1e32",
        border: "1px solid #2a2a3f",
        borderRadius: 8,
        padding: 16,
        flex: 1,
        minWidth: 240,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 10, textTransform: "uppercase" }}>
        Agent Activity
      </div>
      <div style={{ color: "#555", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
        エージェントタスクはありません
      </div>
    </div>
  );
});

// ─── HomeDashboardScreen ───────────────────────────────────────────────────────

export function HomeDashboardScreen() {
  const { projects, currentProject, selectProject } = useProjectStore();
  const { prs, fetchPrs } = usePrStore();
  const { navigate } = useUiStore();
  const { debtReport, depReport, coverageReport, depStatus, debtStatus, scanDependencies, scanDebt } =
    useMaintenanceStore();

  useEffect(() => {
    if (currentProject) {
      fetchPrs(currentProject.id).catch(() => {});
      if (debtStatus === "idle") scanDebt(currentProject.local_path).catch(() => {});
      if (depStatus === "idle") scanDependencies(currentProject.local_path).catch(() => {});
    }
  }, [currentProject?.id]);

  const openPrs = prs.filter((pr) => pr.state === "open").length;
  const debtScore = debtReport?.total_score ?? 0;
  const outdatedDeps = depReport?.total_outdated ?? 0;
  const coverage = Math.round(coverageReport?.overall_pct ?? 0);
  const docCount = useProjectStore.getState().currentStatus?.document_count ?? 0;

  const handleSelectProject = (p: Project) => {
    selectProject(p);
    navigate("project");
  };

  // ヘルス集計（選択中プロジェクトのみ詳細あり）
  const healthyCnt = projects.length > 1 ? projects.length - 1 : (debtScore <= 50 && outdatedDeps <= 2 ? 1 : 0);
  const warnCnt = debtScore > 30 && debtScore <= 60 ? 1 : 0;
  const critCnt = debtScore > 60 || outdatedDeps > 5 ? 1 : 0;

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>
        ホームダッシュボード
      </h2>

      {/* ヘルスオーバービュー */}
      <HealthOverview
        total={projects.length}
        healthy={healthyCnt}
        warning={warnCnt}
        critical={critCnt}
      />

      {/* プロダクト一覧テーブル */}
      <section>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8, textTransform: "uppercase" }}>
          プロダクト一覧
        </div>
        {projects.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13 }}>プロジェクトがありません</div>
        ) : (
          <ProductTable
            projects={projects}
            currentProjectId={currentProject?.id}
            openPrs={openPrs}
            debtScore={debtScore}
            outdatedDeps={outdatedDeps}
            coverage={coverage}
            docCount={docCount}
            onSelect={handleSelectProject}
          />
        )}
      </section>

      {/* 要注意 + エージェント活動 */}
      {currentProject ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {/* 要注意パネル */}
          <div
            style={{
              background: "#1e1e32",
              border: "1px solid #2a2a3f",
              borderRadius: 8,
              padding: 16,
              flex: 1,
              minWidth: 240,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 10, textTransform: "uppercase" }}>
              要対応
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {openPrs > 0 ? (
                <AttentionCard
                  icon={<IconGitPullRequest size={16} />}
                  label={`${openPrs} オープン PR`}
                  color="#7c6af7"
                  onClick={() => navigate("pr")}
                />
              ) : null}
              {outdatedDeps > 0 ? (
                <AttentionCard
                  icon={<IconAlertTriangle size={16} />}
                  label={`${outdatedDeps} 古い依存パッケージ`}
                  color="#ef4444"
                  onClick={() => navigate("project")}
                />
              ) : null}
              {debtScore > 40 ? (
                <AttentionCard
                  icon={<IconHeartRateMonitor size={16} />}
                  label={`技術的負債スコア ${debtScore}`}
                  color="#eab308"
                  onClick={() => navigate("project")}
                />
              ) : null}
              {openPrs === 0 && outdatedDeps === 0 && debtScore <= 40 ? (
                <div style={{ color: "#555", fontSize: 13, padding: "8px 0" }}>問題はありません ✓</div>
              ) : null}
            </div>
          </div>

          {/* エージェント活動パネル */}
          <AgentActivityPanel />
        </div>
      ) : null}

      {/* クイックアクセス */}
      <section>
        <div
          style={{ fontSize: 12, color: "#888", marginBottom: 8, textTransform: "uppercase" }}
        >
          クイックアクセス
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <QuickButton
            icon={<IconLayoutKanban size={16} />}
            label="かんばん"
            onClick={() => navigate("project")}
          />
          <QuickButton
            icon={<IconTerminal2 size={16} />}
            label="Claude Terminal"
            onClick={() => navigate("agent")}
          />
          <QuickButton
            icon={<IconHeartRateMonitor size={16} />}
            label="保守スキャン"
            onClick={() => navigate("project")}
          />
        </div>
      </section>
    </div>
  );
}

function AttentionCard({
  icon,
  label,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        background: "transparent",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        color,
        fontSize: 13,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#252540"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      {icon}
      <span style={{ color: "#ccc" }}>{label}</span>
    </button>
  );
}

function QuickButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        background: "#1e1e32",
        border: "1px solid #2a2a3f",
        borderRadius: 8,
        color: "#ccc",
        cursor: "pointer",
        fontSize: 13,
        transition: "all 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
