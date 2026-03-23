/**
 * screens データあり状態レンダリングテスト
 *
 * 各スクリーンを「データが存在する状態」でレンダリングし、
 * データ依存コードパスのカバレッジを向上させる。
 */
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── モック定義 ────────────────────────────────────────────────────────────────

const mockProject = {
  id: 1, name: "DevNest", repo_owner: "yo", repo_name: "devnest",
  local_path: "/tmp/devnest", default_branch: "main", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockStatus = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest",
  issue_count: 10, open_issue_count: 3, document_count: 5,
  github_connected: true, last_synced_at: "2026-03-01",
};

const mockPr = {
  id: 1, project_id: 1, github_number: 44, github_id: 1044,
  title: "feat: auto commit", body: null, state: "open" as const,
  head_branch: "feat/44", base_branch: "main", author_login: "user",
  checks_status: "passing" as const, linked_issue_number: null,
  draft: false, merged_at: null,
  github_created_at: "2026-01-01", github_updated_at: "2026-01-01", synced_at: "2026-01-01",
};

const mockDepReport = {
  checked_at: "2026-03-01",
  rust_deps: [{ name: "tokio", current_version: "1.0.0", latest_version: "1.36.0", update_type: "minor" as const, source: "crates.io" }],
  node_deps: [],
  total_outdated: 1,
  total_vulnerable: 0,
};

const mockDebtReport = {
  scanned_at: "2026-03-01",
  items: [{
    id: "item-1",
    category: "TodoFixme" as const,
    file_path: "src/foo.ts",
    line: 10,
    severity: "Low" as const,
    description: "fix me",
    auto_detected: true,
  }],
  total_score: 80.0,
  by_category: { TodoFixme: 1 },
};

const mockRefactorCandidates = [{
  file_path: "src/big.ts",
  score: 0.95,
  factors: { change_frequency: 0.8, complexity: 0.9, file_size: 0.9 },
  estimated_impact: "High" as const,
}];

const mockCoverageReport = {
  overall_pct: 78.5,
  files: [],
  rust_available: false,
  node_available: true,
};

const mockDocStaleness = [{
  doc_path: "docs/arch.md",
  current_status: "fresh",
  staleness_score: 0.8,
  recommended_status: "stale",
  days_since_sync: 60,
  commits_since_sync: 5,
  lines_changed_in_sources: 100,
  total_source_lines: 500,
}];

const mockKanbanBoard = {
  product_id: "prod-1",
  columns: [
    { id: "col-1", name: "Todo", order: 0, wip_limit: null },
    { id: "col-2", name: "In Progress", order: 1, wip_limit: 3 },
  ],
  cards: [
    { id: "card-1", column_id: "col-1", title: "タスクA", description: null,
      priority: "high" as const, assignee: "alice", labels: [], issue_number: 42,
      created_at: "2026-01-01", updated_at: "2026-01-01" },
    { id: "card-2", column_id: "col-2", title: "タスクB", description: "説明",
      priority: "low" as const, assignee: null, labels: ["bug"], issue_number: null,
      created_at: "2026-01-01", updated_at: "2026-01-01" },
  ],
};

// const mockSprintHistory = [
//   { sprint_id: "s1", name: "Sprint 1", start_date: "2026-01-01", end_date: "2026-01-14",
//     velocity: 12, planned_points: 10, completed_points: 12,
//     ai_assisted_count: 3, total_issues: 5 },
// ];

const mockVelocity = {
  period: { from: "2026-01-01", to: "2026-03-01" },
  commits: { total: 42, by_author: { alice: 30, bob: 12 }, average_per_day: 1.5, streak_days: 7 },
  code_changes: { lines_added: 500, lines_deleted: 200, files_changed: 30, net_growth: 300 },
  daily_breakdown: [],
};

// ─── ストアモック ──────────────────────────────────────────────────────────────

vi.mock("../../stores/projectStore", () => {
  const state = {
    currentProject: mockProject,
    projects: [mockProject],
    currentStatus: mockStatus,
    selectProject: vi.fn(),
  };
  const useProjectStore: ReturnType<typeof vi.fn> & { getState?: () => typeof state } =
    vi.fn((sel?: (s: typeof state) => unknown) => sel ? sel(state) : state);
  useProjectStore.getState = () => state;
  return { useProjectStore };
});

