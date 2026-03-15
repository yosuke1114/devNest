import React from "react";
import type { RingUrgency } from "../../hooks/useRingNotification";

interface RingIndicatorProps {
  urgency: RingUrgency | null;  // null = アニメーションなし
  children: React.ReactNode;
}

export function RingIndicator({ urgency, children }: RingIndicatorProps) {
  if (!urgency) {
    return <>{children}</>;
  }

  return (
    <span
      data-testid={`ring-indicator-${urgency}`}
      style={{
        display: "block",
        position: "relative",
        animation: `ring-pulse-${urgency} ${urgency === "critical" ? "1s" : "2s"} ease-in-out infinite`,
        borderRadius: 4,
      }}
    >
      {children}
    </span>
  );
}
