import { useEffect, useState } from "react";
import { useKanbanStore } from "../stores/kanbanStore";
import { useProjectStore } from "../stores/projectStore";
import type { KanbanCard, NewCard, KanbanPriority } from "../types";

const PRIORITY_COLOR: Record<KanbanPriority, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#6b7280",
};

export function KanbanScreen() {
  const { currentProject } = useProjectStore();
  const { board, status, fetchBoard, moveCard, createCard, deleteCard } = useKanbanStore();
  const [showNewCardCol, setShowNewCardCol] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");

  const projectPath = currentProject?.local_path ?? "";
  const productId = String(currentProject?.id ?? "default");

  useEffect(() => {
    if (projectPath) {
      fetchBoard(projectPath, productId);
    }
  }, [projectPath, productId]);

  if (!currentProject) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
        プロジェクトを選択してください
      </div>
    );
  }

  const handleMove = (card: KanbanCard, direction: "left" | "right") => {
    if (!board) return;
    const sorted = [...board.columns].sort((a, b) => a.order - b.order);
    const ci = sorted.findIndex((c) => c.id === card.column_id);
    const next = direction === "right" ? sorted[ci + 1] : sorted[ci - 1];
    if (next) moveCard(projectPath, productId, card.id, next.id);
  };

  const handleCreateCard = async (colId: string) => {
    if (!newCardTitle.trim()) return;
    const card: NewCard = {
      title: newCardTitle.trim(),
      column_id: colId,
      priority: "medium",
      labels: [],
    };
    await createCard(projectPath, productId, card);
    setNewCardTitle("");
    setShowNewCardCol(null);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 24, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>かんばんボード</h1>
        {status === "loading" && <span style={{ color: "#666", fontSize: 13 }}>読み込み中...</span>}
      </div>

      {/* Board */}
      {board && (
        <div style={{ display: "flex", gap: 16, overflow: "auto", flex: 1, alignItems: "flex-start" }}>
          {[...board.columns].sort((a, b) => a.order - b.order).map((col) => {
            const colCards = board.cards.filter((c) => c.column_id === col.id);
            const overWip = col.wip_limit != null && colCards.length > col.wip_limit;
            return (
              <div
                key={col.id}
                style={{
                  minWidth: 240,
                  width: 240,
                  background: "#1e1e2e",
                  borderRadius: 8,
                  border: `1px solid ${overWip ? "#ef4444" : "#2a2a3a"}`,
                  display: "flex",
                  flexDirection: "column",
                  maxHeight: "100%",
                }}
              >
                {/* Column header */}
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #2a2a3a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#ccc" }}>{col.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {col.wip_limit != null && (
                      <span style={{ fontSize: 11, color: overWip ? "#ef4444" : "#666" }}>
                        {colCards.length}/{col.wip_limit}
                      </span>
                    )}
                    <span style={{ fontSize: 12, background: "#2a2a3a", borderRadius: 4, padding: "1px 6px", color: "#888" }}>
                      {colCards.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {colCards.map((card) => {
                    const sorted = [...board.columns].sort((a, b) => a.order - b.order);
                    const ci = sorted.findIndex((c) => c.id === card.column_id);
                    return (
                      <div
                        key={card.id}
                        style={{
                          background: "#13131f",
                          borderRadius: 6,
                          padding: 10,
                          border: "1px solid #2a2a3a",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: "#e0e0e0", lineHeight: 1.4 }}>{card.title}</span>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: PRIORITY_COLOR[card.priority],
                              flexShrink: 0,
                              marginTop: 4,
                            }}
                          />
                        </div>
                        {card.labels.length > 0 && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                            {card.labels.map((l) => (
                              <span key={l} style={{ fontSize: 10, padding: "1px 5px", background: "#2a2a3a", borderRadius: 3, color: "#888" }}>{l}</span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            {ci > 0 && (
                              <button
                                onClick={() => handleMove(card, "left")}
                                style={{ padding: "2px 6px", background: "#2a2a3a", border: "none", borderRadius: 4, color: "#888", cursor: "pointer", fontSize: 11 }}
                              >
                                ←
                              </button>
                            )}
                            {ci < sorted.length - 1 && (
                              <button
                                onClick={() => handleMove(card, "right")}
                                style={{ padding: "2px 6px", background: "#2a2a3a", border: "none", borderRadius: 4, color: "#888", cursor: "pointer", fontSize: 11 }}
                              >
                                →
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => deleteCard(projectPath, productId, card.id)}
                            style={{ padding: "2px 6px", background: "transparent", border: "none", color: "#444", cursor: "pointer", fontSize: 11 }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add card */}
                {showNewCardCol === col.id ? (
                  <div style={{ padding: 8, borderTop: "1px solid #2a2a3a" }}>
                    <input
                      autoFocus
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateCard(col.id);
                        if (e.key === "Escape") { setShowNewCardCol(null); setNewCardTitle(""); }
                      }}
                      placeholder="カードタイトルを入力..."
                      style={{
                        width: "100%",
                        background: "#13131f",
                        border: "1px solid #7c6af7",
                        borderRadius: 4,
                        color: "#e0e0e0",
                        padding: "6px 8px",
                        fontSize: 12,
                        boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button
                        onClick={() => handleCreateCard(col.id)}
                        style={{ flex: 1, padding: "4px", background: "#7c6af7", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12 }}
                      >
                        追加
                      </button>
                      <button
                        onClick={() => { setShowNewCardCol(null); setNewCardTitle(""); }}
                        style={{ padding: "4px 8px", background: "#2a2a3a", border: "none", borderRadius: 4, color: "#888", cursor: "pointer", fontSize: 12 }}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewCardCol(col.id)}
                    style={{
                      margin: 8,
                      padding: "6px",
                      background: "transparent",
                      border: "1px dashed #2a2a3a",
                      borderRadius: 4,
                      color: "#666",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    + カードを追加
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
