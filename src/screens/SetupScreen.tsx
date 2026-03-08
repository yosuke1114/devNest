import { useState } from "react";
import { IconFolder, IconPlus, IconTrash } from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";
import type { Project } from "../types";

export function SetupScreen() {
  const { projects, currentProject, createProject, deleteProject, selectProject } =
    useProjectStore();
  const { navigate } = useUiStore();

  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(projects.length === 0);

  const handleCreate = async () => {
    if (!name.trim() || !localPath.trim()) {
      setErrorMsg("プロジェクト名とパスを入力してください");
      return;
    }
    setCreating(true);
    setErrorMsg(null);
    try {
      await createProject(name.trim(), localPath.trim());
      setName("");
      setLocalPath("");
      setShowForm(false);
      navigate("editor");
    } catch (e) {
      const err = e as { message?: string };
      setErrorMsg(err.message ?? "プロジェクト作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (p: Project) => {
    selectProject(p);
    navigate("editor");
  };

  const handleDelete = async (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${p.name}" を削除しますか？`)) return;
    await deleteProject(p.id);
  };

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        プロジェクト管理
      </h1>
      <p style={{ color: "#888", marginBottom: 32 }}>
        ローカルの git リポジトリを DevNest に登録します。
      </p>

      {/* 既存プロジェクト一覧 */}
      {projects.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            登録済みプロジェクト
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => handleSelect(p)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  background: currentProject?.id === p.id ? "#2a2a42" : "#1e1e30",
                  borderRadius: 8,
                  cursor: "pointer",
                  border: currentProject?.id === p.id
                    ? "1px solid #7c6cf2"
                    : "1px solid #2a2a3a",
                  gap: 12,
                }}
              >
                <IconFolder size={20} color="#7c6cf2" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                    {p.local_path}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(p, e)}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "#666",
                    padding: 4,
                    borderRadius: 4,
                  }}
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 追加フォーム */}
      {showForm ? (
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            新規プロジェクト追加
          </h2>

          {errorMsg && (
            <div
              style={{
                background: "#3a1a1a",
                border: "1px solid #c0392b",
                borderRadius: 6,
                padding: "10px 14px",
                color: "#e74c3c",
                marginBottom: 16,
                fontSize: 14,
                whiteSpace: "pre-line",
              }}
            >
              {errorMsg}
            </div>
          )}

          <label style={labelStyle}>プロジェクト名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="MyApp"
            style={inputStyle}
          />

          <label style={labelStyle}>
            ローカルパス（git リポジトリのルートディレクトリ）
          </label>
          <input
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="/Users/you/projects/myapp"
            style={inputStyle}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                background: "#7c6cf2",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 20px",
                cursor: creating ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 14,
                opacity: creating ? 0.7 : 1,
              }}
            >
              {creating ? "作成中…" : "プロジェクトを作成"}
            </button>
            {projects.length > 0 && (
              <button
                onClick={() => setShowForm(false)}
                style={{
                  background: "transparent",
                  border: "1px solid #3a3a52",
                  color: "#888",
                  borderRadius: 6,
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                キャンセル
              </button>
            )}
          </div>
        </section>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#2a2a42",
            border: "1px dashed #4a4a62",
            borderRadius: 8,
            padding: "12px 20px",
            color: "#888",
            cursor: "pointer",
            fontSize: 14,
            width: "100%",
          }}
        >
          <IconPlus size={16} />
          新規プロジェクトを追加
        </button>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#aaa",
  marginBottom: 6,
  marginTop: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1a2e",
  border: "1px solid #3a3a52",
  borderRadius: 6,
  padding: "8px 12px",
  color: "#e0e0e0",
  fontSize: 14,
  boxSizing: "border-box",
};
