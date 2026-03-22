// ────────────────────────────────────────
//  SubTask（既存 swarm::subtask::SubTask と対応）
// ────────────────────────────────────────
export interface SubTask {
  id: number;
  title: string;
  files: string[];
  instruction: string;
  dependsOn: number[];
}

// ────────────────────────────────────────
//  SwarmSettings（既存 swarm::settings::SwarmSettings と対応）
// ────────────────────────────────────────
export interface SwarmSettings {
  maxWorkers: number;
  branchPrefix: string;
  baseBranch: string;
  maxRetries: number;
  timeoutMinutes: number;
  defaultShell: string;
  promptPatterns: string;
  claudeSkipPermissions: boolean;
  claudeNoStream: boolean;
  autoApproveHighConfidence: boolean;
  claudeInteractive: boolean;
}

export const DEFAULT_SETTINGS: SwarmSettings = {
  maxWorkers: 4,
  branchPrefix: "swarm/worker-",
  baseBranch: "main",
  maxRetries: 2,
  timeoutMinutes: 30,
  defaultShell: "zsh",
  promptPatterns: "$|%|❯|>|#|→",
  claudeSkipPermissions: false,
  claudeNoStream: false,
  autoApproveHighConfidence: false,
  claudeInteractive: false,
};

// ────────────────────────────────────────
//  スナップショット
// ────────────────────────────────────────
export interface SwarmSnapshot {
  status: SwarmStatus;
  currentWave: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
}

export type SwarmStatus =
  | "idle"
  | "running"
  | "gating"
  | "done"
  | "blocked"
  | "cancelled";

export interface WorkerSnapshot {
  id: string;
  label: string;
  status: string;
}

// ────────────────────────────────────────
//  WebSocket メッセージ
// ────────────────────────────────────────
export type ServerMessage =
  | { type: "SwarmStatus"; payload: SwarmSnapshot }
  | { type: "WorkerStatus"; payload: { worker_id: string; status: string } }
  | { type: "WorkerOutput"; payload: { worker_id: string; data: string } }
  | { type: "Workers"; payload: WorkerSnapshot[] }
  | { type: "Splitting" }
  | { type: "SplitResult"; payload: { tasks: SubTask[]; conflict_warnings: string[] } }
  | { type: "GateResult"; payload: { wave_number: number; overall: string } }
  | { type: "GateReady"; payload: { wave_number: number } }
  | { type: "Error"; payload: { message: string } }
  | { type: "Pong" };

export type ClientMessage =
  | { type: "TaskSplit"; payload: { prompt: string; project_path: string } }
  | { type: "SwarmStart"; payload: { tasks: SubTask[]; settings: SwarmSettings; project_path: string } }
  | { type: "SwarmStop" }
  | { type: "WorkerInput"; payload: { worker_id: string; data: string } }
  | { type: "RunGate" }
  | { type: "Sync" }
  | { type: "Ping" };
