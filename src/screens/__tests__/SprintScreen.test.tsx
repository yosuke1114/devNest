/**
 * SprintScreen テスト
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

const mockSprintItem = {
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
  maintenance_delta: { debt_score_start: 40, debt_score_end: 35, coverage_start: 60, coverage_end: 65, stale_docs_start: 5, stale_docs_end: 2 },
  highlights: [],
  concerns: [],
};

// ─── モック状態 ──────────────────────────────────────────────────────────────

const projectState = { currentProject: mockProject as typeof mockProject | null };
const analyticsState = {
  sprintHistory: [] as typeof mockSprintItem[],
  sprintStatus: "idle" as string,
  fetchSprintHistory: vi.fn(() => Promise.resolve()),
};

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn(() => projectState),
}));

vi.mock("../../stores/analyticsStore", () => ({
  useAnalyticsStore: vi.fn(() => analyticsState),
}));

import { SprintScreen } from "../SprintScreen";

describe("SprintScreen", () => {
  beforeEach(() => {
    projectState.currentProject = mockProject;
    analyticsState.sprintHistory = [];
    analyticsState.sprintStatus = "idle";
    analyticsState.fetchSprintHistory.mockClear();
  });

  it("プロジェクト未選択時は案内文を表示", () => {
    projectState.currentProject = null;
    render(<SprintScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("デフォルトで プランニング タブが表示される", () => {
    render(<SprintScreen />);
    expect(screen.getByText("スプリントプランニング")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/このスプリントで達成したいことを記述/)).toBeInTheDocument();
  });

  it("スプリントゴール を入力できる", () => {
    render(<SprintScreen />);
    const textarea = screen.getByPlaceholderText(/このスプリントで達成したいことを記述/);
    fireEvent.change(textarea, { target: { value: "テスト改善" } });
    expect((textarea as HTMLTextAreaElement).value).toBe("テスト改善");
  });

  it("期間 を変更できる", () => {
    render(<SprintScreen />);
    const input = screen.getByDisplayValue("14");
    fireEvent.change(input, { target: { value: "21" } });
    expect((input as HTMLInputElement).value).toBe("21");
  });

  it("レトロスペクティブ タブに切り替えできる", () => {
    render(<SprintScreen />);
    fireEvent.click(screen.getByRole("button", { name: "レトロスペクティブ" }));
    expect(screen.getByText(/うまくいったこと/)).toBeInTheDocument();
    expect(screen.getByText(/改善したいこと/)).toBeInTheDocument();
    expect(screen.getByText(/次のアクション/)).toBeInTheDocument();
  });

  it("レトロ の各フィールドに入力できる", () => {
    render(<SprintScreen />);
    fireEvent.click(screen.getByRole("button", { name: "レトロスペクティブ" }));
    const textareas = screen.getAllByRole("textbox");
    fireEvent.change(textareas[0], { target: { value: "良かった" } });
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("良かった");
  });

  it("年輪 タブ: sprintHistory が空でプレースホルダーデータを表示", () => {
    render(<SprintScreen />);
    fireEvent.click(screen.getByRole("button", { name: "年輪" }));
    expect(screen.getByText(/年輪 — スプリント成長グラフ/)).toBeInTheDocument();
    // placeholder のスプリント名が表示される
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
  });

  it("年輪 タブ: sprintHistory データあり状態でレンダリングされる", () => {
    analyticsState.sprintHistory = [mockSprintItem];
    render(<SprintScreen />);
    fireEvent.click(screen.getByRole("button", { name: "年輪" }));
    expect(screen.getByText("Sprint 1")).toBeInTheDocument();
  });

  it("年輪 タブ: loading=true で読み込み中表示", () => {
    analyticsState.sprintStatus = "loading";
    render(<SprintScreen />);
    fireEvent.click(screen.getByRole("button", { name: "年輪" }));
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("フロー分析 タブに切り替えできる", () => {
    render(<SprintScreen />);
    fireEvent.click(screen.getByRole("button", { name: "フロー分析" }));
    expect(screen.getByText("サイクルタイム")).toBeInTheDocument();
    expect(screen.getByText("スループット")).toBeInTheDocument();
    expect(screen.getByText("ボトルネック")).toBeInTheDocument();
  });

  it("フロー分析 タブ: sprintHistory ありでスループット値が表示される", () => {
    analyticsState.sprintHistory = [mockSprintItem];
    render(<SprintScreen />);
    fireEvent.click(screen.getByRole("button", { name: "フロー分析" }));
    expect(screen.getByText("24 コミット")).toBeInTheDocument();
  });

  it("フロー分析 タブ: sprintHistory なしは 0 コミット", () => {
    render(<SprintScreen />);
    fireEvent.click(screen.getByRole("button", { name: "フロー分析" }));
    expect(screen.getByText("0 コミット")).toBeInTheDocument();
  });

  it("マウント時に fetchSprintHistory が呼ばれる", () => {
    render(<SprintScreen />);
    expect(analyticsState.fetchSprintHistory).toHaveBeenCalledWith("/tmp/devnest", 8);
  });
});
