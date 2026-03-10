import type { AsyncStatus } from "../../types";

interface StatusPillProps {
  status: AsyncStatus;
  label?: string;
  className?: string;
}

const DEFAULTS: Record<Exclude<AsyncStatus, "idle">, { text: string; color: string; bg: string }> = {
  loading: { text: "処理中…", color: "#f0a500", bg: "#f0a50020" },
  success: { text: "完了", color: "#2ecc71", bg: "#2ecc7120" },
  error: { text: "エラー", color: "#e74c3c", bg: "#e74c3c20" },
};

export function StatusPill({ status, label, className }: StatusPillProps) {
  if (status === "idle") return null;

  const cfg = DEFAULTS[status];
  const text = label ?? cfg.text;

  return (
    <span
      data-testid="status-pill"
      className={className}
      style={{
        fontSize: 12,
        color: cfg.color,
        background: cfg.bg,
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${cfg.color}40`,
        display: "inline-block",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}
