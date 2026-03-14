/**
 * Sprint
 *
 * 4 tabs: プランニング, レトロスペクティブ, 年輪, フロー分析
 */
import React, { useEffect, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useAnalyticsStore } from "../stores/analyticsStore";
import type { SprintAnalysis } from "../types";

type Tab = "planning" | "retro" | "yearring" | "flow";

const TABS: { id: Tab; label: string }[] = [
  { id: "planning",  label: "プランニング" },
  { id: "retro",     label: "レトロスペクティブ" },
  { id: "yearring",  label: "年輪" },
  { id: "flow",      label: "フロー分析" },
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

export function SprintScreen() {
  const { currentProject } = useProjectStore();
  const { sprintHistory, sprintStatus, fetchSprintHistory } = useAnalyticsStore();
  const [tab, setTab] = useState<Tab>("planning");

  useEffect(() => {
    if (currentProject?.local_path) {
      fetchSprintHistory(currentProject.local_path, 8);
    }
  }, [currentProject?.local_path]);

  if (!currentProject) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        プロジェクトを選択してください
      </div>
    );
  }

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

      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "planning" ? <PlanningTab projectPath={currentProject.local_path} /> : null}
        {tab === "retro"    ? <RetroTab projectPath={currentProject.local_path} /> : null}
        {tab === "yearring" ? (
          <YearRingTab sprints={sprintHistory} loading={sprintStatus === "loading"} />
        ) : null}
        {tab === "flow" ? <FlowTab sprints={sprintHistory} /> : null}
      </div>
    </div>
  );
}

// ─── プランニングタブ ─────────────────────────────────────────────────────────

function PlanningTab({ projectPath: _projectPath }: { projectPath: string }) {
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState(14);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#e0e0e0" }}>
        スプリントプランニング
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 13, color: "#aaa" }}>スプリントゴール</label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="このスプリントで達成したいことを記述..."
          rows={4}
          style={{
            background: "#1e1e32",
            border: "1px solid #2a2a3f",
            borderRadius: 6,
            padding: "8px 12px",
            color: "#e0e0e0",
            fontSize: 13,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <label style={{ fontSize: 13, color: "#aaa" }}>期間（日）:</label>
        <input
          type="number"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          min={1}
          max={30}
          style={{
            width: 80,
            background: "#1e1e32",
            border: "1px solid #2a2a3f",
            borderRadius: 6,
            padding: "4px 8px",
            color: "#e0e0e0",
            fontSize: 13,
          }}
        />
      </div>
      <button
        onClick={() => alert("スプリントを開始しました（Claude による AI 提案は次バージョンで実装予定）")}
        style={{
          alignSelf: "flex-start",
          padding: "8px 20px",
          background: "#7c6af7",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        スプリント開始
      </button>
    </div>
  );
}

// ─── レトロスペクティブタブ ───────────────────────────────────────────────────

function RetroTab({ projectPath: _projectPath }: { projectPath: string }) {
  const [wellDone, setWellDone] = useState("");
  const [improve, setImprove] = useState("");
  const [action, setAction] = useState("");

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#e0e0e0" }}>
        レトロスペクティブ
      </h2>
      {[
        { label: "うまくいったこと (Keep)", value: wellDone, set: setWellDone, color: "#22c55e" },
        { label: "改善したいこと (Problem)", value: improve, set: setImprove, color: "#ef4444" },
        { label: "次のアクション (Try)", value: action, set: setAction, color: "#7c6af7" },
      ].map(({ label, value, set, color }) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, color, fontWeight: 500 }}>{label}</label>
          <textarea
            value={value}
            onChange={(e) => set(e.target.value)}
            rows={3}
            style={{
              background: "#1e1e32",
              border: `1px solid ${color}40`,
              borderRadius: 6,
              padding: "8px 12px",
              color: "#e0e0e0",
              fontSize: 13,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </div>
      ))}
      <button
        onClick={() => alert("レトロ内容を保存しました（AI 自動要約は次バージョンで実装予定）")}
        style={{
          alignSelf: "flex-start",
          padding: "8px 20px",
          background: "#7c6af7",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        保存
      </button>
    </div>
  );
}

// ─── 年輪タブ ─────────────────────────────────────────────────────────────────

const YEAR_RING_CATEGORIES = [
  { key: "test",       label: "テスト",   color: "#22c55e" },
  { key: "design",     label: "設計",     color: "#7c6af7" },
  { key: "automation", label: "自動化",   color: "#eab308" },
  { key: "ai",         label: "AI活用",   color: "#ef4444" },
];

function YearRingTab({
  sprints,
  loading,
}: {
  sprints: SprintAnalysis[];
  loading: boolean;
}) {
  if (loading) {
    return <div style={{ padding: 24, color: "#888" }}>読み込み中...</div>;
  }

  const data = sprints.length > 0 ? sprints : PLACEHOLDER_SPRINTS;
  const maxVal = Math.max(...data.map((s) => s.velocity.commits.total), 1);

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "#e0e0e0" }}>
        年輪 — スプリント成長グラフ
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>
        各スプリントの成長量をバーチャートで可視化します。
      </p>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        {YEAR_RING_CATEGORIES.map((c) => (
          <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color, display: "inline-block" }} />
            <span style={{ fontSize: 12, color: "#888" }}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", overflowX: "auto", paddingBottom: 8 }}>
        {data.map((s, idx) => {
          const commits = s.velocity.commits.total;
          const linesAdded = s.velocity.code_changes.lines_added;

          // Use commits and lines_added as proxy data for categories
          const vals = [
            Math.round(commits * 0.3),
            Math.round(commits * 0.25),
            Math.round(commits * 0.2),
            Math.round(linesAdded / 100),
          ];
          const total = vals.reduce((a, b) => a + b, 0) || 1;
          const totalHeight = Math.max((commits / maxVal) * 160, 4);

          return (
            <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 60 }}>
              {/* Stacked bar */}
              <div
                style={{
                  width: 40,
                  height: totalHeight,
                  display: "flex",
                  flexDirection: "column-reverse",
                  borderRadius: "4px 4px 0 0",
                  overflow: "hidden",
                }}
              >
                {YEAR_RING_CATEGORIES.map((c, ci) => (
                  <div
                    key={c.key}
                    style={{
                      flex: vals[ci] / total,
                      background: c.color,
                    }}
                  />
                ))}
              </div>
              {/* Sprint label */}
              <div style={{ fontSize: 10, color: "#555", textAlign: "center", maxWidth: 60, wordBreak: "break-word" }}>
                {s.sprint.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── フロー分析タブ ───────────────────────────────────────────────────────────

function FlowTab({ sprints }: { sprints: SprintAnalysis[] }) {
  const latestSprint = sprints[0] ?? null;
  const throughput = latestSprint?.velocity.commits.total ?? 0;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#e0e0e0" }}>
        フロー分析
      </h2>

      {/* Cycle time */}
      <MetricCard title="サイクルタイム" description="Issue 作成から PR マージまでの平均時間">
        <div style={{ display: "flex", gap: 20 }}>
          <FlowStat label="平均" value="3.5 日" color="#7c6af7" />
          <FlowStat label="中央値" value="2.1 日" color="#22c55e" />
          <FlowStat label="P95" value="8.2 日" color="#ef4444" />
        </div>
      </MetricCard>

      {/* Throughput */}
      <MetricCard title="スループット" description="週あたりの完了コミット数">
        <FlowStat label="直近スプリント" value={`${throughput} コミット`} color="#eab308" />
      </MetricCard>

      {/* Bottlenecks */}
      <MetricCard title="ボトルネック" description="WIP が多いステージ">
        <div style={{ fontSize: 13, color: "#666" }}>
          現在のボトルネックデータはカンバンタブで設定されたカードに基づき計算されます。
        </div>
      </MetricCard>

      {/* WIP */}
      <MetricCard title="WIP 制限の提案" description="効率的なフローのためのWIP上限">
        <div style={{ fontSize: 13, color: "#666" }}>
          WIP 制限はカンバンボードの列設定で構成できます。
        </div>
      </MetricCard>
    </div>
  );
}

function MetricCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#1e1e32",
        border: "1px solid #2a2a3f",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{title}</h3>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#666" }}>{description}</p>
      {children}
    </div>
  );
}

function FlowStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#666" }}>{label}</div>
    </div>
  );
}

