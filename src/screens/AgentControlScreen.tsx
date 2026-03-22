/**
 * Agent Control
 *
 * 4 tabs: キュー, 承認待ち, 実行ログ (Terminal), トリガー設定
 */
import { useState, useEffect } from "react";
import { TerminalScreen } from "./TerminalScreen";
import { useApprovalStore } from "../stores/approvalStore";
import type { ApprovalRequest, RiskLevel } from "../types";

type Tab = "queue" | "approval" | "log" | "triggers";

const TABS: { id: Tab; label: string }[] = [
  { id: "queue",    label: "キュー" },
  { id: "approval", label: "承認待ち" },
  { id: "log",      label: "実行ログ" },
  { id: "triggers", label: "トリガー設定" },
];

function tabBtnStyle(active: boolean) {
  return {
    padding: "6px 16px",
    border: "none",
    borderRadius: "6px 6px 0 0",
    background: active ? "#1e1e32" : "transparent",
    color: active ? "#7c6af7" : "#888",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    borderBottom: active ? "2px solid #7c6af7" : "2px solid transparent",
    transition: "all 0.15s",
  } as const;
}

export function AgentControlScreen() {
  const [tab, setTab] = useState<Tab>("queue");
  const pendingCount = useApprovalStore((s) => s.pendingCount);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* タブバー */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "8px 16px 0",
          borderBottom: "1px solid #2a2a3f",
          background: "#13131f",
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={tabBtnStyle(tab === t.id)}>
            {t.label}
            {t.id === "approval" && pendingCount > 0 && (
              <span style={{
                marginLeft: 6,
                background: "#ef4444",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 8,
                padding: "1px 6px",
                minWidth: 16,
                display: "inline-block",
                textAlign: "center",
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tab === "queue"    ? <QueueTab /> : null}
        {tab === "approval" ? <ApprovalTab /> : null}
        {/* TerminalScreen は常時マウント（xterm バッファ保持） */}
        <div
          style={{
            flex: 1,
            display: tab === "log" ? "flex" : "none",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <TerminalScreen />
        </div>
        {tab === "triggers" ? <TriggersTab /> : null}
      </div>
    </div>
  );
}

// ─── Queue tab ────────────────────────────────────────────────────────────────

function QueueTab() {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600, color: "#e0e0e0" }}>
        タスクキュー
      </h2>
      <div
        style={{
          background: "#1e1e32",
          border: "1px solid #2a2a3f",
          borderRadius: 8,
          padding: 20,
          color: "#666",
          fontSize: 14,
          textAlign: "center",
        }}
      >
        キューにタスクはありません
      </div>
      <div style={{ marginTop: 16, fontSize: 13, color: "#555" }}>
        Claude Code によるタスク実行結果は「実行ログ」タブで確認できます。
      </div>
    </div>
  );
}

// ─── Approval tab ─────────────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#dc2626",
};

