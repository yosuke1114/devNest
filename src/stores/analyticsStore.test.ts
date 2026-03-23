import { beforeEach, describe, it, expect, vi } from "vitest";
import { useAnalyticsStore } from "./analyticsStore";

const mockIpc = vi.hoisted(() => ({
  getVelocityMetrics: vi.fn(),
  getAiImpact: vi.fn(),
  getSprintHistory: vi.fn(),
}));

vi.mock("../lib/ipc", () => mockIpc);

// ─── ヘルパー ──────────────────────────────────────────────────────

const period = { start: "2026-01-01", end: "2026-03-01" };
const projectPath = "/tmp/proj";

function resetStore() {
  useAnalyticsStore.setState({
    velocity: null,
    aiImpact: null,
    sprintHistory: [],
    velocityStatus: "idle",
    aiImpactStatus: "idle",
    sprintStatus: "idle",
  });
}

// ─── テスト ─────────────────────────────────────────────────────────

describe("analyticsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ─ 初期状態 ──────────────────────────────────────────────────────

  describe("初期状態", () => {
    it("velocity / aiImpact / sprintHistory が null/空", () => {
      const s = useAnalyticsStore.getState();
      expect(s.velocity).toBeNull();
      expect(s.aiImpact).toBeNull();
      expect(s.sprintHistory).toEqual([]);
    });

    it("全 status が idle", () => {
      const s = useAnalyticsStore.getState();
      expect(s.velocityStatus).toBe("idle");
      expect(s.aiImpactStatus).toBe("idle");
      expect(s.sprintStatus).toBe("idle");
    });
  });

  // ─ fetchVelocity ─────────────────────────────────────────────────

  describe("fetchVelocity", () => {
    const mockVelocity = {
      period,
      issuesClosed: 10,
      prsMerged: 5,
      avgCycleTimeHours: 24.0,
      weeklyPoints: [3, 4, 3],
    };

    it("成功時に velocity と velocityStatus=success がセットされる", async () => {
      mockIpc.getVelocityMetrics.mockResolvedValue(mockVelocity);
      await useAnalyticsStore.getState().fetchVelocity(projectPath, period);
      const s = useAnalyticsStore.getState();
      expect(s.velocity).toEqual(mockVelocity);
      expect(s.velocityStatus).toBe("success");
    });

    it("loading → success の遷移", async () => {
      let loadingCapture: string | null = null;
      mockIpc.getVelocityMetrics.mockImplementation(async () => {
        loadingCapture = useAnalyticsStore.getState().velocityStatus;
        return mockVelocity;
      });
      await useAnalyticsStore.getState().fetchVelocity(projectPath, period);
      expect(loadingCapture).toBe("loading");
      expect(useAnalyticsStore.getState().velocityStatus).toBe("success");
    });

    it("失敗時に velocityStatus=error がセットされる", async () => {
      mockIpc.getVelocityMetrics.mockRejectedValue(new Error("fail"));
      await useAnalyticsStore.getState().fetchVelocity(projectPath, period);
      expect(useAnalyticsStore.getState().velocityStatus).toBe("error");
      expect(useAnalyticsStore.getState().velocity).toBeNull();
    });

    it("getVelocityMetrics に正しい引数を渡す", async () => {
      mockIpc.getVelocityMetrics.mockResolvedValue(mockVelocity);
      await useAnalyticsStore.getState().fetchVelocity(projectPath, period);
      expect(mockIpc.getVelocityMetrics).toHaveBeenCalledWith(projectPath, period);
    });
  });

  // ─ fetchAiImpact ─────────────────────────────────────────────────

  describe("fetchAiImpact", () => {
    const mockAiImpact = {
      period,
      aiAssistedPrs: 3,
      totalPrs: 5,
      aiAssistedRatio: 0.6,
      topPatterns: ["test generation"],
    };

    it("成功時に aiImpact と aiImpactStatus=success がセットされる", async () => {
      mockIpc.getAiImpact.mockResolvedValue(mockAiImpact);
      await useAnalyticsStore.getState().fetchAiImpact(projectPath, period);
      const s = useAnalyticsStore.getState();
      expect(s.aiImpact).toEqual(mockAiImpact);
      expect(s.aiImpactStatus).toBe("success");
    });

    it("失敗時に aiImpactStatus=error がセットされる", async () => {
      mockIpc.getAiImpact.mockRejectedValue(new Error("fail"));
      await useAnalyticsStore.getState().fetchAiImpact(projectPath, period);
      expect(useAnalyticsStore.getState().aiImpactStatus).toBe("error");
    });
  });

  // ─ fetchSprintHistory ────────────────────────────────────────────

  describe("fetchSprintHistory", () => {
    const mockHistory = [
      { sprintId: "s1", name: "Sprint 1", velocity: 10, aiAssisted: 2 },
      { sprintId: "s2", name: "Sprint 2", velocity: 12, aiAssisted: 4 },
    ];

    it("成功時に sprintHistory と sprintStatus=success がセットされる", async () => {
      mockIpc.getSprintHistory.mockResolvedValue(mockHistory);
      await useAnalyticsStore.getState().fetchSprintHistory(projectPath);
      const s = useAnalyticsStore.getState();
      expect(s.sprintHistory).toEqual(mockHistory);
      expect(s.sprintStatus).toBe("success");
    });

    it("デフォルト count=4 が渡される", async () => {
      mockIpc.getSprintHistory.mockResolvedValue([]);
      await useAnalyticsStore.getState().fetchSprintHistory(projectPath);
      expect(mockIpc.getSprintHistory).toHaveBeenCalledWith(projectPath, 4);
    });

    it("count を明示的に渡せる", async () => {
      mockIpc.getSprintHistory.mockResolvedValue([]);
      await useAnalyticsStore.getState().fetchSprintHistory(projectPath, 8);
      expect(mockIpc.getSprintHistory).toHaveBeenCalledWith(projectPath, 8);
    });

    it("失敗時に sprintStatus=error がセットされる", async () => {
      mockIpc.getSprintHistory.mockRejectedValue(new Error("fail"));
      await useAnalyticsStore.getState().fetchSprintHistory(projectPath);
      expect(useAnalyticsStore.getState().sprintStatus).toBe("error");
    });
  });
});
