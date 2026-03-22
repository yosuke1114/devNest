import { useState, useEffect } from "react";

const STORAGE_KEY = "devnest-mobile-settings";

export interface MobileSettings {
  wsUrl: string;
  wsSecret: string;
  logRetention: number; // 保持するログ行数
}

const DEFAULTS: MobileSettings = {
  wsUrl: import.meta.env.VITE_WS_URL || "ws://127.0.0.1:7878/ws",
  wsSecret: import.meta.env.VITE_WS_SECRET || "",
  logRetention: 200,
};

export function loadSettings(): MobileSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function saveSettings(s: MobileSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (s: MobileSettings) => void;
}

export function SettingsPanel({ open, onClose, onSave }: Props) {
  const [form, setForm] = useState<MobileSettings>(loadSettings);

  useEffect(() => {
    if (open) setForm(loadSettings());
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    saveSettings(form);
    onSave(form);
    onClose();
  };

  const handleReset = () => {
    setForm({ ...DEFAULTS });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#141720",
          borderRadius: "16px 16px 0 0",
          padding: "20px 16px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e4e4e7", margin: 0 }}>Settings</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#71717a", fontSize: 20, cursor: "pointer" }}
          >
            &times;
          </button>
        </div>

        <label style={labelStyle}>WebSocket URL</label>
        <input
          style={inputStyle}
          value={form.wsUrl}
          onChange={(e) => setForm({ ...form, wsUrl: e.target.value })}
          placeholder="ws://127.0.0.1:7878/ws"
        />

        <label style={labelStyle}>Token / Secret</label>
        <input
          style={inputStyle}
          type="password"
          value={form.wsSecret}
          onChange={(e) => setForm({ ...form, wsSecret: e.target.value })}
          placeholder="(optional)"
        />

        <label style={labelStyle}>Log Retention (lines per worker)</label>
        <input
          style={inputStyle}
          type="number"
          min={50}
          max={1000}
          value={form.logRetention}
          onChange={(e) => setForm({ ...form, logRetention: Number(e.target.value) || 200 })}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={handleReset} style={{ ...btnStyle, background: "#1a1e2a", color: "#71717a", flex: 1 }}>
            Reset
          </button>
          <button onClick={handleSave} style={{ ...btnStyle, background: "#3b82f6", color: "#fff", flex: 2 }}>
            Save &amp; Reconnect
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#71717a",
  marginBottom: 4,
  marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1e2a",
  border: "1px solid #27272a",
  borderRadius: 8,
  color: "#e4e4e7",
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};
