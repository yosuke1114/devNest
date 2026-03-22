import { beforeEach, describe, it, expect, vi } from "vitest";
import { useMaintenanceStore } from "./maintenanceStore";
import type {
  DependencyReport,
  TechDebtReport,
  CoverageReport,
  RefactorCandidate,
  DocStaleness,
} from "../types";

const mockIpc = vi.hoisted(() => ({
  maintenanceScanDependencies: vi.fn(),
  maintenanceScanTechDebt: vi.fn(),
  maintenanceRunCoverage: vi.fn(),
  maintenanceGenerateCoverage: vi.fn(),
  maintenanceRefactorCandidates: vi.fn(),
  checkDocStaleness: vi.fn(),
}));

vi.mock("../lib/ipc", () => mockIpc);

// ─── ヘルパー ──────────────────────────────────────────────────────

const projectPath = "/tmp/proj";

const mockDepReport: DependencyReport = {
  checked_at: "2026-03-01",
  rust_deps: [],
  node_deps: [{ name: "react", ecosystem: "Node", current_version: "18.0.0", latest_version: "18.3.0", update_type: "Minor", has_vulnerability: false, vulnerability_severity: null, affected_sources: [] }],
  total_outdated: 1,
  total_vulnerable: 0,
};

const mockDebtReport: TechDebtReport = {
  scanned_at: "2026-03-01",
  items: [{ id: "1", category: "TodoFixme", file_path: "src/foo.ts", line: 10, severity: "Low", description: "fix me", auto_detected: true }],
  total_score: 85,
  by_category: {},
};

const mockCoverageReport: CoverageReport = {
  overall_pct: 78.5,
  files: [],
  rust_available: false,
  node_available: true,
};

const mockRefactorCandidates: RefactorCandidate[] = [
  { file_path: "src/big.ts", score: 90, factors: { change_frequency: 5, complexity: 20, file_size: 500 }, estimated_impact: "High" },
];

const mockDocStaleness: DocStaleness[] = [
  { doc_path: "docs/arch.md", current_status: "stale", staleness_score: 0.8, recommended_status: "update", days_since_sync: 60, commits_since_sync: 10, lines_changed_in_sources: 100, total_source_lines: 500 },
];

function resetStore() {
  useMaintenanceStore.setState({
    depReport: null, depStatus: "idle",
    debtReport: null, debtStatus: "idle",
    coverageReport: null, coverageStatus: "idle",
    refactorCandidates: [], refactorStatus: "idle",
    docStaleness: [], docStalenessStatus: "idle",
    error: null,
  });
}

// ─── テスト ─────────────────────────────────────────────────────────