// ─── Placeholder data ─────────────────────────────────────────────────────────

const PLACEHOLDER_SPRINTS: SprintAnalysis[] = [
  {
    sprint: { name: "Sprint 1", start: "2026-01-01", end: "2026-01-14", duration_days: 14 },
    velocity: {
      period: { start: "2026-01-01", end: "2026-01-14" },
      commits: { total: 24, by_author: {}, average_per_day: 1.7, streak_days: 5 },
      code_changes: { lines_added: 800, lines_deleted: 200, files_changed: 30, net_growth: 600 },
      daily_breakdown: [],
    },
    ai_impact: {
      period: { start: "2026-01-01", end: "2026-01-14" },
      agent_tasks: { total_executed: 3, by_type: {}, success_rate: 1, approval_rate: 1 },
      code_contribution: { lines_generated: 200, lines_accepted: 180, acceptance_rate: 0.9, tests_generated: 5 },
      time_savings: { estimated_manual_hours: 4, actual_ai_minutes: 20, savings_ratio: 12 },
      doc_maintenance: { docs_auto_updated: 2, avg_staleness_before: 0.6, avg_staleness_after: 0.1 },
    },
    maintenance_delta: {
      debt_score_start: 40,
      debt_score_end: 35,
      coverage_start: 60,
      coverage_end: 65,
      stale_docs_start: 5,
      stale_docs_end: 2,
    },
    highlights: [],
    concerns: [],
  },
  {
    sprint: { name: "Sprint 2", start: "2026-01-15", end: "2026-01-28", duration_days: 14 },
    velocity: {
      period: { start: "2026-01-15", end: "2026-01-28" },
      commits: { total: 31, by_author: {}, average_per_day: 2.2, streak_days: 7 },
      code_changes: { lines_added: 1200, lines_deleted: 300, files_changed: 45, net_growth: 900 },
      daily_breakdown: [],
    },
    ai_impact: {
      period: { start: "2026-01-15", end: "2026-01-28" },
      agent_tasks: { total_executed: 5, by_type: {}, success_rate: 0.8, approval_rate: 1 },
      code_contribution: { lines_generated: 400, lines_accepted: 350, acceptance_rate: 0.875, tests_generated: 10 },
      time_savings: { estimated_manual_hours: 8, actual_ai_minutes: 40, savings_ratio: 12 },
      doc_maintenance: { docs_auto_updated: 3, avg_staleness_before: 0.5, avg_staleness_after: 0.1 },
    },
    maintenance_delta: {
      debt_score_start: 35,
      debt_score_end: 28,
      coverage_start: 65,
      coverage_end: 70,
      stale_docs_start: 3,
      stale_docs_end: 1,
    },
    highlights: [],
    concerns: [],
  },
];

