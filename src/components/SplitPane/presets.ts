import type { SplitLayout } from "./types";

export const LAYOUT_PRESETS: Record<string, SplitLayout> = {
  "code-review": {
    direction: "vertical",
    children: [
      {
        direction: "horizontal",
        children: [
          { id: "pr", type: "browser", props: {} },
          { id: "doc", type: "doc-viewer", props: {} },
        ],
        sizes: [50, 50],
      },
      { id: "findings", type: "review-findings", props: {} },
    ],
    sizes: [70, 30],
  },
  "agent-monitor": {
    direction: "horizontal",
    children: [
      { id: "log", type: "agent-log", props: {} },
      { id: "browser", type: "browser", props: {} },
    ],
    sizes: [50, 50],
  },
  "doc-driven": {
    direction: "horizontal",
    children: [
      { id: "doc", type: "doc-viewer", props: {} },
      { id: "code", type: "code-viewer", props: {} },
    ],
    sizes: [50, 50],
  },
  full: {
    direction: "horizontal",
    children: [
      { id: "kanban", type: "kanban", props: {} },
      { id: "browser", type: "browser", props: {} },
      { id: "doc", type: "doc-viewer", props: {} },
    ],
    sizes: [33, 34, 33],
  },
};

export const PRESET_NAMES = Object.keys(LAYOUT_PRESETS) as Array<keyof typeof LAYOUT_PRESETS>;
