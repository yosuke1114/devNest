import { IconGitMerge, IconCircleCheck } from "@tabler/icons-react";
import type { AsyncStatus } from "../../types";

interface MergePanelProps {
  canMerge: boolean;
  mergeStatus: AsyncStatus;
  onMerge: () => void;
  headBranch: string;
  baseBranch: string;
}

export function MergePanel({ canMerge, mergeStatus, onMerge, headBranch, baseBranch }: MergePanelProps) {
  const isLoading = mergeStatus === "loading";

  if (mergeStatus === "success") {
    return (
      <div className="rounded-lg border border-green-700/40 p-3 bg-green-900/20 space-y-1">
        <div className="flex items-center gap-2 text-xs text-green-400">
          <IconCircleCheck size={14} />
          <span>マージ完了</span>
        </div>
        <div className="text-[10px] text-gray-400 font-mono">
          {headBranch} → {baseBranch}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 p-3 space-y-2">
      <div className="text-xs font-medium text-gray-400">Merge</div>

      {/* ブランチ情報 */}
      <div className="text-[10px] text-gray-500 font-mono">
        <span className="text-blue-300">{headBranch}</span>
        {" → "}
        <span>{baseBranch}</span>
      </div>

      {/* canMerge=false の場合の案内 */}
      {!canMerge && mergeStatus !== "loading" && (
        <div className="text-[10px] text-yellow-500">
          Approve と passing checks が必要です（条件未達成）
        </div>
      )}

      {/* エラーメッセージ */}
      {mergeStatus === "error" && (
        <div className="text-xs text-red-400">マージに失敗しました。もう一度お試しください。</div>
      )}

      <button
        onClick={onMerge}
        disabled={!canMerge || isLoading}
        className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors"
      >
        <IconGitMerge size={12} />
        Squash and merge{isLoading && "…"}
      </button>
    </div>
  );
}
