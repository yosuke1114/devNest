interface Props {
  currentWave: number;
  completedTasks: number;
  totalTasks: number;
  onStop: () => void;
}

export function StickyStatusBar({ currentWave, completedTasks, totalTasks, onStop }: Props) {
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div className="sticky-status-bar">
      <span className="sticky-wave-label">Wave {currentWave}</span>
      <div className="sticky-progress-bar">
        <div className="sticky-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="sticky-progress-text">{Math.round(progress)}%</span>
      <button className="sticky-stop-btn" onClick={onStop}>
        ⏹ Stop
      </button>
    </div>
  );
}
