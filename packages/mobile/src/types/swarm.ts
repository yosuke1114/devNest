export type ServerMessage =
  | { type: "Status"; payload: StatusPayload }
  | { type: "WaitingInput"; payload: { prompt: string } }
  | { type: "Log"; payload: { text: string; level: LogLevel } }
  | { type: "Splitting" }
  | { type: "SplitResult"; payload: { tasks: SubTask[] } }
  | { type: "Error"; payload: { message: string } }
  | { type: "Pong" };

export type ClientMessage =
  | { type: "SwarmStart"; payload: { tasks: SubTask[] } }
  | { type: "SwarmStop" }
  | { type: "SwarmInput"; payload: { text: string } }
  | { type: "TaskSplit"; payload: { text: string } }
  | { type: "Sync" }
  | { type: "Ping" };

export interface StatusPayload {
  phase: SwarmPhase;
  agent: string | null;
  completed: number;
  total: number;
}

export type SwarmPhase =
  | "idle"
  | "starting"
  | "running"
  | "waiting_input"
  | "stopping"
  | "error";

export type LogLevel = "info" | "warn" | "error" | "success";

export interface SubTask {
  id: number;
  title: string;
  tag: "backend" | "frontend" | "design" | "test" | "infra";
  points: number;
}
