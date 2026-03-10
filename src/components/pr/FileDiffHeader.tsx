interface FileDiffHeaderProps {
  filename: string;
  additions: number;
  deletions: number;
  className?: string;
}

export function FileDiffHeader({ filename, additions, deletions, className = "" }: FileDiffHeaderProps) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 bg-white/5 text-xs font-mono border-b border-white/10 ${className}`}
      data-testid="file-diff-header"
    >
      <span className="text-gray-300 flex-1 truncate">{filename}</span>
      <span className="text-green-400 shrink-0">+{additions}</span>
      <span className="text-red-400 shrink-0">-{deletions}</span>
    </div>
  );
}
