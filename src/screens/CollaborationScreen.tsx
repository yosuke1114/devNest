import { useEffect, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import * as ipc from "../lib/ipc";
import type { KnowledgeEntry, TeamDashboard } from "../types";

type Tab = "knowledge" | "team";

export function CollaborationScreen() {
  const { currentProject } = useProjectStore();
  const [tab, setTab] = useState<Tab>("knowledge");
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [teamDashboard, setTeamDashboard] = useState<TeamDashboard | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // New entry form
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<string>("design_decision");
  const [newTags, setNewTags] = useState("");

  const projectPath = currentProject?.local_path ?? "";

  const loadEntries = async (q?: string) => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const result = q?.trim()
        ? await ipc.knowledgeSearch(projectPath, q.trim())
        : await ipc.knowledgeList(projectPath);
      setEntries(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadTeam = async () => {
    if (!projectPath) return;
    try {
      const d = await ipc.teamGetDashboard(projectPath);
      setTeamDashboard(d);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (projectPath) {
      loadEntries();
      loadTeam();
    }
  }, [projectPath]);

  const handleAddEntry = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    await ipc.knowledgeAdd(
      projectPath,
      newTitle.trim(),
      newContent.trim(),
      newType,
      newTags.split(",").map((t) => t.trim()).filter(Boolean),
      [],
      "user",
    );
    setShowForm(false);
    setNewTitle(""); setNewContent(""); setNewTags(""); setNewType("design_decision");
    loadEntries();
  };

  if (!currentProject) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        プロジェクトを選択してください
      </div>
    );
  }

  const TYPE_LABELS: Record<string, string> = {
    design_decision: "設計判断",
    retro_learning: "振り返り",
    tech_note: "技術メモ",
    postmortem: "ポストモーテム",
  };
  const TYPE_COLORS: Record<string, string> = {
    design_decision: "#7c6af7",
    retro_learning: "#4caf50",
    tech_note: "#2196f3",
    postmortem: "#f44336",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 24, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>コラボレーション</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {(["knowledge", "team"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "4px 14px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: tab === t ? "#7c6af7" : "#333",
                background: tab === t ? "#7c6af7" : "transparent",
                color: tab === t ? "#fff" : "#888",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {t === "knowledge" ? "ナレッジベース" : "チーム"}
            </button>
          ))}
        </div>
      </div>

      {tab === "knowledge" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Search + Add */}
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") loadEntries(query); }}
              placeholder="ナレッジを検索..."
              style={{
                flex: 1,
                background: "#1e1e2e",
                border: "1px solid #333",
                borderRadius: 6,
                color: "#e0e0e0",
                padding: "8px 12px",
                fontSize: 13,
              }}
            />
            <button
              onClick={() => loadEntries(query)}
              style={{ padding: "8px 16px", background: "#2a2a3a", border: "none", borderRadius: 6, color: "#ccc", cursor: "pointer", fontSize: 13 }}
            >
              検索
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              style={{ padding: "8px 16px", background: "#7c6af7", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontSize: 13 }}
            >
              + 追加
            </button>
          </div>

          {/* New entry form */}
          {showForm && (
            <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 16, border: "1px solid #2a2a3a", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="タイトル"
                  style={{ flex: 1, background: "#13131f", border: "1px solid #333", borderRadius: 4, color: "#e0e0e0", padding: "6px 8px", fontSize: 13 }}
                />
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  style={{ background: "#13131f", border: "1px solid #333", borderRadius: 4, color: "#e0e0e0", padding: "6px 8px", fontSize: 13 }}
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="内容"
                rows={4}
                style={{ background: "#13131f", border: "1px solid #333", borderRadius: 4, color: "#e0e0e0", padding: "6px 8px", fontSize: 13, resize: "vertical" }}
              />
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="タグ（カンマ区切り）"
                style={{ background: "#13131f", border: "1px solid #333", borderRadius: 4, color: "#e0e0e0", padding: "6px 8px", fontSize: 13 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleAddEntry}
                  style={{ padding: "6px 16px", background: "#7c6af7", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13 }}
                >
                  保存
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  style={{ padding: "6px 12px", background: "#2a2a3a", border: "none", borderRadius: 4, color: "#888", cursor: "pointer", fontSize: 13 }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {/* Entries list */}
          {loading && <div style={{ color: "#666" }}>読み込み中...</div>}
          {!loading && entries.length === 0 && (
            <div style={{ color: "#666", textAlign: "center", padding: 40 }}>ナレッジがありません</div>
          )}
          {entries.map((e) => (
            <div key={e.id} style={{ background: "#1e1e2e", borderRadius: 8, padding: 16, border: "1px solid #2a2a3a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: (TYPE_COLORS[e.entry_type] ?? "#666") + "22",
                  color: TYPE_COLORS[e.entry_type] ?? "#666",
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  {TYPE_LABELS[e.entry_type] ?? e.entry_type}
                </span>
                <span style={{ fontWeight: 600, color: "#e0e0e0", fontSize: 14 }}>{e.title}</span>
                <span style={{ marginLeft: "auto", color: "#555", fontSize: 11 }}>{e.created_at.slice(0, 10)}</span>
              </div>
              <p style={{ margin: "0 0 8px 0", color: "#aaa", fontSize: 13, lineHeight: 1.5 }}>
                {e.content.length > 200 ? e.content.slice(0, 200) + "..." : e.content}
              </p>
              {e.tags.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {e.tags.map((t) => (
                    <span key={t} style={{ padding: "1px 6px", background: "#2a2a3a", borderRadius: 3, fontSize: 11, color: "#888" }}>#{t}</span>
                  ))}
                </div>
              )}
              {e.comments.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>{e.comments.length} コメント</div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "team" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Team stats */}
          {teamDashboard && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>オープン PR</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#7c6af7" }}>{teamDashboard.total_open_prs}</div>
              </div>
              <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>オープン Issue</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#7c6af7" }}>{teamDashboard.total_open_issues}</div>
              </div>
            </div>
          )}

          {/* Pending reviews */}
          <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: 15, color: "#bbb" }}>レビュー待ち</h2>
            {(!teamDashboard || teamDashboard.pending_reviews.length === 0) ? (
              <div style={{ color: "#666", fontSize: 13 }}>レビュー待ちなし</div>
            ) : (
              teamDashboard.pending_reviews.map((r) => (
                <div key={r.pr_number} style={{ padding: "8px 0", borderBottom: "1px solid #2a2a3a" }}>
                  <span style={{ color: "#7c6af7", fontSize: 12 }}>#{r.pr_number}</span>
                  <span style={{ marginLeft: 8, color: "#e0e0e0", fontSize: 13 }}>{r.title}</span>
                  <span style={{ marginLeft: 8, color: "#666", fontSize: 11 }}>by {r.author}</span>
                </div>
              ))
            )}
          </div>

          {/* Members */}
          <div style={{ background: "#1e1e2e", borderRadius: 8, padding: 20, border: "1px solid #2a2a3a" }}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: 15, color: "#bbb" }}>チームメンバー</h2>
            {(!teamDashboard || teamDashboard.members.length === 0) ? (
              <div style={{ color: "#666", fontSize: 13 }}>GitHub 連携後に表示されます</div>
            ) : (
              teamDashboard.members.map((m) => (
                <div key={m.github_username} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #2a2a3a" }}>
                  <span style={{ color: "#e0e0e0", fontSize: 13 }}>@{m.github_username}</span>
                  <div style={{ display: "flex", gap: 16, color: "#666", fontSize: 12 }}>
                    <span>{m.recent_commits} コミット</span>
                    <span>{m.open_prs} PR</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
