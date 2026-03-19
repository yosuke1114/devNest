import { useEffect, useRef, useState, useCallback } from "react";
import { EditorView, lineNumbers, highlightActiveLine, keymap } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, historyKeymap, history, indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { IconAlertTriangle, IconTerminal, IconEdit, IconEye, IconDeviceFloppy } from "@tabler/icons-react";
import { getLanguageExtension, getLangLabel } from "../../lib/langDetect";
import { useUiStore } from "../../stores/uiStore";
import type { CodeSaveProgressPayload } from "../../stores/documentStore";

const MAX_DISPLAY_LINES = 1000;

interface CodeViewerProps {
  path: string;
  content: string;
  truncated: boolean;
  totalLines: number;
  onSave?: (content: string) => Promise<void>;
  saveStatus?: "idle" | "loading" | "success" | "error";
  saveProgress?: CodeSaveProgressPayload;
}

export function CodeViewer({
  path, content, truncated, totalLines, onSave, saveStatus, saveProgress,
}: CodeViewerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartment = useRef(new Compartment());
  const [ready, setReady] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const navigate = useUiStore((s) => s.navigate);

  // path / content が変わったときエディタを構築（常に read-only で初期化）
  useEffect(() => {
    if (!editorRef.current) return;
    setEditMode(false);
    setIsDirty(false);
    setReady(false);
    viewRef.current?.destroy();
    viewRef.current = null;

    getLanguageExtension(path).then((langExt) => {
      if (!editorRef.current) return;

      const state = EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          oneDark,
          ...langExt,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px" },
            ".cm-scroller": { overflow: "auto", fontFamily: "monospace" },
          }),
          // Compartment で read-only / editable を動的切り替え
          editableCompartment.current.of([
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) setIsDirty(true);
          }),
        ],
      });

      const view = new EditorView({ state, parent: editorRef.current });
      viewRef.current = view;
      setReady(true);
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [path, content]);

  // EDIT/VIEW 切り替え — Compartment を同期的に reconfigure
  const handleToggleEdit = useCallback(() => {
    const next = !editMode;
    setEditMode(next);
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: editableCompartment.current.reconfigure(
        next
          ? [EditorState.readOnly.of(false), EditorView.editable.of(true)]
          : [EditorState.readOnly.of(true), EditorView.editable.of(false)]
      ),
    });
    if (next) setTimeout(() => viewRef.current?.focus(), 30);
    if (!next) setIsDirty(false);
  }, [editMode]);

  // Cmd+S で保存
  useEffect(() => {
    if (!editMode || !onSave) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const cur = viewRef.current?.state.doc.toString() ?? content;
        onSave(cur).then(() => setIsDirty(false));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode, onSave, content]);

  const handleSave = useCallback(() => {
    if (!onSave) return;
    const cur = viewRef.current?.state.doc.toString() ?? content;
    onSave(cur).then(() => setIsDirty(false));
  }, [onSave, content]);

  const langLabel = getLangLabel(path);

  const progressLabel = (() => {
    if (saveStatus === "loading") {
      const s = saveProgress?.status;
      if (s === "committing") return "コミット中…";
      if (s === "pushing") return "プッシュ中…";
      return "保存中…";
    }
    if (saveStatus === "success" || saveProgress?.status === "synced") return "同期済み";
    if (saveProgress?.status === "push_failed") return "プッシュ失敗";
    if (saveStatus === "error") return "保存エラー";
    if (isDirty) return "未保存";
    return null;
  })();

  const progressColor =
    saveStatus === "error" || saveProgress?.status === "push_failed" ? "#e74c3c"
    : saveProgress?.status === "synced" || saveStatus === "success" ? "#2ecc71"
    : "#f0a500";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      {/* ツールバー */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 16px", background: "#1a1a2e",
        borderBottom: "1px solid #2a2a3a", height: 36, flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 13, color: "#aaa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {path}
        </span>

        {progressLabel && (
          <span style={{ fontSize: 11, color: progressColor }}>{progressLabel}</span>
        )}

        <span style={{ fontSize: 11, color: "#7c6cf2", background: "#7c6cf220", padding: "2px 7px", borderRadius: 4, border: "1px solid #7c6cf240" }}>
          {langLabel}
        </span>
        <span style={{ fontSize: 11, color: "#555" }}>
          {totalLines.toLocaleString()} lines
        </span>

        {onSave && (
          <button
            onClick={handleToggleEdit}
            title={editMode ? "読み取り専用に戻す" : "編集モード"}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: editMode ? "#7c6cf220" : "transparent",
              border: `1px solid ${editMode ? "#7c6cf2" : "#3a3a52"}`,
              borderRadius: 5, color: editMode ? "#7c6cf2" : "#888",
              cursor: "pointer", fontSize: 12, padding: "3px 8px",
            }}
          >
            {editMode ? <IconEye size={13} /> : <IconEdit size={13} />}
            {editMode ? "VIEW" : "EDIT"}
          </button>
        )}

        {editMode && onSave && (
          <button
            onClick={handleSave}
            disabled={saveStatus === "loading" || !isDirty}
            title="保存 (Cmd+S)"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: isDirty ? "#7c6cf2" : "#2a2a42",
              border: "none", borderRadius: 5,
              color: isDirty ? "#fff" : "#555",
              cursor: isDirty ? "pointer" : "default",
              fontSize: 12, padding: "3px 10px",
            }}
          >
            <IconDeviceFloppy size={13} />
            保存
          </button>
        )}

        <button
          onClick={() => navigate("terminal")}
          title="TerminalScreen を開く"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "transparent", border: "1px solid #3a3a52",
            borderRadius: 5, color: "#888", cursor: "pointer",
            fontSize: 12, padding: "3px 8px",
          }}
        >
          <IconTerminal size={13} />
          OPEN IN TERMINAL
        </button>
      </div>

      {truncated && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 16px", background: "#2a1a0a",
          borderBottom: "1px solid #f0a50040", color: "#f0a500",
          fontSize: 12, flexShrink: 0,
        }}>
          <IconAlertTriangle size={13} />
          ファイルが大きすぎます。先頭 {MAX_DISPLAY_LINES.toLocaleString()} 行を表示しています（全 {totalLines.toLocaleString()} 行）
        </div>
      )}

      <div
        ref={editorRef}
        style={{ flex: 1, overflow: "hidden", opacity: ready ? 1 : 0, transition: "opacity 0.1s" }}
      />
    </div>
  );
}
