import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConflictFile, ConflictBlock } from "../types";

// ─── store モック ──────────────────────────────────────────────────────────────
const mockBlock: ConflictBlock = {
  index: 0,
  ours: "our content",
  theirs: "their content",
};

const mockFile: ConflictFile = {
  id: 1,
  project_id: 1,
  file_path: "docs/architecture.md",
  is_managed: true,
  sync_log_id: null,
  document_id: null,
  our_content: null,
  their_content: null,
  merged_content: null,
  resolution: null,
  resolved_at: null,
  blocks: [mockBlock],
};

const mockProjectStore = {
  currentProject: { id: 1, name: "TestProject" } as { id: number; name: string } | null,
};

const mockConflictStore = {
  managedFiles: [] as ConflictFile[],
  unmanagedCount: 0,
  unmanagedFiles: [] as string[],
  activeFileId: null as number | null,
  resolutions: {} as Record<number, Record<number, { resolution: string; manualContent?: string }>>,
  listStatus: "idle" as string,
  resolveStatus: "idle" as string,
  resolveAllStatus: "idle" as string,
  resolveAllResult: null as { commit_sha: string; resolved_files: number } | null,
  error: null as string | null,
  totalBlocks: vi.fn().mockReturnValue(0),
  resolvedBlocks: vi.fn().mockReturnValue(0),
  allResolved: vi.fn().mockReturnValue(false),
  activeFile: vi.fn().mockReturnValue(null),
  loadConflicts: vi.fn(),
  setActiveFile: vi.fn(),
  saveResolutions: vi.fn().mockResolvedValue(undefined),
  resolveAll: vi.fn().mockResolvedValue(undefined),
  resolveAllBlocks: vi.fn(),
  setBlockResolution: vi.fn(),
  reset: vi.fn(),
};

const mockUiStore = {
  navigate: vi.fn(),
};

vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/conflictStore", () => ({
  useConflictStore: (sel?: (s: typeof mockConflictStore) => unknown) =>
    sel ? sel(mockConflictStore) : mockConflictStore,
}));
vi.mock("../stores/uiStore", () => ({
  useUiStore: (sel?: (s: typeof mockUiStore) => unknown) =>
    sel ? sel(mockUiStore) : mockUiStore,
}));
vi.mock("../components/conflict/ConflictBlockItem", () => ({
  ConflictBlockItem: ({ block }: { block: ConflictBlock }) => (
    <div data-testid={`conflict-block-${block.index}`}>Block {block.index}</div>
  ),
}));
vi.mock("../components/conflict/ConflictFileListItem", () => ({
  ConflictFileListItem: ({
    file,
    isActive,
    onClick,
  }: {
    file: ConflictFile;
    isActive: boolean;
    onClick: () => void;
  }) => (
    <button
      data-testid={`conflict-file-${file.id}`}
      data-active={isActive}
      onClick={onClick}
    >
      {file.file_path}
    </button>
  ),
}));

