import { IconCheck, IconX } from "@tabler/icons-react";
import { Button } from "../ui/button";

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
    <div data-testid="pr-created-banner" className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border-b border-primary/30">
      <IconCheck size={14} className="text-primary shrink-0" />
      <div className="flex-1 min-w-0 text-xs text-foreground">
        <span className="font-medium">PR #{prNumber}</span> を作成しました — {title}
        {hasDocChanges && (
          <span className="ml-2 text-primary/80 text-[10px]">
            設計書変更あり。Design Docs タブで確認できます。
          </span>
        )}
      </div>
      <Button
        onClick={onOpenPR}
        size="sm"
        className="shrink-0 h-7 px-2.5 text-xs"
      >
        PR を開く →
      </Button>
      <Button variant="ghost" size="icon" onClick={onDismiss} className="h-7 w-7 text-muted-foreground">
        <IconX size={12} />
      </Button>
    </div>
  );
}