describe("maintenanceStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ─ 初期状態 ──────────────────────────────────────────────────────

  describe("初期状態", () => {
    it("全レポートが null/空", () => {
      const s = useMaintenanceStore.getState();
      expect(s.depReport).toBeNull();
      expect(s.debtReport).toBeNull();
      expect(s.coverageReport).toBeNull();
      expect(s.refactorCandidates).toEqual([]);
      expect(s.docStaleness).toEqual([]);
      expect(s.error).toBeNull();
    });

    it("全 status が idle", () => {
      const s = useMaintenanceStore.getState();
      expect(s.depStatus).toBe("idle");
      expect(s.debtStatus).toBe("idle");
      expect(s.coverageStatus).toBe("idle");
      expect(s.refactorStatus).toBe("idle");
      expect(s.docStalenessStatus).toBe("idle");
    });
  });

  // ─ scanDependencies ──────────────────────────────────────────────

  describe("scanDependencies", () => {
    it("成功時に depReport と depStatus=success がセットされる", async () => {
      mockIpc.maintenanceScanDependencies.mockResolvedValue(mockDepReport);
      await useMaintenanceStore.getState().scanDependencies(projectPath);
      const s = useMaintenanceStore.getState();
      expect(s.depReport).toEqual(mockDepReport);
      expect(s.depStatus).toBe("success");
      expect(s.error).toBeNull();
    });

    it("失敗時に depStatus=error と error メッセージがセットされる", async () => {
      mockIpc.maintenanceScanDependencies.mockRejectedValue(new Error("scan failed"));
      await useMaintenanceStore.getState().scanDependencies(projectPath);
      const s = useMaintenanceStore.getState();
      expect(s.depStatus).toBe("error");
      expect(s.error).toContain("scan failed");
    });
  });

  // ─ scanDebt ──────────────────────────────────────────────────────

  describe("scanDebt", () => {
    it("成功時に debtReport と debtStatus=success がセットされる", async () => {
      mockIpc.maintenanceScanTechDebt.mockResolvedValue(mockDebtReport);
      await useMaintenanceStore.getState().scanDebt(projectPath);
      const s = useMaintenanceStore.getState();
      expect(s.debtReport).toEqual(mockDebtReport);
      expect(s.debtStatus).toBe("success");
    });

    it("失敗時に debtStatus=error がセットされる", async () => {
      mockIpc.maintenanceScanTechDebt.mockRejectedValue(new Error("debt scan failed"));
      await useMaintenanceStore.getState().scanDebt(projectPath);
      expect(useMaintenanceStore.getState().debtStatus).toBe("error");
    });
  });

  // ─ scanCoverage ──────────────────────────────────────────────────

  describe("scanCoverage", () => {
    it("成功時に coverageReport と coverageStatus=success がセットされる", async () => {
      mockIpc.maintenanceRunCoverage.mockResolvedValue(mockCoverageReport);
      await useMaintenanceStore.getState().scanCoverage(projectPath);
      const s = useMaintenanceStore.getState();
      expect(s.coverageReport).toEqual(mockCoverageReport);
      expect(s.coverageStatus).toBe("success");
    });

    it("失敗時に coverageStatus=error がセットされる", async () => {
      mockIpc.maintenanceRunCoverage.mockRejectedValue(new Error("coverage failed"));
      await useMaintenanceStore.getState().scanCoverage(projectPath);
      expect(useMaintenanceStore.getState().coverageStatus).toBe("error");
    });
  });

  // ─ generateCoverage ──────────────────────────────────────────────

  describe("generateCoverage", () => {
    it("デフォルト target=node で呼ばれる", async () => {
      mockIpc.maintenanceGenerateCoverage.mockResolvedValue(mockCoverageReport);
      await useMaintenanceStore.getState().generateCoverage(projectPath);
      expect(mockIpc.maintenanceGenerateCoverage).toHaveBeenCalledWith(projectPath, "node");
    });

    it("target=rust を渡せる", async () => {
      mockIpc.maintenanceGenerateCoverage.mockResolvedValue(mockCoverageReport);
      await useMaintenanceStore.getState().generateCoverage(projectPath, "rust");
      expect(mockIpc.maintenanceGenerateCoverage).toHaveBeenCalledWith(projectPath, "rust");
    });

    it("成功時に coverageReport がセットされる", async () => {
      mockIpc.maintenanceGenerateCoverage.mockResolvedValue(mockCoverageReport);
      await useMaintenanceStore.getState().generateCoverage(projectPath, "all");
      expect(useMaintenanceStore.getState().coverageReport).toEqual(mockCoverageReport);
    });

    it("失敗時に coverageStatus=error がセットされる", async () => {
      mockIpc.maintenanceGenerateCoverage.mockRejectedValue(new Error("gen failed"));
      await useMaintenanceStore.getState().generateCoverage(projectPath);
      expect(useMaintenanceStore.getState().coverageStatus).toBe("error");
    });
  });

  // ─ scanRefactor ──────────────────────────────────────────────────

  describe("scanRefactor", () => {
    it("成功時に refactorCandidates と refactorStatus=success がセットされる", async () => {
      mockIpc.maintenanceRefactorCandidates.mockResolvedValue(mockRefactorCandidates);
      await useMaintenanceStore.getState().scanRefactor(projectPath);
      const s = useMaintenanceStore.getState();
      expect(s.refactorCandidates).toEqual(mockRefactorCandidates);
      expect(s.refactorStatus).toBe("success");
    });

    it("topN=20 で呼ばれる", async () => {
      mockIpc.maintenanceRefactorCandidates.mockResolvedValue([]);
      await useMaintenanceStore.getState().scanRefactor(projectPath);
      expect(mockIpc.maintenanceRefactorCandidates).toHaveBeenCalledWith(projectPath, 20);
    });

    it("失敗時に refactorStatus=error がセットされる", async () => {
      mockIpc.maintenanceRefactorCandidates.mockRejectedValue(new Error("fail"));
      await useMaintenanceStore.getState().scanRefactor(projectPath);
      expect(useMaintenanceStore.getState().refactorStatus).toBe("error");
    });
  });

  // ─ scanDocStaleness ──────────────────────────────────────────────

  describe("scanDocStaleness", () => {
    it("成功時に docStaleness と docStalenessStatus=success がセットされる", async () => {
      mockIpc.checkDocStaleness.mockResolvedValue(mockDocStaleness);
      await useMaintenanceStore.getState().scanDocStaleness(projectPath);
      const s = useMaintenanceStore.getState();
      expect(s.docStaleness).toEqual(mockDocStaleness);
      expect(s.docStalenessStatus).toBe("success");
    });

    it("失敗時に docStalenessStatus=error がセットされる", async () => {
      mockIpc.checkDocStaleness.mockRejectedValue(new Error("fail"));
      await useMaintenanceStore.getState().scanDocStaleness(projectPath);
      expect(useMaintenanceStore.getState().docStalenessStatus).toBe("error");
    });
  });

  // ─ scanAll ───────────────────────────────────────────────────────

  describe("scanAll", () => {
    beforeEach(() => {
      mockIpc.maintenanceScanTechDebt.mockResolvedValue(mockDebtReport);
      mockIpc.maintenanceRefactorCandidates.mockResolvedValue(mockRefactorCandidates);
      mockIpc.checkDocStaleness.mockResolvedValue(mockDocStaleness);
      mockIpc.maintenanceScanDependencies.mockResolvedValue(mockDepReport);
      mockIpc.maintenanceRunCoverage.mockResolvedValue(mockCoverageReport);
    });

    it("全サブスキャンを順次実行する", async () => {
      await useMaintenanceStore.getState().scanAll(projectPath);
      expect(mockIpc.maintenanceScanTechDebt).toHaveBeenCalledOnce();
      expect(mockIpc.maintenanceRefactorCandidates).toHaveBeenCalledOnce();
      expect(mockIpc.checkDocStaleness).toHaveBeenCalledOnce();
      expect(mockIpc.maintenanceScanDependencies).toHaveBeenCalledOnce();
      expect(mockIpc.maintenanceRunCoverage).toHaveBeenCalledOnce();
    });

    it("全レポートが success 状態になる", async () => {
      await useMaintenanceStore.getState().scanAll(projectPath);
      const s = useMaintenanceStore.getState();
      expect(s.debtStatus).toBe("success");
      expect(s.refactorStatus).toBe("success");
      expect(s.docStalenessStatus).toBe("success");
      expect(s.depStatus).toBe("success");
      expect(s.coverageStatus).toBe("success");
    });

    it("一部失敗しても他のスキャンは実行される", async () => {
      mockIpc.maintenanceScanTechDebt.mockRejectedValue(new Error("debt fail"));
      await useMaintenanceStore.getState().scanAll(projectPath);
      expect(mockIpc.maintenanceRefactorCandidates).toHaveBeenCalled();
      expect(mockIpc.checkDocStaleness).toHaveBeenCalled();
    });
  });
});
