import { IconGitBranch, IconGitMerge, IconX } from "@tabler/icons-react";
import { Button } from "../ui/button";

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
    <div data-testid="pr-ready-banner" className="flex items-center gap-3 px-4 py-2.5 bg-green-900/40 border-b border-green-700/50">
      <IconGitBranch size={14} className="text-green-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-green-300">PR READY: </span>
        <span className="text-xs font-mono text-green-200">{branchName}</span>
        {hasDocChanges && (
          <span className="ml-2 text-[10px] text-green-400">（設計書変更あり）</span>
        )}
      </div>
      <Button
        onClick={onCreatePR}
        data-testid="create-pr"
        size="sm"
        className="shrink-0 h-7 px-2.5 text-xs bg-green-700 hover:bg-green-600 text-white"
      >
        <IconGitMerge size={11} /> CREATE PR
      </Button>
      <Button
        onClick={onReviewChanges}
        variant="outline"
        size="sm"
        className="shrink-0 h-7 px-2.5 text-xs"
      >
        REVIEW CHANGES
      </Button>
      <Button variant="ghost" size="icon" onClick={onDismiss} className="h-7 w-7 text-muted-foreground">
        <IconX size={12} />
      </Button>
    </div>
  );
}
