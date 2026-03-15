export interface SubTask {
  id: number;
  title: string;
  files: string[];
  instruction: string;
  dependsOn: number[];
}

export type ExecutionState =
  | "waiting"
  | "ready"
  | "running"
  | "done"
  | "error"
  | "skipped";

export interface SplitTaskResult {
  tasks: SubTask[];
  conflictWarnings: string[];
  cycleError: string | null;
}

export interface SwarmSettings {
  maxWorkers: 2 | 4 | 6 | 8;
  timeoutMinutes: number;
  branchPrefix: string;
  // Feature 12-4 拡張設定
  defaultShell: string;
  promptPatterns: string;
  claudeSkipPermissions: boolean;
  claudeNoStream: boolean;
  autoApproveHighConfidence: boolean;
}

export const DEFAULT_SWARM_SETTINGS: SwarmSettings = {
  maxWorkers: 4,
  timeoutMinutes: 30,
  branchPrefix: "swarm/worker-",
  defaultShell: "zsh",
  promptPatterns: "$|%|❯|>|#|→",
  claudeSkipPermissions: false,
  claudeNoStream: false,
  autoApproveHighConfidence: false,
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
