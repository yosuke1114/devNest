import { useSwarmStore } from "../../stores/swarmStore";
import type { MergeOutcome } from "../../stores/swarmStore";
import { SwarmConflictView } from "./SwarmConflictView";

// ─── Component ────────────────────────────────────────────────

export function SwarmConflictsTab() {
  const { currentRun, conflictOutcome, setConflictOutcome } = useSwarmStore();

  // コンフリクト解決ビューが開かれている場合
  if (conflictOutcome && currentRun) {
    return (
      <div style={{ height: "100%" }} data-testid="swarm-conflicts-tab">
        <SwarmConflictView
          outcome={conflictOutcome}
          projectPath={currentRun.projectPath}
          onResolved={() => setConflictOutcome(null)}
          onClose={() => setConflictOutcome(null)}
        />
      </div>
    );
  }

  // コンフリクト一覧（conflictOutcome はストアからすでに取得済みの変数を使う）
  const conflictOutcomes: MergeOutcome[] =
    conflictOutcome && !conflictOutcome.success ? [conflictOutcome] : [];

  if (!currentRun) {
    return (
      <div style={emptyStyle} data-testid="swarm-conflicts-tab">
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
        <div style={{ color: "#484f58", fontSize: 14 }}>実行中のSwarmセッションはありません</div>
      </div>
    );
  }

  if (conflictOutcomes.length === 0) {
    const hasMergeResults = currentRun.status === "done" || currentRun.status === "partialDone";
    return (
      <div style={emptyStyle} data-testid="swarm-conflicts-tab">
        {hasMergeResults ? (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ color: "#68d391", fontSize: 14 }}>コンフリクトなし</div>
            <div style={{ color: "#484f58", fontSize: 12, marginTop: 6 }}>
              全ブランチが正常にマージされました
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ color: "#8b949e", fontSize: 14 }}>マージ完了後にコンフリクトが表示されます</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={containerStyle} data-testid="swarm-conflicts-tab">
      <div style={headerStyle}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f6ad55" }}>
          ⚠️ {conflictOutcomes.length} 件のコンフリクトが検出されました
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {conflictOutcomes.map((outcome) => (
          <ConflictOutcomeCard
            key={outcome.branch}
            outcome={outcome}
            onOpen={() => setConflictOutcome(outcome)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── ConflictOutcomeCard ──────────────────────────────────────

function ConflictOutcomeCard({
  outcome,
  onOpen,
}: {
  outcome: MergeOutcome;
  onOpen: () => void;
}) {
  return (
    <div
      data-testid={`conflict-card-${outcome.branch}`}
      style={{
        padding: "12px 16px",
        background: "#161b22",
        border: "1px solid #f6ad5540",
        borderRadius: 8,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3", fontFamily: "monospace", marginBottom: 4 }}>
            {outcome.branch}
          </div>
          <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 8 }}>
            {outcome.conflictFiles.length} ファイルにコンフリクト
          </div>
          <div>
            {outcome.conflictFiles.map((f) => (
              <span
                key={f}
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  color: "#fc8181",
                  background: "#2d0a0a",
                  border: "1px solid #fc818140",
                  borderRadius: 3,
                  padding: "2px 6px",
                  marginRight: 4,
                  marginBottom: 4,
                  fontFamily: "monospace",
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
        <button
          data-testid={`resolve-button-${outcome.branch}`}
          onClick={onOpen}
          style={{
            padding: "7px 14px",
            background: "#1f6feb",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          解決する →
        </button>
      </div>
      {outcome.error && (
        <div style={{ fontSize: 11, color: "#fc8181", marginTop: 6 }}>
          エラー: {outcome.error}
        </div>
      )}
    </div>
  );
}

// ─── スタイル ─────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  background: "#0d1117",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #21262d",
  flexShrink: 0,
};

const emptyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  background: "#0d1117",
};
