import { beforeEach, describe, it, expect, vi } from "vitest";
import { useConflictStore } from "./conflictStore";
import * as ipc from "../lib/ipc";
import type { ConflictFile, ConflictScanResult } from "../types";

vi.mock("../lib/ipc");
const mockIpc = vi.mocked(ipc);

function makeBlock(index: number) {
  return { index, ours: "ours content", theirs: "theirs content" };
}

function makeConflictFile(overrides: Partial<ConflictFile> = {}): ConflictFile {
  return {
    id: 1,
    project_id: 1,
    file_path: "docs/spec.md",
    is_managed: true,
    sync_log_id: null,
    document_id: null,
    our_content: null,
    their_content: null,
    merged_content: null,
    resolution: null,
    resolved_at: null,
    blocks: [makeBlock(0), makeBlock(1)],
    ...overrides,
  };
}

function makeScanResult(files: ConflictFile[] = [], unmanagedCount = 0): ConflictScanResult {
  return { managed: files, unmanaged_count: unmanagedCount };
}

describe("conflictStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConflictStore.setState({
      managedFiles: [],
      unmanagedCount: 0,
      activeFileId: null,
      resolutions: {},
      listStatus: "idle",
      resolveStatus: "idle",
      resolveAllStatus: "idle",
      resolveAllResult: null,
      error: null,
    });
  });

  // ─── 初期状態 ───────────────────────────────────────────────────────────────

  it("初期状態が正しい", () => {
    const s = useConflictStore.getState();
    expect(s.managedFiles).toEqual([]);
    expect(s.unmanagedCount).toBe(0);
    expect(s.listStatus).toBe("idle");
  });

  // ─── loadConflicts ─────────────────────────────────────────────────────────

  it("loadConflicts() が conflictList を呼ぶ", async () => {
    mockIpc.conflictList.mockResolvedValueOnce(makeScanResult());
    await useConflictStore.getState().loadConflicts(1);
    expect(mockIpc.conflictList).toHaveBeenCalledWith(1);
  });

  it("loadConflicts() 成功時に managedFiles がセットされる", async () => {
    const file = makeConflictFile();
    mockIpc.conflictList.mockResolvedValueOnce(makeScanResult([file], 2));

    await useConflictStore.getState().loadConflicts(1);

    expect(useConflictStore.getState().managedFiles).toHaveLength(1);
    expect(useConflictStore.getState().unmanagedCount).toBe(2);
    expect(useConflictStore.getState().listStatus).toBe("success");
  });

  it("loadConflicts() 成功時に activeFileId が最初のファイル id になる", async () => {
    const file = makeConflictFile({ id: 42 });
    mockIpc.conflictList.mockResolvedValueOnce(makeScanResult([file]));

    await useConflictStore.getState().loadConflicts(1);

    expect(useConflictStore.getState().activeFileId).toBe(42);
  });

  it("loadConflicts() コンフリクトなしのとき activeFileId が null", async () => {
    mockIpc.conflictList.mockResolvedValueOnce(makeScanResult([]));

    await useConflictStore.getState().loadConflicts(1);

    expect(useConflictStore.getState().activeFileId).toBeNull();
  });

  it("loadConflicts() 失敗時に error がセットされる", async () => {
    mockIpc.conflictList.mockRejectedValueOnce(new Error("scan failed"));

    await useConflictStore.getState().loadConflicts(1);

    expect(useConflictStore.getState().listStatus).toBe("error");
    expect(useConflictStore.getState().error).toBeTruthy();
  });

  // ─── scanConflicts ─────────────────────────────────────────────────────────

  it("scanConflicts() が conflictScan を呼ぶ", async () => {
    mockIpc.conflictScan.mockResolvedValueOnce(makeScanResult());
    await useConflictStore.getState().scanConflicts(1);
    expect(mockIpc.conflictScan).toHaveBeenCalledWith(1);
  });

  // ─── setActiveFile ─────────────────────────────────────────────────────────

  it("setActiveFile() で activeFileId が変わる", () => {
    useConflictStore.getState().setActiveFile(99);
    expect(useConflictStore.getState().activeFileId).toBe(99);
  });

  // ─── setBlockResolution ────────────────────────────────────────────────────

  it("setBlockResolution() でブロックの解消選択が記録される", () => {
    useConflictStore.getState().setBlockResolution(1, 0, { resolution: "ours" });

    const res = useConflictStore.getState().resolutions;
    expect(res[1][0].resolution).toBe("ours");
  });

  it("setBlockResolution() が既存の解消記録を上書きする", () => {
    useConflictStore.getState().setBlockResolution(1, 0, { resolution: "ours" });
    useConflictStore.getState().setBlockResolution(1, 0, { resolution: "theirs" });

    expect(useConflictStore.getState().resolutions[1][0].resolution).toBe("theirs");
  });

  it("setBlockResolution() で複数ファイルの解消が独立して記録される", () => {
    useConflictStore.getState().setBlockResolution(1, 0, { resolution: "ours" });
    useConflictStore.getState().setBlockResolution(2, 0, { resolution: "theirs" });

    expect(useConflictStore.getState().resolutions[1][0].resolution).toBe("ours");
    expect(useConflictStore.getState().resolutions[2][0].resolution).toBe("theirs");
  });

  // ─── resolveAllBlocks ──────────────────────────────────────────────────────

  it("resolveAllBlocks() が全ブロックを同じ resolution でセットする", () => {
    const file = makeConflictFile({ id: 1, blocks: [makeBlock(0), makeBlock(1), makeBlock(2)] });
    useConflictStore.setState({ managedFiles: [file] });

    useConflictStore.getState().resolveAllBlocks(1, "theirs");

    const res = useConflictStore.getState().resolutions[1];
    expect(res[0].resolution).toBe("theirs");
    expect(res[1].resolution).toBe("theirs");
    expect(res[2].resolution).toBe("theirs");
  });

  it("resolveAllBlocks() で存在しないファイル id は何もしない", () => {
    useConflictStore.getState().resolveAllBlocks(999, "ours");
    expect(useConflictStore.getState().resolutions[999]).toBeUndefined();
  });

  // ─── 計算値 ────────────────────────────────────────────────────────────────

  it("totalBlocks() が全ファイルのブロック数合計を返す", () => {
    const f1 = makeConflictFile({ id: 1, blocks: [makeBlock(0), makeBlock(1)] });
    const f2 = makeConflictFile({ id: 2, blocks: [makeBlock(0)] });
    useConflictStore.setState({ managedFiles: [f1, f2] });

    expect(useConflictStore.getState().totalBlocks()).toBe(3);
  });

  it("resolvedBlocks() が解消済みブロック数を返す", () => {
    const file = makeConflictFile({ id: 1, blocks: [makeBlock(0), makeBlock(1)] });
    useConflictStore.setState({
      managedFiles: [file],
      resolutions: { 1: { 0: { resolution: "ours" } } },
    });

    expect(useConflictStore.getState().resolvedBlocks()).toBe(1);
  });

  it("allResolved() が全ブロック解消済みのとき true を返す", () => {
    const file = makeConflictFile({ id: 1, blocks: [makeBlock(0)] });
    useConflictStore.setState({
      managedFiles: [file],
      resolutions: { 1: { 0: { resolution: "ours" } } },
    });

    expect(useConflictStore.getState().allResolved()).toBe(true);
  });

  it("allResolved() が未解消ブロックがあると false を返す", () => {
    const file = makeConflictFile({ id: 1, blocks: [makeBlock(0), makeBlock(1)] });
    useConflictStore.setState({
      managedFiles: [file],
      resolutions: { 1: { 0: { resolution: "ours" } } }, // block 1 未解消
    });

    expect(useConflictStore.getState().allResolved()).toBe(false);
  });

  it("allResolved() がファイルなしのとき false を返す", () => {
    useConflictStore.setState({ managedFiles: [] });
    expect(useConflictStore.getState().allResolved()).toBe(false);
  });

  it("activeFile() が activeFileId に対応するファイルを返す", () => {
    const file = makeConflictFile({ id: 7 });
    useConflictStore.setState({ managedFiles: [file], activeFileId: 7 });

    expect(useConflictStore.getState().activeFile()?.id).toBe(7);
  });

  it("activeFile() が見つからないとき null を返す", () => {
    useConflictStore.setState({ managedFiles: [], activeFileId: 999 });
    expect(useConflictStore.getState().activeFile()).toBeNull();
  });

  // ─── saveResolutions ───────────────────────────────────────────────────────

  it("saveResolutions() が conflictResolve を呼ぶ", async () => {
    const file = makeConflictFile({ id: 1 });
    useConflictStore.setState({
      managedFiles: [file],
      resolutions: { 1: { 0: { resolution: "ours" }, 1: { resolution: "theirs" } } },
    });
    mockIpc.conflictResolve.mockResolvedValueOnce(undefined);

    await useConflictStore.getState().saveResolutions(1, 1);

    expect(mockIpc.conflictResolve).toHaveBeenCalledWith(
      1, 1, "docs/spec.md",
      expect.arrayContaining([
        expect.objectContaining({ block_index: 0, resolution: "ours" }),
        expect.objectContaining({ block_index: 1, resolution: "theirs" }),
      ])
    );
  });

  it("saveResolutions() 成功後にファイルが managedFiles から除去される", async () => {
    const f1 = makeConflictFile({ id: 1 });
    const f2 = makeConflictFile({ id: 2 });
    useConflictStore.setState({
      managedFiles: [f1, f2],
      resolutions: { 1: { 0: { resolution: "ours" }, 1: { resolution: "ours" } } },
    });
    mockIpc.conflictResolve.mockResolvedValueOnce(undefined);

    await useConflictStore.getState().saveResolutions(1, 1);

    expect(useConflictStore.getState().managedFiles).toHaveLength(1);
    expect(useConflictStore.getState().managedFiles[0].id).toBe(2);
  });

  // ─── resolveAll ────────────────────────────────────────────────────────────

  it("resolveAll() が conflictResolveAll を呼ぶ", async () => {
    mockIpc.conflictResolveAll.mockResolvedValueOnce({ commit_sha: "abc123", resolved_files: 2 });
    await useConflictStore.getState().resolveAll(1);
    expect(mockIpc.conflictResolveAll).toHaveBeenCalledWith(1);
  });

  it("resolveAll() 成功時に resolveAllResult がセットされる", async () => {
    const result = { commit_sha: "abc123", resolved_files: 2 };
    mockIpc.conflictResolveAll.mockResolvedValueOnce(result);

    await useConflictStore.getState().resolveAll(1);

    expect(useConflictStore.getState().resolveAllResult).toEqual(result);
    expect(useConflictStore.getState().resolveAllStatus).toBe("success");
  });

  // ─── reset ─────────────────────────────────────────────────────────────────

  it("reset() で全状態が初期値に戻る", () => {
    const file = makeConflictFile();
    useConflictStore.setState({
      managedFiles: [file],
      unmanagedCount: 3,
      activeFileId: 1,
      resolutions: { 1: { 0: { resolution: "ours" } } },
      listStatus: "success",
    });

    useConflictStore.getState().reset();

    const s = useConflictStore.getState();
    expect(s.managedFiles).toEqual([]);
    expect(s.unmanagedCount).toBe(0);
    expect(s.activeFileId).toBeNull();
    expect(s.resolutions).toEqual({});
    expect(s.listStatus).toBe("idle");
  });
});
