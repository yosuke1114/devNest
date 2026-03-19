import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import type { ScreenName } from "../../types";

interface NavShortcut {
  label: string;
  screen: ScreenName;
  description?: string;
}

const NAV_SHORTCUTS: NavShortcut[] = [
  { label: "ホーム",         screen: "home",           description: "ダッシュボード" },
  { label: "プロジェクト",   screen: "project",        description: "カンバン・保守・分析" },
  { label: "エージェント",   screen: "agent",          description: "Claude Terminal・タスクキュー" },
  { label: "スプリント",     screen: "sprint",         description: "プランニング・レトロスペクティブ" },
  { label: "設定",           screen: "settings",       description: "接続・通知・ポリシー" },
  { label: "Issues",         screen: "issues",         description: "GitHub Issues" },
  { label: "Pull Requests",  screen: "pr",             description: "GitHub PR" },
  { label: "設計書",         screen: "editor",         description: "ドキュメントエディタ" },
  { label: "鮮度マップ",     screen: "docs-freshness", description: "設計書の鮮度確認" },
  { label: "コンフリクト",   screen: "conflict",       description: "マージコンフリクト解決" },
  { label: "検索",           screen: "search",         description: "セマンティック検索" },
];

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette = memo(function CommandPalette({
  isOpen,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim()
    ? NAV_SHORTCUTS.filter(
        (s) =>
          s.label.toLowerCase().includes(query.toLowerCase()) ||
          (s.description ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : NAV_SHORTCUTS;

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      // Focus input after next render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Keep selectedIdx in bounds
  useEffect(() => {
    setSelectedIdx((prev) => Math.min(prev, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  const handleNavigate = useCallback((screen: ScreenName) => {
    useUiStore.getState().navigate(screen);
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[selectedIdx]) {
        handleNavigate(filtered[selectedIdx].screen);
      }
    },
    [filtered, selectedIdx, handleNavigate, onClose]
  );

  if (!isOpen) return null;

  return (
    /* Overlay */
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 2000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
      }}
    >
      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: 520,
          background: "#1e1e32",
          border: "1px solid #2a2a3f",
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid #2a2a3f",
          }}
        >
          <span style={{ fontSize: 16 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            placeholder="画面を検索..."
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: "#e0e0e0",
              fontSize: 15,
              fontFamily: "inherit",
            }}
          />
          <span style={{ fontSize: 11, color: "#555" }}>Esc で閉じる</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {!query.trim() ? (
            <div
              style={{
                padding: "8px 16px 4px",
                fontSize: 11,
                color: "#555",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              ナビゲーション
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <div style={{ padding: "20px 16px", color: "#666", fontSize: 13, textAlign: "center" }}>
              「{query}」に一致する画面は見つかりません
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.screen}
                onClick={() => handleNavigate(item.screen)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 16px",
                  background: idx === selectedIdx ? "#2a2a4a" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: idx === selectedIdx ? 500 : 400 }}>
                    {item.label}
                  </div>
                  {item.description ? (
                    <div style={{ fontSize: 12, color: "#666" }}>{item.description}</div>
                  ) : null}
                </div>
                {idx === selectedIdx ? (
                  <span style={{ fontSize: 11, color: "#555" }}>Enter</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
});
