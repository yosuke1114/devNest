import type { TaskSnapshot } from "../types/swarm";

const TASK_STATE: Record<string, { icon: string; color: string; label: string }> = {
  waiting:  { icon: "⏳", color: "#4a5568", label: "待機" },
  ready:    { icon: "🟢", color: "#68d391", label: "準備完了" },
  running:  { icon: "🔄", color: "#f6ad55", label: "実行中" },
  done:     { icon: "✅", color: "#68d391", label: "完了" },
  error:    { icon: "❌", color: "#fc8181", label: "エラー" },
  skipped:  { icon: "⏭️", color: "#484f58", label: "スキップ" },
};

export function TaskBoard({ tasks }: { tasks: TaskSnapshot[] }) {
  if (tasks.length === 0) return null;
  const waves = Array.from(new Set(tasks.map((t) => t.waveNumber))).sort((a, b) => a - b);
  return (
    <div className="card">
      <h2>Tasks ({tasks.filter((t) => t.executionState === "done").length}/{tasks.length} 完了)</h2>
      {waves.map((wn) => {
        const waveTasks = tasks.filter((t) => t.waveNumber === wn);
        const allDone = waveTasks.every((t) => t.executionState === "done");
        const anyRunning = waveTasks.some((t) => t.executionState === "running");
        const waveColor = allDone ? "#10b981" : anyRunning ? "#f6ad55" : "#71717a";
        return (
          <div key={wn} className="wave-group">
            <div className="wave-label" style={{ color: waveColor }}>
              Wave {wn} {allDone ? "✅" : anyRunning ? "🔄" : ""}
            </div>
            {waveTasks.map((task) => {
              const st = TASK_STATE[task.executionState] ?? TASK_STATE.waiting;
              return (
                <div key={task.taskId} className="task-row">
                  <span className="task-icon">{st.icon}</span>
                  <div className="task-row-body">
                    <span className="task-row-title">{task.title}</span>
                    {task.dependsOn.length > 0 && (
                      <span className="task-deps-small">← #{task.dependsOn.join(", #")}</span>
                    )}
                  </div>
                  <span className="task-state-label" style={{ color: st.color }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
