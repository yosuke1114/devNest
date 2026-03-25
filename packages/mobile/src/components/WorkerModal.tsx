import { lazy, Suspense } from "react";

// A2: xterm.js を WorkerModal 内に統合。iOS Safari クラッシュ回避のため遅延ロード
const WorkerTerminal = lazy(() =>
  import("./WorkerTerminal").then((m) => ({ default: m.WorkerTerminal }))
);

export function WorkerModal({
  label,
  lines,
  onClose,
  onInput,
}: {
  label: string;
  lines: string[];
  onClose: () => void;
  onInput: (data: string) => void;
}) {
  return (
    <div className="worker-modal" onClick={onClose}>
      <div className="worker-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="worker-modal-header">
          <span className="worker-modal-title">{label}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="worker-modal-terminal">
          <Suspense fallback={<div style={{ color: "#71717a", padding: 12 }}>Loading terminal...</div>}>
            <WorkerTerminal lines={lines} onInput={onInput} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
