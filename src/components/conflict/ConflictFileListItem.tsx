import type { ConflictFile } from "../../types";

interface ConflictFileListItemProps {
  file: ConflictFile;
  isActive: boolean;
  resolvedCount: number;
  onClick: () => void;
}

export function ConflictFileListItem({
  file,
  isActive,
  resolvedCount,
  onClick,
}: ConflictFileListItemProps) {
  const fileTotal = file.blocks.length;
  const isAllResolved = fileTotal > 0 && resolvedCount >= fileTotal;
  const basename = file.file_path.split("/").pop() ?? file.file_path;

  return (
    <button
      onClick={onClick}
      data-active={isActive ? "true" : "false"}
      className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors ${
        isActive ? "bg-white/10" : ""
      }`}
      style={{
        borderLeft: isActive
          ? "3px solid #fbbf24"
          : isAllResolved
          ? "3px solid #22c55e"
          : "3px solid transparent",
      }}
    >
      <div className="text-xs font-mono text-gray-300 truncate">{basename}</div>
      <div
        className={`text-[10px] mt-0.5 ${
          isAllResolved ? "text-green-400" : "text-yellow-500"
        }`}
      >
        {isAllResolved ? "ready" : `${fileTotal - resolvedCount} conflicts`}
      </div>
    </button>
  );
}
