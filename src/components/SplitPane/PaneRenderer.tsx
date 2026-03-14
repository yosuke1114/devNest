import type { PaneConfig, PaneType } from "./types";

export const PANE_LABELS: Record<PaneType, string> = {
  browser: "ブラウザ",
  "doc-viewer": "設計書",
  "code-viewer": "コード",
  "agent-log": "エージェントログ",
  "review-findings": "AIレビュー",
  kanban: "カンバン",
  terminal: "ターミナル",
};

interface PaneRendererProps {
  config: PaneConfig;
  onRemove: (id: string) => void;
}

export function PaneRenderer({ config, onRemove }: PaneRendererProps) {
  return (
    <div
      data-testid={`pane-${config.id}`}
      data-pane-type={config.type}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0d1117",
        border: "1px solid #21262d",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {/* ペインヘッダー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 10px",
          background: "#161b22",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
          fontSize: 11,
          color: "#8b949e",
        }}
      >
        <span>{PANE_LABELS[config.type]}</span>
        <button
          onClick={() => onRemove(config.id)}
          aria-label={`${PANE_LABELS[config.type]}ペインを閉じる`}
          style={{
            background: "none",
            border: "none",
            color: "#484f58",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ✕
        </button>
      </div>

      {/* ペイン本体（プレースホルダー）*/}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#484f58",
          fontSize: 13,
        }}
      >
        {PANE_LABELS[config.type]}
      </div>
    </div>
  );
}
