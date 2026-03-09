interface PermissionBannerProps {
  permissionStatus: "granted" | "denied" | "skipped" | "unknown";
  onRequestPermission: () => void;
}

export function PermissionBanner({
  permissionStatus,
  onRequestPermission,
}: PermissionBannerProps) {
  if (permissionStatus === "granted") return null;

  if (permissionStatus === "denied") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300">
        <span>🔔</span>
        <span>
          OS 通知がブロックされています。システム設定から許可してください。
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-yellow-900/20 border-b border-yellow-800/40 text-xs text-yellow-200">
      <span>🔔</span>
      <span className="flex-1">
        OS 通知を許可すると CI 結果・PR コメントをリアルタイムで受け取れます。
      </span>
      <button
        onClick={onRequestPermission}
        className="px-3 py-1 rounded text-xs bg-yellow-700/60 hover:bg-yellow-600/60 text-yellow-100 transition-colors"
      >
        ALLOW
      </button>
    </div>
  );
}
