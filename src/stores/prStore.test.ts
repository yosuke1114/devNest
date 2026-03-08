import { beforeEach, describe, it, expect, vi } from "vitest";
import { usePrStore } from "./prStore";
import * as ipc from "../lib/ipc";
import type { PrDetail, PrFile, PullRequest } from "../types";

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

  it("loadDocDiff() が .md ファイルのみ docDiffs に含める", async () => {
    const rawDiff = [
      "diff --git a/docs/spec.md b/docs/spec.md",
      "@@ -1 +1 @@",
      " markdown",
      "diff --git a/src/main.ts b/src/main.ts",
      "@@ -1 +1 @@",
      " typescript",
    ].join("\n");
    mockIpc.prGetDiff.mockResolvedValueOnce(rawDiff);

    await usePrStore.getState().loadDocDiff(1, 5);

    const { docDiffs } = usePrStore.getState();
    expect(docDiffs).toHaveLength(1);
    expect(docDiffs[0].filename).toBe("docs/spec.md");
    expect(usePrStore.getState().docDiffStatus).toBe("success");
  });

  it("loadDocDiff() .md ファイルがない diff では docDiffs が空になる", async () => {
    const rawDiff = "diff --git a/src/main.ts b/src/main.ts\n@@ -1 +1 @@\n ts";
    mockIpc.prGetDiff.mockResolvedValueOnce(rawDiff);

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

    await usePrStore.getState().mergePr(1, 5);

    expect(usePrStore.getState().prs[0].state).toBe("merged");
    expect(usePrStore.getState().selectedPrId).toBeNull();
    expect(usePrStore.getState().mergeStatus).toBe("success");
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
});
