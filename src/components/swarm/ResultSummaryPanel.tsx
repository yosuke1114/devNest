import { useUiStore } from "../../stores/uiStore";
import type { OrchestratorRun, AggregatedResult, MergeOutcome } from "../../stores/swarmStore";

interface ResultSummaryPanelProps {
  run: OrchestratorRun;
  result: AggregatedResult | null;
  onReset: () => void;
  onOpenConflict: (outcome: MergeOutcome) => void;
}

export function ResultSummaryPanel({
  run,
  result,
  onReset,
  onOpenConflict,
}: ResultSummaryPanelProps) {
  const navigate = useUiStore((s) => s.navigate);

  const allSucceeded = run.status === "done";
  const isPartial = run.status === "partialDone";
  const isFailed = run.status === "failed";

  const conflictedOutcomes = run.mergeResults.filter(
    (r) => r.conflictFiles.length > 0
  );
  const hasConflicts = conflictedOutcomes.length > 0;

  return (
    <div style={panelStyle} data-testid="result-summary-panel">
      {/* ステータスヘッダー */}
      <div style={headerStyle}>
        {allSucceeded && !hasConflicts && (
          <span style={{ color: "#68d391", fontSize: 13, fontWeight: 700 }}>
            ✅ 全タスク完了
          </span>
        )}
        {(isPartial || hasConflicts) && (
          <span style={{ color: "#f6ad55", fontSize: 13, fontWeight: 700 }}>
            ⚠️ 一部完了
          </span>
        )}
        {isFailed && (
          <span style={{ color: "#fc8181", fontSize: 13, fontWeight: 700 }}>
            ❌ 全タスク失敗
          </span>
        )}
      </div>

      {/* Git diff 統計 */}
      {result && (result.totalFilesChanged > 0 || result.totalInsertions > 0) && (
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>変更サマリー</div>
          <div style={statsRowStyle}>
            <StatBadge label="ファイル" value={result.totalFilesChanged} color="#79c0ff" />
            <StatBadge label="+追加" value={result.totalInsertions} color="#68d391" />
            <StatBadge label="-削除" value={result.totalDeletions} color="#fc8181" />
          </div>
        </div>
      )}

      {/* Worker 別結果 */}
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Worker 結果</div>
        {run.assignments.map((a) => {
          const diff = result?.workerDiffs.find((d) => d.workerId === a.workerId);
          return (
            <div key={a.workerId} style={workerRowStyle}>
              <span style={{ color: a.status === "done" ? "#68d391" : a.status === "error" ? "#fc8181" : "#f6ad55" }}>
                {a.status === "done" ? "✓" : a.status === "error" ? "✕" : "⚠"}
              </span>
              <span style={{ flex: 1, color: "#c9d1d9", fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.task.title}
              </span>
              {diff && (
                <span style={{ fontSize: 10, color: "#484f58" }}>
                  {diff.filesChanged} files
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* コンフリクト一覧 */}
      {hasConflicts && (
        <div style={sectionStyle}>
          <div style={sectionLabelStyle}>コンフリクト解決が必要</div>
          {conflictedOutcomes.map((outcome) => (
            <div key={outcome.branch}>
              {outcome.conflictFiles.map((file) => (
                <button
                  key={file}
                  onClick={() => onOpenConflict(outcome)}
                  style={conflictFileButtonStyle}
                  data-testid="conflict-file-button"
                >
                  <span style={{ color: "#f6ad55" }}>⚠</span>
                  <span style={{ flex: 1, fontSize: 10, fontFamily: "monospace", color: "#79c0ff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file}
                  </span>
                  <span style={{ color: "#484f58", fontSize: 10 }}>→ 解決</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* アクションボタン */}
      <div style={actionsStyle}>
        {!isFailed && (
          <button
            data-testid="create-pr-button"
            onClick={() => navigate("pr")}
            style={prButtonStyle}
          >
            🔀 PR を作成
          </button>
        )}
        <button
          data-testid="reset-button"
          onClick={onReset}
          style={resetButtonStyle}
        >
          リセット
        </button>
      </div>
    </div>
  );
}

// ─── 小コンポーネント ───────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color, fontSize: 16, fontFamily: "monospace", fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#484f58", fontSize: 10 }}>{label}</div>
    </div>
  );
}

// ─── スタイル ──────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  overflow: "auto",
};

const headerStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #21262d",
};

const sectionStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #161b22",
};

const sectionLabelStyle: React.CSSProperties = {
  color: "#484f58",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
};

const workerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 4,
};

const conflictFileButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  padding: "5px 6px",
  background: "#2d1f00",
  border: "1px solid #f6ad5540",
  borderRadius: 4,
  cursor: "pointer",
  marginBottom: 4,
};

const actionsStyle: React.CSSProperties = {
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const prButtonStyle: React.CSSProperties = {
  padding: "7px 12px",
  background: "#1f6feb",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "monospace",
};

const resetButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "none",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#8b949e",
  cursor: "pointer",
  fontSize: 12,
};
