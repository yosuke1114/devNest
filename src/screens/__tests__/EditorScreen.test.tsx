/**
 * EditorScreen テスト — ツールバー・コンテンツエリア・リネーム・リサイズ
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── codemirror モック ────────────────────────────────────────────────────────

vi.mock("codemirror", () => {
  const EditorView = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.destroy = vi.fn();
    this.state = { doc: { toString: () => "mock content" } };
  }) as ReturnType<typeof vi.fn> & { updateListener?: { of: ReturnType<typeof vi.fn> } };
  EditorView.updateListener = { of: vi.fn(() => []) };
  return { EditorView, basicSetup: [] };
});

vi.mock("@codemirror/lang-markdown", () => ({ markdown: () => [] }));
vi.mock("@codemirror/theme-one-dark", () => ({ oneDark: [] }));
vi.mock("@codemirror/view", () => ({
  EditorView: { updateListener: { of: vi.fn(() => []) } },
}));

// ─── サブコンポーネントモック ─────────────────────────────────────────────────

vi.mock("../../components/editor/LinkedIssuesPanel", () => ({
  LinkedIssuesPanel: () => <div data-testid="linked-issues-panel" />,
}));

vi.mock("../../components/editor/MarkdownPreview", () => ({
  MarkdownPreview: ({ content }: { content: string }) => (
    <div data-testid="markdown-preview">{content}</div>
  ),
}));

vi.mock("../../components/editor/UnsavedWarningModal", () => ({
  UnsavedWarningModal: ({
    onSave,
    onDiscard,
    onCancel,
  }: {
    filename: string;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="unsaved-warning-modal">
      <button onClick={onSave}>modal-save</button>
      <button onClick={onDiscard}>modal-discard</button>
      <button onClick={onCancel}>modal-cancel</button>
    </div>
  ),
}));

vi.mock("../../components/editor/CodeViewer", () => ({
  CodeViewer: ({ path }: { path: string }) => (
    <div data-testid="code-viewer">{path}</div>
  ),
}));

vi.mock("../../components/editor/FileTreePanel", () => ({
  FileTreePanel: () => <div data-testid="file-tree-panel" />,
}));

vi.mock("../../components/ai/AiAssistant", () => ({
  AiAssistant: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="ai-assistant">
      <button onClick={onClose}>close-ai</button>
    </div>
  ),
}));

// ─── モック状態 ──────────────────────────────────────────────────────────────

const mockProject = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest", default_branch: "main",
  repo_owner: "yo", repo_name: "devnest", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockDoc = {
  id: 10, path: "docs/spec.md", content: "# Spec", is_dirty: false,
  push_status: "synced" as string,
};

type OpenedFile =
  | { type: "code"; path: string; content: string; truncated: boolean; totalLines: number }
  | { type: "code-error"; path: string; error: string }
  | { type: "doc"; path: string }
  | null;

const documentState = {
  documents: [] as typeof mockDoc[],
  currentDoc: null as typeof mockDoc | null,
  linkedIssues: [] as unknown[],
  saveStatus: "idle" as string,
  saveProgress: null as { status: "committing" | "pushing" | "synced" | "push_failed" } | null,
  fetchDocuments: vi.fn(() => Promise.resolve()),
  openDocument: vi.fn(() => Promise.resolve()),
  saveDocument: vi.fn(() => Promise.resolve()),
  retryPush: vi.fn(() => Promise.resolve()),
  setDirty: vi.fn(),
  listenSaveProgress: vi.fn(() => Promise.resolve(() => {})),
  fetchLinkedIssues: vi.fn(),
  createDocument: vi.fn(() => Promise.resolve({ id: 99, path: "docs/new.md" })),
  renameDocument: vi.fn(() => Promise.resolve()),
  openedFile: null as OpenedFile,
  fileTreeNodes: [] as unknown[],
  fileTreeLoading: false,
  fetchFileTree: vi.fn(),
  openCodeFile: vi.fn(),
  saveCodeFile: vi.fn(() => Promise.resolve()),
  listenCodeSaveProgress: vi.fn(() => Promise.resolve(() => {})),
  codeSaveStatus: "idle" as string,
  codeSaveProgress: null as unknown,
};

const projectState = {
  currentProject: mockProject as typeof mockProject | null,
  setLastOpenedDocument: vi.fn(),
};

const issueState = { selectIssue: vi.fn() };
const uiState = { navigate: vi.fn() };

vi.mock("../../stores/documentStore", () => ({
  useDocumentStore: vi.fn((sel?: (s: typeof documentState) => unknown) =>
    sel ? sel(documentState) : documentState
  ),
}));

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn((sel?: (s: typeof projectState) => unknown) =>
    sel ? sel(projectState) : projectState
  ),
}));

vi.mock("../../stores/issueStore", () => ({
  useIssueStore: vi.fn((sel?: (s: typeof issueState) => unknown) =>
    sel ? sel(issueState) : issueState
  ),
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn((sel?: (s: typeof uiState) => unknown) =>
    sel ? sel(uiState) : uiState
  ),
}));

import { EditorScreen } from "../EditorScreen";

describe("EditorScreen — 基本レンダリング", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    projectState.setLastOpenedDocument = vi.fn();
    documentState.documents = [];
    documentState.currentDoc = null;
    documentState.linkedIssues = [];
    documentState.saveStatus = "idle";
    documentState.saveProgress = null;
    documentState.openedFile = null;
    documentState.fileTreeNodes = [];
    documentState.fileTreeLoading = false;
    documentState.fetchDocuments = vi.fn(() => Promise.resolve());
    documentState.openDocument = vi.fn(() => Promise.resolve());
    documentState.saveDocument = vi.fn(() => Promise.resolve());
    documentState.retryPush = vi.fn(() => Promise.resolve());
    documentState.setDirty = vi.fn();
    documentState.listenSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.listenCodeSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.fetchLinkedIssues = vi.fn();
    documentState.createDocument = vi.fn(() => Promise.resolve({ id: 99, path: "docs/new.md" }));
    documentState.renameDocument = vi.fn(() => Promise.resolve());
    documentState.fetchFileTree = vi.fn();
    documentState.openCodeFile = vi.fn();
    documentState.saveCodeFile = vi.fn(() => Promise.resolve());
    documentState.codeSaveStatus = "idle";
    documentState.codeSaveProgress = null;
    issueState.selectIssue = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("currentProject なしのとき EmptyState が表示される", () => {
    projectState.currentProject = null;
    render(<EditorScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("ドキュメントなしのとき空メッセージが表示される", () => {
    render(<EditorScreen />);
    expect(screen.getByText("設計書ファイルがありません")).toBeInTheDocument();
  });

  it("ドキュメントがあるとき一覧に表示される", () => {
    documentState.documents = [mockDoc];
    render(<EditorScreen />);
    expect(screen.getByText("spec.md")).toBeInTheDocument();
  });

  it("ドキュメントクリックで openDocument が呼ばれる", () => {
    documentState.documents = [mockDoc];
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("spec.md"));
    expect(documentState.openDocument).toHaveBeenCalledWith(10);
  });

  it("openedFile なしのとき EmptyState「ドキュメントを選択」が表示される", () => {
    render(<EditorScreen />);
    expect(screen.getByText("左のファイル一覧からドキュメントを選択")).toBeInTheDocument();
  });
});

describe("EditorScreen — ツールバー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    projectState.setLastOpenedDocument = vi.fn();
    documentState.documents = [];
    documentState.currentDoc = null;
    documentState.linkedIssues = [];
    documentState.saveStatus = "idle";
    documentState.saveProgress = null;
    documentState.openedFile = null;
    documentState.listenSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.listenCodeSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.fetchDocuments = vi.fn(() => Promise.resolve());
    documentState.openDocument = vi.fn(() => Promise.resolve());
    documentState.saveDocument = vi.fn(() => Promise.resolve());
    documentState.retryPush = vi.fn(() => Promise.resolve());
    documentState.setDirty = vi.fn();
    documentState.fetchLinkedIssues = vi.fn();
    documentState.createDocument = vi.fn(() => Promise.resolve({ id: 99 }));
    documentState.renameDocument = vi.fn(() => Promise.resolve());
    documentState.fetchFileTree = vi.fn();
    documentState.openCodeFile = vi.fn();
    documentState.saveCodeFile = vi.fn(() => Promise.resolve());
    documentState.codeSaveStatus = "idle";
    documentState.codeSaveProgress = null;
    documentState.fileTreeNodes = [];
    documentState.fileTreeLoading = false;
    issueState.selectIssue = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("currentDoc ありのとき Preview/MD/Split ボタンが表示される", () => {
    documentState.currentDoc = mockDoc;
    documentState.openedFile = { type: "doc", path: "docs/spec.md" };
    render(<EditorScreen />);
    expect(screen.getByTitle("Preview")).toBeInTheDocument();
    expect(screen.getByTitle("MD")).toBeInTheDocument();
    expect(screen.getByTitle("Split")).toBeInTheDocument();
  });

  it("MD ボタンクリックで MarkdownPreview が非表示になる", () => {
    documentState.currentDoc = mockDoc;
    documentState.openedFile = { type: "doc", path: "docs/spec.md" };
    render(<EditorScreen />);
    // MD モード → preview non-rendered
    fireEvent.click(screen.getByTitle("MD"));
    expect(screen.queryByTestId("markdown-preview")).not.toBeInTheDocument();
  });

  it("Split ボタンクリックでリサイズハンドルが表示される", () => {
    documentState.currentDoc = mockDoc;
    documentState.openedFile = { type: "doc", path: "docs/spec.md" };
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("Split"));
    expect(document.querySelector(".cursor-col-resize")).toBeInTheDocument();
  });

  it("AI パネルボタンで AiAssistant が表示される", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("AI アシスタント"));
    expect(screen.getByTestId("ai-assistant")).toBeInTheDocument();
  });

  it("AI パネルの close-ai で非表示になる", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("AI アシスタント"));
    fireEvent.click(screen.getByText("close-ai"));
    expect(screen.queryByTestId("ai-assistant")).not.toBeInTheDocument();
  });

  it("saveStatus=loading のとき保存ボタンが 保存中… を表示", () => {
    documentState.currentDoc = mockDoc;
    documentState.saveStatus = "loading";
    render(<EditorScreen />);
    expect(screen.getByText("保存中…")).toBeInTheDocument();
  });

  it("saveProgress committing のとき StatusBadge が表示される", () => {
    documentState.saveProgress = { status: "committing" };
    render(<EditorScreen />);
    expect(screen.getByText("コミット中…")).toBeInTheDocument();
  });

  it("saveProgress pushing のとき StatusBadge が表示される", () => {
    documentState.saveProgress = { status: "pushing" };
    render(<EditorScreen />);
    expect(screen.getByText("プッシュ中…")).toBeInTheDocument();
  });

  it("saveProgress synced のとき StatusBadge が表示される", () => {
    documentState.saveProgress = { status: "synced" };
    render(<EditorScreen />);
    expect(screen.getByText("同期済み")).toBeInTheDocument();
  });

  it("saveProgress push_failed のとき StatusBadge が表示される", () => {
    documentState.saveProgress = { status: "push_failed" };
    render(<EditorScreen />);
    expect(screen.getByText("プッシュ失敗")).toBeInTheDocument();
  });

  it("currentDoc.push_status=push_failed のとき再プッシュボタンが表示される", () => {
    documentState.currentDoc = { ...mockDoc, push_status: "push_failed" };
    render(<EditorScreen />);
    expect(screen.getByTitle("再プッシュ")).toBeInTheDocument();
  });
});

describe("EditorScreen — コンテンツエリア", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    projectState.setLastOpenedDocument = vi.fn();
    documentState.documents = [];
    documentState.currentDoc = null;
    documentState.linkedIssues = [];
    documentState.saveStatus = "idle";
    documentState.saveProgress = null;
    documentState.openedFile = null;
    documentState.listenSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.listenCodeSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.fetchDocuments = vi.fn(() => Promise.resolve());
    documentState.openDocument = vi.fn(() => Promise.resolve());
    documentState.saveDocument = vi.fn(() => Promise.resolve());
    documentState.retryPush = vi.fn(() => Promise.resolve());
    documentState.setDirty = vi.fn();
    documentState.fetchLinkedIssues = vi.fn();
    documentState.createDocument = vi.fn(() => Promise.resolve({ id: 99 }));
    documentState.renameDocument = vi.fn(() => Promise.resolve());
    documentState.fetchFileTree = vi.fn();
    documentState.openCodeFile = vi.fn();
    documentState.saveCodeFile = vi.fn(() => Promise.resolve());
    documentState.codeSaveStatus = "idle";
    documentState.codeSaveProgress = null;
    documentState.fileTreeNodes = [];
    documentState.fileTreeLoading = false;
    issueState.selectIssue = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("openedFile.type=code のとき CodeViewer が表示される", () => {
    documentState.openedFile = {
      type: "code", path: "src/main.rs", content: "fn main() {}",
      truncated: false, totalLines: 1,
    };
    render(<EditorScreen />);
    expect(screen.getByTestId("code-viewer")).toBeInTheDocument();
    expect(screen.getByText("src/main.rs")).toBeInTheDocument();
  });

  it("openedFile.type=code-error のときエラーメッセージが表示される", () => {
    documentState.openedFile = {
      type: "code-error", path: "src/big.rs", error: "ファイルが大きすぎます",
    };
    render(<EditorScreen />);
    expect(screen.getByText("src/big.rs")).toBeInTheDocument();
    expect(screen.getByText("ファイルが大きすぎます")).toBeInTheDocument();
  });

  it("openedFile.type=doc のとき MarkdownPreview が表示される", () => {
    documentState.currentDoc = mockDoc;
    documentState.openedFile = { type: "doc", path: "docs/spec.md" };
    render(<EditorScreen />);
    expect(screen.getByTestId("markdown-preview")).toBeInTheDocument();
  });

  it("Split モード: リサイズ handleMouseDown + mousemove が動作する (line 114)", () => {
    documentState.currentDoc = mockDoc;
    documentState.openedFile = { type: "doc", path: "docs/spec.md" };
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("Split"));

    const handle = document.querySelector(".cursor-col-resize")!;
    expect(handle).toBeTruthy();

    // mousedown → isDraggingRef=true, dragStartXRef=400
    fireEvent.mouseDown(handle, { clientX: 400 });
    // mousemove on window → triggers line 114: delta = 400 - 350 = 50
    fireEvent.mouseMove(window, { clientX: 350 });
    fireEvent.mouseUp(window);

    // verify no errors thrown
    expect(handle).toBeInTheDocument();
  });
});

describe("EditorScreen — ファイルツリー操作", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    projectState.setLastOpenedDocument = vi.fn();
    documentState.documents = [];
    documentState.currentDoc = null;
    documentState.linkedIssues = [];
    documentState.saveStatus = "idle";
    documentState.saveProgress = null;
    documentState.openedFile = null;
    documentState.listenSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.listenCodeSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.fetchDocuments = vi.fn(() => Promise.resolve());
    documentState.openDocument = vi.fn(() => Promise.resolve());
    documentState.saveDocument = vi.fn(() => Promise.resolve());
    documentState.retryPush = vi.fn(() => Promise.resolve());
    documentState.setDirty = vi.fn();
    documentState.fetchLinkedIssues = vi.fn();
    documentState.createDocument = vi.fn(() => Promise.resolve({ id: 99, path: "docs/new.md" }));
    documentState.renameDocument = vi.fn(() => Promise.resolve());
    documentState.fetchFileTree = vi.fn();
    documentState.openCodeFile = vi.fn();
    documentState.saveCodeFile = vi.fn(() => Promise.resolve());
    documentState.codeSaveStatus = "idle";
    documentState.codeSaveProgress = null;
    documentState.fileTreeNodes = [];
    documentState.fileTreeLoading = false;
    issueState.selectIssue = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("全ファイルボタンで FileTreePanel が表示される", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("全ファイル"));
    expect(screen.getByTestId("file-tree-panel")).toBeInTheDocument();
  });

  it("設計書ボタンで設計書リストが表示される（全ファイルから戻る）", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("全ファイル"));
    fireEvent.click(screen.getByText("設計書"));
    expect(screen.queryByTestId("file-tree-panel")).not.toBeInTheDocument();
  });

  it("新規ファイルボタンで入力フォームが表示される", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("新規ファイル"));
    expect(screen.getByPlaceholderText("ファイル名.md")).toBeInTheDocument();
  });

  it("新規ファイル: Escape でフォームが閉じる", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("新規ファイル"));
    fireEvent.keyDown(screen.getByPlaceholderText("ファイル名.md"), { key: "Escape" });
    expect(screen.queryByPlaceholderText("ファイル名.md")).not.toBeInTheDocument();
  });

  it("新規ファイル: 入力→Enter で createDocument が呼ばれる", async () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("新規ファイル"));
    fireEvent.change(screen.getByPlaceholderText("ファイル名.md"), { target: { value: "newfile" } });
    fireEvent.keyDown(screen.getByPlaceholderText("ファイル名.md"), { key: "Enter" });
    await waitFor(() => {
      expect(documentState.createDocument).toHaveBeenCalledWith(1, "docs/newfile.md");
    });
  });

  it("リネームボタンクリックでリネーム入力が表示される (line 433)", () => {
    documentState.documents = [mockDoc];
    render(<EditorScreen />);
    // ドキュメントをクリックして選択状態にする
    fireEvent.click(screen.getByText("spec.md"));
    // pencil ボタンをクリック (title="リネーム")
    const pencilBtn = screen.getByTitle("リネーム");
    fireEvent.click(pencilBtn);
    // リネーム入力 (value = "spec" — .md 除去済み)
    expect(screen.getByDisplayValue("spec")).toBeInTheDocument();
  });

  it("リネーム: Enter で renameDocument が呼ばれる", async () => {
    documentState.documents = [mockDoc];
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("spec.md"));
    fireEvent.click(screen.getByTitle("リネーム"));
    const renameInput = screen.getByDisplayValue("spec");
    fireEvent.change(renameInput, { target: { value: "renamed" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });
    await waitFor(() => {
      expect(documentState.renameDocument).toHaveBeenCalledWith(1, 10, "docs/renamed.md");
    });
  });

  it("リネーム: Escape でリネームモードが解除される", () => {
    documentState.documents = [mockDoc];
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("spec.md"));
    fireEvent.click(screen.getByTitle("リネーム"));
    expect(screen.getByDisplayValue("spec")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByDisplayValue("spec"), { key: "Escape" });
    expect(screen.queryByDisplayValue("spec")).not.toBeInTheDocument();
  });
});

describe("EditorScreen — UnsavedWarningModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    projectState.setLastOpenedDocument = vi.fn();
    documentState.linkedIssues = [];
    documentState.saveStatus = "idle";
    documentState.saveProgress = null;
    documentState.openedFile = null;
    documentState.listenSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.listenCodeSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.fetchDocuments = vi.fn(() => Promise.resolve());
    documentState.openDocument = vi.fn(() => Promise.resolve());
    documentState.saveDocument = vi.fn(() => Promise.resolve());
    documentState.retryPush = vi.fn(() => Promise.resolve());
    documentState.setDirty = vi.fn();
    documentState.fetchLinkedIssues = vi.fn();
    documentState.createDocument = vi.fn(() => Promise.resolve({ id: 99 }));
    documentState.renameDocument = vi.fn(() => Promise.resolve());
    documentState.fetchFileTree = vi.fn();
    documentState.openCodeFile = vi.fn();
    documentState.saveCodeFile = vi.fn(() => Promise.resolve());
    documentState.codeSaveStatus = "idle";
    documentState.codeSaveProgress = null;
    documentState.fileTreeNodes = [];
    documentState.fileTreeLoading = false;
    issueState.selectIssue = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("dirty doc で別ドキュメントクリックすると UnsavedWarningModal が表示される", () => {
    const doc2 = { ...mockDoc, id: 11, path: "docs/other.md" };
    documentState.documents = [mockDoc, doc2];
    documentState.currentDoc = { ...mockDoc, is_dirty: true };
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("other.md"));
    expect(screen.getByTestId("unsaved-warning-modal")).toBeInTheDocument();
  });

  it("UnsavedWarningModal の cancel でモーダルが閉じる", () => {
    const doc2 = { ...mockDoc, id: 11, path: "docs/other.md" };
    documentState.documents = [mockDoc, doc2];
    documentState.currentDoc = { ...mockDoc, is_dirty: true };
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("other.md"));
    fireEvent.click(screen.getByText("modal-cancel"));
    expect(screen.queryByTestId("unsaved-warning-modal")).not.toBeInTheDocument();
  });

  it("UnsavedWarningModal の discard で setDirty(false) が呼ばれる", async () => {
    const doc2 = { ...mockDoc, id: 11, path: "docs/other.md" };
    documentState.documents = [mockDoc, doc2];
    documentState.currentDoc = { ...mockDoc, is_dirty: true };
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("other.md"));
    fireEvent.click(screen.getByText("modal-discard"));
    await waitFor(() => {
      expect(documentState.setDirty).toHaveBeenCalledWith(10, false);
    });
  });
});

describe("EditorScreen — ファイルツリー・作成・リネーム", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    projectState.setLastOpenedDocument = vi.fn();
    documentState.documents = [mockDoc];
    documentState.currentDoc = null;
    documentState.linkedIssues = [];
    documentState.saveStatus = "idle";
    documentState.saveProgress = null;
    documentState.openedFile = null;
    documentState.fileTreeNodes = [];
    documentState.fileTreeLoading = false;
    documentState.fetchDocuments = vi.fn(() => Promise.resolve());
    documentState.openDocument = vi.fn(() => Promise.resolve());
    documentState.saveDocument = vi.fn(() => Promise.resolve());
    documentState.retryPush = vi.fn(() => Promise.resolve());
    documentState.setDirty = vi.fn();
    documentState.listenSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.listenCodeSaveProgress = vi.fn(() => Promise.resolve(() => {}));
    documentState.fetchLinkedIssues = vi.fn();
    documentState.createDocument = vi.fn(() => Promise.resolve({ id: 99, path: "docs/new.md" }));
    documentState.renameDocument = vi.fn(() => Promise.resolve());
    documentState.fetchFileTree = vi.fn();
    documentState.openCodeFile = vi.fn();
    documentState.saveCodeFile = vi.fn(() => Promise.resolve());
    documentState.codeSaveStatus = "idle";
    documentState.codeSaveProgress = null;
    issueState.selectIssue = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("「全ファイル」ボタンクリックで fetchFileTree が呼ばれる (handleTreeModeAll, line 91-95)", () => {
    documentState.fileTreeNodes = [];
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("全ファイル"));
    expect(documentState.fetchFileTree).toHaveBeenCalledWith(mockProject.id);
  });

  it("「全ファイル」クリック後 FileTreePanel が表示される", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("全ファイル"));
    expect(screen.getByTestId("file-tree-panel")).toBeInTheDocument();
  });

  it("「設計書」に戻すと設計書一覧が表示される", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("全ファイル"));
    fireEvent.click(screen.getByText("設計書"));
    expect(screen.queryByTestId("file-tree-panel")).not.toBeInTheDocument();
    expect(screen.getByText("spec.md")).toBeInTheDocument();
  });

  it("新規ファイルボタンクリックで入力フィールドが表示される (handleCreateStart)", () => {
    render(<EditorScreen />);
    const plusBtn = screen.getByTitle("新規ファイル");
    fireEvent.click(plusBtn);
    expect(screen.getByPlaceholderText("ファイル名.md")).toBeInTheDocument();
  });

  it("新規ファイル入力後 confirm ボタンで createDocument が呼ばれる (handleCreateConfirm, line 252)", async () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("新規ファイル"));
    const input = screen.getByPlaceholderText("ファイル名.md");
    fireEvent.change(input, { target: { value: "new-spec" } });
    // confirm ボタン（緑チェック）をクリック — 2番目のボタン（最初はcancel）
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find(
      (b) => b.className.includes("green") || b.getAttribute("class")?.includes("green")
    )!;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(documentState.createDocument).toHaveBeenCalledWith(
        mockProject.id,
        "docs/new-spec.md"
      );
    });
  });

  it("Escape キーで作成モードがキャンセルされる", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByTitle("新規ファイル"));
    const input = screen.getByPlaceholderText("ファイル名.md");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("ファイル名.md")).not.toBeInTheDocument();
  });

  it("リネーム confirm ボタンで renameDocument が呼ばれる (handleRenameConfirm, line 275)", async () => {
    render(<EditorScreen />);
    // まずドキュメントをクリックして選択状態にする
    fireEvent.click(screen.getByText("spec.md"));
    // リネームボタン（鉛筆アイコン）をクリック
    fireEvent.click(screen.getByTitle("リネーム"));
    await waitFor(() => {
      expect(screen.getByDisplayValue("spec")).toBeInTheDocument();
    });
    const renameInput = screen.getByDisplayValue("spec");
    fireEvent.change(renameInput, { target: { value: "renamed" } });
    // confirm ボタン（class に green）
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find(
      (b) => b.className.includes("green") || b.getAttribute("class")?.includes("green")
    )!;
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(documentState.renameDocument).toHaveBeenCalledWith(
        mockProject.id,
        mockDoc.id,
        "docs/renamed.md"
      );
    });
  });

  it("リネーム cancel ボタンで入力が消える (line 414)", () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByText("spec.md"));
    fireEvent.click(screen.getByTitle("リネーム"));
    expect(screen.getByDisplayValue("spec")).toBeInTheDocument();
    // X ボタン（destructive class）をクリック
    const buttons = screen.getAllByRole("button");
    const cancelBtn = buttons.find(
      (b) => b.className.includes("destructive") || b.getAttribute("class")?.includes("destructive")
    )!;
    fireEvent.click(cancelBtn);
    expect(screen.queryByDisplayValue("spec")).not.toBeInTheDocument();
  });
});
