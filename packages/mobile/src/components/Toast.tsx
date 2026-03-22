import { useEffect, useState } from "react";

export interface ToastItem {
  id: number;
  text: string;
  level: "info" | "warn" | "error" | "success";
}

let nextId = 0;
const listeners: Set<(t: ToastItem) => void> = new Set();

/** アプリ全体から呼べるトースト表示関数 */
export function showToast(text: string, level: ToastItem["level"] = "info") {
  const item: ToastItem = { id: ++nextId, text, level };
  listeners.forEach((fn) => fn(item));
}

const LEVEL_COLORS: Record<string, string> = {
  info: "#3b82f6",
  warn: "#f59e0b",
  error: "#ef4444",
  success: "#10b981",
};

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (t: ToastItem) => {
      setItems((prev) => [...prev.slice(-4), t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== t.id));
      }, 4000);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: "env(safe-area-inset-top, 12px)",
      left: 12,
      right: 12,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      pointerEvents: "none",
    }}>
      {items.map((t) => (
        <div
          key={t.id}
          style={{
            background: "#1a1e2a",
            border: `1px solid ${LEVEL_COLORS[t.level]}`,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            color: "#e4e4e7",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            animation: "slideIn 0.2s ease-out",
            pointerEvents: "auto",
          }}
        >
          <span style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: LEVEL_COLORS[t.level],
            marginRight: 8,
          }} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
