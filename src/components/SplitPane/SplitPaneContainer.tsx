import { useState } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import type { PaneConfig, SplitLayout } from "./types";
import { isPaneConfig } from "./types";
import { PaneRenderer } from "./PaneRenderer";
import { LAYOUT_PRESETS, PRESET_NAMES } from "./presets";

interface SplitPaneContainerProps {
  initialLayout?: SplitLayout;
}

function LayoutNode({
  node,
  onRemove,
}: {
  node: PaneConfig | SplitLayout;
  onRemove: (id: string) => void;
}) {
  if (isPaneConfig(node)) {
    return <PaneRenderer config={node} onRemove={onRemove} />;
  }

  const layout = node as SplitLayout;
  return (
    <Allotment vertical={layout.direction === "vertical"}>
      {layout.children.map((child, i) => (
        <Allotment.Pane
          key={isPaneConfig(child) ? child.id : `layout-${i}`}
          preferredSize={layout.sizes?.[i] ? `${layout.sizes[i]}%` : undefined}
        >
          <LayoutNode node={child} onRemove={onRemove} />
        </Allotment.Pane>
      ))}
    </Allotment>
  );
}

function removePaneFromLayout(
  layout: SplitLayout,
  targetId: string
): SplitLayout {
  const newChildren = layout.children
    .map((child) => {
      if (isPaneConfig(child)) {
        return child.id === targetId ? null : child;
      }
      return removePaneFromLayout(child as SplitLayout, targetId);
    })
    .filter(Boolean) as (PaneConfig | SplitLayout)[];

  return { ...layout, children: newChildren };
}

const DEFAULT_LAYOUT: SplitLayout = LAYOUT_PRESETS["agent-monitor"];

export function SplitPaneContainer({ initialLayout }: SplitPaneContainerProps) {
  const [layout, setLayout] = useState<SplitLayout>(
    initialLayout ?? DEFAULT_LAYOUT
  );
  const [activePreset, setActivePreset] = useState<string>("agent-monitor");

  const applyPreset = (name: string) => {
    const preset = LAYOUT_PRESETS[name];
    if (preset) {
      setLayout(preset);
      setActivePreset(name);
    }
  };

  const removePane = (id: string) => {
    const updated = removePaneFromLayout(layout, id);
    if (updated.children.length === 0) {
      setLayout(DEFAULT_LAYOUT);
    } else {
      setLayout(updated);
    }
  };

  // フラットなペイン数を数える（テスト検証用）
  const countPanes = (node: PaneConfig | SplitLayout): number => {
    if (isPaneConfig(node)) return 1;
    return (node as SplitLayout).children.reduce(
      (sum, child) => sum + countPanes(child),
      0
    );
  };
  const paneCount = countPanes(layout);

  return (
    <div
      data-testid="split-pane-container"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      {/* プリセット切替バー */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "6px 10px",
          background: "#161b22",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        {PRESET_NAMES.map((name) => (
          <button
            key={name}
            data-testid={`preset-${name}`}
            onClick={() => applyPreset(name)}
            aria-pressed={activePreset === name}
            style={{
              padding: "3px 10px",
              background: activePreset === name ? "#7c6af7" : "#21262d",
              border: "1px solid #30363d",
              borderRadius: 4,
              color: "#e6edf3",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            {name}
          </button>
        ))}
        <span
          data-testid="pane-count"
          style={{ marginLeft: "auto", color: "#484f58", fontSize: 11, alignSelf: "center" }}
        >
          {paneCount} ペイン
        </span>
      </div>

      {/* レイアウト */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <LayoutNode node={layout} onRemove={removePane} />
      </div>
    </div>
  );
}
