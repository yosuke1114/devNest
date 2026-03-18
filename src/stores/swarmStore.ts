import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SubTask, SwarmSettings, WorkerStatus, ExecutionState, Wave } from "../components/swarm/types";

// ─── Rust 側と対応する型 ──────────────────────────────────────

export interface WorkerAssignment {
  workerId: string;
  task: SubTask;
  branchName: string;
  status: WorkerStatus;
  executionState: ExecutionState;
  retryCount: number;
}

export interface MergeOutcome {
  branch: string;
  success: boolean;
  conflictFiles: string[];
  error: string | null;
}

export interface WorkerDiff {
  workerId: string;
  branch: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedFiles: string[];
}

export interface AggregatedResult {
  workerDiffs: WorkerDiff[];
  succeededIds: string[];
  failedIds: string[];
  totalFilesChanged: number;
  totalInsertions: number;
  totalDeletions: number;
}

export type RunStatus =
  | "preparing"
  | "running"
  | "merging"
  | "done"
  | "partialDone"
  | "failed"
  | "cancelled";

export interface OrchestratorRun {
  runId: string;
  status: RunStatus;
  assignments: WorkerAssignment[];
  baseBranch: string;
  projectPath: string;
  mergeResults: MergeOutcome[];
  total: number;
  doneCount: number;
  waves: Wave[];
  currentWave: number;
  gateResults: import("../components/swarm/types").WaveGateResult[];
}

// ─── Store ───────────────────────────────────────────────────

interface SwarmState {
  currentRun: OrchestratorRun | null;
  mergeReady: boolean;
  isStarting: boolean;
  isMerging: boolean;
  error: string | null;
  aggregatedResult: AggregatedResult | null;
  conflictOutcome: MergeOutcome | null;

  startRun: (
    tasks: SubTask[],
    settings: SwarmSettings,
    projectPath: string
  ) => Promise<void>;
  cancelRun: () => Promise<void>;
  mergeAll: () => Promise<void>;
  notifyWorkerDone: (workerId: string, status: WorkerStatus) => Promise<void>;
  listenOrchestratorEvents: () => () => void;
  setConflictOutcome: (outcome: MergeOutcome | null) => void;
  reset: () => void;
}

export const useSwarmStore = create<SwarmState>((set, get) => ({
  currentRun: null,
  mergeReady: false,
  isStarting: false,
  isMerging: false,
  error: null,
  aggregatedResult: null,
  conflictOutcome: null,

  startRun: async (tasks, settings, projectPath) => {
    set({ isStarting: true, error: null, mergeReady: false });
    try {
      const run = await invoke<OrchestratorRun>("orchestrator_start", {
        tasks,
        settings: {
          maxWorkers: settings.maxWorkers,
          timeoutMinutes: settings.timeoutMinutes,
          branchPrefix: settings.branchPrefix,
          defaultShell: settings.defaultShell,
          promptPatterns: settings.promptPatterns,
          claudeSkipPermissions: settings.claudeSkipPermissions,
          claudeNoStream: settings.claudeNoStream,
          autoApproveHighConfidence: settings.autoApproveHighConfidence,
          claudeInteractive: settings.claudeInteractive,
        },
        projectPath,
      });
      set({ currentRun: run });
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isStarting: false });
    }
  },

  cancelRun: async () => {
    try {
      await invoke("orchestrator_cancel");
    } catch {/* ベストエフォート */}
    set({ currentRun: null, mergeReady: false });
  },

  mergeAll: async () => {
    set({ isMerging: true, error: null });
    try {
      await invoke<MergeOutcome[]>("orchestrator_merge_all");
      // orchestrator-merge-done イベントで currentRun が更新される
    } catch (e) {
      set({ error: String(e) });
    } finally {
      set({ isMerging: false });
    }
  },

  notifyWorkerDone: async (workerId, status) => {
    const { currentRun } = get();
    if (!currentRun) return;
    // isInRun チェックを削除: worker-status-changed と orchestrator-status-changed の
    // レースコンディションで currentRun が古い状態のとき通知が飛ばないバグを防ぐ。
    // Orchestrator 側で未知の workerId は無視するため安全。
    try {
      await invoke("orchestrator_notify_worker_done", { workerId, status });
    } catch {/* ベストエフォート */}
  },

  listenOrchestratorEvents: () => {
    const unlistens: Array<() => void> = [];

    // Orchestrator ステータス変化
    listen<OrchestratorRun>("orchestrator-status-changed", (event) => {
      set({ currentRun: event.payload });
    }).then((fn) => unlistens.push(fn));

    // マージ準備完了
    listen<OrchestratorRun>("orchestrator-merge-ready", (event) => {
      set({ currentRun: event.payload, mergeReady: true });
    }).then((fn) => unlistens.push(fn));

    // マージ完了 → 集約結果を取得
    listen<OrchestratorRun>("orchestrator-merge-done", (event) => {
      set({ currentRun: event.payload, mergeReady: false, isMerging: false });
      invoke<AggregatedResult | null>("orchestrator_get_result")
        .then((r) => set({ aggregatedResult: r }))
        .catch(() => {/* ベストエフォート */});
    }).then((fn) => unlistens.push(fn));

    return () => unlistens.forEach((fn) => fn());
  },

  setConflictOutcome: (outcome) => set({ conflictOutcome: outcome }),

  reset: () => set({
    currentRun: null,
    mergeReady: false,
    error: null,
    aggregatedResult: null,
    conflictOutcome: null,
  }),
}));
