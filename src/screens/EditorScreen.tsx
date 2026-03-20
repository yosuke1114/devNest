import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconDeviceFloppy,
  IconRefresh,
  IconAlertTriangle,
  IconFilePlus,
  IconPencil,
  IconCheck,
  IconX,
  IconCode,
  IconEye,
  IconLayoutColumns,
  IconBrain,
} from "@tabler/icons-react";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useDocumentStore } from "../stores/documentStore";
import { useProjectStore } from "../stores/projectStore";
import { useIssueStore } from "../stores/issueStore";
import { useUiStore } from "../stores/uiStore";
import { LinkedIssuesPanel } from "../components/editor/LinkedIssuesPanel";
import { MarkdownPreview } from "../components/editor/MarkdownPreview";
import { UnsavedWarningModal } from "../components/editor/UnsavedWarningModal";
import { CodeViewer } from "../components/editor/CodeViewer";
import { FileTreePanel } from "../components/editor/FileTreePanel";
import { AiAssistant } from "../components/ai/AiAssistant";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";
import type { Document, Issue } from "../types";

// Hoisted outside component to avoid recreating on every render
const DOCS_PREFIX_RE = /^docs\//;

export function EditorScreen() {
  const { currentProject, setLastOpenedDocument } = useProjectStore();
  const {
    documents,
    currentDoc,
    linkedIssues,
    saveStatus,
    saveProgress,
    scanDocuments,
    openDocument,
    saveDocument,
    retryPush,
    setDirty,
    listenSaveProgress,
    fetchLinkedIssues,
    createDocument,
    renameDocument,
    openedFile,
    fileTreeNodes,
    fileTreeLoading,
    fetchFileTree,
    openCodeFile,
    saveCodeFile,
    listenCodeSaveProgress,
    codeSaveStatus,
    codeSaveProgress,
  } = useDocumentStore();

  const selectIssue = useIssueStore((s) => s.selectIssue);
  const navigate = useUiStore((s) => s.navigate);

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [pendingDoc, setPendingDoc] = useState<Document | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewWidth, setPreviewWidth] = useState(280);
  const [editorMode, setEditorMode] = useState<"preview" | "md" | "split">("preview");
  const [showAiPanel, setShowAiPanel] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const [treeMode, setTreeMode] = useState<"docs" | "all">("docs");

  const handleSelectCodeFile = useCallback((path: string) => {
    if (!currentProject) return;
    openCodeFile(currentProject.id, path);
  }, [currentProject, openCodeFile]);

  const handleCodeSave = useCallback(async (content: string) => {
    if (!currentProject || openedFile?.type !== "code") return;
    await saveCodeFile(currentProject.id, openedFile.path, content);
  }, [currentProject, openedFile, saveCodeFile]);

  const handleTreeModeAll = useCallback(() => {
    setTreeMode("all");
    if (currentProject && fileTreeNodes.length === 0) {
      fetchFileTree(currentProject.id);
    }
  }, [currentProject, fileTreeNodes.length, fetchFileTree]);

  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const newFileInputRef = useRef<HTMLInputElement>(null);

  const [renamingDocId, setRenamingDocId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = previewWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = dragStartXRef.current - ev.clientX;
      const newWidth = Math.max(160, Math.min(600, dragStartWidthRef.current + delta));
      setPreviewWidth(newWidth);
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    listenSaveProgress().then((fn) => { cleanup = fn; });
    return () => cleanup?.();
  }, [listenSaveProgress]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    listenCodeSaveProgress().then((fn) => { cleanup = fn; });
    return () => cleanup?.();
  }, [listenCodeSaveProgress]);

  useEffect(() => {
    if (currentProject) {
      // ディスクをスキャンして追加・削除されたファイルをDBに反映してから一覧を取得
      scanDocuments(currentProject.id).then(() => {
        if (currentDoc) {
          setSelectedDocId(currentDoc.id);
        } else {
          const lastId = currentProject.last_opened_document_id;
          if (lastId) {
            setSelectedDocId(lastId);
            openDocument(lastId);
          }
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  useEffect(() => {
    if (!editorRef.current || !currentDoc) return;

    viewRef.current?.destroy();

    setPreviewContent(currentDoc.content);

    const view = new EditorView({
      doc: currentDoc.content,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.updateListener.of((update: import("@codemirror/view").ViewUpdate) => {
          if (update.docChanged) {
            setDirty(currentDoc.id, true);
            setPreviewContent(update.state.doc.toString());
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
    (doc: Document) => {
      if (currentDoc?.is_dirty && currentDoc.id !== doc.id) {
        setPendingDoc(doc);
        return;
      }
      setSelectedDocId(doc.id);
      openDocument(doc.id);
      fetchLinkedIssues(doc.id);
      if (currentProject) setLastOpenedDocument(currentProject.id, doc.id);
    },
    [currentDoc, currentProject, openDocument, fetchLinkedIssues, setLastOpenedDocument]
  );

  const handleModalSave = useCallback(async () => {
    if (!pendingDoc || !viewRef.current || !currentDoc) return;
    const content = viewRef.current.state.doc.toString();
    await saveDocument(currentDoc.id, content);
    setSelectedDocId(pendingDoc.id);
    await openDocument(pendingDoc.id);
    fetchLinkedIssues(pendingDoc.id);
    if (currentProject) setLastOpenedDocument(currentProject.id, pendingDoc.id);
    setPendingDoc(null);
  }, [pendingDoc, currentDoc, currentProject, saveDocument, openDocument, fetchLinkedIssues, setLastOpenedDocument]);

  const handleModalDiscard = useCallback(async () => {
    if (!pendingDoc || !currentDoc) return;
    setDirty(currentDoc.id, false);
    setSelectedDocId(pendingDoc.id);
    await openDocument(pendingDoc.id);
    fetchLinkedIssues(pendingDoc.id);
    if (currentProject) setLastOpenedDocument(currentProject.id, pendingDoc.id);
    setPendingDoc(null);
  }, [pendingDoc, currentDoc, currentProject, setDirty, openDocument, fetchLinkedIssues, setLastOpenedDocument]);

  const handleModalCancel = useCallback(() => {
    setPendingDoc(null);
  }, []);

  const handleIssueClick = useCallback(
    (issue: Issue) => {
      selectIssue(issue);
      navigate("issues");
    },
    [selectIssue, navigate]
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

  const handleCreateStart = useCallback(() => {
    setIsCreating(true);
    setNewFileName("");
    setTimeout(() => newFileInputRef.current?.focus(), 50);
  }, []);

  const handleCreateConfirm = useCallback(async () => {
    if (!currentProject || !newFileName.trim()) { setIsCreating(false); return; }
    const name = newFileName.trim().endsWith(".md") ? newFileName.trim() : newFileName.trim() + ".md";
    const relPath = `docs/${name}`;
    try {
      const doc = await createDocument(currentProject.id, relPath);
      setSelectedDocId(doc.id);
      openDocument(doc.id);
      if (currentProject) setLastOpenedDocument(currentProject.id, doc.id);
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? String(e));
    }
    setIsCreating(false);
  }, [currentProject, newFileName, createDocument, openDocument, setLastOpenedDocument]);

  const handleRenameStart = useCallback((doc: Document, e: React.MouseEvent) => {
    e.stopPropagation();
    const basename = doc.path.replace(DOCS_PREFIX_RE, "");
    setRenamingDocId(doc.id);
    setRenameValue(basename.replace(/\.md$/, ""));
    setTimeout(() => renameInputRef.current?.focus(), 50);
  }, []);

  const handleRenameConfirm = useCallback(async (docId: number) => {
    if (!currentProject || !renameValue.trim()) { setRenamingDocId(null); return; }
    const name = renameValue.trim().endsWith(".md") ? renameValue.trim() : renameValue.trim() + ".md";
    const newRelPath = `docs/${name}`;
    try {
      await renameDocument(currentProject.id, docId, newRelPath);
    } catch (e: unknown) {
      alert((e as { message?: string })?.message ?? String(e));
    }
    setRenamingDocId(null);
  }, [currentProject, renameValue, renameDocument]);

  useEffect(() => {
    if (renamingDocId !== null) renameInputRef.current?.select();
  }, [renamingDocId]);

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
    <>
    {pendingDoc && currentDoc && (
      <UnsavedWarningModal
        filename={currentDoc.path}
        onSave={handleModalSave}
        onDiscard={handleModalDiscard}
        onCancel={handleModalCancel}
      />
    )}
    <div data-testid="editor-screen" className="flex flex-1 overflow-hidden">
      {/* ファイルツリー */}
      <aside className="w-[240px] bg-card border-r border-border overflow-auto shrink-0">
        {/* ヘッダー */}
        <div className="border-b border-border shrink-0">
          {/* モード切替 */}
          <div className="flex gap-0.5 p-1.5">
            {(["docs", "all"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => mode === "all" ? handleTreeModeAll() : setTreeMode("docs")}
                className={cn(
                  "flex-1 py-0.5 text-[10px] rounded border transition-colors uppercase tracking-wide",
                  treeMode === mode
                    ? "bg-secondary border-primary text-primary"
                    : "bg-transparent border-border text-muted-foreground hover:bg-secondary/50"
                )}
              >
                {mode === "docs" ? "設計書" : "全ファイル"}
              </button>
            ))}
          </div>
          {/* 設計書モード時のみ + ボタン */}
          {treeMode === "docs" && (
            <div className="flex items-center justify-between px-4 pb-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Documents</span>
              <button
                onClick={handleCreateStart}
                title="新規ファイル"
                className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5 flex"
              >
                <IconFilePlus size={13} />
              </button>
            </div>
          )}
        </div>

        {/* 全ファイルモード */}
        {treeMode === "all" && (
          <FileTreePanel
            nodes={fileTreeNodes}
            loading={fileTreeLoading}
            selectedPath={openedFile?.type === "code" ? openedFile.path : null}
            onSelect={handleSelectCodeFile}
          />
        )}

        {/* 設計書モード */}
        {treeMode === "docs" && <>
        {/* 新規ファイル入力 */}
        {isCreating && (
          <div className="flex items-center p-2 border-b border-border">
            <input
              ref={newFileInputRef}
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateConfirm();
                if (e.key === "Escape") setIsCreating(false);
              }}
              placeholder="ファイル名.md"
              className="flex-1 bg-background border border-primary rounded text-foreground text-xs px-1.5 py-0.5 outline-none"
            />
            <button onClick={handleCreateConfirm} className="text-green-400 cursor-pointer px-1"><IconCheck size={13} /></button>
            <button onClick={() => setIsCreating(false)} className="text-destructive cursor-pointer px-0.5"><IconX size={13} /></button>
          </div>
        )}

        {documents.length === 0 ? (
          <div className="p-4 text-muted-foreground text-[13px]">
            設計書ファイルがありません
          </div>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              className={cn(
                "flex items-center border-l-2 transition-colors",
                selectedDocId === doc.id
                  ? "bg-secondary border-primary"
                  : "border-transparent"
              )}
            >
              {renamingDocId === doc.id ? (
                <div className="flex items-center flex-1 px-2 py-1">
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameConfirm(doc.id);
                      if (e.key === "Escape") setRenamingDocId(null);
                    }}
                    className="flex-1 bg-background border border-primary rounded text-foreground text-xs px-1.5 py-0.5 outline-none"
                  />
                  <button onClick={() => handleRenameConfirm(doc.id)} className="text-green-400 cursor-pointer px-1"><IconCheck size={13} /></button>
                  <button onClick={() => setRenamingDocId(null)} className="text-destructive cursor-pointer px-0.5"><IconX size={13} /></button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => handleSelectDoc(doc)}
                    className={cn(
                      "flex-1 min-w-0 py-2 pl-3.5 pr-1 text-left text-[13px] whitespace-nowrap overflow-hidden text-ellipsis transition-colors",
                      selectedDocId === doc.id ? "text-foreground" : "text-muted-foreground"
                    )}
                    title={doc.path}
                  >
                    {doc.is_dirty && <span className="text-yellow-400 mr-1">●</span>}
                    {doc.path.replace(DOCS_PREFIX_RE, "")}
                    {doc.push_status === "push_failed" && (
                      <IconAlertTriangle size={12} className="text-destructive ml-1 inline align-middle" />
                    )}
                  </button>
                  <button
                    onClick={(e) => handleRenameStart(doc, e)}
                    title="リネーム"
                    className={cn(
                      "text-muted-foreground cursor-pointer px-2 shrink-0 hover:text-foreground transition-colors",
                      selectedDocId === doc.id ? "opacity-100" : "opacity-0"
                    )}
                  >
                    <IconPencil size={11} />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </>}
      </aside>

      {/* エディタ本体 */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* ツールバー */}
        <div className="flex items-center gap-2 px-4 bg-background border-b border-border h-11">
          <span className="flex-1 text-sm text-muted-foreground truncate">
            {currentDoc?.path ?? "ファイルを選択"}
          </span>

          {/* 保存進捗 */}
          {saveProgress && (
            <StatusBadge status={saveProgress.status} />
          )}

          {currentDoc?.push_status === "push_failed" && (
            <Button variant="ghost" size="icon" onClick={handleRetry} title="再プッシュ" className="h-8 w-8">
              <IconRefresh size={16} />
            </Button>
          )}

          {/* 表示モード切替（MD ファイル表示中のみ） */}
          {currentDoc && (
            <div className="flex gap-0.5 bg-popover rounded-md p-0.5">
              {(["preview", "md", "split"] as const).map((mode) => {
                const Icon = mode === "md" ? IconCode : mode === "preview" ? IconEye : IconLayoutColumns;
                const label = mode === "md" ? "MD" : mode === "preview" ? "Preview" : "Split";
                const active = editorMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setEditorMode(mode)}
                    title={label}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border transition-colors",
                      active
                        ? "bg-secondary border-primary text-primary"
                        : "bg-transparent border-transparent text-muted-foreground hover:bg-secondary/50"
                    )}
                  >
                    <Icon size={12} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAiPanel((v) => !v)}
            title="AI アシスタント"
            className={cn("h-8 w-8", showAiPanel && "text-primary")}
          >
            <IconBrain size={16} />
          </Button>

          <Button
            onClick={handleSave}
            disabled={saveStatus === "loading" || !currentDoc}
            size="sm"
          >
            <IconDeviceFloppy size={15} />
            {saveStatus === "loading" ? "保存中…" : "保存"}
          </Button>
        </div>

        {/* コンテンツエリア */}
        {openedFile?.type === "code" ? (
          <CodeViewer
            path={openedFile.path}
            content={openedFile.content}
            truncated={openedFile.truncated}
            totalLines={openedFile.totalLines}
            onSave={handleCodeSave}
            saveStatus={codeSaveStatus}
            saveProgress={codeSaveProgress ?? undefined}
          />
        ) : openedFile?.type === "code-error" ? (
          <div className="flex-1 flex flex-col items-center justify-center text-destructive gap-2 p-8">
            <span className="text-[13px]">{openedFile.path}</span>
            <span className="text-xs text-muted-foreground">{openedFile.error}</span>
          </div>
        ) : openedFile?.type === "doc" ? (
          <div className="flex-1 flex overflow-hidden">
            {/* CodeMirror */}
            <div
              ref={editorRef}
              className="flex-1 overflow-auto text-sm min-w-0"
              style={{ display: editorMode === "preview" ? "none" : "block" }}
            />
            {/* リサイズハンドル（split モードのみ）*/}
            {editorMode === "split" && (
              <div
                onMouseDown={handleResizeMouseDown}
                className="w-1.5 shrink-0 cursor-col-resize transition-colors border-l border-border hover:bg-primary/25"
              />
            )}
            {/* プレビュー */}
            {editorMode !== "md" && (
              <aside
                className="bg-card overflow-hidden flex flex-col shrink-0"
                style={{
                  flex: editorMode === "preview" ? 1 : undefined,
                  width: editorMode === "split" ? previewWidth : undefined,
                }}
              >
                <MarkdownPreview content={previewContent} />
                <LinkedIssuesPanel
                  issues={linkedIssues}
                  loading={false}
                  onIssueClick={handleIssueClick}
                />
              </aside>
            )}
          </div>
        ) : (
          <EmptyState message="左のファイル一覧からドキュメントを選択" />
        )}
      </div>

      {/* AI アシスタントパネル */}
      {showAiPanel && (
        <AiAssistant
          currentFilePath={currentDoc?.path}
          onClose={() => setShowAiPanel(false)}
        />
      )}
    </div>
  </>
  );
}

function StatusBadge({
  status,
}: {
  status: "committing" | "pushing" | "synced" | "push_failed";
}) {
  const configs: Record<typeof status, { label: string; className: string }> = {
    committing: { label: "コミット中…", className: "border-yellow-600/40 bg-yellow-500/10 text-yellow-400" },
    pushing: { label: "プッシュ中…", className: "border-blue-600/40 bg-blue-500/10 text-blue-400" },
    synced: { label: "同期済み", className: "border-green-600/40 bg-green-500/10 text-green-400" },
    push_failed: { label: "プッシュ失敗", className: "border-destructive/40 bg-destructive/10 text-destructive" },
  };
  const cfg = configs[status];
  return (
    <Badge variant="outline" className={cn("text-xs", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground text-[15px]">
      {message}
    </div>
  );
}
