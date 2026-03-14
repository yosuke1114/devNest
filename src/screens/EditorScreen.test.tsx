import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── store モック ──────────────────────────────────────────────────────────────
const mockDocumentStore = {
  documents: [
    { id: 1, project_id: 1, path: "docs/a.md", is_dirty: false, push_status: "synced" },
    { id: 2, project_id: 1, path: "docs/b.md", is_dirty: false, push_status: "synced" },
  ],
  currentDoc: null as null | { id: number; project_id: number; path: string; content: string; is_dirty: boolean },
  linkedIssues: [],
  saveStatus: "idle" as const,
  saveProgress: null,
  fetchDocuments: vi.fn().mockResolvedValue(undefined),
  openDocument: vi.fn().mockResolvedValue(undefined),
  saveDocument: vi.fn().mockResolvedValue({ sha: null, push_status: "synced" }),
  retryPush: vi.fn().mockResolvedValue(undefined),
  setDirty: vi.fn(),
  listenSaveProgress: vi.fn().mockResolvedValue(() => {}),
  fetchLinkedIssues: vi.fn().mockResolvedValue(undefined),
  // CodeViewer / FileTree 関連（EditorScreen Phase 11 追加分）
  createDocument: vi.fn().mockResolvedValue(undefined),
  renameDocument: vi.fn().mockResolvedValue(undefined),
  openedFile: null as null | { path: string; type: string },
  fileTreeNodes: [] as unknown[],
  fileTreeLoading: false,
  fetchFileTree: vi.fn().mockResolvedValue(undefined),
  openCodeFile: vi.fn().mockResolvedValue(undefined),
  saveCodeFile: vi.fn().mockResolvedValue(undefined),
  listenCodeSaveProgress: vi.fn().mockResolvedValue(() => {}),
  codeSaveStatus: "idle" as const,
  codeSaveProgress: null,
};

const mockProjectStore = {
  currentProject: { id: 1, name: "TestProject", last_opened_document_id: null },
  setLastOpenedDocument: vi.fn().mockResolvedValue(undefined),
};

const mockIssueStore = { selectIssue: vi.fn() };
const mockUiStore = { navigate: vi.fn() };

vi.mock("../stores/documentStore", () => ({
  useDocumentStore: (sel?: (s: typeof mockDocumentStore) => unknown) =>
    sel ? sel(mockDocumentStore) : mockDocumentStore,
}));
vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/issueStore", () => ({
  useIssueStore: (sel?: (s: typeof mockIssueStore) => unknown) =>
    sel ? sel(mockIssueStore) : mockIssueStore,
}));
vi.mock("../stores/uiStore", () => ({
  useUiStore: (sel?: (s: typeof mockUiStore) => unknown) =>
    sel ? sel(mockUiStore) : mockUiStore,
}));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown-preview">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: vi.fn() }));
vi.mock("@codemirror/lang-markdown", () => ({ markdown: vi.fn(() => []) }));
vi.mock("@codemirror/theme-one-dark", () => ({ oneDark: {} }));
vi.mock("codemirror", () => ({
  EditorView: class {
    static updateListener = { of: vi.fn(() => ({})) };
    constructor() {}
    destroy() {}
    get state() { return { doc: { toString: () => "content" } }; }
  },
  basicSetup: [],
}));

import { EditorScreen } from "./EditorScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("EditorScreen — UnsavedWarningModal wire-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocumentStore.currentDoc = null;
    mockDocumentStore.openedFile = null;
    mockDocumentStore.saveStatus = "idle";
    mockDocumentStore.documents = [
      { id: 1, project_id: 1, path: "docs/a.md", is_dirty: false, push_status: "synced" },
      { id: 2, project_id: 1, path: "docs/b.md", is_dirty: false, push_status: "synced" },
    ];
  });

  it("dirty でない状態でドキュメントを切り替えてもモーダルが表示されない", async () => {
    mockDocumentStore.currentDoc = {
      id: 1, project_id: 1, path: "docs/a.md", content: "# A", is_dirty: false,
    };
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockDocumentStore.openDocument).toHaveBeenCalledWith(2);
  });

  it("dirty なドキュメントから切り替えると UnsavedWarningModal が表示される", async () => {
    mockDocumentStore.currentDoc = {
      id: 1, project_id: 1, path: "docs/a.md", content: "# A", is_dirty: true,
    };
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/a\.md/)).toBeInTheDocument();
  });

  it("モーダルの「保存」をクリックすると saveDocument が呼ばれてから次のドキュメントが開く", async () => {
    mockDocumentStore.currentDoc = {
      id: 1, project_id: 1, path: "docs/a.md", content: "# A", is_dirty: true,
    };
    mockDocumentStore.openedFile = { path: "docs/a.md", type: "doc" };
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /保存/ }));
    await waitFor(() => {
      expect(mockDocumentStore.saveDocument).toHaveBeenCalled();
      expect(mockDocumentStore.openDocument).toHaveBeenCalledWith(2);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("モーダルの「破棄」をクリックすると setDirty(false) が呼ばれてから次のドキュメントが開く", async () => {
    mockDocumentStore.currentDoc = {
      id: 1, project_id: 1, path: "docs/a.md", content: "# A", is_dirty: true,
    };
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /破棄/ }));
    await waitFor(() => {
      expect(mockDocumentStore.setDirty).toHaveBeenCalledWith(1, false);
      expect(mockDocumentStore.openDocument).toHaveBeenCalledWith(2);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("モーダルの「キャンセル」でモーダルが閉じて切り替えが起きない", async () => {
    mockDocumentStore.currentDoc = {
      id: 1, project_id: 1, path: "docs/a.md", content: "# A", is_dirty: true,
    };
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /キャンセル/ }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockDocumentStore.openDocument).not.toHaveBeenCalled();
  });
});

describe("EditorScreen — setLastOpenedDocument wire-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocumentStore.currentDoc = null;
    mockDocumentStore.openedFile = null;
    mockDocumentStore.saveStatus = "idle";
    mockDocumentStore.documents = [
      { id: 1, project_id: 1, path: "docs/a.md", is_dirty: false, push_status: "synced" },
      { id: 2, project_id: 1, path: "docs/b.md", is_dirty: false, push_status: "synced" },
    ];
  });

  it("ドキュメントを選択すると setLastOpenedDocument が呼ばれる", async () => {
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => {
      expect(mockProjectStore.setLastOpenedDocument).toHaveBeenCalledWith(1, 2);
    });
  });

  it("dirty なドキュメントから保存して切り替えると setLastOpenedDocument が呼ばれる", async () => {
    mockDocumentStore.currentDoc = {
      id: 1, project_id: 1, path: "docs/a.md", content: "# A", is_dirty: true,
    };
    mockDocumentStore.openedFile = { path: "docs/a.md", type: "doc" };
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /保存/ }));
    await waitFor(() => {
      expect(mockProjectStore.setLastOpenedDocument).toHaveBeenCalledWith(1, 2);
    });
  });

  it("dirty なドキュメントから破棄して切り替えると setLastOpenedDocument が呼ばれる", async () => {
    mockDocumentStore.currentDoc = {
      id: 1, project_id: 1, path: "docs/a.md", content: "# A", is_dirty: true,
    };
    render(<EditorScreen />);
    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /破棄/ }));
    await waitFor(() => {
      expect(mockProjectStore.setLastOpenedDocument).toHaveBeenCalledWith(1, 2);
    });
  });
});
