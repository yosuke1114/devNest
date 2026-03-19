export type PaneType =
  | "browser"
  | "doc-viewer"
  | "code-viewer"
  | "agent-log"
  | "review-findings"
  | "kanban"
  | "terminal";

export interface PaneConfig {
  id: string;
  type: PaneType;
  props: Record<string, unknown>;
  minSize?: number;
}

export interface SplitLayout {
  direction: "horizontal" | "vertical";
  children: (PaneConfig | SplitLayout)[];
  sizes?: number[];
}

export function isPaneConfig(node: PaneConfig | SplitLayout): node is PaneConfig {
  return "type" in node;
}
