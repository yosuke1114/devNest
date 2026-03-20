import { beforeEach, describe, it, expect, vi } from "vitest";
import { usePrStore } from "./prStore";
import * as ipc from "../lib/ipc";
import type { PrDetail, PrFile, PullRequest } from "../types";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock("../lib/ipc");
// cross-store 依存をスタブ化
vi.mock("./uiStore", () => ({
  useUiStore: {
    getState: vi.fn(() => ({ navigate: vi.fn() })),
  },
}));
vi.mock("./terminalStore", () => ({
  useTerminalStore: {
    getState: vi.fn(() => ({ startSession: vi.fn() })),
  },
}));

const mockIpc = vi.mocked(ipc);

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
    project_id: 1,
    github_number: 10,
    github_id: 1000,
    title: "feat: add new feature",
    body: null,
    state: "open",
    head_branch: "feat/new-feature",
    base_branch: "main",
    author_login: "dev",
    checks_status: "passing",
    linked_issue_number: null,
    created_by: "user",
    draft: false,
    merged_at: null,
    github_created_at: "2026-01-01T00:00:00Z",
    github_updated_at: "2026-01-01T00:00:00Z",
    synced_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePrDetail(pr: PullRequest): PrDetail {
  return { pr, reviews: [], comments: [] };
}

