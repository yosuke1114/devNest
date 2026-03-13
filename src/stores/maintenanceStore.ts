import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type {
  AsyncStatus,
  CoverageReport,
  DependencyReport,
  DocStaleness,
  RefactorCandidate,
  TechDebtReport,
} from "../types";

interface MaintenanceState {
  depReport: DependencyReport | null;
  depStatus: AsyncStatus;

  debtReport: TechDebtReport | null;
  debtStatus: AsyncStatus;

  coverageReport: CoverageReport | null;
  coverageStatus: AsyncStatus;

  refactorCandidates: RefactorCandidate[];
  refactorStatus: AsyncStatus;

  docStaleness: DocStaleness[];
  docStalenessStatus: AsyncStatus;

  error: string | null;

  scanDependencies: (projectPath: string) => Promise<void>;
  scanDebt: (projectPath: string) => Promise<void>;
  scanCoverage: (projectPath: string) => Promise<void>;
  scanRefactor: (projectPath: string) => Promise<void>;
  scanDocStaleness: (projectPath: string) => Promise<void>;
  scanAll: (projectPath: string) => Promise<void>;
}

export const useMaintenanceStore = create<MaintenanceState>((set, get) => ({
  depReport: null,
  depStatus: "idle",
  debtReport: null,
  debtStatus: "idle",
  coverageReport: null,
  coverageStatus: "idle",
  refactorCandidates: [],
  refactorStatus: "idle",
  docStaleness: [],
  docStalenessStatus: "idle",
  error: null,

  scanDependencies: async (projectPath) => {
    set({ depStatus: "loading", error: null });
    try {
      const report = await ipc.maintenanceScanDependencies(projectPath);
      set({ depReport: report, depStatus: "success" });
    } catch (e) {
      set({ depStatus: "error", error: String(e) });
    }
  },

  scanDebt: async (projectPath) => {
    set({ debtStatus: "loading", error: null });
    try {
      const report = await ipc.maintenanceScanTechDebt(projectPath);
      set({ debtReport: report, debtStatus: "success" });
    } catch (e) {
      set({ debtStatus: "error", error: String(e) });
    }
  },

  scanCoverage: async (projectPath) => {
    set({ coverageStatus: "loading", error: null });
    try {
      const report = await ipc.maintenanceRunCoverage(projectPath);
      set({ coverageReport: report, coverageStatus: "success" });
    } catch (e) {
      set({ coverageStatus: "error", error: String(e) });
    }
  },

  scanRefactor: async (projectPath) => {
    set({ refactorStatus: "loading", error: null });
    try {
      const candidates = await ipc.maintenanceRefactorCandidates(projectPath, 20);
      set({ refactorCandidates: candidates, refactorStatus: "success" });
    } catch (e) {
      set({ refactorStatus: "error", error: String(e) });
    }
  },

  scanDocStaleness: async (projectPath) => {
    set({ docStalenessStatus: "loading", error: null });
    try {
      const staleness = await ipc.checkDocStaleness(projectPath);
      set({ docStaleness: staleness, docStalenessStatus: "success" });
    } catch (e) {
      set({ docStalenessStatus: "error", error: String(e) });
    }
  },

  scanAll: async (projectPath) => {
    const { scanDependencies, scanDebt, scanCoverage, scanRefactor, scanDocStaleness } = get();
    // 順次実行: 重いサブプロセス（cargo outdated, cargo tarpaulin 等）を
    // 同時起動するとTauriのasyncランタイムが詰まりリロードが発生するため
    await scanDebt(projectPath);
    await scanRefactor(projectPath);
    await scanDocStaleness(projectPath);
    await scanDependencies(projectPath);
    await scanCoverage(projectPath);
  },
}));
