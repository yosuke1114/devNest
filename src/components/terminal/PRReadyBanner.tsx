import { IconGitBranch, IconGitMerge, IconX } from "@tabler/icons-react";

interface PRReadyBannerProps {
  branchName: string;
  hasDocChanges: boolean;
  onCreatePR: () => void;
  onReviewChanges: () => void;
  onDismiss: () => void;
}

export function PRReadyBanner({
  branchName,
  hasDocChanges,
  onCreatePR,
  onReviewChanges,
  onDismiss,
}: PRReadyBannerProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-green-900/40 border-b border-green-700/50">
      <IconGitBranch size={14} className="text-green-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-green-300">PR READY: </span>
        <span className="text-xs font-mono text-green-200">{branchName}</span>
        {hasDocChanges && (
          <span className="ml-2 text-[10px] text-green-400">（設計書変更あり）</span>
        )}
      </div>
      <button
        onClick={onCreatePR}
        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-green-700 hover:bg-green-600 text-white transition-colors shrink-0"
      >
        <IconGitMerge size={11} /> CREATE PR
      </button>
      <button
        onClick={onReviewChanges}
        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors shrink-0"
      >
        REVIEW CHANGES
      </button>
      <button onClick={onDismiss} className="text-gray-500 hover:text-gray-300">
        <IconX size={12} />
      </button>
    </div>
  );
}
