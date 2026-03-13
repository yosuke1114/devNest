import { useEffect, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import * as ipc from "../lib/ipc";
import type { McpHubStatus, McpServerConfig, PolicyConfig, ToolPolicy } from "../types";

export function McpScreen() {
  const { currentProject } = useProjectStore();
  const [status, setStatus] = useState<McpHubStatus | null>(null);
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [loading, setLoading] = useState(false);

  // New server form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEndpoint, setNewEndpoint] = useState("");
  const [newTransport, setNewTransport] = useState<"stdio" | "sse">("stdio");

  const projectPath = currentProject?.local_path ?? "";

  const reload = async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        ipc.mcpGetStatus(projectPath),
        ipc.mcpGetPolicy(projectPath),
      ]);
      setStatus(s);
      setPolicy(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [projectPath]);

  const handleAddServer = async () => {
    if (!newName.trim() || !newEndpoint.trim()) return;
    const config: McpServerConfig = {
      name: newName.trim(),
      transport: newTransport,
      endpoint: newEndpoint.trim(),
      args: [],
      enabled: true,
    };
    await ipc.mcpAddServer(projectPath, config);
    setShowAddForm(false);
    setNewName(""); setNewEndpoint("");
    reload();
  };

  const handleRemoveServer = async (name: string) => {
    await ipc.mcpRemoveServer(projectPath, name);
    reload();
  };

  const handlePolicyChange = async (newDefault: ToolPolicy) => {
    if (!policy) return;
    const updated: PolicyConfig = { ...policy, default_policy: newDefault };
    await ipc.mcpSavePolicy(projectPath, updated);
    setPolicy(updated);
  };

  if (!currentProject) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div style={{ flex: 1, padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>MCP 統合</h1>
        {loading && <span style={{ color: "#666", fontSize: 13 }}>読み込み中...</span>}
      </div>

      {/* Servers */}
      <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, color: "#bbb" }}>
            MCPサーバー {status && `(${status.servers.length}台)`}
          </h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ padding: "4px 12px", background: "#7c6af7", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            + 追加
          </button>
        </div>

        {showAddForm && (
          <div style={{ background: "#13131f", borderRadius: 6, padding: 16, marginBottom: 16, border: "1px solid #2a2a3a", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="サーバー名"
                style={{ flex: 1, background: "#1e1e2e", border: "1px solid #333", borderRadius: 4, color: "#e0e0e0", padding: "6px 8px", fontSize: 13 }}
              />
              <select
                value={newTransport}
                onChange={(e) => setNewTransport(e.target.value as "stdio" | "sse")}
                style={{ background: "#1e1e2e", border: "1px solid #333", borderRadius: 4, color: "#e0e0e0", padding: "6px 8px", fontSize: 13 }}
              >
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
              </select>
            </div>
            <input
              value={newEndpoint}
              onChange={(e) => setNewEndpoint(e.target.value)}
              placeholder="エンドポイント（コマンドパス or URL）"
              style={{ background: "#1e1e2e", border: "1px solid #333", borderRadius: 4, color: "#e0e0e0", padding: "6px 8px", fontSize: 13 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleAddServer}
                style={{ padding: "6px 16px", background: "#7c6af7", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13 }}
              >
                追加
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                style={{ padding: "6px 12px", background: "#2a2a3a", border: "none", borderRadius: 4, color: "#888", cursor: "pointer", fontSize: 13 }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {status && status.servers.length === 0 && (
          <div style={{ color: "#666", fontSize: 13 }}>MCPサーバーが設定されていません</div>
        )}

        {status && status.servers.map((srv) => (
          <div key={srv.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #2a2a3a" }}>
            <div>
              <span style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14 }}>{srv.name}</span>
              <span style={{ marginLeft: 10, fontSize: 12, color: srv.status.type === "connected" ? "#4caf50" : "#666" }}>
                {srv.status.type === "connected" ? "接続中" : "未接続"}
              </span>
              {srv.tools.length > 0 && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "#888" }}>{srv.tools.length} ツール</span>
              )}
            </div>
            <button
              onClick={() => handleRemoveServer(srv.name)}
              style={{ padding: "3px 10px", background: "transparent", border: "1px solid #333", borderRadius: 4, color: "#888", cursor: "pointer", fontSize: 12 }}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      {/* Policy */}
      {policy && (
        <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
          <h2 style={{ margin: "0 0 16px 0", fontSize: 15, color: "#bbb" }}>ツールポリシー</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#888", fontSize: 13 }}>デフォルトポリシー:</span>
            {(["allow", "require_approval", "deny"] as ToolPolicy[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePolicyChange(p)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: policy.default_policy === p ? "#7c6af7" : "#333",
                  background: policy.default_policy === p ? "#7c6af7" : "transparent",
                  color: policy.default_policy === p ? "#fff" : "#888",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {p === "allow" ? "許可" : p === "require_approval" ? "承認必須" : "拒否"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
