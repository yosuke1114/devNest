import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconDeviceFloppy,
  IconRefresh,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useDocumentStore } from "../stores/documentStore";
import { useProjectStore } from "../stores/projectStore";
import type { Document } from "../types";

export function EditorScreen() {
  const { currentProject } = useProjectStore();
  const {
    documents,
    currentDoc,
    saveStatus,
    saveProgress,
    fetchDocuments,
    openDocument,
    saveDocument,
    retryPush,
    setDirty,
    listenSaveProgress,
  } = useDocumentStore();

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  // イベントリスナー登録
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    listenSaveProgress().then((fn) => { cleanup = fn; });
    return () => cleanup?.();
  }, [listenSaveProgress]);

  // プロジェクト切り替え時にドキュメント一覧を取得
  useEffect(() => {
    if (currentProject) {
      fetchDocuments(currentProject.id).then(() => {
        // last_opened_document_id を選択
        const lastId = currentProject.last_opened_document_id;
        if (lastId) {
          setSelectedDocId(lastId);
          openDocument(lastId);
        }
      });
    }
  }, [currentProject?.id]);

  // ドキュメント選択時に CodeMirror を初期化
  useEffect(() => {
    if (!editorRef.current || !currentDoc) return;

    // 既存の editor を破棄
    viewRef.current?.destroy();

    const view = new EditorView({
      doc: currentDoc.content,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.updateListener.of((update: import("@codemirror/view").ViewUpdate) => {
          if (update.docChanged) {
            setDirty(currentDoc.id, true);
          }
        }),
      ],
      parent: editorRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [currentDoc?.id]);

  const handleSelectDoc = useCallback(
    async (doc: Document) => {
      setSelectedDocId(doc.id);
      await openDocument(doc.id);
    },
    [openDocument]
  );

  const handleSave = useCallback(async () => {
    if (!viewRef.current || !currentDoc) return;
    const content = viewRef.current.state.doc.toString();
    await saveDocument(currentDoc.id, content);
  }, [currentDoc, saveDocument]);

  const handleRetry = useCallback(async () => {
    if (!currentDoc) return;
    await retryPush(currentDoc.id);
  }, [currentDoc, retryPush]);

  // Ctrl/Cmd+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  if (!currentProject) {
    return (
      <EmptyState message="プロジェクトを選択してください" />
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* ファイルツリー */}
      <aside
        style={{
          width: 240,
          background: "#161622",
          borderRight: "1px solid #2a2a3a",
          overflow: "auto",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            fontSize: 11,
            color: "#888",
            borderBottom: "1px solid #2a2a3a",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Documents
        </div>
        {documents.length === 0 ? (
          <div style={{ padding: 16, color: "#666", fontSize: 13 }}>
            設計書ファイルがありません
          </div>
        ) : (
          documents.map((doc) => (
            <button
              key={doc.id}
              onClick={() => handleSelectDoc(doc)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 16px",
                background:
                  selectedDocId === doc.id ? "#2a2a42" : "transparent",
                border: "none",
                borderLeft:
                  selectedDocId === doc.id
                    ? "2px solid #7c6cf2"
                    : "2px solid transparent",
                color: selectedDocId === doc.id ? "#e0e0e0" : "#aaa",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={doc.path}
            >
              {doc.is_dirty && (
                <span style={{ color: "#f0a500", marginRight: 4 }}>●</span>
              )}
              {doc.path.replace(/^docs\//, "")}
              {doc.push_status === "push_failed" && (
                <IconAlertTriangle
                  size={12}
                  color="#e74c3c"
                  style={{ marginLeft: 4, verticalAlign: "middle" }}
                />
              )}
            </button>
          ))
        )}
      </aside>

      {/* エディタ本体 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* ツールバー */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            background: "#1a1a2e",
            borderBottom: "1px solid #2a2a3a",
            height: 44,
          }}
        >
          <span style={{ flex: 1, fontSize: 14, color: "#aaa" }}>
            {currentDoc?.path ?? "ファイルを選択"}
          </span>

          {/* 保存進捗 */}
          {saveProgress && (
            <StatusBadge status={saveProgress.status} />
          )}

          {currentDoc?.push_status === "push_failed" && (
            <button onClick={handleRetry} style={iconBtnStyle} title="再プッシュ">
              <IconRefresh size={16} />
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saveStatus === "loading" || !currentDoc}
            style={{
              ...iconBtnStyle,
              background: "#7c6cf2",
              color: "#fff",
              padding: "4px 12px",
              borderRadius: 4,
              gap: 4,
              display: "flex",
              alignItems: "center",
              opacity: saveStatus === "loading" ? 0.7 : 1,
            }}
          >
            <IconDeviceFloppy size={16} />
            保存
          </button>
        </div>

        {/* CodeMirror */}
        {currentDoc ? (
          <div
            ref={editorRef}
            style={{ flex: 1, overflow: "auto", fontSize: 14 }}
          />
        ) : (
          <EmptyState message="左のファイル一覧からドキュメントを選択" />
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "committing" | "pushing" | "synced" | "push_failed";
}) {
  const configs: Record<typeof status, { label: string; color: string }> = {
    committing: { label: "コミット中…", color: "#f0a500" },
    pushing: { label: "プッシュ中…", color: "#3498db" },
    synced: { label: "同期済み", color: "#2ecc71" },
    push_failed: { label: "プッシュ失敗", color: "#e74c3c" },
  };
  const cfg = configs[status];
  return (
    <span
      style={{
        fontSize: 12,
        color: cfg.color,
        background: `${cfg.color}20`,
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${cfg.color}40`,
      }}
    >
      {cfg.label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#666",
        fontSize: 15,
      }}
    >
      {message}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #3a3a52",
  color: "#aaa",
  cursor: "pointer",
  borderRadius: 4,
  padding: 4,
  display: "flex",
  alignItems: "center",
};
