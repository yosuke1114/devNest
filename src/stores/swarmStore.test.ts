import { beforeEach, describe, it, expect, vi } from "vitest";
import { useSwarmStore } from "./swarmStore";
import type { SubTask, SwarmSettings } from "../components/swarm/types";
import type { WorkerAssignment, OrchestratorRun, MergeOutcome, AggregatedResult } from "./swarmStore";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// ─── ヘルパー ──────────────────────────────────────────────────────

const defaultSettings: SwarmSettings = {
  maxWorkers: 4,
  timeoutMinutes: 30,
  branchPrefix: "swarm/worker-",
  defaultShell: "zsh",
  promptPatterns: "$|%|❯|>|#|→",
  claudeSkipPermissions: false,
  claudeNoStream: false,
  autoApproveHighConfidence: false,
  claudeInteractive: false,
};

function makeTask(id: number, dependsOn: number[] = []): SubTask {
  return { id, title: `Task ${id}`, role: "builder", files: [], instruction: `do ${id}`, dependsOn };
}

function makeAssignment(overrides: Partial<WorkerAssignment> = {}): WorkerAssignment {
  return {
    workerId: "w-001",
    task: makeTask(1),
    branchName: "swarm/worker-1",
    status: "idle",
    executionState: "running",
    retryCount: 0,
    ...overrides,
  };
}

function makeRun(overrides: Partial<OrchestratorRun> = {}): OrchestratorRun {
  return {
    runId: "run-001",
    status: "running",
    assignments: [makeAssignment()],
    baseBranch: "main",
    projectPath: "/tmp/proj",
    total: 1,
    doneCount: 0,
    failed: 0,
    waves: null,
    currentWave: null,
    gateResults: null,
    ...overrides,
  };
}

// ─── テスト ─────────────────────────────────────────────────────────

