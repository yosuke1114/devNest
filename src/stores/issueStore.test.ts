import { beforeEach, describe, it, expect, vi } from "vitest";
import { useIssueStore } from "./issueStore";
import * as ipc from "../lib/ipc";
import type { Issue, IssueDraft, IssueDocLink } from "../types";

vi.mock("../lib/ipc");
const mockIpc = vi.mocked(ipc);

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    project_id: 1,
    github_number: 42,
    github_id: 100,
    title: "Fix the bug",
    body: null,
    status: "open",
    author_login: "user",
    assignee_login: null,
    labels: "[]",
    milestone: null,
    linked_pr_number: null,
    created_by: "user",
    github_created_at: "2026-01-01T00:00:00Z",
    github_updated_at: "2026-01-01T00:00:00Z",
    synced_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDraft(overrides: Partial<IssueDraft> = {}): IssueDraft {
  return {
    id: 1,
    project_id: 1,
    title: "Draft title",
    body: "",
    draft_body: null,
    wizard_context: null,
    labels: "[]",
    assignee_login: null,
    status: "draft",
    github_issue_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDocLink(overrides: Partial<IssueDocLink> = {}): IssueDocLink {
  return {
    id: 1,
    issue_id: 1,
    document_id: 10,
    link_type: "manual",
    created_by: "user",
    created_at: "2026-01-01T00:00:00Z",
    path: "docs/spec.md",
    title: null,
    ...overrides,
  };
}

describe("issueStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useIssueStore.setState({
      issues: [],
      currentIssue: null,
      issueLinks: [],
      drafts: [],
      currentDraft: null,
      draftStreamBuffer: "",
      labels: [],
      listStatus: "idle",
      syncStatus: "idle",
      generateStatus: "idle",
      error: null,
    });
  });

  // ─── 初期状態 ───────────────────────────────────────────────────────────────

  it("初期状態が正しい", () => {
    const s = useIssueStore.getState();
    expect(s.issues).toEqual([]);
    expect(s.listStatus).toBe("idle");
    expect(s.currentDraft).toBeNull();
  });

  // ─── fetchIssues ───────────────────────────────────────────────────────────

  it("fetchIssues() が issueList を呼ぶ", async () => {
    mockIpc.issueList.mockResolvedValueOnce([]);
    await useIssueStore.getState().fetchIssues(1);
    expect(mockIpc.issueList).toHaveBeenCalledWith(1, undefined);
  });

  it("fetchIssues() に statusFilter を渡せる", async () => {
    mockIpc.issueList.mockResolvedValueOnce([]);
    await useIssueStore.getState().fetchIssues(1, "open");
    expect(mockIpc.issueList).toHaveBeenCalledWith(1, "open");
  });

  it("fetchIssues() 成功時に issues がセットされる", async () => {
    const issues = [makeIssue({ id: 1 }), makeIssue({ id: 2 })];
    mockIpc.issueList.mockResolvedValueOnce(issues);

    await useIssueStore.getState().fetchIssues(1);

    expect(useIssueStore.getState().issues).toHaveLength(2);
    expect(useIssueStore.getState().listStatus).toBe("success");
  });

  it("fetchIssues() 失敗時に error がセットされる", async () => {
    const err = { code: "GitHub", message: "rate limit" };
    mockIpc.issueList.mockRejectedValueOnce(err);

    await useIssueStore.getState().fetchIssues(1);

    expect(useIssueStore.getState().listStatus).toBe("error");
    expect(useIssueStore.getState().error).toEqual(err);
  });

  // ─── syncIssues ────────────────────────────────────────────────────────────

  it("syncIssues() が issueSync と issueList を呼ぶ", async () => {
    mockIpc.issueSync.mockResolvedValueOnce({ synced_count: 3 });
    mockIpc.issueList.mockResolvedValueOnce([]);

    const count = await useIssueStore.getState().syncIssues(1);

    expect(mockIpc.issueSync).toHaveBeenCalledWith(1);
    expect(count).toBe(3);
  });

  it("syncIssues() 失敗時に 0 を返す", async () => {
    mockIpc.issueSync.mockRejectedValueOnce(new Error("failed"));

    const count = await useIssueStore.getState().syncIssues(1);

    expect(count).toBe(0);
    expect(useIssueStore.getState().syncStatus).toBe("error");
  });

  // ─── selectIssue ───────────────────────────────────────────────────────────

  it("selectIssue() で currentIssue がセットされる", () => {
    const issue = makeIssue();
    useIssueStore.getState().selectIssue(issue);
    expect(useIssueStore.getState().currentIssue).toEqual(issue);
  });

  it("selectIssue(null) で currentIssue が null になる", () => {
    useIssueStore.setState({ currentIssue: makeIssue() });
    useIssueStore.getState().selectIssue(null);
    expect(useIssueStore.getState().currentIssue).toBeNull();
  });

  // ─── fetchIssueLinks ───────────────────────────────────────────────────────

  it("fetchIssueLinks() が issueDocLinkList を呼ぶ", async () => {
    useIssueStore.setState({ currentIssue: makeIssue({ id: 1, project_id: 2 }) });
    mockIpc.issueDocLinkList.mockResolvedValueOnce([]);
    await useIssueStore.getState().fetchIssueLinks(1);
    expect(mockIpc.issueDocLinkList).toHaveBeenCalledWith(2, 1);
  });

  it("fetchIssueLinks() 成功時に issueLinks がセットされる", async () => {
    const links = [makeDocLink(), makeDocLink({ id: 2, document_id: 20 })];
    mockIpc.issueDocLinkList.mockResolvedValueOnce(links);

    await useIssueStore.getState().fetchIssueLinks(1);

    expect(useIssueStore.getState().issueLinks).toHaveLength(2);
  });

  // ─── Draft ─────────────────────────────────────────────────────────────────

  it("createDraft() が issueDraftCreate を呼ぶ", async () => {
    const draft = makeDraft({ id: 5 });
    mockIpc.issueDraftCreate.mockResolvedValueOnce(draft);

    const result = await useIssueStore.getState().createDraft(1);

    expect(mockIpc.issueDraftCreate).toHaveBeenCalledWith(1);
    expect(result.id).toBe(5);
  });

  it("createDraft() 後に currentDraft がセットされる", async () => {
    const draft = makeDraft({ id: 99 });
    mockIpc.issueDraftCreate.mockResolvedValueOnce(draft);

    await useIssueStore.getState().createDraft(1);

    expect(useIssueStore.getState().currentDraft?.id).toBe(99);
    expect(useIssueStore.getState().drafts).toHaveLength(1);
  });

  it("updateDraft() が issueDraftUpdate を呼ぶ", async () => {
    const original = makeDraft({ id: 1 });
    const updated = makeDraft({ id: 1, title: "Updated title" });
    useIssueStore.setState({ drafts: [original], currentDraft: original });
    mockIpc.issueDraftUpdate.mockResolvedValueOnce(updated);

    await useIssueStore.getState().updateDraft({ id: 1, title: "Updated title" });

    expect(mockIpc.issueDraftUpdate).toHaveBeenCalledWith({ id: 1, title: "Updated title" });
    expect(useIssueStore.getState().currentDraft?.title).toBe("Updated title");
  });

  it("selectDraft() で currentDraft がセットされ draftStreamBuffer が初期化される", () => {
    const draft = makeDraft({ draft_body: "existing body" });
    useIssueStore.getState().selectDraft(draft);

    expect(useIssueStore.getState().currentDraft).toEqual(draft);
    expect(useIssueStore.getState().draftStreamBuffer).toBe("existing body");
  });

  it("selectDraft(null) で currentDraft が null になる", () => {
    useIssueStore.setState({ currentDraft: makeDraft() });
    useIssueStore.getState().selectDraft(null);
    expect(useIssueStore.getState().currentDraft).toBeNull();
  });

  it("generateDraft() が issueDraftGenerate を呼ぶ", async () => {
    mockIpc.issueDraftGenerate.mockResolvedValueOnce(undefined);
    await useIssueStore.getState().generateDraft(1);
    expect(mockIpc.issueDraftGenerate).toHaveBeenCalledWith(1);
    expect(useIssueStore.getState().generateStatus).toBe("success");
  });

  // ─── cancelDraft ───────────────────────────────────────────────────────────

  it("cancelDraft() が issueDraftCancel を呼ぶ", async () => {
    vi.mocked(ipc.issueDraftCancel).mockResolvedValueOnce(undefined);
    await useIssueStore.getState().cancelDraft(1);
    expect(ipc.issueDraftCancel).toHaveBeenCalledWith(1);
  });

  it("cancelDraft() 後に drafts から対象が除去される", async () => {
    const draft1 = makeDraft({ id: 1 });
    const draft2 = makeDraft({ id: 2 });
    useIssueStore.setState({ drafts: [draft1, draft2], currentDraft: draft1 });
    vi.mocked(ipc.issueDraftCancel).mockResolvedValueOnce(undefined);

    await useIssueStore.getState().cancelDraft(1);

    const state = useIssueStore.getState();
    expect(state.drafts).toHaveLength(1);
    expect(state.drafts[0].id).toBe(2);
    expect(state.currentDraft).toBeNull();
  });

  it("cancelDraft() で currentDraft でない下書きを削除しても currentDraft は維持される", async () => {
    const draft1 = makeDraft({ id: 1 });
    const draft2 = makeDraft({ id: 2 });
    useIssueStore.setState({ drafts: [draft1, draft2], currentDraft: draft2 });
    vi.mocked(ipc.issueDraftCancel).mockResolvedValueOnce(undefined);

    await useIssueStore.getState().cancelDraft(1);

    const state = useIssueStore.getState();
    expect(state.drafts).toHaveLength(1);
    expect(state.currentDraft?.id).toBe(2);
  });

  // ─── addIssueLink / removeIssueLink ──────────────────────────────────────

  it("addIssueLink() が issueDocLinkAdd を呼ぶ", async () => {
    mockIpc.issueDocLinkAdd.mockResolvedValueOnce(undefined);
    mockIpc.issueDocLinkList.mockResolvedValueOnce([]);
    await useIssueStore.getState().addIssueLink(1, 10);
    expect(mockIpc.issueDocLinkAdd).toHaveBeenCalledWith(1, 10);
  });

  it("addIssueLink() 後に issueLinks が再フェッチされる", async () => {
    useIssueStore.setState({ currentIssue: makeIssue({ id: 1, project_id: 2 }) });
    const link = makeDocLink({ issue_id: 1, document_id: 10 });
    mockIpc.issueDocLinkAdd.mockResolvedValueOnce(undefined);
    mockIpc.issueDocLinkList.mockResolvedValueOnce([link]);

    await useIssueStore.getState().addIssueLink(1, 10);

    expect(mockIpc.issueDocLinkList).toHaveBeenCalledWith(2, 1);
    expect(useIssueStore.getState().issueLinks).toHaveLength(1);
  });

  it("removeIssueLink() が issueDocLinkRemove を呼ぶ", async () => {
    const link = makeDocLink({ id: 5, issue_id: 1, document_id: 10 });
    useIssueStore.setState({ issueLinks: [link] });
    mockIpc.issueDocLinkRemove.mockResolvedValueOnce(undefined);
    mockIpc.issueDocLinkList.mockResolvedValueOnce([]);

    await useIssueStore.getState().removeIssueLink(1, 10);

    expect(mockIpc.issueDocLinkRemove).toHaveBeenCalledWith(1, 10);
  });

  it("removeIssueLink() 後に issueLinks が更新される", async () => {
    const link = makeDocLink({ issue_id: 1, document_id: 10 });
    useIssueStore.setState({ issueLinks: [link] });
    mockIpc.issueDocLinkRemove.mockResolvedValueOnce(undefined);
    mockIpc.issueDocLinkList.mockResolvedValueOnce([]);

    await useIssueStore.getState().removeIssueLink(1, 10);

    expect(useIssueStore.getState().issueLinks).toHaveLength(0);
  });

  // ─── getContextDocIds ─────────────────────────────────────────────────────

  it("getContextDocIds() が issueLinks の document_id リストを返す", () => {
    const links = [
      makeDocLink({ document_id: 10 }),
      makeDocLink({ document_id: 20 }),
    ];
    useIssueStore.setState({ issueLinks: links });

    const ids = useIssueStore.getState().getContextDocIds();
    expect(ids).toEqual([10, 20]);
  });

  it("getContextDocIds() issueLinks が空なら空配列を返す", () => {
    useIssueStore.setState({ issueLinks: [] });
    expect(useIssueStore.getState().getContextDocIds()).toEqual([]);
  });

  // ─── fetchDrafts ──────────────────────────────────────────────────────────

  it("fetchDrafts() が issueDraftList を呼ぶ", async () => {
    mockIpc.issueDraftList.mockResolvedValueOnce([]);
    await useIssueStore.getState().fetchDrafts(1);
    expect(mockIpc.issueDraftList).toHaveBeenCalledWith(1);
  });

  it("fetchDrafts() 成功時に drafts がセットされる", async () => {
    const draft = makeDraft({ id: 10 });
    mockIpc.issueDraftList.mockResolvedValueOnce([draft]);

    await useIssueStore.getState().fetchDrafts(1);

    expect(useIssueStore.getState().drafts).toHaveLength(1);
    expect(useIssueStore.getState().drafts[0].id).toBe(10);
  });

  it("fetchDrafts() 失敗時に drafts が空のままになる", async () => {
    mockIpc.issueDraftList.mockRejectedValueOnce(new Error("fail"));

    await useIssueStore.getState().fetchDrafts(1);

    expect(useIssueStore.getState().drafts).toHaveLength(0);
  });

  // ─── fetchLabels ───────────────────────────────────────────────────────────

  it("fetchLabels() が githubLabelsList を呼ぶ", async () => {
    mockIpc.githubLabelsList.mockResolvedValueOnce([]);
    await useIssueStore.getState().fetchLabels(1);
    expect(mockIpc.githubLabelsList).toHaveBeenCalledWith(1);
  });

  it("fetchLabels() 成功時に labels がセットされる", async () => {
    const labels = [{ id: 1, name: "bug", color: "ff0000", description: null }];
    mockIpc.githubLabelsList.mockResolvedValueOnce(labels);

    await useIssueStore.getState().fetchLabels(1);

    expect(useIssueStore.getState().labels).toHaveLength(1);
    expect(useIssueStore.getState().labels[0].name).toBe("bug");
  });
});
