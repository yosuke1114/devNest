export interface SubTask {
  id: number;
  title: string;
  files: string[];
  instruction: string;
}

export interface SplitTaskResult {
  tasks: SubTask[];
  conflictWarnings: string[];
}

export interface SwarmSettings {
  maxWorkers: 2 | 4 | 6 | 8;
  timeoutMinutes: number;
  branchPrefix: string;
}

export const DEFAULT_SWARM_SETTINGS: SwarmSettings = {
  maxWorkers: 4,
  timeoutMinutes: 30,
  branchPrefix: "swarm/worker-",
};

export type WorkerKind = "claudeCode" | "shell";
export type WorkerMode = "interactive" | "batch";
export type WorkerStatus = "idle" | "running" | "done" | "error" | "retrying";

export interface WorkerConfig {
  kind: WorkerKind;
  mode: WorkerMode;
  label: string;
  workingDir: string;
  dependsOn: string[];
  metadata: Record<string, string>;
}

export interface WorkerInfo {
  id: string;
  config: WorkerConfig;
  status: WorkerStatus;
}
