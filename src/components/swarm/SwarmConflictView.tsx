import { useEffect, useRef, useState } from "react";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { invoke } from "@tauri-apps/api/core";
import type { MergeOutcome } from "../../stores/swarmStore";

interface ConflictBlock {
  filePath: string;
  ours: string;
  theirs: string;
  contextBefore: string;
  startLine: number;
}

interface SwarmConflictViewProps {
  outcome: MergeOutcome;
  projectPath: string;
  onResolved: () => void;
  onClose: () => void;
}

export function SwarmConflictView({
  outcome,
  projectPath,
  onResolved,
  onClose,
}: SwarmConflictViewProps) {
  const [blocks, setBlocks] = useState<ConflictBlock[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const mergeContainerRef = useRef<HTMLDivElement>(null);
  const mergeViewRef = useRef<MergeView | null>(null);

  // コンフリクトブロックを取得
  useEffect(() => {
    const loadBlocks = async () => {
      setLoading(true);
      const allBlocks: ConflictBlock[] = [];
      for (const file of outcome.conflictFiles) {
        try {
          const fileBlocks = await invoke<ConflictBlock[]>("orchestrator_get_conflicts", {
            filePath: file,
          });
          allBlocks.push(...fileBlocks);
        } catch (e) {
          console.error("get_conflicts failed:", e);
        }
      }
      setBlocks(allBlocks);
      setCurrentIdx(0);
      setLoading(false);
    };
    loadBlocks();
  }, [outcome]);

  // MergeView を初期化
  useEffect(() => {
    if (!mergeContainerRef.current || blocks.length === 0 || loading) return;

    const block = blocks[currentIdx];

    // 既存の MergeView を破棄
    if (mergeViewRef.current) {
      mergeViewRef.current.destroy();
    }

    mergeViewRef.current = new MergeView({
      a: {
        doc: block.ours,
        extensions: [basicSetup, oneDark, EditorState.readOnly.of(true)],
      },
      b: {
        doc: block.theirs,
        extensions: [basicSetup, oneDark, EditorState.readOnly.of(true)],
      },
      parent: mergeContainerRef.current,
    });

    return () => {
      mergeViewRef.current?.destroy();
    };
  }, [blocks, currentIdx, loading]);

  const handleResolve = async (resolution: string) => {
    if (blocks.length === 0) return;
    const block = blocks[currentIdx];

    try {
      await invoke("orchestrator_resolve_conflict", {
        filePath: block.filePath,
        startLine: block.startLine,
        resolution: resolution === "manual"
          ? { Manual: mergeViewRef.current?.b.state.doc.toString() ?? block.theirs }
          : { [resolution]: null },
      });

      if (currentIdx + 1 < blocks.length) {
        setCurrentIdx(currentIdx + 1);
      } else {
        // 全コンフリクト解決 → コミット
        setCommitting(true);
        await invoke("orchestrator_commit_resolution", {
          projectPath,
          files: outcome.conflictFiles,
          message: `fix: ${outcome.branch} コンフリクト解決`,
        });
        setCommitting(false);
        onResolved();
      }
    } catch (e) {
      console.error("resolve_conflict failed:", e);
    }
  };

  if (loading) {
    return (
      <div style={overlayStyle}>
        <div style={dialogStyle}>
          <div style={{ color: "#8b949e", textAlign: "center", padding: 24 }}>
            コンフリクト情報を読み込み中...
          </div>
        </div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div style={overlayStyle}>
        <div style={dialogStyle}>
          <div style={{ color: "#68d391", textAlign: "center", padding: 24 }}>
            ✅ コンフリクトなし
          </div>
          <button onClick={onClose} style={btnStyle}>閉じる</button>
        </div>
      </div>
    );
  }

  const block = blocks[currentIdx];

  return (
    <div style={overlayStyle} data-testid="swarm-conflict-view">
      <div style={{ ...dialogStyle, width: "80vw", maxWidth: 1000 }}>
        {/* ヘッダー */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <span style={{ color: "#f6ad55", fontWeight: 700 }}>⚠️ コンフリクト解決</span>
            <span style={{ color: "#484f58", fontSize: 11, marginLeft: 8 }}>
              {currentIdx + 1} / {blocks.length} ブロック
            </span>
          </div>
          <button onClick={onClose} style={{ ...btnStyle, padding: "3px 8px" }}>✕</button>
        </div>

        <div style={{ color: "#79c0ff", fontSize: 11, fontFamily: "monospace", marginBottom: 8 }}>
          📄 {block.filePath} (行 {block.startLine})
        </div>

        {/* MergeView コンテナ */}
        <div
          ref={mergeContainerRef}
          style={{ height: 300, overflow: "auto", border: "1px solid #30363d", borderRadius: 4, marginBottom: 12 }}
          data-testid="merge-view-container"
        />

        {/* ラベル */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 10, color: "#484f58" }}>
          <div style={{ flex: 1, textAlign: "center" }}>← HEAD（ベースブランチ）</div>
          <div style={{ flex: 1, textAlign: "center" }}>{outcome.branch} →</div>
        </div>

        {/* 解決ボタン */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            data-testid="take-ours-button"
            onClick={() => handleResolve("TakeOurs")}
            style={{ ...btnStyle, background: "#1a4a7a" }}
          >
            ← HEAD を採用
          </button>
          <button
            data-testid="take-theirs-button"
            onClick={() => handleResolve("TakeTheirs")}
            style={{ ...btnStyle, background: "#1a4a3a" }}
          >
            {outcome.branch.split("/").pop()} を採用 →
          </button>
          <button
            data-testid="take-both-button"
            onClick={() => handleResolve("TakeBoth")}
            style={{ ...btnStyle, background: "#3a3a1a" }}
          >
            両方採用
          </button>
          <button
            data-testid="take-manual-button"
            onClick={() => handleResolve("manual")}
            style={{ ...btnStyle, background: "#3a1a3a" }}
          >
            手動編集
          </button>
        </div>

        {committing && (
          <div style={{ color: "#8b949e", textAlign: "center", marginTop: 8, fontSize: 11 }}>
            🔀 コミット中...
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.8)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
};

const dialogStyle: React.CSSProperties = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 8,
  padding: 20,
  maxHeight: "90vh",
  overflow: "auto",
};

const btnStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "#21262d",
  border: "1px solid #30363d",
  borderRadius: 5,
  color: "#e6edf3",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "monospace",
};
