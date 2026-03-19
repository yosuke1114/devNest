import { useEffect, useState } from "react";
import { useAnalyticsStore } from "../stores/analyticsStore";
import { useProjectStore } from "../stores/projectStore";
import type { DateRange } from "../types";

type Period = "7d" | "30d" | "90d";

function periodToRange(p: Period): DateRange {
  const end = new Date();
  const start = new Date();
  if (p === "7d") start.setDate(end.getDate() - 6);
  else if (p === "30d") start.setDate(end.getDate() - 29);
  else start.setDate(end.getDate() - 89);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export function AnalyticsScreen() {
  const { currentProject } = useProjectStore();
  const {
    velocity, aiImpact, sprintHistory,
    velocityStatus, aiImpactStatus, sprintStatus,
    fetchVelocity, fetchAiImpact, fetchSprintHistory,
  } = useAnalyticsStore();
  const [period, setPeriod] = useState<Period>("30d");

  useEffect(() => {
    if (!currentProject?.local_path) return;
    const range = periodToRange(period);
    fetchVelocity(currentProject.local_path, range);
    fetchAiImpact(currentProject.local_path, range);
  }, [currentProject?.local_path, period]);

  useEffect(() => {
    if (!currentProject?.local_path) return;
    fetchSprintHistory(currentProject.local_path, 4);
  }, [currentProject?.local_path]);

  if (!currentProject) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div style={{ flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>分析 & インサイト</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: period === p ? "#7c6af7" : "#333",
                background: period === p ? "#7c6af7" : "transparent",
                color: period === p ? "#fff" : "#888",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {p === "7d" ? "7日" : p === "30d" ? "30日" : "90日"}
            </button>
          ))}
        </div>
      </div>

      {/* Velocity Panel */}
      <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: 15, color: "#bbb" }}>開発速度</h2>
        {velocityStatus === "loading" && <div style={{ color: "#666" }}>読み込み中...</div>}
        {velocityStatus === "error" && <div style={{ color: "#f87171" }}>エラーが発生しました</div>}
        {velocityStatus === "success" && velocity && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <MetricCard label="総コミット数" value={String(velocity.commits.total)} />
            <MetricCard label="日平均コミット" value={velocity.commits.average_per_day.toFixed(1)} />
            <MetricCard label="連続コミット日数" value={`${velocity.commits.streak_days}日`} />
            <MetricCard label="純増行数" value={String(velocity.code_changes.net_growth)} />
          </div>
        )}
        {velocityStatus === "success" && velocity && velocity.daily_breakdown.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>日別コミット</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60 }}>
              {velocity.daily_breakdown.map((d) => {
                const maxC = Math.max(...velocity.daily_breakdown.map((x) => x.commits), 1);
                const h = Math.max(4, (d.commits / maxC) * 56);
                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.commits}件`}
                    style={{ flex: 1, height: h, background: "#7c6af7", borderRadius: 2, minWidth: 4 }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* AI Impact Panel */}
      <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: 15, color: "#bbb" }}>AI インパクト</h2>
        {aiImpactStatus === "loading" && <div style={{ color: "#666" }}>読み込み中...</div>}
        {aiImpactStatus === "error" && <div style={{ color: "#f87171" }}>エラーが発生しました</div>}
        {aiImpactStatus === "success" && aiImpact && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <MetricCard label="AI タスク実行数" value={String(aiImpact.agent_tasks.total_executed)} />
            <MetricCard label="成功率" value={`${(aiImpact.agent_tasks.success_rate * 100).toFixed(0)}%`} />
            <MetricCard label="推定節約時間" value={`${aiImpact.time_savings.estimated_manual_hours.toFixed(1)}h`} />
            <MetricCard label="時間節約率" value={`${(aiImpact.time_savings.savings_ratio * 100).toFixed(0)}%`} />
          </div>
        )}
      </div>

      {/* Sprint History */}
      <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: 15, color: "#bbb" }}>スプリント履歴</h2>
        {sprintStatus === "loading" && <div style={{ color: "#666" }}>読み込み中...</div>}
        {sprintStatus === "error" && <div style={{ color: "#f87171" }}>エラーが発生しました</div>}
        {sprintStatus === "success" && sprintHistory.length === 0 && (
          <div style={{ color: "#666" }}>スプリント履歴なし</div>
        )}
        {sprintStatus === "success" && sprintHistory.map((s) => (
          <div key={s.sprint.name} style={{ padding: "12px 0", borderBottom: "1px solid #2a2a3a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 600, color: "#e0e0e0" }}>{s.sprint.name}</span>
                <span style={{ marginLeft: 12, color: "#666", fontSize: 12 }}>
                  {s.sprint.start} 〜 {s.sprint.end}
                </span>
              </div>
              <div style={{ display: "flex", gap: 16, color: "#888", fontSize: 13 }}>
                <span>{s.velocity.commits.total} コミット</span>
                <span>+{s.velocity.code_changes.lines_added} / -{s.velocity.code_changes.lines_deleted}</span>
              </div>
            </div>
            {s.highlights.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {s.highlights.map((h, i) => (
                  <span key={i} style={{ padding: "2px 8px", background: "#1a3a1a", color: "#4caf50", borderRadius: 4, fontSize: 11 }}>
                    {JSON.stringify(h)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#13131f", borderRadius: 6, padding: 12, border: "1px solid #2a2a3a" }}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#7c6af7" }}>{value}</div>
    </div>
  );
}
