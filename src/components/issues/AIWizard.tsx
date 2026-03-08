import { useEffect, useState } from "react";
import { IconSparkles } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { IssueDraft, IssueDraftPatch } from "../../types";

interface AIWizardProps {
  drafts: IssueDraft[];
  currentDraft: IssueDraft | null;
  streamBuffer: string;
  generating: boolean;
  onSelectDraft: (d: IssueDraft | null) => void;
  onUpdateDraft: (patch: IssueDraftPatch) => Promise<void>;
  onGenerate: (draftId: number) => Promise<void>;
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#666",
  fontSize: 14,
  padding: 32,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#888",
  marginBottom: 6,
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

export function AIWizard({
  drafts,
  currentDraft,
  streamBuffer,
  generating,
  onSelectDraft,
  onUpdateDraft,
  onGenerate,
}: AIWizardProps) {
  const [title, setTitle] = useState(currentDraft?.title ?? "");
  const [context, setContext] = useState(currentDraft?.wizard_context ?? "");

  useEffect(() => {
    setTitle(currentDraft?.title ?? "");
    setContext(currentDraft?.wizard_context ?? "");
  }, [currentDraft?.id]);

  const handleBlur = () => {
    if (!currentDraft) return;
    onUpdateDraft({ id: currentDraft.id, title, wizard_context: context });
  };

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* ドラフト一覧 */}
      <aside
        style={{
          width: 200,
          borderRight: "1px solid #2a2a3a",
          overflow: "auto",
          background: "#161622",
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            fontSize: 11,
            color: "#888",
            textTransform: "uppercase",
          }}
        >
          Drafts
        </div>
        {drafts.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelectDraft(d)}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              background: currentDraft?.id === d.id ? "#2a2a42" : "transparent",
              border: "none",
              borderLeft:
                currentDraft?.id === d.id
                  ? "2px solid #7c6cf2"
                  : "2px solid transparent",
              color: "#ccc",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {d.title || "（無題）"}
          </button>
        ))}
      </aside>

      {/* エディタ */}
      {currentDraft ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: 0,
            overflow: "hidden",
          }}
        >
          {/* 入力フォーム */}
          <div
            style={{
              flex: 1,
              padding: 20,
              overflow: "auto",
              borderRight: "1px solid #2a2a3a",
            }}
          >
            <label style={labelStyle}>タイトル</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleBlur}
              placeholder="Issue のタイトル"
              style={inputStyle}
            />

            <label style={{ ...labelStyle, marginTop: 16 }}>
              コンテキスト（何を解決したいか）
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onBlur={handleBlur}
              rows={8}
              placeholder="Issue の背景・目的・詳細を自由に記入してください"
              style={{ ...inputStyle, resize: "vertical" }}
            />

            <button
              onClick={() => onGenerate(currentDraft.id)}
              disabled={generating}
              style={{
                marginTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#7c6cf2",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 18px",
                cursor: generating ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 14,
                opacity: generating ? 0.7 : 1,
              }}
            >
              <IconSparkles size={16} />
              {generating ? "生成中…" : "AI で本文を生成"}
            </button>
          </div>

          {/* プレビュー */}
          <div
            style={{
              flex: 1,
              padding: 20,
              overflow: "auto",
              background: "#161622",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#888",
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              Preview
            </div>
            <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
              {streamBuffer ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamBuffer}
                </ReactMarkdown>
              ) : (
                <span style={{ color: "#555" }}>
                  生成ボタンを押すと AI が本文を生成します
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ...centerStyle, flex: 1 }}>
          ドラフトを選択するか、新規作成してください
        </div>
      )}
    </div>
  );
}