describe("swarmStore", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    // ストアをリセット
    useSwarmStore.getState().reset();
  });

  // ─ 初期状態 ──────────────────────────────────────────────────────

  describe("初期状態", () => {
    it("currentRun が null", () => {
      expect(useSwarmStore.getState().currentRun).toBeNull();
    });

    it("mergeReady が false", () => {
      expect(useSwarmStore.getState().mergeReady).toBe(false);
    });

    it("isStarting / isMerging が false", () => {
      const s = useSwarmStore.getState();
      expect(s.isStarting).toBe(false);
      expect(s.isMerging).toBe(false);
    });

    it("aggregatedResult / conflictOutcome が null", () => {
      const s = useSwarmStore.getState();
      expect(s.aggregatedResult).toBeNull();
      expect(s.conflictOutcome).toBeNull();
    });
  });

  // ─ startRun ──────────────────────────────────────────────────────

  describe("startRun", () => {
    it("orchestrator_start を呼ぶ", async () => {
      const run = makeRun();
      mockInvoke.mockResolvedValue(run);
      await useSwarmStore.getState().startRun([makeTask(1)], defaultSettings, "/tmp/proj");
      expect(mockInvoke).toHaveBeenCalledWith(
        "orchestrator_start",
        expect.objectContaining({ projectPath: "/tmp/proj" })
      );
    });

    it("成功時に currentRun がセットされる", async () => {
      const run = makeRun();
      mockInvoke.mockResolvedValue(run);
      await useSwarmStore.getState().startRun([makeTask(1)], defaultSettings, "/tmp/proj");
      expect(useSwarmStore.getState().currentRun?.runId).toBe("run-001");
    });

    it("失敗時に error がセットされ isStarting が false に戻る", async () => {
      mockInvoke.mockRejectedValue(new Error("backend error"));
      await useSwarmStore.getState().startRun([makeTask(1)], defaultSettings, "/tmp/proj");
      expect(useSwarmStore.getState().error).toContain("backend error");
      expect(useSwarmStore.getState().isStarting).toBe(false);
    });

    it("settings の maxWorkers / timeoutMinutes / branchPrefix が渡される", async () => {
      mockInvoke.mockResolvedValue(makeRun());
      const settings = { ...defaultSettings, maxWorkers: 8 as const, timeoutMinutes: 60 };
      await useSwarmStore.getState().startRun([makeTask(1)], settings, "/tmp/proj");
      expect(mockInvoke).toHaveBeenCalledWith(
        "orchestrator_start",
        expect.objectContaining({
          settings: expect.objectContaining({ maxWorkers: 8, timeoutMinutes: 60 }),
        })
      );
    });
  });

  // ─ cancelRun ─────────────────────────────────────────────────────

  describe("cancelRun", () => {
    it("orchestrator_cancel を呼んで currentRun を null にする", async () => {
      useSwarmStore.setState({ currentRun: makeRun(), mergeReady: true });
      mockInvoke.mockResolvedValue(null);
      await useSwarmStore.getState().cancelRun();
      expect(mockInvoke).toHaveBeenCalledWith("orchestrator_cancel");
      expect(useSwarmStore.getState().currentRun).toBeNull();
      expect(useSwarmStore.getState().mergeReady).toBe(false);
    });

    it("invoke 失敗でも currentRun は null になる（ベストエフォート）", async () => {
      useSwarmStore.setState({ currentRun: makeRun() });
      mockInvoke.mockRejectedValue(new Error("fail"));
      await useSwarmStore.getState().cancelRun();
      expect(useSwarmStore.getState().currentRun).toBeNull();
    });
  });

  // ─ mergeAll ──────────────────────────────────────────────────────

  describe("mergeAll", () => {
    it("orchestrator_merge_all を呼ぶ", async () => {
      mockInvoke.mockResolvedValue([]);
      await useSwarmStore.getState().mergeAll();
      expect(mockInvoke).toHaveBeenCalledWith("orchestrator_merge_all");
    });

    it("失敗時に error がセットされ isMerging が false に戻る", async () => {
      mockInvoke.mockRejectedValue(new Error("merge fail"));
      await useSwarmStore.getState().mergeAll();
      expect(useSwarmStore.getState().error).toContain("merge fail");
      expect(useSwarmStore.getState().isMerging).toBe(false);
    });
  });

  // ─ notifyWorkerDone ───────────────────────────────────────────────

  describe("notifyWorkerDone", () => {
    it("currentRun が null のときは invoke しない", async () => {
      await useSwarmStore.getState().notifyWorkerDone("w-001", "done");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("workerId が assignments にない場合も orchestrator_notify_worker_done を呼ぶ（ベストエフォート）", async () => {
      useSwarmStore.setState({ currentRun: makeRun({ assignments: [makeAssignment({ workerId: "w-999" })] }) });
      mockInvoke.mockResolvedValue(null);
      await useSwarmStore.getState().notifyWorkerDone("w-001", "done");
      expect(mockInvoke).toHaveBeenCalledWith("orchestrator_notify_worker_done", {
        workerId: "w-001",
        status: "done",
      });
    });

    it("workerId が assignments にある場合は orchestrator_notify_worker_done を呼ぶ", async () => {
      useSwarmStore.setState({ currentRun: makeRun() });
      mockInvoke.mockResolvedValue(null);
      await useSwarmStore.getState().notifyWorkerDone("w-001", "done");
      expect(mockInvoke).toHaveBeenCalledWith("orchestrator_notify_worker_done", {
        workerId: "w-001",
        status: "done",
      });
    });
  });

  // ─ setConflictOutcome ─────────────────────────────────────────────

  describe("setConflictOutcome", () => {
    it("conflictOutcome をセットする", () => {
      const outcome: MergeOutcome = { branch: "swarm/worker-1", success: false, conflictFiles: ["a.ts"], error: null };
      useSwarmStore.getState().setConflictOutcome(outcome);
      expect(useSwarmStore.getState().conflictOutcome?.branch).toBe("swarm/worker-1");
    });

    it("null でクリアできる", () => {
      useSwarmStore.setState({ conflictOutcome: { branch: "b", success: false, conflictFiles: [], error: null } });
      useSwarmStore.getState().setConflictOutcome(null);
      expect(useSwarmStore.getState().conflictOutcome).toBeNull();
    });
  });

  // ─ reset ─────────────────────────────────────────────────────────

  describe("reset", () => {
    it("すべての状態を初期値に戻す", () => {
      const run = makeRun();
      const result: AggregatedResult = {
        workerDiffs: [], succeededIds: ["w-001"], failedIds: [],
        totalFilesChanged: 2, totalInsertions: 10, totalDeletions: 5,
      };
      useSwarmStore.setState({
        currentRun: run,
        mergeReady: true,
        error: "some error",
        aggregatedResult: result,
        conflictOutcome: { branch: "b", success: false, conflictFiles: [], error: null },
      });
      useSwarmStore.getState().reset();
      const s = useSwarmStore.getState();
      expect(s.currentRun).toBeNull();
      expect(s.mergeReady).toBe(false);
      expect(s.error).toBeNull();
      expect(s.aggregatedResult).toBeNull();
      expect(s.conflictOutcome).toBeNull();
    });
  });

  // ─ listenOrchestratorEvents ─────────────────────────────────────

  describe("listenOrchestratorEvents", () => {
    it("cleanup 関数を返す", () => {
      const cleanup = useSwarmStore.getState().listenOrchestratorEvents();
      expect(typeof cleanup).toBe("function");
      cleanup();
    });

    it("orchestrator-status-changed で currentRun が更新される", async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const listeners: Record<string, (event: unknown) => void> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listen as any).mockImplementation(async (event: any, cb: any) => {
        listeners[event] = cb;
        return vi.fn();
      });

      useSwarmStore.getState().listenOrchestratorEvents();
      // listen は async なので一旦 microtask を待つ
      await new Promise((r) => setTimeout(r, 0));

      const run = makeRun({ status: "running", doneCount: 1 });
      listeners["orchestrator-status-changed"]?.({ payload: run });
      expect(useSwarmStore.getState().currentRun?.doneCount).toBe(1);
    });

    it("orchestrator-merge-ready で mergeReady が true になる", async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const listeners: Record<string, (event: unknown) => void> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listen as any).mockImplementation(async (event: any, cb: any) => {
        listeners[event] = cb;
        return vi.fn();
      });

      useSwarmStore.getState().listenOrchestratorEvents();
      await new Promise((r) => setTimeout(r, 0));

      const run = makeRun({ status: "merging" });
      listeners["orchestrator-merge-ready"]?.({ payload: run });
      expect(useSwarmStore.getState().mergeReady).toBe(true);
      expect(useSwarmStore.getState().currentRun?.status).toBe("merging");
    });

    it("orchestrator-merge-done で isMerging が false になり aggregatedResult を取得する", async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const listeners: Record<string, (event: unknown) => void> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (listen as any).mockImplementation(async (event: any, cb: any) => {
        listeners[event] = cb;
        return vi.fn();
      });

      const mockResult: AggregatedResult = {
        workerDiffs: [], succeededIds: ["w-001"], failedIds: [],
        totalFilesChanged: 5, totalInsertions: 50, totalDeletions: 10,
      };
      mockInvoke.mockResolvedValueOnce(mockResult);

      useSwarmStore.setState({ isMerging: true, mergeReady: true });
      useSwarmStore.getState().listenOrchestratorEvents();
      await new Promise((r) => setTimeout(r, 0));

      const run = makeRun({ status: "done" });
      listeners["orchestrator-merge-done"]?.({ payload: run });

      expect(useSwarmStore.getState().isMerging).toBe(false);
      expect(useSwarmStore.getState().mergeReady).toBe(false);

      // invoke("orchestrator_get_result") の結果を待つ
      await new Promise((r) => setTimeout(r, 10));
      expect(useSwarmStore.getState().aggregatedResult).toEqual(mockResult);
    });

    it("cleanup で全 unlisten が呼ばれる", async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const unlistenFns = [vi.fn(), vi.fn(), vi.fn()];
      let callIdx = 0;
      vi.mocked(listen).mockImplementation(async () => {
        const fn = unlistenFns[callIdx++] ?? vi.fn();
        return fn;
      });

      const cleanup = useSwarmStore.getState().listenOrchestratorEvents();
      // listen のPromise解決を待つ
      await new Promise((r) => setTimeout(r, 0));
      cleanup();
      for (const fn of unlistenFns) {
        expect(fn).toHaveBeenCalled();
      }
    });
  });
});
