/**
 * ConflictScreen テスト — ResolvedOverlay / handleSaveAndMerge / ConflictFileEditor
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── サブコンポーネントモック ─────────────────────────────────────────────────

vi.mock("../../components/conflict/ConflictBlockItem", () => ({
  ConflictBlockItem: ({
    block,
    onResolve,
  }: {
    block: { index: number; ours: string; theirs: string };
    resolution?: string;
    manualContent?: string;
    onResolve: (r: string, manual?: string) => void;
    onManualChange: (c: string) => void;
  }) => (
    <div data-testid={`block-${block.index}`}>
      <button onClick={() => onResolve("ours")}>use-ours-{block.index}</button>
      <button onClick={() => onResolve("theirs")}>use-theirs-{block.index}</button>
    </div>
  ),
}));

vi.mock("../../components/conflict/ConflictFileListItem", () => ({
  ConflictFileListItem: ({
    file,
    onClick,
  }: {
    file: { id: number; path: string };
    isActive: boolean;
    resolvedCount: number;
    onClick: () => void;
  }) => (
    <button data-testid={`file-item-${file.id}`} onClick={onClick}>
      {file.path}
    </button>
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

const mockFile = {
  id: 10, path: "docs/spec.md",
  blocks: [{ index: 0, ours: "A", theirs: "B" }],
};

const conflictState = {
  managedFiles: [] as typeof mockFile[],
  unmanagedCount: 0,
  activeFileId: null as number | null,
  resolutions: {} as Record<number, Record<number, { resolution: string; manualContent?: string }>>,
  listStatus: "idle" as string,
  resolveStatus: "idle" as string,
  resolveAllStatus: "idle" as string,
  resolveAllResult: null as { commit_sha: string; resolved_files: number } | null,
  error: null as string | null,
  totalBlocks: vi.fn(() => 0),
  resolvedBlocks: vi.fn(() => 0),
  allResolved: vi.fn(() => false),
  activeFile: vi.fn(() => null as typeof mockFile | null),
  loadConflicts: vi.fn(),
  setActiveFile: vi.fn(),
  saveResolutions: vi.fn(() => Promise.resolve()),
  resolveAll: vi.fn(() => Promise.resolve()),
  reset: vi.fn(),
  setBlockResolution: vi.fn(),
  resolveAllBlocks: vi.fn(),
};

const projectState = {
  currentProject: mockProject as typeof mockProject | null,
};

const uiState = { navigate: vi.fn() };

vi.mock("../../stores/conflictStore", () => ({
  useConflictStore: vi.fn((sel?: (s: typeof conflictState) => unknown) =>
    sel ? sel(conflictState) : conflictState
  ),
}));

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn((sel?: (s: typeof projectState) => unknown) =>
    sel ? sel(projectState) : projectState
  ),
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn((sel?: (s: typeof uiState) => unknown) =>
    sel ? sel(uiState) : uiState
  ),
}));

import { ConflictScreen } from "../ConflictScreen";

describe("ConflictScreen — 基本表示", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    conflictState.managedFiles = [];
    conflictState.unmanagedCount = 0;
    conflictState.activeFileId = null;
    conflictState.resolutions = {};
    conflictState.listStatus = "idle";
    conflictState.resolveStatus = "idle";
    conflictState.resolveAllStatus = "idle";
    conflictState.resolveAllResult = null;
    conflictState.error = null;
    conflictState.totalBlocks = vi.fn(() => 0);
    conflictState.resolvedBlocks = vi.fn(() => 0);
    conflictState.allResolved = vi.fn(() => false);
    conflictState.activeFile = vi.fn(() => null);
    conflictState.loadConflicts = vi.fn();
    conflictState.setActiveFile = vi.fn();
    conflictState.saveResolutions = vi.fn(() => Promise.resolve());
    conflictState.resolveAll = vi.fn(() => Promise.resolve());
    conflictState.reset = vi.fn();
    conflictState.setBlockResolution = vi.fn();
    conflictState.resolveAllBlocks = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("currentProject なしのとき選択メッセージが表示される", () => {
    projectState.currentProject = null;
    render(<ConflictScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("マウント時に loadConflicts が呼ばれる", () => {
    render(<ConflictScreen />);
    expect(conflictState.loadConflicts).toHaveBeenCalledWith(1);
  });

  it("listStatus=loading のとき検索中メッセージが表示される", () => {
    conflictState.listStatus = "loading";
    render(<ConflictScreen />);
    expect(screen.getByText("コンフリクトを検索中…")).toBeInTheDocument();
  });

  it("listStatus=success + managedFiles=[] のとき見つからなかったメッセージが表示される", () => {
    conflictState.listStatus = "success";
    render(<ConflictScreen />);
    expect(screen.getByText("コンフリクトは見つかりませんでした")).toBeInTheDocument();
  });

  it("error ありのときエラーメッセージが表示される", () => {
    conflictState.error = "マージに失敗しました";
    render(<ConflictScreen />);
    expect(screen.getByText("マージに失敗しました")).toBeInTheDocument();
  });

  it("unmanagedCount > 0 のとき警告が表示される", () => {
    conflictState.unmanagedCount = 3;
    render(<ConflictScreen />);
    expect(screen.getByText(/docs\/ 外に 3 ファイル/)).toBeInTheDocument();
  });

  it("total > 0 のときプログレスバー情報が表示される", () => {
    conflictState.totalBlocks = vi.fn(() => 5);
    conflictState.resolvedBlocks = vi.fn(() => 2);
    render(<ConflictScreen />);
    expect(screen.getByText("2 / 5 ブロック解消済み")).toBeInTheDocument();
  });
});

describe("ConflictScreen — ファイルリスト & handleSaveAndMerge (line 182-191)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    conflictState.unmanagedCount = 0;
    conflictState.activeFileId = null;
    conflictState.resolutions = {};
    conflictState.listStatus = "idle";
    conflictState.resolveStatus = "idle";
    conflictState.resolveAllStatus = "idle";
    conflictState.resolveAllResult = null;
    conflictState.error = null;
    conflictState.totalBlocks = vi.fn(() => 1);
    conflictState.resolvedBlocks = vi.fn(() => 1);
    conflictState.allResolved = vi.fn(() => true);
    conflictState.activeFile = vi.fn(() => null);
    conflictState.loadConflicts = vi.fn();
    conflictState.setActiveFile = vi.fn();
    conflictState.saveResolutions = vi.fn(() => Promise.resolve());
    conflictState.resolveAll = vi.fn(() => Promise.resolve());
    conflictState.reset = vi.fn();
    conflictState.setBlockResolution = vi.fn();
    conflictState.resolveAllBlocks = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("managedFiles ありのとき ConflictFileListItem が表示される", () => {
    conflictState.managedFiles = [mockFile];
    render(<ConflictScreen />);
    expect(screen.getByTestId("file-item-10")).toBeInTheDocument();
  });

  it("ファイルアイテムクリックで setActiveFile が呼ばれる", () => {
    conflictState.managedFiles = [mockFile];
    render(<ConflictScreen />);
    fireEvent.click(screen.getByTestId("file-item-10"));
    expect(conflictState.setActiveFile).toHaveBeenCalledWith(10);
  });

  it("activeFile なしのとき「ファイルを選択してください」が表示される", () => {
    conflictState.managedFiles = [mockFile];
    conflictState.activeFile = vi.fn(() => null);
    render(<ConflictScreen />);
    expect(screen.getByText("ファイルを選択してください")).toBeInTheDocument();
  });

  it("allResolved=true のとき SAVE & MERGE ボタンが有効", () => {
    conflictState.managedFiles = [mockFile];
    conflictState.allResolved = vi.fn(() => true);
    render(<ConflictScreen />);
    const btn = screen.getByText("SAVE & MERGE");
    expect(btn.closest("button")).not.toBeDisabled();
  });

  it("allResolved=false のとき SAVE & MERGE ボタンが無効", () => {
    conflictState.managedFiles = [mockFile];
    conflictState.allResolved = vi.fn(() => false);
    render(<ConflictScreen />);
    const btn = screen.getByText("SAVE & MERGE");
    expect(btn.closest("button")).toBeDisabled();
  });

  it("SAVE & MERGE クリックで saveResolutions + resolveAll が呼ばれる (line 182-191)", async () => {
    conflictState.managedFiles = [mockFile];
    conflictState.allResolved = vi.fn(() => true);
    render(<ConflictScreen />);
    fireEvent.click(screen.getByText("SAVE & MERGE"));
    await waitFor(() => {
      expect(conflictState.saveResolutions).toHaveBeenCalledWith(1, 10);
      expect(conflictState.resolveAll).toHaveBeenCalledWith(1);
    });
  });

  it("resolveAllStatus=loading のとき Saving… が表示される", () => {
    conflictState.managedFiles = [mockFile];
    conflictState.resolveAllStatus = "loading";
    conflictState.allResolved = vi.fn(() => true);
    render(<ConflictScreen />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });
});

describe("ConflictScreen — ConflictFileEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    conflictState.unmanagedCount = 0;
    conflictState.activeFileId = 10;
    conflictState.resolutions = {};
    conflictState.listStatus = "idle";
    conflictState.resolveStatus = "idle";
    conflictState.resolveAllStatus = "idle";
    conflictState.resolveAllResult = null;
    conflictState.error = null;
    conflictState.totalBlocks = vi.fn(() => 1);
    conflictState.resolvedBlocks = vi.fn(() => 0);
    conflictState.allResolved = vi.fn(() => false);
    conflictState.activeFile = vi.fn(() => mockFile);
    conflictState.loadConflicts = vi.fn();
    conflictState.setActiveFile = vi.fn();
    conflictState.saveResolutions = vi.fn(() => Promise.resolve());
    conflictState.resolveAll = vi.fn(() => Promise.resolve());
    conflictState.reset = vi.fn();
    conflictState.setBlockResolution = vi.fn();
    conflictState.resolveAllBlocks = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("activeFile ありのとき ConflictFileEditor が表示される", () => {
    conflictState.managedFiles = [mockFile];
    render(<ConflictScreen />);
    expect(screen.getByText("USE ALL MINE")).toBeInTheDocument();
    expect(screen.getByText("USE ALL THEIRS")).toBeInTheDocument();
  });

  it("USE ALL MINE クリックで resolveAllBlocks(ours) が呼ばれる", () => {
    conflictState.managedFiles = [mockFile];
    render(<ConflictScreen />);
    fireEvent.click(screen.getByText("USE ALL MINE"));
    expect(conflictState.resolveAllBlocks).toHaveBeenCalledWith(10, "ours");
  });

  it("USE ALL THEIRS クリックで resolveAllBlocks(theirs) が呼ばれる", () => {
    conflictState.managedFiles = [mockFile];
    render(<ConflictScreen />);
    fireEvent.click(screen.getByText("USE ALL THEIRS"));
    expect(conflictState.resolveAllBlocks).toHaveBeenCalledWith(10, "theirs");
  });

  it("blocks=[] のとき「マーカーなし」メッセージが表示される", () => {
    const emptyFile = { ...mockFile, blocks: [] };
    conflictState.managedFiles = [emptyFile];
    conflictState.activeFile = vi.fn(() => emptyFile);
    render(<ConflictScreen />);
    expect(screen.getByText("コンフリクトマーカーは見つかりませんでした")).toBeInTheDocument();
  });

  it("ConflictBlockItem の onResolve で setBlockResolution が呼ばれる", () => {
    conflictState.managedFiles = [mockFile];
    render(<ConflictScreen />);
    fireEvent.click(screen.getByText("use-ours-0"));
    expect(conflictState.setBlockResolution).toHaveBeenCalledWith(10, 0, {
      resolution: "ours",
      manualContent: undefined,
    });
  });
});

describe("ConflictScreen — ResolvedOverlay (line 112-120)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    conflictState.managedFiles = [];
    conflictState.unmanagedCount = 0;
    conflictState.activeFileId = null;
    conflictState.resolutions = {};
    conflictState.listStatus = "idle";
    conflictState.resolveStatus = "idle";
    conflictState.resolveAllStatus = "success";
    conflictState.resolveAllResult = { commit_sha: "abc123ef", resolved_files: 2 };
    conflictState.error = null;
    conflictState.totalBlocks = vi.fn(() => 0);
    conflictState.resolvedBlocks = vi.fn(() => 0);
    conflictState.allResolved = vi.fn(() => true);
    conflictState.activeFile = vi.fn(() => null);
    conflictState.loadConflicts = vi.fn();
    conflictState.setActiveFile = vi.fn();
    conflictState.saveResolutions = vi.fn(() => Promise.resolve());
    conflictState.resolveAll = vi.fn(() => Promise.resolve());
    conflictState.reset = vi.fn();
    conflictState.setBlockResolution = vi.fn();
    conflictState.resolveAllBlocks = vi.fn();
    uiState.navigate = vi.fn();
  });

  it("resolveAllStatus=success のとき ResolvedOverlay が表示される", () => {
    render(<ConflictScreen />);
    expect(screen.getByText("Conflicts resolved")).toBeInTheDocument();
    expect(screen.getByText("abc123ef")).toBeInTheDocument();
  });

  it("VIEW IN EDITOR クリックで navigate(editor) が呼ばれる (line 112)", () => {
    render(<ConflictScreen />);
    fireEvent.click(screen.getByText("VIEW IN EDITOR"));
    expect(uiState.navigate).toHaveBeenCalledWith("editor");
  });

  it("OPEN TERMINAL クリックで navigate(terminal) が呼ばれる (line 120)", () => {
    render(<ConflictScreen />);
    fireEvent.click(screen.getByText("OPEN TERMINAL"));
    expect(uiState.navigate).toHaveBeenCalledWith("terminal");
  });

  it("× ボタンクリックで reset が呼ばれる", () => {
    render(<ConflictScreen />);
    // X ボタン: テキストコンテンツなし (アイコンのみ)
    const allBtns = screen.getAllByRole("button");
    const closeBtn = allBtns.find((b) => !(b.textContent ?? "").trim())!;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    expect(conflictState.reset).toHaveBeenCalled();
  });
});
