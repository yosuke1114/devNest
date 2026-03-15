import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface BrowserPanelProps {
  url: string;
  panelId: string;
  title?: string;
  onClose: () => void;
  onNavigate?: (url: string) => void;
}

const navBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#8b949e",
  cursor: "pointer",
  fontSize: 16,
  padding: "0 4px",
  lineHeight: 1,
};

export function BrowserPanel({ url: initialUrl, panelId, title, onClose, onNavigate }: BrowserPanelProps) {
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleBack = () => {
    iframeRef.current?.contentWindow?.history.back();
  };

  const handleForward = () => {
    iframeRef.current?.contentWindow?.history.forward();
  };

  const handleNavigate = async (newUrl: string) => {
    setCurrentUrl(newUrl);
    setInputUrl(newUrl);
    await invoke("navigate_browser", { panelId, url: newUrl }).catch(() => {});
    onNavigate?.(newUrl);
  };

  return (
    <div
      data-testid="browser-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#fff",
        border: "1px solid #30363d",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {/* タイトルバー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          background: "#161b22",
          borderBottom: "1px solid #21262d",
          flexShrink: 0,
        }}
      >
        <button onClick={handleBack} aria-label="前のページに戻る" style={navBtnStyle}>‹</button>
        <button onClick={handleForward} aria-label="次のページに進む" style={navBtnStyle}>›</button>
        <span style={{ fontSize: 12, color: "#8b949e", flexShrink: 0 }}>
          {title ?? "ブラウザ"}
        </span>
        <input
          data-testid="browser-url-input"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleNavigate(inputUrl)}
          style={{
            flex: 1,
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 4,
            color: "#e6edf3",
            padding: "3px 8px",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={onClose}
          aria-label="ブラウザパネルを閉じる"
          style={{
            background: "none",
            border: "none",
            color: "#484f58",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ✕
        </button>
      </div>

      {/* iframe */}
      <iframe
        ref={iframeRef}
        data-testid="browser-iframe"
        src={currentUrl}
        title={title ?? currentUrl}
        style={{ flex: 1, border: "none" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
