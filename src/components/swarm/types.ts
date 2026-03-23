export interface SubTask {
  id: number;
  title: string;
  role: WorkerRole;
  files: string[];
  instruction: string;
  dependsOn: number[];
}

export type ExecutionState =
  | "waiting"
  | "ready"
  | "awaitingApproval"
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
  /** true のとき -p を省略し TUI モードで起動（追加指示・対話が可能になる） */
  claudeInteractive: boolean;
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
  claudeInteractive: false,
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
  role?: WorkerRole;
}

export interface WorkerInfo {
  id: string;
  config: WorkerConfig;
  status: WorkerStatus;
}

// Phase 13追加
export type WorkerRole =
  | "scout"
  | "builder"
  | "designer"
  | "reviewer"
  | "merger"
  | "tester"
  | "shell";

export const ROLE_ICON: Record<WorkerRole, string> = {
  scout:    "🔍",
  builder:  "🔨",
  designer: "🎨",
  reviewer: "👁️",
  merger:   "🔀",
  tester:   "🧪",
  shell:    "🐚",
};

export const ROLE_LABEL: Record<WorkerRole, string> = {
  scout:    "Scout",
  builder:  "Builder",
  designer: "Designer",
  reviewer: "Reviewer",
  merger:   "Merger",
  tester:   "Tester",
  shell:    "Shell",
};

// ─── Wave Orchestrator 型 ────────────────────────────────────────

export type WaveStatus =
  | "pending"
  | "running"
  | "gating"
  | "passed"
  | "passedWithWarnings"
  | "failed";

export type GateOverall = "passed" | "passedWithWarnings" | "blocked";

export interface GateStepResult {
  passed: boolean;
  summary: string;
  details: string[];
  durationSecs: number;
}

export interface WaveGateResult {
  merge: GateStepResult;
  test: GateStepResult;
  review: GateStepResult;
  overall: GateOverall;
}

export interface Wave {
  waveNumber: number;
  taskIds: number[];
  status: WaveStatus;
  gateResult: WaveGateResult | null;
}

// WorkerConfigにrole・assignedFilesを追加（Phase 13拡張）
export interface WorkerConfigV13 extends WorkerConfig {
  role: WorkerRole;
  assignedFiles: string[];
}