describe("prStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // terminalSessionStart is called with .catch() so it must return a Promise
    mockIpc.terminalSessionStart.mockResolvedValue({ id: 1, project_id: 1, branch_name: null, has_doc_changes: false, prompt_summary: null, output_log: null, exit_code: null, status: "running", started_at: "2026-01-01T00:00:00Z", ended_at: null } as never);
    usePrStore.setState({
      prs: [],
      selectedPrId: null,
      detail: null,
      files: [],
      diff: "",
      docDiffs: [],
      stateFilter: "open",
      activeTab: "overview",
      fetchStatus: "idle",
      detailStatus: "idle",
      filesStatus: "idle",
      diffStatus: "idle",
      docDiffStatus: "idle",
      syncStatus: "idle",
      mergeStatus: "idle",
      reviewStatus: "idle",
      requestChangesStatus: "idle",
      createStatus: "idle",
      error: null,
    });
  });

  // ─── 初期状態 ───────────────────────────────────────────────────────────────

  it("初期状態が正しい", () => {
    const s = usePrStore.getState();
    expect(s.prs).toEqual([]);
    expect(s.stateFilter).toBe("open");
    expect(s.activeTab).toBe("overview");
  });

  // ─── fetchPrs ─────────────────────────────────────────────────────────────

  it("fetchPrs() が prList を呼ぶ", async () => {
    mockIpc.prList.mockResolvedValueOnce([]);
    await usePrStore.getState().fetchPrs(1);
    expect(mockIpc.prList).toHaveBeenCalledWith(1, "open");
  });

  it("fetchPrs() stateFilter='all' のとき filter を渡さない", async () => {
    usePrStore.setState({ stateFilter: "all" });
    mockIpc.prList.mockResolvedValueOnce([]);
    await usePrStore.getState().fetchPrs(1);
    expect(mockIpc.prList).toHaveBeenCalledWith(1, undefined);
  });

  it("fetchPrs() 成功時に prs がセットされる", async () => {
    const prs = [makePr({ id: 1 }), makePr({ id: 2 })];
    mockIpc.prList.mockResolvedValueOnce(prs);

    await usePrStore.getState().fetchPrs(1);

    expect(usePrStore.getState().prs).toHaveLength(2);
    expect(usePrStore.getState().fetchStatus).toBe("success");
  });

  it("fetchPrs() 失敗時に error がセットされる", async () => {
    mockIpc.prList.mockRejectedValueOnce(new Error("API error"));

    await usePrStore.getState().fetchPrs(1);

    expect(usePrStore.getState().fetchStatus).toBe("error");
    expect(usePrStore.getState().error).toBeTruthy();
  });

  // ─── syncPrs ──────────────────────────────────────────────────────────────

  it("syncPrs() が prSync を呼ぶ", async () => {
    mockIpc.prSync.mockResolvedValueOnce({ synced_count: 3 });
    await usePrStore.getState().syncPrs(1);
    expect(mockIpc.prSync).toHaveBeenCalledWith(1, "open");
  });

  it("syncPrs() 成功時に syncStatus が 'success' になる", async () => {
    mockIpc.prSync.mockResolvedValueOnce({ synced_count: 1 });
    await usePrStore.getState().syncPrs(1);
    expect(usePrStore.getState().syncStatus).toBe("success");
  });

  // ─── selectPr ─────────────────────────────────────────────────────────────

  it("selectPr(null) で detail が null になる", async () => {
    usePrStore.setState({ detail: makePrDetail(makePr()), selectedPrId: 1 });
    await usePrStore.getState().selectPr(null);
    expect(usePrStore.getState().detail).toBeNull();
    expect(usePrStore.getState().selectedPrId).toBeNull();
  });

  it("selectPr() が prGetDetail を呼ぶ", async () => {
    const pr = makePr({ id: 5 });
    mockIpc.prGetDetail.mockResolvedValueOnce(makePrDetail(pr));

    await usePrStore.getState().selectPr(5, 1);

    expect(mockIpc.prGetDetail).toHaveBeenCalledWith(5);
  });

  it("selectPr() 成功時に detail と selectedPrId がセットされる", async () => {
    const pr = makePr({ id: 5 });
    const detail = makePrDetail(pr);
    mockIpc.prGetDetail.mockResolvedValueOnce(detail);

    await usePrStore.getState().selectPr(5, 1);

    expect(usePrStore.getState().selectedPrId).toBe(5);
    expect(usePrStore.getState().detail).toEqual(detail);
    expect(usePrStore.getState().detailStatus).toBe("success");
  });

  // ─── setStateFilter / setActiveTab ────────────────────────────────────────

  it("setStateFilter() で stateFilter が変わる", () => {
    usePrStore.getState().setStateFilter("closed");
    expect(usePrStore.getState().stateFilter).toBe("closed");
  });

  it("setActiveTab() で activeTab が変わる", () => {
    usePrStore.getState().setActiveTab("code-diff");
    expect(usePrStore.getState().activeTab).toBe("code-diff");
  });

  // ─── fetchDiff / loadDocDiff ───────────────────────────────────────────────

  it("fetchDiff() が prGetDiff を呼び diff をセットする", async () => {
    mockIpc.prGetDiff.mockResolvedValueOnce("diff --git a/foo b/foo\n@@ -1 +1 @@\n content");

    await usePrStore.getState().fetchDiff(1, 5);

    expect(mockIpc.prGetDiff).toHaveBeenCalledWith(1, 5);
    expect(usePrStore.getState().diff).toContain("diff --git");
    expect(usePrStore.getState().diffStatus).toBe("success");
  });

  it("loadDocDiff() が prDocDiffGet を呼び docDiffs をセットする", async () => {
    // Rust 側で .md フィルタ済みの diff が返る
    const rawDiff = [
      "diff --git a/docs/spec.md b/docs/spec.md",
      "--- a/docs/spec.md",
      "+++ b/docs/spec.md",
      "@@ -1 +1 @@",
      " markdown",
    ].join("\n");
    mockIpc.prDocDiffGet.mockResolvedValueOnce(rawDiff);

    await usePrStore.getState().loadDocDiff(1, 5);

    expect(mockIpc.prDocDiffGet).toHaveBeenCalledWith(1, 5);
    const { docDiffs } = usePrStore.getState();
    expect(docDiffs).toHaveLength(1);
    expect(docDiffs[0].filename).toBe("docs/spec.md");
    expect(usePrStore.getState().docDiffStatus).toBe("success");
  });

  it("loadDocDiff() 空文字列の場合は docDiffs が空になる", async () => {
    mockIpc.prDocDiffGet.mockResolvedValueOnce("");

    await usePrStore.getState().loadDocDiff(1, 5);

    expect(usePrStore.getState().docDiffs).toHaveLength(0);
  });

  // ─── fetchFiles ───────────────────────────────────────────────────────────

  it("fetchFiles() が prGetFiles を呼び files をセットする", async () => {
    const files: PrFile[] = [
      { filename: "src/main.ts", status: "modified", additions: 5, deletions: 2, patch: null },
    ];
    mockIpc.prGetFiles.mockResolvedValueOnce(files);

    await usePrStore.getState().fetchFiles(1, 5);

    expect(mockIpc.prGetFiles).toHaveBeenCalledWith(1, 5);
    expect(usePrStore.getState().files).toHaveLength(1);
    expect(usePrStore.getState().filesStatus).toBe("success");
  });

  // ─── mergePr ──────────────────────────────────────────────────────────────

  it("mergePr() が prMerge を呼ぶ", async () => {
    mockIpc.prMerge.mockResolvedValueOnce(undefined);

    await usePrStore.getState().mergePr(1, 5, "squash");

    expect(mockIpc.prMerge).toHaveBeenCalledWith(1, 5, "squash");
  });

  it("mergePr() 成功後に対象 PR の state が 'merged' になる", async () => {
    const pr = makePr({ id: 5, state: "open" });
    usePrStore.setState({ prs: [pr], selectedPrId: 5 });
    mockIpc.prMerge.mockResolvedValueOnce(undefined);
    mockIpc.gitPull.mockResolvedValueOnce("success");

    await usePrStore.getState().mergePr(1, 5);

    expect(usePrStore.getState().prs[0].state).toBe("merged");
    expect(usePrStore.getState().selectedPrId).toBeNull();
    expect(usePrStore.getState().mergeStatus).toBe("success");
  });

  it("mergePr() 後の gitPull が 'conflict' を返したとき ConflictScreen へ遷移する", async () => {
    const pr = makePr({ id: 5, state: "open" });
    usePrStore.setState({ prs: [pr], selectedPrId: 5 });
    const mockNavigate = vi.fn();
    const { useUiStore } = await import("./uiStore");
    vi.mocked(useUiStore.getState).mockReturnValue({ navigate: mockNavigate } as any);

    mockIpc.prMerge.mockResolvedValueOnce(undefined);
    mockIpc.gitPull.mockResolvedValueOnce("conflict");

    await usePrStore.getState().mergePr(1, 5);

    expect(mockNavigate).toHaveBeenCalledWith("conflict");
  });

  it("mergePr() 後の gitPull が 'up_to_date' のとき遷移しない", async () => {
    const pr = makePr({ id: 5, state: "open" });
    usePrStore.setState({ prs: [pr], selectedPrId: 5 });
    const mockNavigate = vi.fn();
    const { useUiStore } = await import("./uiStore");
    vi.mocked(useUiStore.getState).mockReturnValue({ navigate: mockNavigate } as any);

    mockIpc.prMerge.mockResolvedValueOnce(undefined);
    mockIpc.gitPull.mockResolvedValueOnce("up_to_date");

    await usePrStore.getState().mergePr(1, 5);

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ─── createPrFromBranch ───────────────────────────────────────────────────

  it("createPrFromBranch() が prCreateFromBranch を呼ぶ", async () => {
    const pr = makePr();
    mockIpc.prCreateFromBranch.mockResolvedValueOnce(pr);

    await usePrStore.getState().createPrFromBranch(1, "feat/x", "New PR", "body");

    expect(mockIpc.prCreateFromBranch).toHaveBeenCalledWith(1, "feat/x", "New PR", "body");
  });

  it("createPrFromBranch() 成功後に PR がリストに追加される", async () => {
    const pr = makePr({ id: 99, title: "Brand new PR" });
    mockIpc.prCreateFromBranch.mockResolvedValueOnce(pr);

    await usePrStore.getState().createPrFromBranch(1, "feat/x", "Brand new PR");

    expect(usePrStore.getState().prs[0].id).toBe(99);
    expect(usePrStore.getState().createStatus).toBe("success");
  });

  it("createPrFromBranch() 失敗時に createStatus が 'error' になる", async () => {
    mockIpc.prCreateFromBranch.mockRejectedValueOnce(new Error("already exists"));

    await expect(
      usePrStore.getState().createPrFromBranch(1, "feat/x", "PR")
    ).rejects.toBeTruthy();

    expect(usePrStore.getState().createStatus).toBe("error");
  });

  // ─── submitReview ─────────────────────────────────────────────────────────

  it("submitReview() が prReviewSubmit を呼ぶ", async () => {
    const pr = makePr({ id: 5 });
    const detail = makePrDetail(pr);
    mockIpc.prReviewSubmit.mockResolvedValueOnce(undefined);
    mockIpc.prGetDetail.mockResolvedValueOnce(detail);

    await usePrStore.getState().submitReview(1, 5, "approved", "LGTM");

    expect(mockIpc.prReviewSubmit).toHaveBeenCalledWith(1, {
      pr_id: 5,
      state: "approved",
      body: "LGTM",
    });
  });

  it("submitReview() 成功後に reviewStatus が 'success' になり detail が更新される", async () => {
    const pr = makePr({ id: 5 });
    const detail = makePrDetail(pr);
    mockIpc.prReviewSubmit.mockResolvedValueOnce(undefined);
    mockIpc.prGetDetail.mockResolvedValueOnce(detail);

    await usePrStore.getState().submitReview(1, 5, "approved", "");

    expect(usePrStore.getState().reviewStatus).toBe("success");
    expect(usePrStore.getState().detail).toEqual(detail);
  });

  it("submitReview() 失敗時に reviewStatus が 'error' になる", async () => {
    mockIpc.prReviewSubmit.mockRejectedValueOnce(new Error("network error"));

    await usePrStore.getState().submitReview(1, 5, "approved", "");

    expect(usePrStore.getState().reviewStatus).toBe("error");
  });

  // ─── addComment ───────────────────────────────────────────────────────────

  it("addComment() が prAddComment を呼ぶ", async () => {
    const pr = makePr({ id: 5 });
    const detail = makePrDetail(pr);
    mockIpc.prAddComment.mockResolvedValueOnce(undefined);
    mockIpc.prGetDetail.mockResolvedValueOnce(detail);

    await usePrStore.getState().addComment(1, 5, "Nice change", "src/main.rs", 42);

    expect(mockIpc.prAddComment).toHaveBeenCalledWith(1, 5, "Nice change", "src/main.rs", 42);
  });

  it("addComment() 成功後に detail が更新される", async () => {
    const pr = makePr({ id: 5 });
    const detail = makePrDetail(pr);
    mockIpc.prAddComment.mockResolvedValueOnce(undefined);
    mockIpc.prGetDetail.mockResolvedValueOnce(detail);

    await usePrStore.getState().addComment(1, 5, "comment", "file.rs", 1);

    expect(usePrStore.getState().detail).toEqual(detail);
  });

  it("addComment() 失敗時に error がセットされる", async () => {
    mockIpc.prAddComment.mockRejectedValueOnce(new Error("forbidden"));

    await usePrStore.getState().addComment(1, 5, "comment", "file.rs", 1);

    expect(usePrStore.getState().error).toMatch(/forbidden/);
  });

  // ─── requestChanges ───────────────────────────────────────────────────────

  it("requestChanges() が prReviewSubmit を changes_requested で呼ぶ", async () => {
    const pr = makePr({ id: 5, head_branch: "feat/x" });
    usePrStore.setState({ prs: [pr] });
    mockIpc.prReviewSubmit.mockResolvedValueOnce(undefined);

    await usePrStore.getState().requestChanges(1, 5, "Please fix the bug");

    expect(mockIpc.prReviewSubmit).toHaveBeenCalledWith(1, {
      pr_id: 5,
      state: "changes_requested",
      body: "Please fix the bug",
    });
  });

  it("requestChanges() 成功後に requestChangesStatus が 'success' になる", async () => {
    const pr = makePr({ id: 5 });
    usePrStore.setState({ prs: [pr] });
    mockIpc.prReviewSubmit.mockResolvedValueOnce(undefined);

    await usePrStore.getState().requestChanges(1, 5, "fix it");

    expect(usePrStore.getState().requestChangesStatus).toBe("success");
  });

  it("requestChanges() 失敗時に requestChangesStatus が 'error' になる", async () => {
    mockIpc.prReviewSubmit.mockRejectedValueOnce(new Error("unauthorized"));

    await usePrStore.getState().requestChanges(1, 5, "fix it");

    expect(usePrStore.getState().requestChangesStatus).toBe("error");
  });

  // ─── loadDocDiff ─────────────────────────────────────────────────────────

  it("loadDocDiff() が prDocDiffGet を呼んで docDiffs をセットする", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.prDocDiffGet.mockResolvedValueOnce("diff --git a/docs/x.md b/docs/x.md\n--- a/docs/x.md\n+++ b/docs/x.md\n@@ -1 +1 @@\n-old\n+new");

    await usePrStore.getState().loadDocDiff(1, 5);

    expect(ipcM.prDocDiffGet).toHaveBeenCalledWith(1, 5);
    expect(usePrStore.getState().docDiffStatus).toBe("success");
  });

  it("loadDocDiff() 失敗時に docDiffStatus=error がセットされる", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.prDocDiffGet.mockRejectedValueOnce(new Error("not found"));
    await usePrStore.getState().loadDocDiff(1, 5);
    expect(usePrStore.getState().docDiffStatus).toBe("error");
  });

  // ─── mergePr (conflict 分岐) ──────────────────────────────────────────────

  it("mergePr() マージ後 gitPull が conflict を返すと navigate('conflict') が呼ばれる", async () => {
    const { useUiStore } = await import("./uiStore");
    const navigateMock = vi.fn();
    vi.mocked(useUiStore.getState).mockReturnValue({ navigate: navigateMock } as unknown as ReturnType<typeof useUiStore.getState>);

    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    const pr = { id: 5, github_number: 44, title: "test", state: "open" as const, head_branch: "feat/x", base_branch: "main", author_login: "u", checks_status: "passing" as const, draft: false, merged_at: null, project_id: 1, github_id: 9, body: null, linked_issue_number: null, created_by: "user" as const, github_created_at: "", github_updated_at: "", synced_at: "" };
    usePrStore.setState({ prs: [pr] });
    ipcM.prMerge.mockResolvedValueOnce(undefined);
    ipcM.gitPull.mockResolvedValueOnce("conflict" as never);

    await usePrStore.getState().mergePr(1, 5, "merge");

    expect(navigateMock).toHaveBeenCalledWith("conflict");
  });

  // ─── listenSyncDone ───────────────────────────────────────────────────────

  it("listenSyncDone() が pr_sync_done をリッスンし cleanup 関数を返す", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    const cleanup = usePrStore.getState().listenSyncDone();
    expect(listen).toHaveBeenCalledWith("pr_sync_done", expect.any(Function));
    expect(typeof cleanup).toBe("function");
  });

  it("listenSyncDone() イベント発火で fetchPrs が呼ばれる", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    let capturedCb: ((ev: unknown) => void) | undefined;
    vi.mocked(listen).mockImplementationOnce(async (_event, cb) => {
      capturedCb = cb as (ev: unknown) => void;
      return vi.fn() as unknown as () => void;
    });
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.prList.mockResolvedValueOnce([]);

    usePrStore.getState().listenSyncDone();
    await new Promise((r) => setTimeout(r, 0));
    capturedCb?.({ payload: { project_id: 1, synced_count: 2 } });
    await new Promise((r) => setTimeout(r, 0));

    expect(ipcM.prList).toHaveBeenCalled();
  });

  // ─── openPrByGithubNumber ─────────────────────────────────────────────────

  it("openPrByGithubNumber() が prs から一致する PR を見つけて selectPr を呼ぶ", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    const pr = { id: 7, github_number: 99, title: "test", state: "open" as const, head_branch: "feat/x", base_branch: "main", author_login: "u", checks_status: "passing" as const, draft: false, merged_at: null, project_id: 1, github_id: 9, body: null, linked_issue_number: null, created_by: "user" as const, github_created_at: "", github_updated_at: "", synced_at: "" };
    usePrStore.setState({ prs: [pr] });
    ipcM.prGetDetail.mockResolvedValueOnce({ pr, reviews: [], comments: [] });

    await usePrStore.getState().openPrByGithubNumber(1, 99);

    expect(usePrStore.getState().selectedPrId).toBe(7);
  });

  it("openPrByGithubNumber() prs が空のとき fetchPrs してから探す", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    const pr = { id: 8, github_number: 55, title: "test", state: "open" as const, head_branch: "feat/y", base_branch: "main", author_login: "u", checks_status: "passing" as const, draft: false, merged_at: null, project_id: 1, github_id: 10, body: null, linked_issue_number: null, created_by: "user" as const, github_created_at: "", github_updated_at: "", synced_at: "" };
    usePrStore.setState({ prs: [] });
    ipcM.prList.mockResolvedValueOnce([pr]);
    ipcM.prGetDetail.mockResolvedValueOnce({ pr, reviews: [], comments: [] });

    await usePrStore.getState().openPrByGithubNumber(1, 55);

    expect(ipcM.prList).toHaveBeenCalled();
    expect(usePrStore.getState().selectedPrId).toBe(8);
  });

  it("openPrByGithubNumber() 一致する PR がない場合は何もしない", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    usePrStore.setState({ prs: [] });
    ipcM.prList.mockResolvedValueOnce([]);

    await usePrStore.getState().openPrByGithubNumber(1, 999);

    expect(usePrStore.getState().selectedPrId).toBeNull();
  });

  // ─── commentsForLine ──────────────────────────────────────────────────────

  it("commentsForLine() が path と line で comments をフィルタする", async () => {
    const pr = { id: 1, github_number: 1, title: "t", state: "open" as const, head_branch: "b", base_branch: "main", author_login: "u", checks_status: "passing" as const, draft: false, merged_at: null, project_id: 1, github_id: 1, body: null, linked_issue_number: null, created_by: "user" as const, github_created_at: "", github_updated_at: "", synced_at: "" };
    const comment = { id: 1, pr_id: 1, github_id: null, author_login: "u", body: "LGTM", path: "src/foo.ts", line: 10, comment_type: "inline" as const, diff_hunk: null, resolved: false, in_reply_to_id: null, is_pending: false, synced_at: null, created_at: "" };
    const other = { id: 2, pr_id: 1, github_id: null, author_login: "u", body: "other", path: "src/bar.ts", line: 20, comment_type: "inline" as const, diff_hunk: null, resolved: false, in_reply_to_id: null, is_pending: false, synced_at: null, created_at: "" };
    usePrStore.setState({ detail: { pr, reviews: [], comments: [comment, other] } });

    const result = usePrStore.getState().commentsForLine("src/foo.ts", 10);

    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("LGTM");
  });

  it("commentsForLine() detail が null のとき空配列を返す", () => {
    usePrStore.setState({ detail: null });
    expect(usePrStore.getState().commentsForLine("src/foo.ts", 1)).toEqual([]);
  });

  // ─── reset ────────────────────────────────────────────────────────────────

  it("reset() で全状態が初期値に戻る", () => {
    usePrStore.setState({
      prs: [{ id: 1 } as never],
      selectedPrId: 1,
      detail: { pr: { id: 1 } as never, reviews: [], comments: [] },
      fetchStatus: "success",
      mergeStatus: "success",
      error: "some error",
    });

    usePrStore.getState().reset();
    const s = usePrStore.getState();
    expect(s.prs).toEqual([]);
    expect(s.selectedPrId).toBeNull();
    expect(s.detail).toBeNull();
    expect(s.fetchStatus).toBe("idle");
    expect(s.mergeStatus).toBe("idle");
    expect(s.error).toBeNull();
  });

  it("selectPr() detail 取得失敗で detailStatus=error がセットされる", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.prGetDetail.mockRejectedValueOnce(new Error("not found"));
    await usePrStore.getState().selectPr(99, 1);
    expect(usePrStore.getState().detailStatus).toBe("error");
  });

  it("fetchFiles() 失敗で filesStatus=error がセットされる", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.prGetFiles.mockRejectedValueOnce(new Error("forbidden"));
    await usePrStore.getState().fetchFiles(1, 5);
    expect(usePrStore.getState().filesStatus).toBe("error");
  });

  it("fetchDiff() 失敗で diffStatus=error がセットされる", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.prGetDiff.mockRejectedValueOnce(new Error("too large"));
    await usePrStore.getState().fetchDiff(1, 5);
    expect(usePrStore.getState().diffStatus).toBe("error");
  });

  it("mergePr() gitPull が失敗しても mergeStatus は success のまま", async () => {
    const { mockIpc: ipcM } = await import("../lib/ipc").then((m) => ({ mockIpc: vi.mocked(m) }));
    ipcM.prMerge.mockResolvedValueOnce(undefined);
    ipcM.gitPull.mockRejectedValueOnce(new Error("pull failed"));

    await usePrStore.getState().mergePr(1, 99, "merge");

    expect(usePrStore.getState().mergeStatus).toBe("success");
  });
});
