import { IconBell } from "@tabler/icons-react";

export function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <IconBell size={32} className="text-gray-700 mb-3" />
      <div className="text-sm text-gray-500 mb-1">通知はありません</div>
      <div className="text-[11px] text-gray-700">
        CI 結果・PR コメント・Conflict 検知などをここで受け取れます
      </div>
    </div>
  );
}
