import { beforeEach, describe, it, expect, vi } from "vitest";
import { useDocumentStore } from "./documentStore";
import * as ipc from "../lib/ipc";
import type { Document, DocumentWithContent, Issue, SaveResult } from "../types";

vi.mock("../lib/ipc");
const mockIpc = vi.mocked(ipc);

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

function makeDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    project_id: 1,
    path: "docs/spec.md",
    title: null,
    sha: "abc123",
    size_bytes: 100,
    embedding_status: "pending",
    push_status: "synced",
    is_dirty: false,
    last_indexed_at: null,
    last_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDocWithContent(overrides: Partial<Document> = {}): DocumentWithContent {
  return { ...makeDocument(overrides), content: "# Spec\n\nContent here." };
}

describe("documentStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentStore.setState({
      documents: [],
      currentDoc: null,
      saveStatus: "idle",
      saveProgress: null,
      error: null,
    });
  });

  // ─── 初期状態 ───────────────────────────────────────────────────────────────

  it("初期状態が正しい", () => {
    const s = useDocumentStore.getState();
    expect(s.documents).toEqual([]);
    expect(s.currentDoc).toBeNull();
    expect(s.saveStatus).toBe("idle");
  });

  // ─── fetchDocuments ────────────────────────────────────────────────────────

  it("fetchDocuments() が documentList を呼ぶ", async () => {
    mockIpc.documentList.mockResolvedValueOnce([]);
    await useDocumentStore.getState().fetchDocuments(1);
    expect(mockIpc.documentList).toHaveBeenCalledWith(1);
  });

  it("fetchDocuments() 成功時に documents がセットされる", async () => {
    const docs = [makeDocument({ id: 1 }), makeDocument({ id: 2, path: "docs/design.md" })];
    mockIpc.documentList.mockResolvedValueOnce(docs);

    await useDocumentStore.getState().fetchDocuments(1);

    expect(useDocumentStore.getState().documents).toHaveLength(2);
  });

  it("fetchDocuments() 失敗時に error がセットされる", async () => {
    const err = { code: "Db", message: "db error" };
    mockIpc.documentList.mockRejectedValueOnce(err);

    await useDocumentStore.getState().fetchDocuments(1);

    expect(useDocumentStore.getState().error).toEqual(err);
  });

  // ─── openDocument ──────────────────────────────────────────────────────────

  it("openDocument() が documentGet を正しい引数で呼ぶ", async () => {
    const doc = makeDocument({ id: 5, project_id: 2 });
    useDocumentStore.setState({ documents: [doc] });
    mockIpc.documentGet.mockResolvedValueOnce(makeDocWithContent({ id: 5, project_id: 2 }));

    await useDocumentStore.getState().openDocument(5);

    expect(mockIpc.documentGet).toHaveBeenCalledWith(2, 5);
  });

  it("openDocument() 成功時に currentDoc がセットされる", async () => {
    const doc = makeDocument({ id: 3, project_id: 1 });
    useDocumentStore.setState({ documents: [doc] });
    const withContent = makeDocWithContent({ id: 3 });
    mockIpc.documentGet.mockResolvedValueOnce(withContent);

    await useDocumentStore.getState().openDocument(3);

    expect(useDocumentStore.getState().currentDoc).toEqual(withContent);
  });

  it("openDocument() で documents に存在しない id はエラーをセットする", async () => {
    useDocumentStore.setState({ documents: [] });

    await useDocumentStore.getState().openDocument(999);

    // documents に id=999 がないため error がセットされること
    expect(useDocumentStore.getState().error).toBeTruthy();
    expect(mockIpc.documentGet).not.toHaveBeenCalled();
  });

  // ─── saveDocument ──────────────────────────────────────────────────────────

  it("saveDocument() が documentSave を呼ぶ", async () => {
    useDocumentStore.setState({ currentDoc: makeDocWithContent({ id: 1, project_id: 1 }) });
    const result: SaveResult = { sha: "newsha", committed: true, push_status: "pending_push" };
    mockIpc.documentSave.mockResolvedValueOnce(result);

    await useDocumentStore.getState().saveDocument(1, "new content");

    expect(mockIpc.documentSave).toHaveBeenCalledWith(1, 1, "new content");
  });

  it("saveDocument() 成功後に documents の push_status と sha が更新される", async () => {
    const doc = makeDocument({ id: 1, sha: "old", push_status: "pending_push" });
    useDocumentStore.setState({
      documents: [doc],
      currentDoc: makeDocWithContent({ id: 1, project_id: 1 }),
    });
    const result: SaveResult = { sha: "newsha", committed: true, push_status: "synced" };
    mockIpc.documentSave.mockResolvedValueOnce(result);

    await useDocumentStore.getState().saveDocument(1, "updated content");

    const updated = useDocumentStore.getState().documents[0];
    expect(updated.sha).toBe("newsha");
    expect(updated.push_status).toBe("synced");
    expect(updated.is_dirty).toBe(false);
  });

  it("saveDocument() 成功後に saveStatus が 'success' になる", async () => {
    useDocumentStore.setState({ currentDoc: makeDocWithContent({ id: 1, project_id: 1 }) });
    mockIpc.documentSave.mockResolvedValueOnce({ sha: "s", committed: true, push_status: "synced" });

    await useDocumentStore.getState().saveDocument(1, "content");

    expect(useDocumentStore.getState().saveStatus).toBe("success");
  });

  it("saveDocument() 失敗時に saveStatus が 'error' になる", async () => {
    useDocumentStore.setState({ currentDoc: makeDocWithContent({ id: 1, project_id: 1 }) });
    mockIpc.documentSave.mockRejectedValueOnce({ code: "Git", message: "commit failed" });

    await expect(useDocumentStore.getState().saveDocument(1, "content")).rejects.toBeTruthy();
    expect(useDocumentStore.getState().saveStatus).toBe("error");
  });

  // ─── setDirty ──────────────────────────────────────────────────────────────

  it("setDirty() で documents の is_dirty が更新される", () => {
    const doc = makeDocument({ id: 1 });
    useDocumentStore.setState({ documents: [doc] });
    mockIpc.documentSetDirty.mockResolvedValue(undefined);

    useDocumentStore.getState().setDirty(1, true);

    expect(useDocumentStore.getState().documents[0].is_dirty).toBe(true);
  });

  it("setDirty() で currentDoc の is_dirty も更新される", () => {
    const doc = makeDocWithContent({ id: 1, is_dirty: false });
    useDocumentStore.setState({
      documents: [makeDocument({ id: 1 })],
      currentDoc: doc,
    });
    mockIpc.documentSetDirty.mockResolvedValue(undefined);

    useDocumentStore.getState().setDirty(1, true);

    expect(useDocumentStore.getState().currentDoc?.is_dirty).toBe(true);
  });

  it("setDirty() が documentSetDirty IPC を呼ぶ", () => {
    useDocumentStore.setState({ documents: [makeDocument({ id: 1 })] });
    mockIpc.documentSetDirty.mockResolvedValue(undefined);

    useDocumentStore.getState().setDirty(1, true);

    expect(mockIpc.documentSetDirty).toHaveBeenCalledWith(0, 1, true);
  });

  it("setDirty() が currentDoc がある場合 projectId を使う", () => {
    useDocumentStore.setState({
      documents: [makeDocument({ id: 1 })],
      currentDoc: makeDocWithContent({ id: 1, project_id: 3 }),
    });
    mockIpc.documentSetDirty.mockResolvedValue(undefined);

    useDocumentStore.getState().setDirty(1, true);

    expect(mockIpc.documentSetDirty).toHaveBeenCalledWith(3, 1, true);
  });

  // ─── scanDocuments ─────────────────────────────────────────────────────────

  it("scanDocuments() が documentScan と documentList を呼ぶ", async () => {
    mockIpc.documentScan.mockResolvedValueOnce({ added: 2, updated: 0, deleted: 0, total: 2 });
    mockIpc.documentList.mockResolvedValueOnce([makeDocument()]);

    const count = await useDocumentStore.getState().scanDocuments(1);

    expect(mockIpc.documentScan).toHaveBeenCalledWith(1);
    expect(count).toBe(2);
  });

  // ─── fetchLinkedIssues ───────────────────────────────────────────────────────

  it("fetchLinkedIssues() が documentLinkedIssues IPC を呼ぶ", async () => {
    mockIpc.documentLinkedIssues.mockResolvedValueOnce([]);
    await useDocumentStore.getState().fetchLinkedIssues(10);
    expect(mockIpc.documentLinkedIssues).toHaveBeenCalledWith(0, 10);
  });

  it("fetchLinkedIssues() 成功時に linkedIssues がセットされる", async () => {
    const issue: Issue = {
      id: 5,
      project_id: 1,
      github_number: 10,
      github_id: 2001,
      title: "Fix auth",
      body: null,
      status: "open",
      author_login: "alice",
      assignee_login: null,
      labels: "[]",
      milestone: null,
      linked_pr_number: null,
      created_by: "user",
      github_created_at: "2026-01-01T00:00:00Z",
      github_updated_at: "2026-01-01T00:00:00Z",
      synced_at: "2026-01-01T00:00:00Z",
    };
    mockIpc.documentLinkedIssues.mockResolvedValueOnce([issue]);
    await useDocumentStore.getState().fetchLinkedIssues(10);
    expect(useDocumentStore.getState().linkedIssues).toEqual([issue]);
  });

  it("fetchLinkedIssues() 失敗時に linkedIssues は空のまま", async () => {
    mockIpc.documentLinkedIssues.mockRejectedValueOnce(new Error("fail"));
    await useDocumentStore.getState().fetchLinkedIssues(10);
    expect(useDocumentStore.getState().linkedIssues).toEqual([]);
  });

  // ─── retryPush ────────────────────────────────────────────────────────────

  it("retryPush() が documentPushRetry を呼ぶ", async () => {
    mockIpc.documentPushRetry.mockResolvedValueOnce(undefined);
    await useDocumentStore.getState().retryPush(7);
    expect(mockIpc.documentPushRetry).toHaveBeenCalledWith(0, 7);
  });

  it("retryPush() 失敗時に error がセットされる", async () => {
    mockIpc.documentPushRetry.mockRejectedValueOnce(new Error("push failed"));
    await useDocumentStore.getState().retryPush(7);
    expect(useDocumentStore.getState().error).toBeTruthy();
  });

  // ─── listenSaveProgress ───────────────────────────────────────────────────

  it("listenSaveProgress() が doc_save_progress イベントをリッスンし cleanup 関数を返す", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    const cleanup = await useDocumentStore.getState().listenSaveProgress();
    expect(listen).toHaveBeenCalledWith("doc_save_progress", expect.any(Function));
    expect(typeof cleanup).toBe("function");
  });

  it("listenSaveProgress() のクリーンアップを呼ぶと unlisten が実行される", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    const mockUnlisten = vi.fn();
    vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);

    const cleanup = await useDocumentStore.getState().listenSaveProgress();
    cleanup();
    expect(mockUnlisten).toHaveBeenCalled();
  });

  // ─── createDocument ──────────────────────────────────────────────────────

  it("createDocument() が documentCreate を呼んで documents に追加する", async () => {
    const newDoc = makeDocument({ id: 10, path: "docs/new.md" });
    mockIpc.documentCreate.mockResolvedValueOnce(newDoc);
    useDocumentStore.setState({ documents: [] });

    const result = await useDocumentStore.getState().createDocument(1, "docs/new.md");

    expect(mockIpc.documentCreate).toHaveBeenCalledWith(1, "docs/new.md");
    expect(result).toEqual(newDoc);
    expect(useDocumentStore.getState().documents).toContainEqual(newDoc);
  });

  it("createDocument() 後に documents がパス順にソートされる", async () => {
    const existing = makeDocument({ id: 1, path: "docs/z.md" });
    useDocumentStore.setState({ documents: [existing] });
    const newDoc = makeDocument({ id: 2, path: "docs/a.md" });
    mockIpc.documentCreate.mockResolvedValueOnce(newDoc);

    await useDocumentStore.getState().createDocument(1, "docs/a.md");

    const docs = useDocumentStore.getState().documents;
    expect(docs[0].path).toBe("docs/a.md");
    expect(docs[1].path).toBe("docs/z.md");
  });

  // ─── renameDocument ──────────────────────────────────────────────────────

  it("renameDocument() が documentRename を呼んで documents を更新する", async () => {
    const original = makeDocument({ id: 1, path: "docs/old.md" });
    const renamed = makeDocument({ id: 1, path: "docs/new.md" });
    useDocumentStore.setState({ documents: [original], currentDoc: null });
    mockIpc.documentRename.mockResolvedValueOnce(renamed);

    const result = await useDocumentStore.getState().renameDocument(1, 1, "docs/new.md");

    expect(mockIpc.documentRename).toHaveBeenCalledWith(1, 1, "docs/new.md");
    expect(result).toEqual(renamed);
    expect(useDocumentStore.getState().documents[0].path).toBe("docs/new.md");
  });

  it("renameDocument() で currentDoc が同じ id なら currentDoc も更新される", async () => {
    const original = makeDocument({ id: 1, path: "docs/old.md" });
    const renamed = makeDocument({ id: 1, path: "docs/new.md" });
    useDocumentStore.setState({
      documents: [original],
      currentDoc: makeDocWithContent({ id: 1, path: "docs/old.md", project_id: 1 }),
    });
    mockIpc.documentRename.mockResolvedValueOnce(renamed);

    await useDocumentStore.getState().renameDocument(1, 1, "docs/new.md");

    expect(useDocumentStore.getState().currentDoc?.path).toBe("docs/new.md");
  });

  // ─── fetchFileTree ────────────────────────────────────────────────────────

  it("fetchFileTree() が fileTree を呼んで fileTreeNodes をセットする", async () => {
    const nodes = [{ id: "n1", name: "src", path: "src", kind: "dir" as const, children: [] }];
    mockIpc.fileTree.mockResolvedValueOnce(nodes);

    await useDocumentStore.getState().fetchFileTree(1);

    expect(mockIpc.fileTree).toHaveBeenCalledWith(1);
    expect(useDocumentStore.getState().fileTreeNodes).toEqual(nodes);
    expect(useDocumentStore.getState().fileTreeLoading).toBe(false);
  });

  it("fetchFileTree() 失敗時に fileTreeLoading が false に戻る", async () => {
    mockIpc.fileTree.mockRejectedValueOnce(new Error("fail"));
    await useDocumentStore.getState().fetchFileTree(1);
    expect(useDocumentStore.getState().fileTreeLoading).toBe(false);
  });

  // ─── openCodeFile ─────────────────────────────────────────────────────────

  it("openCodeFile() 成功時に openedFile が code タイプになる", async () => {
    mockIpc.fileRead.mockResolvedValueOnce({
      path: "src/foo.ts",
      content: "const x = 1;",
      truncated: false,
      total_lines: 1,
    });

    await useDocumentStore.getState().openCodeFile(1, "src/foo.ts");

    const of = useDocumentStore.getState().openedFile;
    expect(of?.type).toBe("code");
    if (of?.type === "code") {
      expect(of.path).toBe("src/foo.ts");
      expect(of.content).toBe("const x = 1;");
    }
  });

  it("openCodeFile() 失敗時に openedFile が code-error タイプになる", async () => {
    mockIpc.fileRead.mockRejectedValueOnce({ message: "file not found" });

    await useDocumentStore.getState().openCodeFile(1, "src/missing.ts");

    const of = useDocumentStore.getState().openedFile;
    expect(of?.type).toBe("code-error");
    if (of?.type === "code-error") {
      expect(of.error).toBe("file not found");
    }
  });

  // ─── saveCodeFile ─────────────────────────────────────────────────────────

  it("saveCodeFile() 成功時に codeSaveStatus が success になる", async () => {
    mockIpc.fileSave.mockResolvedValueOnce(undefined);

    await useDocumentStore.getState().saveCodeFile(1, "src/foo.ts", "content");

    expect(mockIpc.fileSave).toHaveBeenCalledWith(1, "src/foo.ts", "content");
    expect(useDocumentStore.getState().codeSaveStatus).toBe("success");
  });

  it("saveCodeFile() 失敗時に codeSaveStatus が error になりリスローされる", async () => {
    mockIpc.fileSave.mockRejectedValueOnce({ message: "write error" });

    await expect(
      useDocumentStore.getState().saveCodeFile(1, "src/foo.ts", "content")
    ).rejects.toBeTruthy();
    expect(useDocumentStore.getState().codeSaveStatus).toBe("error");
  });

  // ─── listenCodeSaveProgress ──────────────────────────────────────────────

  it("listenCodeSaveProgress() が code_save_progress イベントをリッスンする", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    const cleanup = await useDocumentStore.getState().listenCodeSaveProgress();
    expect(listen).toHaveBeenCalledWith("code_save_progress", expect.any(Function));
    expect(typeof cleanup).toBe("function");
  });

  // ─── reset ───────────────────────────────────────────────────────────────

  it("reset() で全状態が初期値に戻る", () => {
    useDocumentStore.setState({
      documents: [makeDocument()],
      currentDoc: makeDocWithContent(),
      linkedIssues: [],
      saveStatus: "success",
      error: { code: "Git", message: "err" } as never,
      fileTreeLoading: true,
      codeSaveStatus: "error",
    });

    useDocumentStore.getState().reset();
    const s = useDocumentStore.getState();
    expect(s.documents).toEqual([]);
    expect(s.currentDoc).toBeNull();
    expect(s.saveStatus).toBe("idle");
    expect(s.error).toBeNull();
    expect(s.fileTreeNodes).toEqual([]);
    expect(s.fileTreeLoading).toBe(false);
    expect(s.codeSaveStatus).toBe("idle");
  });

  // ─── 未カバーブランチ補完 ─────────────────────────────────────────────────

  // fetchLinkedIssues: currentDoc.project_id が存在するパス (lines 161-162)
  it("fetchLinkedIssues() currentDoc に project_id があると projectId を使って呼ぶ", async () => {
    useDocumentStore.setState({
      currentDoc: makeDocWithContent({ project_id: 5 }),
    });
    mockIpc.documentLinkedIssues.mockResolvedValueOnce([]);

    await useDocumentStore.getState().fetchLinkedIssues(10);

    expect(mockIpc.documentLinkedIssues).toHaveBeenCalledWith(5, 10);
  });

  // renameDocument: currentDoc?.id !== documentId のとき currentDoc は変わらない (line 210/213)
  it("renameDocument() currentDoc が別の id なら currentDoc は更新されない", async () => {
    const original = makeDocument({ id: 1, path: "docs/old.md" });
    const renamed = makeDocument({ id: 1, path: "docs/new.md" });
    const other = makeDocWithContent({ id: 99, path: "docs/other.md" });
    useDocumentStore.setState({ documents: [original], currentDoc: other });
    mockIpc.documentRename.mockResolvedValueOnce(renamed);

    await useDocumentStore.getState().renameDocument(1, 1, "docs/new.md");

    // currentDoc は id=99 のまま変わらない
    expect(useDocumentStore.getState().currentDoc?.id).toBe(99);
  });

  // listenCodeSaveProgress のコールバックが codeSaveProgress を更新する (line 233)
  it("listenCodeSaveProgress() コールバックが codeSaveProgress をセットする", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    const mockListen = vi.mocked(listen);
    let capturedCb: ((e: { payload: unknown }) => void) | null = null;
    mockListen.mockImplementationOnce((_evt, cb) => {
      capturedCb = cb as (e: { payload: unknown }) => void;
      return Promise.resolve(vi.fn());
    });

    await useDocumentStore.getState().listenCodeSaveProgress();

    const payload = { file: "docs/spec.md", progress: 50, total: 100 };
    capturedCb?.({ payload });

    expect(useDocumentStore.getState().codeSaveProgress).toEqual(payload);
  });
});
