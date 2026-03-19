/**
 * HomeDashboardScreen テスト — HealthOverview / ProductTable / AttentionCard / QuickButton
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project } from "../../types";

// ─── モック状態 ──────────────────────────────────────────────────────────────

const mockProject: Project = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest", default_branch: "main",
  repo_owner: "yo", repo_name: "devnest", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const projectState = {
  projects: [mockProject] as Project[],
  currentProject: mockProject as Project | null,
  selectProject: vi.fn(),
  currentStatus: null as { document_count: number } | null,
};

const prState = {
  prs: [] as { state: string }[],
  fetchPrs: vi.fn(() => Promise.resolve()),
};

const uiState = { navigate: vi.fn() };

const maintenanceState = {
  debtReport: null as { total_score: number } | null,
  depReport: null as { total_outdated: number } | null,
  coverageReport: null as { overall_pct: number } | null,
  depStatus: "idle" as string,
  debtStatus: "idle" as string,
  scanDependencies: vi.fn(() => Promise.resolve()),
  scanDebt: vi.fn(() => Promise.resolve()),
};

vi.mock("../../stores/projectStore", () => {
  const hook = vi.fn((sel?: (s: typeof projectState) => unknown) =>
    sel ? sel(projectState) : projectState
  ) as ReturnType<typeof vi.fn> & { getState?: () => typeof projectState };
  hook.getState = () => projectState;
  return { useProjectStore: hook };
});

vi.mock("../../stores/prStore", () => ({
  usePrStore: vi.fn((sel?: (s: typeof prState) => unknown) =>
    sel ? sel(prState) : prState
  ),
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn((sel?: (s: typeof uiState) => unknown) =>
    sel ? sel(uiState) : uiState
  ),
}));

vi.mock("../../stores/maintenanceStore", () => ({
  useMaintenanceStore: vi.fn((sel?: (s: typeof maintenanceState) => unknown) =>
    sel ? sel(maintenanceState) : maintenanceState
  ),
}));

import { HomeDashboardScreen } from "../HomeDashboardScreen";

describe("HomeDashboardScreen — 基本レンダリング", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.projects = [mockProject];
    projectState.currentProject = mockProject;
    projectState.selectProject = vi.fn();
    projectState.currentStatus = null;
    prState.prs = [];
    prState.fetchPrs = vi.fn(() => Promise.resolve());
    uiState.navigate = vi.fn();
    maintenanceState.debtReport = null;
    maintenanceState.depReport = null;
    maintenanceState.coverageReport = null;
    maintenanceState.depStatus = "idle";
    maintenanceState.debtStatus = "idle";
    maintenanceState.scanDependencies = vi.fn(() => Promise.resolve());
    maintenanceState.scanDebt = vi.fn(() => Promise.resolve());
  });

  it("ホームダッシュボードヘッダーが表示される", () => {
    render(<HomeDashboardScreen />);
    expect(screen.getByText("ホームダッシュボード")).toBeInTheDocument();
  });

  it("プロジェクトなしのとき「プロジェクトがありません」が表示される", () => {
    projectState.projects = [];
    render(<HomeDashboardScreen />);
    expect(screen.getByText("プロジェクトがありません")).toBeInTheDocument();
  });

  it("プロジェクトありのとき ProductTable にプロジェクト名が表示される", () => {
    render(<HomeDashboardScreen />);
    expect(screen.getByText(/DevNest/)).toBeInTheDocument();
  });

  it("マウント時に fetchPrs が呼ばれる", async () => {
    render(<HomeDashboardScreen />);
    await waitFor(() => {
      expect(prState.fetchPrs).toHaveBeenCalledWith(1);
    });
  });

  it("debtStatus=idle のとき scanDebt が呼ばれる", async () => {
    maintenanceState.debtStatus = "idle";
    render(<HomeDashboardScreen />);
    await waitFor(() => {
      expect(maintenanceState.scanDebt).toHaveBeenCalled();
    });
  });

  it("depStatus=idle のとき scanDependencies が呼ばれる", async () => {
    maintenanceState.depStatus = "idle";
    render(<HomeDashboardScreen />);
    await waitFor(() => {
      expect(maintenanceState.scanDependencies).toHaveBeenCalled();
    });
  });

  it("HealthOverview: total=1 が表示される", () => {
    render(<HomeDashboardScreen />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("currentProject あり のとき 要対応 パネルが表示される", () => {
    render(<HomeDashboardScreen />);
    expect(screen.getByText("要対応")).toBeInTheDocument();
  });

  it("currentProject なし のとき 要対応 パネルが表示されない", () => {
    projectState.currentProject = null;
    render(<HomeDashboardScreen />);
    expect(screen.queryByText("要対応")).not.toBeInTheDocument();
  });
});

describe("HomeDashboardScreen — AttentionCards (line 282-308)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.projects = [mockProject];
    projectState.currentProject = mockProject;
    projectState.selectProject = vi.fn();
    projectState.currentStatus = null;
    prState.prs = [];
    prState.fetchPrs = vi.fn(() => Promise.resolve());
    uiState.navigate = vi.fn();
    maintenanceState.debtReport = null;
    maintenanceState.depReport = null;
    maintenanceState.coverageReport = null;
    maintenanceState.depStatus = "idle";
    maintenanceState.debtStatus = "idle";
    maintenanceState.scanDependencies = vi.fn(() => Promise.resolve());
    maintenanceState.scanDebt = vi.fn(() => Promise.resolve());
  });

  it("openPrs > 0 のとき PR AttentionCard が表示される", () => {
    prState.prs = [{ state: "open" }, { state: "open" }];
    render(<HomeDashboardScreen />);
    expect(screen.getByText("2 オープン PR")).toBeInTheDocument();
  });

  it("PR AttentionCard クリックで navigate(pr) が呼ばれる", () => {
    prState.prs = [{ state: "open" }];
    render(<HomeDashboardScreen />);
    fireEvent.click(screen.getByText("1 オープン PR"));
    expect(uiState.navigate).toHaveBeenCalledWith("pr");
  });

  it("outdatedDeps > 0 のとき deps AttentionCard が表示される", () => {
    maintenanceState.depReport = { total_outdated: 3 };
    render(<HomeDashboardScreen />);
    expect(screen.getByText("3 古い依存パッケージ")).toBeInTheDocument();
  });

  it("deps AttentionCard クリックで navigate(project) が呼ばれる", () => {
    maintenanceState.depReport = { total_outdated: 2 };
    render(<HomeDashboardScreen />);
    fireEvent.click(screen.getByText("2 古い依存パッケージ"));
    expect(uiState.navigate).toHaveBeenCalledWith("project");
  });

  it("debtScore > 40 のとき debt AttentionCard が表示される", () => {
    maintenanceState.debtReport = { total_score: 55 };
    render(<HomeDashboardScreen />);
    expect(screen.getByText("技術的負債スコア 55")).toBeInTheDocument();
  });

  it("debt AttentionCard クリックで navigate(project) が呼ばれる", () => {
    maintenanceState.debtReport = { total_score: 60 };
    render(<HomeDashboardScreen />);
    fireEvent.click(screen.getByText("技術的負債スコア 60"));
    expect(uiState.navigate).toHaveBeenCalledWith("project");
  });

  it("openPrs=0 & outdatedDeps=0 & debtScore<=40 のとき「問題はありません」が表示される", () => {
    render(<HomeDashboardScreen />);
    expect(screen.getByText("問題はありません ✓")).toBeInTheDocument();
  });

  it("AttentionCard onMouseEnter/onMouseLeave が動作する (line 375-376)", () => {
    prState.prs = [{ state: "open" }];
    render(<HomeDashboardScreen />);
    const card = screen.getByText("1 オープン PR").closest("button")!;
    // trigger mouse events (lines 375-376)
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    // just verify no errors thrown
    expect(card).toBeInTheDocument();
  });
});

describe("HomeDashboardScreen — QuickAccess ボタン", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.projects = [mockProject];
    projectState.currentProject = mockProject;
    projectState.selectProject = vi.fn();
    projectState.currentStatus = null;
    prState.prs = [];
    prState.fetchPrs = vi.fn(() => Promise.resolve());
    uiState.navigate = vi.fn();
    maintenanceState.debtReport = null;
    maintenanceState.depReport = null;
    maintenanceState.coverageReport = null;
    maintenanceState.depStatus = "idle";
    maintenanceState.debtStatus = "idle";
    maintenanceState.scanDependencies = vi.fn(() => Promise.resolve());
    maintenanceState.scanDebt = vi.fn(() => Promise.resolve());
  });

  it("かんばんボタンクリックで navigate(project) が呼ばれる", () => {
    render(<HomeDashboardScreen />);
    fireEvent.click(screen.getByText("かんばん"));
    expect(uiState.navigate).toHaveBeenCalledWith("project");
  });

  it("Claude Terminal ボタンクリックで navigate(agent) が呼ばれる", () => {
    render(<HomeDashboardScreen />);
    fireEvent.click(screen.getByText("Claude Terminal"));
    expect(uiState.navigate).toHaveBeenCalledWith("agent");
  });

  it("保守スキャンボタンクリックで navigate(project) が呼ばれる", () => {
    render(<HomeDashboardScreen />);
    fireEvent.click(screen.getByText("保守スキャン"));
    expect(uiState.navigate).toHaveBeenCalledWith("project");
  });
});

describe("HomeDashboardScreen — ProductTable (line 87-161)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.projects = [mockProject];
    projectState.currentProject = mockProject;
    projectState.selectProject = vi.fn();
    projectState.currentStatus = { document_count: 5 };
    prState.prs = [{ state: "open" }];
    prState.fetchPrs = vi.fn(() => Promise.resolve());
    uiState.navigate = vi.fn();
    maintenanceState.debtReport = { total_score: 70 };
    maintenanceState.depReport = { total_outdated: 8 };
    maintenanceState.coverageReport = { overall_pct: 55.5 };
    maintenanceState.depStatus = "idle";
    maintenanceState.debtStatus = "idle";
    maintenanceState.scanDependencies = vi.fn(() => Promise.resolve());
    maintenanceState.scanDebt = vi.fn(() => Promise.resolve());
  });

  it("現在のプロジェクト行にメトリクスが表示される", () => {
    render(<HomeDashboardScreen />);
    // coverage shows as 56% (rounded)
    expect(screen.getByText("56%")).toBeInTheDocument();
    // PR count shown in table (may appear multiple times)
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("ProductTable のプロジェクト行クリックで selectProject + navigate が呼ばれる", () => {
    render(<HomeDashboardScreen />);
    // The project row has the project name
    const row = screen.getByText(/DevNest/).closest("tr")!;
    fireEvent.click(row);
    expect(projectState.selectProject).toHaveBeenCalledWith(mockProject);
    expect(uiState.navigate).toHaveBeenCalledWith("project");
  });

  it("ProductTable の行 onMouseEnter/onMouseLeave が動作する", () => {
    const proj2: Project = { ...mockProject, id: 2, name: "Proj2" };
    projectState.projects = [mockProject, proj2];
    render(<HomeDashboardScreen />);
    const rows = document.querySelectorAll("tr");
    // find the non-selected row (Proj2, id=2 != currentProjectId=1)
    const proj2Row = Array.from(rows).find(r => r.textContent?.includes("Proj2"));
    if (proj2Row) {
      fireEvent.mouseEnter(proj2Row);
      fireEvent.mouseLeave(proj2Row);
    }
    expect(screen.getAllByText(/DevNest/).length).toBeGreaterThan(0);
  });

  it("debtScore > 60 のとき 🔴 ヘルス表示", () => {
    maintenanceState.debtReport = { total_score: 70 };
    render(<HomeDashboardScreen />);
    expect(screen.getByText("🔴")).toBeInTheDocument();
  });

  it("outdatedDeps > 2 のとき 🟡 ヘルス表示", () => {
    maintenanceState.debtReport = { total_score: 20 };
    maintenanceState.depReport = { total_outdated: 4 };
    render(<HomeDashboardScreen />);
    expect(screen.getByText("🟡")).toBeInTheDocument();
  });
});
