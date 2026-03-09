import { beforeEach, describe, it, expect, vi } from "vitest";
import { useDocumentStore } from "./documentStore";
import * as ipc from "../lib/ipc";
import type { Document, DocumentWithContent, Issue, SaveResult } from "../types";

vi.mock("../lib/ipc");
const mockIpc = vi.mocked(ipc);

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

    expect(mockIpc.documentSetDirty).toHaveBeenCalledWith(1, true);
  });

  // ─── scanDocuments ─────────────────────────────────────────────────────────

  it("scanDocuments() が documentScan と documentList を呼ぶ", async () => {
    mockIpc.documentScan.mockResolvedValueOnce({ count: 2 });
    mockIpc.documentList.mockResolvedValueOnce([makeDocument()]);

    const count = await useDocumentStore.getState().scanDocuments(1);

    expect(mockIpc.documentScan).toHaveBeenCalledWith(1);
    expect(count).toBe(2);
  });

  // ─── fetchLinkedIssues ───────────────────────────────────────────────────────

  it("fetchLinkedIssues() が documentLinkedIssues IPC を呼ぶ", async () => {
    mockIpc.documentLinkedIssues.mockResolvedValueOnce([]);
    await useDocumentStore.getState().fetchLinkedIssues(10);
    expect(mockIpc.documentLinkedIssues).toHaveBeenCalledWith(10);
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
});
