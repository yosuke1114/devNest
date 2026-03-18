/**
 * MaintenanceScreen テスト
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

const mockDepReport = {
  checked_at: "2026-03-01",
  rust_deps: [{
    name: "tokio", current_version: "1.0.0", latest_version: "1.36.0",
    update_type: "minor" as const, source: "crates.io",
    has_vulnerability: false, vulnerability_severity: null,
  }],
  node_deps: [{
    name: "react", current_version: "18.0.0", latest_version: "18.3.0",
    update_type: "patch" as const, source: "npm",
    has_vulnerability: true, vulnerability_severity: "High",
  }],
  total_outdated: 2,
  total_vulnerable: 1,
};

const mockDebtReport = {
  scanned_at: "2026-03-01",
  items: [{
    id: "item-1", category: "TodoFixme" as const,
    file_path: "src/foo.ts", line: 10,
    severity: "High" as const, description: "fix me",
    auto_detected: true,
  }],
  total_score: 80.0,
  by_category: { TodoFixme: 1 },
};

const mockCoverageReport = {
  overall_pct: 78.5,
  files: [],
  rust_available: false,
  node_available: true,
};

const mockRefactorCandidates = [{
  file_path: "src/big.ts", score: 0.95,
  factors: { change_frequency: 0.8, complexity: 0.9, file_size: 0.9 },
  estimated_impact: "High" as const,
}];

const mockDocStaleness = [
  { doc_path: "docs/a.md", current_status: "fresh", staleness_score: 0.1, recommended_status: "fresh", days_since_sync: 1, commits_since_sync: 0, lines_changed_in_sources: 10, total_source_lines: 100 },
  { doc_path: "docs/b.md", current_status: "fresh", staleness_score: 0.5, recommended_status: "stale", days_since_sync: 30, commits_since_sync: 5, lines_changed_in_sources: 50, total_source_lines: 100 },
  { doc_path: "docs/c.md", current_status: "stale", staleness_score: 0.9, recommended_status: "stale", days_since_sync: 90, commits_since_sync: 10, lines_changed_in_sources: 80, total_source_lines: 100 },
];

// ─── モック状態 ──────────────────────────────────────────────────────────────

const projectState = { currentProject: mockProject as typeof mockProject | null };
const maintenanceState = {
  depReport: null as typeof mockDepReport | null,
  depStatus: "idle" as string,
  debtReport: null as typeof mockDebtReport | null,
  debtStatus: "idle" as string,
  coverageReport: null as typeof mockCoverageReport | null,
  coverageStatus: "idle" as string,
  refactorCandidates: [] as typeof mockRefactorCandidates,
  refactorStatus: "idle" as string,
  docStaleness: [] as typeof mockDocStaleness,
  docStalenessStatus: "idle" as string,
  error: null,
  scanAll: vi.fn(() => Promise.resolve()),
  scanDependencies: vi.fn(() => Promise.resolve()),
  scanDebt: vi.fn(() => Promise.resolve()),
  scanCoverage: vi.fn(() => Promise.resolve()),
  generateCoverage: vi.fn(() => Promise.resolve()),
  scanRefactor: vi.fn(() => Promise.resolve()),
  scanDocStaleness: vi.fn(() => Promise.resolve()),
};

const uiState = { navigate: vi.fn(), currentScreen: "maintenance" };
const terminalState = { setPendingPrompt: vi.fn(), pendingPrompt: null };

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn((sel?: (s: unknown) => unknown) => sel ? sel(projectState) : projectState),
}));

vi.mock("../../stores/maintenanceStore", () => ({
  useMaintenanceStore: vi.fn((sel?: (s: unknown) => unknown) => sel ? sel(maintenanceState) : maintenanceState),
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn((sel?: (s: unknown) => unknown) => sel ? sel(uiState) : uiState),
}));

vi.mock("../../stores/terminalStore", () => ({
  useTerminalStore: vi.fn((sel?: (s: unknown) => unknown) => sel ? sel(terminalState) : terminalState),
}));

import { MaintenanceScreen } from "../MaintenanceScreen";

describe("MaintenanceScreen", () => {
  beforeEach(() => {
    projectState.currentProject = mockProject;
    maintenanceState.depReport = null;
    maintenanceState.depStatus = "idle";
    maintenanceState.debtReport = null;
    maintenanceState.debtStatus = "idle";
    maintenanceState.coverageReport = null;
    maintenanceState.coverageStatus = "idle";
    maintenanceState.refactorCandidates = [];
    maintenanceState.refactorStatus = "idle";
    maintenanceState.docStaleness = [];
    maintenanceState.docStalenessStatus = "idle";
    vi.clearAllMocks();
    maintenanceState.scanAll = vi.fn(() => Promise.resolve());
    maintenanceState.generateCoverage = vi.fn(() => Promise.resolve());
    uiState.navigate = vi.fn();
    terminalState.setPendingPrompt = vi.fn();
  });

  it("プロジェクト未選択時は案内文を表示", () => {
    projectState.currentProject = null;
    render(<MaintenanceScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("ヘッダーにプロジェクト名が表示される", () => {
    render(<MaintenanceScreen />);
    expect(screen.getByText(/Maintenance Dashboard — DevNest/)).toBeInTheDocument();
  });

  it("各パネルが表示される", () => {
    render(<MaintenanceScreen />);
    expect(screen.getByText("Dependencies")).toBeInTheDocument();
    expect(screen.getByText("Test Coverage")).toBeInTheDocument();
    expect(screen.getByText("Tech Debt")).toBeInTheDocument();
    expect(screen.getByText("Refactor Candidates")).toBeInTheDocument();
  });

  it("全スキャン ボタンクリックで scanAll が呼ばれる", () => {
    render(<MaintenanceScreen />);
    fireEvent.click(screen.getByText("全スキャン"));
    expect(maintenanceState.scanAll).toHaveBeenCalledWith("/tmp/devnest");
  });

  it("全ステータスが idle の場合 スキャン未実行 を表示", () => {
    render(<MaintenanceScreen />);
    const empties = screen.getAllByText("スキャン未実行");
    expect(empties.length).toBeGreaterThanOrEqual(4);
  });

  // ─── DepsPanel ───────────────────────────────────────────────────────────────

  it("DepsPanel: loading 状態でスキャン中を表示", () => {
    maintenanceState.depStatus = "loading";
    render(<MaintenanceScreen />);
    const loadings = screen.getAllByText("スキャン中…");
    expect(loadings.length).toBeGreaterThan(0);
  });

  it("DepsPanel: success + vulnerable deps で脆弱性行を表示", () => {
    maintenanceState.depStatus = "success";
    maintenanceState.depReport = mockDepReport;
    render(<MaintenanceScreen />);
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("DepsPanel: vulnerable なし outdated あり で outdated 行を表示", () => {
    maintenanceState.depStatus = "success";
    maintenanceState.depReport = {
      ...mockDepReport,
      node_deps: [{ ...mockDepReport.node_deps[0], has_vulnerability: false, vulnerability_severity: null }],
      total_vulnerable: 0,
    };
    render(<MaintenanceScreen />);
    expect(screen.getByText("react")).toBeInTheDocument();
  });

  it("DepsPanel: AI修正PR ボタンで navigate(terminal) が呼ばれる", () => {
    maintenanceState.depStatus = "success";
    maintenanceState.depReport = mockDepReport;
    render(<MaintenanceScreen />);
    const aiFixBtns = screen.getAllByText("AI修正PR");
    fireEvent.click(aiFixBtns[0]);
    expect(terminalState.setPendingPrompt).toHaveBeenCalled();
    expect(uiState.navigate).toHaveBeenCalledWith("terminal");
  });

  // ─── DebtPanel ───────────────────────────────────────────────────────────────

  it("DebtPanel: success + High/Critical items を表示", () => {
    maintenanceState.debtStatus = "success";
    maintenanceState.debtReport = mockDebtReport;
    render(<MaintenanceScreen />);
    expect(screen.getByText("src/foo.ts:10")).toBeInTheDocument();
  });

  it("DebtPanel: loading 状態でスキャン中を表示", () => {
    maintenanceState.debtStatus = "loading";
    render(<MaintenanceScreen />);
    const loadings = screen.getAllByText("スキャン中…");
    expect(loadings.length).toBeGreaterThan(0);
  });

  // ─── CoveragePanel ───────────────────────────────────────────────────────────

  it("CoveragePanel: success でカバレッジ % を表示", () => {
    maintenanceState.coverageStatus = "success";
    maintenanceState.coverageReport = mockCoverageReport;
    render(<MaintenanceScreen />);
    expect(screen.getByText("78.5%")).toBeInTheDocument();
  });

  it("CoveragePanel: 再実行 ボタンで generateCoverage が呼ばれる", () => {
    maintenanceState.coverageStatus = "success";
    maintenanceState.coverageReport = mockCoverageReport;
    render(<MaintenanceScreen />);
    fireEvent.click(screen.getByText("再実行"));
    expect(maintenanceState.generateCoverage).toHaveBeenCalledWith("/tmp/devnest", "node");
  });

  it("CoveragePanel: node_available=false のとき カバレッジ実行（Node） を表示", () => {
    maintenanceState.coverageStatus = "success";
    maintenanceState.coverageReport = { ...mockCoverageReport, node_available: false };
    render(<MaintenanceScreen />);
    expect(screen.getByText("カバレッジ実行（Node）")).toBeInTheDocument();
  });

  it("CoveragePanel: loading 状態でスキャン中を表示", () => {
    maintenanceState.coverageStatus = "loading";
    render(<MaintenanceScreen />);
    const loadings = screen.getAllByText("スキャン中…");
    expect(loadings.length).toBeGreaterThan(0);
  });

  it("CoveragePanel: AI修正PR ボタンで navigate が呼ばれる", () => {
    maintenanceState.coverageStatus = "success";
    maintenanceState.coverageReport = mockCoverageReport;
    render(<MaintenanceScreen />);
    const aiFixBtns = screen.getAllByText("AI修正PR");
    // coverageReport がある場合 AI修正PR ボタンが表示される
    expect(aiFixBtns.length).toBeGreaterThan(0);
    fireEvent.click(aiFixBtns[0]);
    expect(uiState.navigate).toHaveBeenCalledWith("terminal");
  });

  // ─── RefactorPanel ───────────────────────────────────────────────────────────

  it("RefactorPanel: success + candidates で候補を表示", () => {
    maintenanceState.refactorStatus = "success";
    maintenanceState.refactorCandidates = mockRefactorCandidates;
    render(<MaintenanceScreen />);
    expect(screen.getByText("src/big.ts")).toBeInTheDocument();
  });

  it("RefactorPanel: success + empty candidates で 候補なし を表示", () => {
    maintenanceState.refactorStatus = "success";
    maintenanceState.refactorCandidates = [];
    render(<MaintenanceScreen />);
    expect(screen.getByText("候補なし")).toBeInTheDocument();
  });

  // ─── DocHealthBar ─────────────────────────────────────────────────────────────

  it("DocHealthBar: docStalenessStatus=success でバーを表示", () => {
    maintenanceState.docStalenessStatus = "success";
    maintenanceState.docStaleness = mockDocStaleness;
    render(<MaintenanceScreen />);
    expect(screen.getByText("Doc Health")).toBeInTheDocument();
  });

  it("DocHealthBar: idle のときは表示しない", () => {
    render(<MaintenanceScreen />);
    expect(screen.queryByText("Doc Health")).not.toBeInTheDocument();
  });

  // ─── DebtPanel AI修正PR (lines 106-113, 512-523) ────────────────────────────

  it("DebtPanel: TodoFixme items があるとき AI修正PR ボタンが表示される (line 512)", () => {
    maintenanceState.debtStatus = "success";
    maintenanceState.debtReport = mockDebtReport;
    render(<MaintenanceScreen />);
    const aiFixBtns = screen.getAllByText("AI修正PR");
    expect(aiFixBtns.length).toBeGreaterThan(0);
  });

  it("DebtPanel: TodoFixme items のある AI修正PR クリックで navigate が呼ばれる (lines 106-113)", () => {
    maintenanceState.debtStatus = "success";
    maintenanceState.debtReport = mockDebtReport; // has TodoFixme category
    render(<MaintenanceScreen />);
    const aiFixBtns = screen.getAllByText("AI修正PR");
    // Debt panel の AI修正PR (DebtPanel の前にある Coverage のボタンがある可能性があるため最後のボタンを使用)
    fireEvent.click(aiFixBtns[aiFixBtns.length - 1]);
    expect(uiState.navigate).toHaveBeenCalledWith("terminal");
  });

  it("RefactorPanel: candidates がある AI修正PR クリックで navigate が呼ばれる (line 520)", () => {
    maintenanceState.refactorStatus = "success";
    maintenanceState.refactorCandidates = mockRefactorCandidates;
    render(<MaintenanceScreen />);
    const aiFixBtns = screen.getAllByText("AI修正PR");
    fireEvent.click(aiFixBtns[aiFixBtns.length - 1]);
    expect(uiState.navigate).toHaveBeenCalledWith("terminal");
  });

  // ─── isLoading 状態 ──────────────────────────────────────────────────────────

  it("loading 中は 全スキャン ボタンが disabled", () => {
    maintenanceState.depStatus = "loading";
    render(<MaintenanceScreen />);
    const btn = screen.getByText("全スキャン").closest("button");
    expect(btn).toBeDisabled();
  });
});
