import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import type { AsyncStatus } from "../../types";

interface StatusPillProps {
  status: AsyncStatus;
  label?: string;
  className?: string;
}

const DEFAULTS: Record<Exclude<AsyncStatus, "idle">, { text: string; className: string }> = {
  loading: { text: "処理中…", className: "border border-yellow-600/40 bg-yellow-500/10 text-yellow-400" },
  success: { text: "完了", className: "border border-green-600/40 bg-green-500/10 text-green-400" },
  error: { text: "エラー", className: "border border-destructive/40 bg-destructive/10 text-destructive" },
};

export function StatusPill({ status, label, className }: StatusPillProps) {
  if (status === "idle") return null;

  const cfg = DEFAULTS[status];
  const text = label ?? cfg.text;

  return (
    <Badge
      data-testid="status-pill"
      variant="outline"
      className={cn(cfg.className, className)}
    >
      {text}
    </Badge>
  );
}
