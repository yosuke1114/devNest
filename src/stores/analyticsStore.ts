import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type { AsyncStatus, VelocityMetrics, AiImpactMetrics, SprintAnalysis, DateRange } from "../types";

interface AnalyticsState {
  velocity: VelocityMetrics | null;
  aiImpact: AiImpactMetrics | null;
  sprintHistory: SprintAnalysis[];
  velocityStatus: AsyncStatus;
  aiImpactStatus: AsyncStatus;
  sprintStatus: AsyncStatus;
  fetchVelocity: (projectPath: string, period: DateRange) => Promise<void>;
  fetchAiImpact: (projectPath: string, period: DateRange) => Promise<void>;
  fetchSprintHistory: (projectPath: string, count?: number) => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  velocity: null,
  aiImpact: null,
  sprintHistory: [],
  velocityStatus: "idle",
  aiImpactStatus: "idle",
  sprintStatus: "idle",
  fetchVelocity: async (projectPath, period) => {
    set({ velocityStatus: "loading" });
    try {
      const v = await ipc.getVelocityMetrics(projectPath, period);
      set({ velocity: v, velocityStatus: "success" });
    } catch {
      set({ velocityStatus: "error" });
    }
  },
  fetchAiImpact: async (projectPath, period) => {
    set({ aiImpactStatus: "loading" });
    try {
      const v = await ipc.getAiImpact(projectPath, period);
      set({ aiImpact: v, aiImpactStatus: "success" });
    } catch {
      set({ aiImpactStatus: "error" });
    }
  },
  fetchSprintHistory: async (projectPath, count = 4) => {
    set({ sprintStatus: "loading" });
    try {
      const v = await ipc.getSprintHistory(projectPath, count);
      set({ sprintHistory: v, sprintStatus: "success" });
    } catch {
      set({ sprintStatus: "error" });
    }
  },
}));
