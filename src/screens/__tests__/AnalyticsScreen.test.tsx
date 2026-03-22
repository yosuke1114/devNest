/**
 * AnalyticsScreen テスト
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProject = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest", default_branch: "main",
  repo_owner: "yo", repo_name: "devnest", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockVelocity = {
  period: { start: "2026-01-01", end: "2026-03-01" },
  commits: { total: 42, by_author: { alice: 30 }, average_per_day: 1.5, streak_days: 7 },
  code_changes: { lines_added: 500, lines_deleted: 200, files_changed: 30, net_growth: 300 },
  daily_breakdown: [
    { date: "2026-02-01", commits: 3, lines_added: 50, lines_deleted: 10 },
    { date: "2026-02-02", commits: 0, lines_added: 0, lines_deleted: 0 },
    { date: "2026-02-03", commits: 5, lines_added: 100, lines_deleted: 20 },
  ],
};

const mockAiImpact = {
  period: { start: "2026-01-01", end: "2026-03-01" },
  agent_tasks: { total_executed: 8, by_type: {}, success_rate: 0.875, approval_rate: 1 },
  code_contribution: { lines_generated: 400, lines_accepted: 350, acceptance_rate: 0.875, tests_generated: 10 },
  time_savings: { estimated_manual_hours: 4.5, actual_ai_minutes: 30, savings_ratio: 0.09 },
  doc_maintenance: { docs_auto_updated: 3, avg_staleness_before: 0.6, avg_staleness_after: 0.1 },
};

const mockSprintItem = {
  sprint: { name: "Sprint 1", start: "2026-01-01", end: "2026-01-14", duration_days: 14 },
  velocity: {
    period: { start: "2026-01-01", end: "2026-01-14" },
    commits: { total: 24, by_author: {}, average_per_day: 1.7, streak_days: 5 },
    code_changes: { lines_added: 800, lines_deleted: 200, files_changed: 30, net_growth: 600 },
    daily_breakdown: [],
  },
  ai_impact: mockAiImpact,
  maintenance_delta: { debt_score_start: 40, debt_score_end: 35, coverage_start: 60, coverage_end: 65, stale_docs_start: 5, stale_docs_end: 2 },
  highlights: ["速度向上"],
  concerns: [],
};

// ─── モック状態 ──────────────────────────────────────────────────────────────

const projectState = { currentProject: mockProject as typeof mockProject | null };
const analyticsState = {
  velocity: null as typeof mockVelocity | null,
  aiImpact: null as typeof mockAiImpact | null,
  sprintHistory: [] as typeof mockSprintItem[],
  velocityStatus: "idle" as string,
  aiImpactStatus: "idle" as string,
  sprintStatus: "idle" as string,
  fetchVelocity: vi.fn(() => Promise.resolve()),
  fetchAiImpact: vi.fn(() => Promise.resolve()),
  fetchSprintHistory: vi.fn(() => Promise.resolve()),
};

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn(() => projectState),
}));

vi.mock("../../stores/analyticsStore", () => ({
  useAnalyticsStore: vi.fn(() => analyticsState),
}));

import { AnalyticsScreen } from "../AnalyticsScreen";

describe("AnalyticsScreen", () => {
  beforeEach(() => {
    projectState.currentProject = mockProject;
    analyticsState.velocity = null;
    analyticsState.aiImpact = null;
    analyticsState.sprintHistory = [];
    analyticsState.velocityStatus = "idle";
    analyticsState.aiImpactStatus = "idle";
    analyticsState.sprintStatus = "idle";
    analyticsState.fetchVelocity = vi.fn(() => Promise.resolve());
    analyticsState.fetchAiImpact = vi.fn(() => Promise.resolve());
    analyticsState.fetchSprintHistory = vi.fn(() => Promise.resolve());
  });

  it("プロジェクト未選択時は案内文を表示", () => {
    projectState.currentProject = null;
    render(<AnalyticsScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("ヘッダーが表示される", () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText("分析 & インサイト")).toBeInTheDocument();
  });

  it("期間ボタンが表示される", () => {
    render(<AnalyticsScreen />);
    expect(screen.getByText("7日")).toBeInTheDocument();
    expect(screen.getByText("30日")).toBeInTheDocument();
    expect(screen.getByText("90日")).toBeInTheDocument();
  });

  it("マウント時に fetch が呼ばれる", () => {
    render(<AnalyticsScreen />);
    expect(analyticsState.fetchVelocity).toHaveBeenCalledWith("/tmp/devnest", expect.any(Object));
    expect(analyticsState.fetchAiImpact).toHaveBeenCalledWith("/tmp/devnest", expect.any(Object));
    expect(analyticsState.fetchSprintHistory).toHaveBeenCalledWith("/tmp/devnest", 4);
  });

  it("期間ボタン切り替えで fetchVelocity が再呼び出しされる", () => {
    render(<AnalyticsScreen />);
    fireEvent.click(screen.getByText("7日"));
    expect(analyticsState.fetchVelocity).toHaveBeenCalledTimes(2);
  });

  it("90日 に切り替えできる", () => {
    render(<AnalyticsScreen />);
    fireEvent.click(screen.getByText("90日"));
    expect(analyticsState.fetchVelocity).toHaveBeenCalledTimes(2);
  });

  // ─── Velocity Panel ───────────────────────────────────────────────────────

  it("velocityStatus=loading で 読み込み中 を表示", () => {
    analyticsState.velocityStatus = "loading";
    render(<AnalyticsScreen />);
    const loadings = screen.getAllByText("読み込み中...");
    expect(loadings.length).toBeGreaterThan(0);
  });

  it("velocityStatus=error でエラー文を表示", () => {
    analyticsState.velocityStatus = "error";
    render(<AnalyticsScreen />);
    const errors = screen.getAllByText("エラーが発生しました");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("velocity データあり状態でメトリクスを表示", () => {
    analyticsState.velocityStatus = "success";
    analyticsState.velocity = mockVelocity;
    render(<AnalyticsScreen />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
    expect(screen.getByText("連続コミット日数")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
  });

  it("velocity.daily_breakdown があるときグラフを表示", () => {
    analyticsState.velocityStatus = "success";
    analyticsState.velocity = mockVelocity;
    render(<AnalyticsScreen />);
    expect(screen.getByText("日別コミット")).toBeInTheDocument();
  });

  // ─── AI Impact Panel ──────────────────────────────────────────────────────

  it("aiImpactStatus=success で AI メトリクスを表示", () => {
    analyticsState.aiImpactStatus = "success";
    analyticsState.aiImpact = mockAiImpact;
    render(<AnalyticsScreen />);
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByText("4.5h")).toBeInTheDocument();
  });

  it("aiImpactStatus=error でエラー文を表示", () => {
    analyticsState.aiImpactStatus = "error";
    render(<AnalyticsScreen />);
    const errors = screen.getAllByText("エラーが発生しました");
    expect(errors.length).toBeGreaterThan(0);
  });

  // ─── Sprint History Panel ─────────────────────────────────────────────────

  it("sprintStatus=success + 空のとき スプリント履歴なし を表示", () => {
    analyticsState.sprintStatus = "success";
    analyticsState.sprintHistory = [];
    render(<AnalyticsScreen />);
    expect(screen.getByText("スプリント履歴なし")).toBeInTheDocument();
  });

  it("sprintStatus=success + データありでスプリントを表示", () => {
    analyticsState.sprintStatus = "success";
    analyticsState.sprintHistory = [mockSprintItem];
    render(<AnalyticsScreen />);
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
    expect(screen.getByText("24 コミット")).toBeInTheDocument();
    expect(screen.getByText("+800 / -200")).toBeInTheDocument();
  });

  it("highlights があるとき表示される", () => {
    analyticsState.sprintStatus = "success";
    analyticsState.sprintHistory = [mockSprintItem];
    render(<AnalyticsScreen />);
    expect(screen.getByText('"速度向上"')).toBeInTheDocument();
  });

  it("sprintStatus=loading で読み込み中を表示", () => {
    analyticsState.sprintStatus = "loading";
    render(<AnalyticsScreen />);
    const loadings = screen.getAllByText("読み込み中...");
    expect(loadings.length).toBeGreaterThan(0);
  });

  it("sprintStatus=error でエラーを表示", () => {
    analyticsState.sprintStatus = "error";
    render(<AnalyticsScreen />);
    const errors = screen.getAllByText("エラーが発生しました");
    expect(errors.length).toBeGreaterThan(0);
  });
});
