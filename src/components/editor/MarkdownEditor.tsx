import { useEffect, useRef } from "react";

interface MarkdownEditorProps {
  docId: number | null;
  initialContent: string;
  onContentChange?: (content: string) => void;
  onReady?: (getValue: () => string) => void;
}

export function MarkdownEditor({
  docId,
  initialContent,
  onContentChange,
  onReady,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (docId === null) return;

    // CodeMirror 6 は jsdom 環境では動作しないため、
    // 実際のブラウザ環境でのみ初期化する。
    // onReady に getValue 関数を渡す。
    let view: { state: { doc: { toString(): string } }; destroy(): void } | null = null;

    const initEditor = async () => {
      try {
        const { EditorView, basicSetup } = await import("codemirror");
        const { markdown } = await import("@codemirror/lang-markdown");
        const { oneDark } = await import("@codemirror/theme-one-dark");
        const { EditorState } = await import("@codemirror/state");

        if (!containerRef.current) return;

        const updateListener = EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onContentChange?.(update.state.doc.toString());
          }
        });

        view = new EditorView({
          state: EditorState.create({
            doc: initialContent,
            extensions: [
              basicSetup,
              markdown(),
              oneDark,
              updateListener,
              EditorView.lineWrapping,
            ],
          }),
          parent: containerRef.current,
        });

        onReady?.(() => view?.state.doc.toString() ?? "");
      } catch {
        // jsdom 環境では codemirror が動作しないため無視
      }
    };

    initEditor();

    return () => {
      view?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  if (docId === null) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
          fontSize: 14,
        }}
      >
        ドキュメントを選択してください
      </div>
    );
  }

  return (
    <div
      data-testid="markdown-editor"
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "auto",
        height: "100%",
      }}
    />
  );
}
