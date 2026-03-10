import { IconDeviceFloppy, IconRefresh } from "@tabler/icons-react";
import type { AsyncStatus, DocSaveProgress } from "../../types";

interface SaveStatusBarProps {
  currentPath: string | null;
  saveStatus: AsyncStatus;
  saveProgress: DocSaveProgress | null;
  onSave: () => void;
  canSave: boolean;
  showRetry?: boolean;
  onRetry?: () => void;
}

const PROGRESS_LABELS: Record<NonNullable<DocSaveProgress["status"]>, string> = {
  committing: "コミット中…",
  pushing: "プッシュ中…",
  synced: "同期済み",
  push_failed: "プッシュ失敗",
};

const PROGRESS_COLORS: Record<NonNullable<DocSaveProgress["status"]>, string> = {
  committing: "#f0a500",
  pushing: "#3498db",
  synced: "#2ecc71",
  push_failed: "#e74c3c",
};

export function SaveStatusBar({
  currentPath,
  saveStatus,
  saveProgress,
  onSave,
  canSave,
  showRetry = false,
  onRetry,
}: SaveStatusBarProps) {
  const isSaving = saveStatus === "loading";
  const isDisabled = isSaving || !canSave;

  return (
    <div
      data-testid="save-status-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        background: "#1a1a2e",
        borderBottom: "1px solid #2a2a3a",
        height: 44,
      }}
    >
      <span style={{ flex: 1, fontSize: 14, color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {currentPath ?? "ファイルを選択"}
      </span>

      {saveProgress && (
        <ProgressBadge progress={saveProgress} />
      )}

      {showRetry && onRetry && (
        <button
          aria-label="再プッシュ"
          onClick={onRetry}
          title="再プッシュ"
          style={ghostBtnStyle}
        >
          <IconRefresh size={16} />
          再プッシュ
        </button>
      )}

      <button
        aria-label="保存"
        onClick={onSave}
        disabled={isDisabled}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "#7c6cf2",
          color: "#fff",
          border: "none",
          padding: "4px 12px",
          borderRadius: 4,
          cursor: isDisabled ? "not-allowed" : "pointer",
          fontSize: 14,
          opacity: isSaving ? 0.7 : 1,
        }}
      >
        <IconDeviceFloppy size={16} />
        保存
      </button>
    </div>
  );
}

function ProgressBadge({ progress }: { progress: DocSaveProgress }) {
  const label = progress.message ?? PROGRESS_LABELS[progress.status];
  const color = PROGRESS_COLORS[progress.status];
  return (
    <span
      style={{
        fontSize: 12,
        color,
        background: `${color}20`,
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${color}40`,
      }}
    >
      {label}
    </span>
  );
}

const ghostBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "transparent",
  border: "1px solid #3a3a52",
  color: "#aaa",
  cursor: "pointer",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 13,
};