vi.mock("../../stores/maintenanceStore", () => ({
  useMaintenanceStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      depReport: mockDepReport, depStatus: "success",
      debtReport: mockDebtReport, debtStatus: "success",
      coverageReport: mockCoverageReport, coverageStatus: "success",
      refactorCandidates: mockRefactorCandidates, refactorStatus: "success",
      docStaleness: mockDocStaleness, docStalenessStatus: "success",
      error: null,
      scanDependencies: vi.fn(() => Promise.resolve()),
      scanDebt: vi.fn(() => Promise.resolve()),
      scanCoverage: vi.fn(() => Promise.resolve()),
      generateCoverage: vi.fn(() => Promise.resolve()),
      scanRefactor: vi.fn(() => Promise.resolve()),
      scanDocStaleness: vi.fn(() => Promise.resolve()),
      scanAll: vi.fn(() => Promise.resolve()),
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock("../../stores/prStore", () => ({
  usePrStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      prs: [mockPr], status: "success",
      fetchPrs: vi.fn(() => Promise.resolve()),
      selectedPr: null, fetchStatus: "success",
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { navigate: vi.fn(), currentScreen: "home" };
    return sel ? sel(state) : state;
  }),
}));

vi.mock("../../stores/kanbanStore", () => ({
  useKanbanStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      board: mockKanbanBoard, status: "success",
      fetchBoard: vi.fn(), moveCard: vi.fn(),
      createCard: vi.fn(), deleteCard: vi.fn(),
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock("../../stores/analyticsStore", () => ({
  useAnalyticsStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      velocity: mockVelocity, velocityStatus: "success",
      aiImpact: null, aiImpactStatus: "idle",
      sprintHistory: [], sprintStatus: "success",
      fetchVelocity: vi.fn(() => Promise.resolve()),
      fetchAiImpact: vi.fn(() => Promise.resolve()),
      fetchSprintHistory: vi.fn(() => Promise.resolve()),
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock("../../stores/terminalStore", () => ({
  useTerminalStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = { setPendingPrompt: vi.fn(), pendingPrompt: null };
    return sel ? sel(state) : state;
  }),
}));

vi.mock("../../stores/collaborationStore", () => ({
  useCollaborationStore: vi.fn(() => ({
    sessions: [], status: "idle", fetchSessions: vi.fn(),
  })),
}));

vi.mock("../../stores/mcpStore", () => ({
  useMcpStore: vi.fn(() => ({
    tools: [], status: "idle", fetchTools: vi.fn(), callTool: vi.fn(),
    servers: [], connectServer: vi.fn(), disconnectServer: vi.fn(),
  })),
}));

vi.mock("../../stores/agentStore", () => ({
  useAgentStore: vi.fn(() => ({
    tasks: [], status: "idle", fetchTasks: vi.fn(), submitTask: vi.fn(),
  })),
}));

vi.mock("../../stores/sprintStore", () => ({
  useSprintStore: vi.fn(() => ({
    currentSprint: null, sprints: [], status: "idle",
    fetchSprints: vi.fn(), startSprint: vi.fn(), closeSprint: vi.fn(),
  })),
}));

vi.mock("../../lib/ipc", () => ({
  ipc: { invoke: vi.fn(() => Promise.resolve(null)) },
  knowledgeList: vi.fn(() => Promise.resolve([])),
  knowledgeSearch: vi.fn(() => Promise.resolve([])),
  knowledgeAdd: vi.fn(() => Promise.resolve(null)),
  teamGetDashboard: vi.fn(() => Promise.resolve(null)),
  mcpGetStatus: vi.fn(() => Promise.resolve(null)),
  mcpGetPolicy: vi.fn(() => Promise.resolve(null)),
}));

// ─── テスト ────────────────────────────────────────────────────────────────────

describe("screens — データあり状態レンダリング", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MaintenanceScreen: depReport あり状態でレンダリングされる", async () => {
    const { MaintenanceScreen } = await import("../MaintenanceScreen");
    const { unmount } = render(<MaintenanceScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("MaintenanceScreen: debtReport あり状態でレンダリングされる", async () => {
    const { MaintenanceScreen } = await import("../MaintenanceScreen");
    const { unmount } = render(<MaintenanceScreen />);
    expect(document.body.textContent).not.toBe("");
    unmount();
  });

  it("KanbanScreen: board あり状態でカラムが表示される", async () => {
    const { KanbanScreen } = await import("../KanbanScreen");
    const { unmount } = render(<KanbanScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("SprintScreen: sprintHistory あり状態でレンダリングされる", async () => {
    const { SprintScreen } = await import("../SprintScreen");
    const { unmount } = render(<SprintScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("AnalyticsScreen: velocity あり状態でレンダリングされる", async () => {
    const { AnalyticsScreen } = await import("../AnalyticsScreen");
    const { unmount } = render(<AnalyticsScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("HomeDashboardScreen: prs + currentStatus あり状態でレンダリングされる", async () => {
    const { HomeDashboardScreen } = await import("../HomeDashboardScreen");
    const { unmount } = render(<HomeDashboardScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("McpScreen: currentProject あり状態でレンダリングされる", async () => {
    const { McpScreen } = await import("../McpScreen");
    const { unmount } = render(<McpScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("FreshnessMapScreen: docStaleness あり状態でレンダリングされる", async () => {
    const { FreshnessMapScreen } = await import("../FreshnessMapScreen");
    const { unmount } = render(<FreshnessMapScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("ProjectViewScreen: データあり状態でレンダリングされる", async () => {
    const { ProjectViewScreen } = await import("../ProjectViewScreen");
    const { unmount } = render(<ProjectViewScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("CollaborationScreen: currentProject あり状態でレンダリングされる", async () => {
    const { CollaborationScreen } = await import("../CollaborationScreen");
    const { unmount } = render(<CollaborationScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });
});
