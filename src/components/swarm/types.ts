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
