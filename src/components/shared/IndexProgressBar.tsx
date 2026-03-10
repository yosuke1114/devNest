interface IndexProgressBarProps {
  indexed: number;
  total: number;
  label?: string;
  className?: string;
}

export function IndexProgressBar({
  indexed,
  total,
  label,
  className,
}: IndexProgressBarProps) {
  const pct = total > 0 ? Math.round((indexed / total) * 100) : 0;

  return (
    <div data-testid="index-progress-bar" className={className} style={{ width: "100%" }}>
      {label && (
        <div style={{ fontSize: 12, color: "#aaa", marginBottom: 4 }}>{label}</div>
      )}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          height: 6,
          background: "#2a2a3a",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "#7c6cf2",
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: "#aaa", marginTop: 4, textAlign: "right" }}>
        {indexed} / {total} ({pct}%)
      </div>
    </div>
  );
}
