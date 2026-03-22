import { useState } from "react";
import { IconAlertTriangle, IconCheck, IconSparkles } from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import type { ConflictBlock } from "../../types";

type Resolution = "ours" | "theirs" | "manual";

interface AiResolution {
  merged: string;
  explanation: string;
}

interface ConflictBlockItemProps {
  block: ConflictBlock;
  filePath: string;
  resolution: Resolution | undefined;
  manualContent: string | undefined;
  onResolve: (r: Resolution, manual?: string) => void;
  onManualChange: (content: string) => void;
}

export function ConflictBlockItem({
  block,
  filePath,
  resolution,
  manualContent,
  onResolve,
  onManualChange,
}: ConflictBlockItemProps) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResolution | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAiSuggest = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await invoke<AiResolution>("orchestrator_ai_resolve_conflict", {
        filePath,
        startLine: block.index,
      });
      setAiResult(result);
      // AI提案をMANUALに適用
      onResolve("manual", result.merged);
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div data-testid="conflict-block-item" className="border border-white/10 rounded-lg overflow-hidden mb-3">
      {/* ブロックヘッダー */}
      <div className="flex items-center gap-3 px-3 py-2 bg-white/5 border-b border-white/10">
        <IconAlertTriangle size={13} className="text-yellow-400 shrink-0" />
        <span className="text-xs text-gray-300 font-medium">
          Conflict block #{block.index + 1}
        </span>
        {resolution && (
          <span className="ml-auto text-[10px] text-green-400 flex items-center gap-1">
            <IconCheck size={10} /> {resolution.toUpperCase()} を選択
          </span>
        )}
        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={() => onResolve("ours")}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              resolution === "ours"
                ? "bg-green-700 text-white"
                : "bg-white/10 hover:bg-white/20 text-gray-300"
            }`}
          >
            USE MINE
          </button>
          <button
            onClick={() => onResolve("theirs")}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              resolution === "theirs"
                ? "bg-blue-700 text-white"
                : "bg-white/10 hover:bg-white/20 text-gray-300"
            }`}
          >
            USE THEIRS
          </button>
          <button
            onClick={() => onResolve("manual", block.ours)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              resolution === "manual"
                ? "bg-purple-700 text-white"
                : "bg-white/10 hover:bg-white/20 text-gray-300"
            }`}
          >
            MANUAL
          </button>
          <button
            onClick={handleAiSuggest}
            disabled={aiLoading}
            data-testid="ai-suggest-btn"
            className={`px-2 py-0.5 rounded text-[10px] transition-colors flex items-center gap-1 ${
              aiLoading
                ? "bg-amber-900/50 text-amber-300 cursor-wait"
                : "bg-amber-800/30 hover:bg-amber-700/50 text-amber-300"
            }`}
          >
            <IconSparkles size={10} />
            {aiLoading ? "..." : "AI"}
          </button>
        </div>
      </div>

      {/* AI提案の説明 */}
      {aiResult && (
        <div className="px-3 py-1.5 bg-amber-950/30 border-b border-amber-700/30 text-[10px] text-amber-300">
          AI: {aiResult.explanation}
        </div>
      )}
      {aiError && (
        <div className="px-3 py-1.5 bg-red-950/30 border-b border-red-700/30 text-[10px] text-red-400">
          AI エラー: {aiError}
        </div>
      )}

      {/* HEAD 側 */}
      <div
        className={`px-3 py-2 border-b border-white/10 ${
          resolution === "ours" ? "bg-green-950/40" : "bg-red-950/20"
        }`}
      >
        <div className="text-[10px] text-red-300 mb-1 font-mono">HEAD (ours)</div>
        <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap leading-5">
          {block.ours || "(empty)"}
        </pre>
      </div>

      {/* THEIRS 側 */}
      <div
        className={`px-3 py-2 ${
          resolution === "theirs" ? "bg-blue-950/40" : "bg-blue-950/10"
        }`}
      >
        <div className="text-[10px] text-blue-300 mb-1 font-mono">THEIRS</div>
        <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap leading-5">
          {block.theirs || "(empty)"}
        </pre>
      </div>

      {/* MANUAL エディタ */}
      {resolution === "manual" && (
        <div className="px-3 py-2 bg-purple-950/30 border-t border-white/10">
          <div className="text-[10px] text-purple-300 mb-1">MANUAL EDIT:</div>
          <textarea
            value={manualContent ?? block.ours}
            onChange={(e) => onManualChange(e.target.value)}
            className="w-full bg-white/5 border border-purple-700/50 rounded p-2 text-[11px] font-mono text-gray-200 resize-none h-24 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
