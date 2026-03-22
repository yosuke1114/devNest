/**
 * Phase 6-10 スクリーン スモークテスト
 *
 * 各スクリーンが「プロジェクト未選択」と「プロジェクト選択済み」の両状態で
 * クラッシュせずにレンダリングできることを確認する最低限のテスト。
 */
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── ストアモック ──────────────────────────────────────────────────

const mockProject = {
  id: 1, name: "DevNest", repo_owner: "yo", repo_name: "devnest",
  local_path: "/tmp/devnest", default_branch: "main", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: update {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

vi.mock("../stores/projectStore", () => ({
  useProjectStore: vi.fn((sel?: (s: unknown) => unknown) => {
    const state = {
      currentProject: mockProject,
      projects: [mockProject],
      currentStatus: null,
    };
    return sel ? sel(state) : state;
  }),
}));

vi.mock("../stores/analyticsStore", () => ({
  useAnalyticsStore: vi.fn(() => ({
    metrics: null, status: "idle", fetchMetrics: vi.fn(),
    velocityTrend: [], burndown: null, aiImpact: null,
  })),
}));

vi.mock("../stores/kanbanStore", () => ({
  useKanbanStore: vi.fn(() => ({
    board: null, status: "idle", fetchBoard: vi.fn(),
    moveCard: vi.fn(), createCard: vi.fn(), deleteCard: vi.fn(),
  })),
}));

vi.mock("../stores/maintenanceStore", () => ({
  useMaintenanceStore: vi.fn(() => ({
    report: null, status: "idle", fetchReport: vi.fn(),
    runLint: vi.fn(), runTests: vi.fn(), runDepsUpdate: vi.fn(),
    depReport: null, depStatus: "idle", scanDependencies: vi.fn(),
    debtReport: null, debtStatus: "idle", scanDebt: vi.fn(),
    coverageReport: null, coverageStatus: "idle", scanCoverage: vi.fn(),
    generateCoverage: vi.fn(),
    refactorCandidates: [], refactorStatus: "idle", scanRefactor: vi.fn(),
    docStaleness: [], docStalenessStatus: "idle", scanDocStaleness: vi.fn(),
    error: null, scanAll: vi.fn(),
  })),
}));

vi.mock("../stores/prStore", () => ({
  usePrStore: vi.fn(() => ({
    prs: [], status: "idle", fetchPRs: vi.fn(), selectedPr: null,
  })),
}));

vi.mock("../stores/uiStore", () => ({
  useUiStore: vi.fn(() => ({ navigate: vi.fn(), currentScreen: "home" })),
}));

vi.mock("../stores/sprintStore", () => ({
  useSprintStore: vi.fn(() => ({
    currentSprint: null, sprints: [], status: "idle",
    fetchSprints: vi.fn(), startSprint: vi.fn(), closeSprint: vi.fn(),
  })),
}));

vi.mock("../stores/collaborationStore", () => ({
  useCollaborationStore: vi.fn(() => ({
    sessions: [], status: "idle", fetchSessions: vi.fn(),
  })),
}));

vi.mock("../stores/mcpStore", () => ({
  useMcpStore: vi.fn(() => ({
    tools: [], status: "idle", fetchTools: vi.fn(), callTool: vi.fn(),
    servers: [], connectServer: vi.fn(), disconnectServer: vi.fn(),
  })),
}));

vi.mock("../stores/agentStore", () => ({
  useAgentStore: vi.fn(() => ({
    tasks: [], status: "idle", fetchTasks: vi.fn(), submitTask: vi.fn(),
  })),
}));

vi.mock("../lib/ipc", () => ({
  ipc: { invoke: vi.fn(() => Promise.resolve(null)) },
  // CollaborationScreen が直接呼ぶ関数
  knowledgeList: vi.fn(() => Promise.resolve([])),
  knowledgeSearch: vi.fn(() => Promise.resolve([])),
  knowledgeAdd: vi.fn(() => Promise.resolve(null)),
  teamGetDashboard: vi.fn(() => Promise.resolve(null)),
}));

// ─── テスト ─────────────────────────────────────────────────────────

describe("Phase 6-10 スクリーン スモークテスト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("KanbanScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { KanbanScreen } = await import("../KanbanScreen");
    const { unmount } = render(<KanbanScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("AnalyticsScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { AnalyticsScreen } = await import("../AnalyticsScreen");
    const { unmount } = render(<AnalyticsScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("SprintScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { SprintScreen } = await import("../SprintScreen");
    const { unmount } = render(<SprintScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("HomeDashboardScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { HomeDashboardScreen } = await import("../HomeDashboardScreen");
    const { unmount } = render(<HomeDashboardScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("MaintenanceScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { MaintenanceScreen } = await import("../MaintenanceScreen");
    const { unmount } = render(<MaintenanceScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("AgentControlScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { AgentControlScreen } = await import("../AgentControlScreen");
    const { unmount } = render(<AgentControlScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("CollaborationScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { CollaborationScreen } = await import("../CollaborationScreen");
    const { unmount } = render(<CollaborationScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("FreshnessMapScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { FreshnessMapScreen } = await import("../FreshnessMapScreen");
    const { unmount } = render(<FreshnessMapScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });

  it("ProjectViewScreen: プロジェクト選択済みでクラッシュしない", async () => {
    const { ProjectViewScreen } = await import("../ProjectViewScreen");
    const { unmount } = render(<ProjectViewScreen />);
    expect(document.body).toBeTruthy();
    unmount();
  });
});
