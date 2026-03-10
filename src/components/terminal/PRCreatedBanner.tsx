import { IconCheck, IconX } from "@tabler/icons-react";

interface PRCreatedBannerProps {
  prNumber: number;
  title: string;
  hasDocChanges: boolean;
  onOpenPR: () => void;
  onDismiss: () => void;
}

export function PRCreatedBanner({
  prNumber,
  title,
  hasDocChanges,
  onOpenPR,
  onDismiss,
}: PRCreatedBannerProps) {
  return (
    <div data-testid="pr-created-banner" className="flex items-center gap-3 px-4 py-2.5 bg-purple-900/40 border-b border-purple-700/50">
      <IconCheck size={14} className="text-purple-400 shrink-0" />
      <div className="flex-1 min-w-0 text-xs text-purple-200">
        <span className="font-medium">PR #{prNumber}</span> を作成しました — {title}
        {hasDocChanges && (
          <span className="ml-2 text-purple-400 text-[10px]">
            設計書変更あり。Design Docs タブで確認できます。
          </span>
        )}
      </div>
      <button
        onClick={onOpenPR}
        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-purple-700 hover:bg-purple-600 text-white transition-colors shrink-0"
      >
        PR を開く →
      </button>
      <button onClick={onDismiss} className="text-gray-500 hover:text-gray-300">
        <IconX size={12} />
      </button>
    </div>
  );
}
