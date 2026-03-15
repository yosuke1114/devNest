import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUiStore } from "../../stores/uiStore";

interface BrowserContext {
  kind: string;
  prNumber?: number;
  issueNumber?: number;
  owner?: string;
  repo?: string;
  affectedDocPaths: string[];
}

interface BrowserContextBarProps {
  url: string;
}

export function BrowserContextBar({ url }: BrowserContextBarProps) {
  const [context, setContext] = useState<BrowserContext | null>(null);
  const { navigate } = useUiStore();

  useEffect(() => {
    if (!url) return;
    invoke<BrowserContext | null>("analyze_browser_context", { url })
      .then(setContext)
      .catch(() => setContext(null));
  }, [url]);

  if (!context || context.kind === "unknown") return null;

  return (
    <div
      data-testid="browser-context-bar"
      style={{
        padding: "8px 12px",
        background: "#161b22",
        borderTop: "1px solid #21262d",
        fontSize: 12,
      }}
    >
      {context.kind === "pull_request" && (
        <div>
          <span style={{ color: "#8b949e" }}>PR #{context.prNumber} — </span>
          <span style={{ color: "#58a6ff" }}>
            {context.owner}/{context.repo}
          </span>
          <button
            data-testid="ai-review-button"
            onClick={() => navigate("pr")}
            style={{
              marginLeft: 12,
              padding: "2px 8px",
              background: "#7c6af7",
              border: "none",
              borderRadius: 4,
              color: "#fff",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            ✨ AIレビュー実行
          </button>
          {context.affectedDocPaths.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <span style={{ color: "#8b949e" }}>影響設計書: </span>
              {context.affectedDocPaths.map((p) => (
                <span
                  key={p}
                  style={{ color: "#79c0ff", marginRight: 8 }}
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {context.kind === "issue" && (
        <div>
          <span style={{ color: "#8b949e" }}>Issue #{context.issueNumber} — </span>
          <span style={{ color: "#58a6ff" }}>
            {context.owner}/{context.repo}
          </span>
        </div>
      )}
    </div>
  );
}