function ApprovalTab() {
  const { pending, listStatus, loadPending, decide, cleanup, listenEvents } = useApprovalStore();
  const [decidingId, setDecidingId] = useState<string | null>(null);

  useEffect(() => {
    loadPending();
    const unlisten = listenEvents();
    // 30秒ごとに期限切れクリーンアップ
    const timer = setInterval(() => { cleanup(); }, 30_000);
    return () => { unlisten(); clearInterval(timer); };
  }, [loadPending, listenEvents, cleanup]);

  const handleDecide = async (req: ApprovalRequest, approved: boolean) => {
    setDecidingId(req.request_id);
    await decide({
      request_id: req.request_id,
      approved,
      reason: null,
    });
    setDecidingId(null);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600, color: "#e0e0e0" }}>
        承認待ち
      </h2>

      {listStatus === "loading" && (
        <div style={{ color: "#666", fontSize: 14, textAlign: "center", padding: 20 }}>
          読み込み中...
        </div>
      )}

      {pending.length === 0 && listStatus !== "loading" && (
        <div
          style={{
            background: "#1e1e32",
            border: "1px solid #2a2a3f",
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ color: "#666", fontSize: 14, textAlign: "center", marginBottom: 16 }}>
            承認待ちのアクションはありません
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#555",
              padding: "10px 14px",
              background: "#13131f",
              borderRadius: 6,
              border: "1px solid #2a2a3f",
            }}
          >
            MCP ポリシーで「承認必須」に設定されたツールの実行リクエストがここに表示されます。
            設定 &gt; ポリシー でツールアクセスポリシーを変更できます。
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pending.map((req) => (
            <div
              key={req.request_id}
              data-testid="approval-item"
              style={{
                background: "#1e1e32",
                border: "1px solid #2a2a3f",
                borderRadius: 8,
                padding: 16,
              }}
            >
              {/* ヘッダー行 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "#e0e0e0" }}>
                    {req.tool_name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: `${RISK_COLORS[req.risk_level]}22`,
                      color: RISK_COLORS[req.risk_level],
                      textTransform: "uppercase",
                    }}
                  >
                    {req.risk_level}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "#555" }}>
                  {req.created_at}
                </span>
              </div>

              {/* Worker ID */}
              {req.worker_id && (
                <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>
                  Worker: {req.worker_id.slice(0, 12)}...
                </div>
              )}

              {/* ツール入力のプレビュー */}
              <div
                style={{
                  background: "#13131f",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontFamily: '"SF Mono", monospace',
                  color: "#aaa",
                  maxHeight: 80,
                  overflow: "auto",
                  marginBottom: 12,
                  border: "1px solid #2a2a3f",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {formatToolInput(req.tool_input)}
              </div>

              {/* ボタン */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  data-testid="approval-approve-btn"
                  onClick={() => handleDecide(req, true)}
                  disabled={decidingId === req.request_id}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: "#10b981",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    opacity: decidingId === req.request_id ? 0.5 : 1,
                  }}
                >
                  承認
                </button>
                <button
                  data-testid="approval-reject-btn"
                  onClick={() => handleDecide(req, false)}
                  disabled={decidingId === req.request_id}
                  style={{
                    flex: 1,
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "1px solid #ef4444",
                    background: "transparent",
                    color: "#ef4444",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    opacity: decidingId === req.request_id ? 0.5 : 1,
                  }}
                >
                  拒否
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatToolInput(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

// ─── Triggers tab ─────────────────────────────────────────────────────────────

interface TriggerConfig {
  id: string;
  name: string;
  event: string;
  enabled: boolean;
}

const DEFAULT_TRIGGERS: TriggerConfig[] = [
  { id: "1", name: "PR オープン時にレビュー", event: "pr_opened", enabled: false },
  { id: "2", name: "CI 失敗時にデバッグ", event: "ci_fail", enabled: false },
  { id: "3", name: "コンフリクト検出時に解決提案", event: "conflict_detected", enabled: false },
  { id: "4", name: "設計書の鮮度低下時に更新", event: "doc_stale", enabled: false },
];

function TriggersTab() {
  const [triggers, setTriggers] = useState<TriggerConfig[]>(DEFAULT_TRIGGERS);

  const toggle = (id: string) => {
    setTriggers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t))
    );
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "#e0e0e0" }}>
        トリガー設定
      </h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>
        特定のイベントに応じて Claude Code エージェントを自動起動します。
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {triggers.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#1e1e32",
              border: "1px solid #2a2a3f",
              borderRadius: 8,
              padding: "12px 16px",
            }}
          >
            <div>
              <div style={{ fontSize: 14, color: "#e0e0e0", fontWeight: 500 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                イベント: {t.event}
              </div>
            </div>
            {/* Toggle */}
            <button
              onClick={() => toggle(t.id)}
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: t.enabled ? "#7c6af7" : "#2a2a3f",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: t.enabled ? 23 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: "#fff",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