import { ConflictScreen } from "./ConflictScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("ConflictScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.currentProject = { id: 1, name: "TestProject" };
    mockConflictStore.managedFiles = [];
    mockConflictStore.unmanagedCount = 0;
    mockConflictStore.activeFileId = null;
    mockConflictStore.resolutions = {};
    mockConflictStore.listStatus = "idle";
    mockConflictStore.resolveAllStatus = "idle";
    mockConflictStore.resolveAllResult = null;
    mockConflictStore.error = null;
    mockConflictStore.totalBlocks.mockReturnValue(0);
    mockConflictStore.resolvedBlocks.mockReturnValue(0);
    mockConflictStore.allResolved.mockReturnValue(false);
    mockConflictStore.activeFile.mockReturnValue(null);
  });

  it("currentProject が null の場合「プロジェクトを選択してください」が表示される", () => {
    mockProjectStore.currentProject = null;
    render(<ConflictScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("初期マウント時に loadConflicts が呼ばれる", () => {
    render(<ConflictScreen />);
    expect(mockConflictStore.loadConflicts).toHaveBeenCalledWith(1);
  });

  it("listStatus が loading の場合「コンフリクトを検索中…」が表示される", () => {
    mockConflictStore.listStatus = "loading";
    render(<ConflictScreen />);
    expect(screen.getByText("コンフリクトを検索中…")).toBeInTheDocument();
  });

  it("managedFiles が空で success の場合「コンフリクトは見つかりませんでした」が表示される", () => {
    mockConflictStore.listStatus = "success";
    mockConflictStore.managedFiles = [];
    render(<ConflictScreen />);
    expect(screen.getByText("コンフリクトは見つかりませんでした")).toBeInTheDocument();
  });

  it("ヘッダーに CONFLICT RESOLUTION と表示される", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.totalBlocks.mockReturnValue(1);
    render(<ConflictScreen />);
    expect(screen.getByText("CONFLICT RESOLUTION")).toBeInTheDocument();
  });

  it("ファイルリストが表示される", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.totalBlocks.mockReturnValue(1);
    render(<ConflictScreen />);
    expect(screen.getByTestId("conflict-file-1")).toBeInTheDocument();
  });

  it("ファイルをクリックすると setActiveFile が呼ばれる", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.totalBlocks.mockReturnValue(1);
    render(<ConflictScreen />);
    fireEvent.click(screen.getByTestId("conflict-file-1"));
    expect(mockConflictStore.setActiveFile).toHaveBeenCalledWith(1);
  });

  it("activeFile がない場合「ファイルを選択してください」が表示される", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.activeFile.mockReturnValue(null);
    mockConflictStore.totalBlocks.mockReturnValue(1);
    render(<ConflictScreen />);
    expect(screen.getByText("ファイルを選択してください")).toBeInTheDocument();
  });

  it("activeFile がある場合にブロックエディタが表示される", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.activeFileId = 1;
    mockConflictStore.activeFile.mockReturnValue(mockFile);
    mockConflictStore.totalBlocks.mockReturnValue(1);
    render(<ConflictScreen />);
    expect(screen.getByTestId("conflict-block-0")).toBeInTheDocument();
  });

  it("allResolved が false のとき SAVE & MERGE ボタンが disabled", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.totalBlocks.mockReturnValue(1);
    mockConflictStore.allResolved.mockReturnValue(false);
    render(<ConflictScreen />);
    const btn = screen.getByText("SAVE & MERGE").closest("button")!;
    expect(btn).toBeDisabled();
  });

  it("エラーがある場合にエラーメッセージが表示される", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.totalBlocks.mockReturnValue(1);
    mockConflictStore.error = "Merge failed";
    render(<ConflictScreen />);
    expect(screen.getByText("Merge failed")).toBeInTheDocument();
  });

  it("unmanagedCount > 0 のとき警告メッセージが表示される", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.unmanagedCount = 3;
    mockConflictStore.totalBlocks.mockReturnValue(1);
    render(<ConflictScreen />);
    expect(
      screen.getByText(/docs\/ 外に 3 ファイルのコンフリクトがあります/)
    ).toBeInTheDocument();
  });

  it("解消完了オーバーレイが表示される", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.totalBlocks.mockReturnValue(1);
    mockConflictStore.resolveAllStatus = "success";
    mockConflictStore.resolveAllResult = {
      commit_sha: "abc12345def",
      resolved_files: 1,
    };
    render(<ConflictScreen />);
    expect(screen.getByText("Conflicts resolved")).toBeInTheDocument();
    expect(screen.getByText("abc12345")).toBeInTheDocument();
  });

  it("USE ALL MINE / USE ALL THEIRS ボタンが表示される", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.activeFileId = 1;
    mockConflictStore.activeFile.mockReturnValue(mockFile);
    mockConflictStore.totalBlocks.mockReturnValue(1);
    render(<ConflictScreen />);
    expect(screen.getByText("USE ALL MINE")).toBeInTheDocument();
    expect(screen.getByText("USE ALL THEIRS")).toBeInTheDocument();
  });

  it("USE ALL MINE クリックで resolveAllBlocks が呼ばれる", () => {
    mockConflictStore.managedFiles = [mockFile];
    mockConflictStore.activeFileId = 1;
    mockConflictStore.activeFile.mockReturnValue(mockFile);
    mockConflictStore.totalBlocks.mockReturnValue(1);
    render(<ConflictScreen />);
    fireEvent.click(screen.getByText("USE ALL MINE"));
    expect(mockConflictStore.resolveAllBlocks).toHaveBeenCalledWith(1, "ours");
  });

  it("アンマウント時に reset が呼ばれる", () => {
    const { unmount } = render(<ConflictScreen />);
    unmount();
    expect(mockConflictStore.reset).toHaveBeenCalled();
  });
});
