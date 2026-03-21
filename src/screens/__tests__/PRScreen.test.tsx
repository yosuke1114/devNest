/**
 * PRScreen テスト — TabDesignDocs / RequestChangesPanel / PRDetailPanel カバレッジ
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockProject = {
  id: 1, name: "DevNest", local_path: "/tmp/devnest", default_branch: "main",
  repo_owner: "yo", repo_name: "devnest", docs_root: "docs/",
  sync_mode: "auto", debounce_ms: 500, commit_msg_format: "docs: {filename}",
  remote_poll_interval_min: 5, github_installation_id: null,
  last_opened_document_id: null, last_synced_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockPr = {
  id: 10, github_id: 1, project_id: 1, github_number: 44,
  title: "feat: new feature", state: "open" as const,
  author_login: "alice", head_branch: "feat/x", base_branch: "main",
  checks_status: "passing" as const,
  body: "PR 本文", draft: false,
  created_at: "2026-01-01", updated_at: "2026-01-01",
  merged_at: null, closed_at: null,
};

const mockDetail = {
  pr: mockPr,
  reviews: [{ id: 1, state: "approved", author_login: "bob", body: "", submitted_at: "2026-01-01" }],
  comments: [],
  commits: [],
};

const mockDocDiff = {
  filename: "docs/spec.md",
  hunks: [{
    header: "@@ -1,3 +1,4 @@",
    lines: [
      { type: "context" as const, content: "same", oldLineNo: 1, newLineNo: 1 },
      { type: "add" as const, content: "added line", oldLineNo: null, newLineNo: 2 },
      { type: "remove" as const, content: "removed line", oldLineNo: 2, newLineNo: null },
    ],
  }],
};

// ─── モック状態 ──────────────────────────────────────────────────────────────

const projectState = { currentProject: mockProject as typeof mockProject | null };

const prState = {
  prs: [] as typeof mockPr[],
  selectedPrId: null as number | null,
  fetchStatus: "idle" as string,
  syncStatus: "idle" as string,
  stateFilter: "open" as string,
  detail: null as typeof mockDetail | null,
  detailStatus: "idle" as string,
  files: [] as unknown[],
  diff: "",
  docDiffs: [] as typeof mockDocDiff[],
  filesStatus: "idle" as string,
  diffStatus: "idle" as string,
  docDiffStatus: "idle" as string,
  requestChangesStatus: "idle" as string,
  activeTab: "overview" as string,
  mergeStatus: "idle" as string,
  reviewStatus: "idle" as string,
  fetchPrs: vi.fn(() => Promise.resolve()),
  syncPrs: vi.fn(() => Promise.resolve()),
  selectPr: vi.fn(),
  setStateFilter: vi.fn(),
  listenSyncDone: vi.fn(() => () => {}),
  setActiveTab: vi.fn(),
  fetchFiles: vi.fn(() => Promise.resolve()),
  fetchDiff: vi.fn(() => Promise.resolve()),
  loadDocDiff: vi.fn(() => Promise.resolve()),
  requestChanges: vi.fn(() => Promise.resolve()),
  submitReview: vi.fn(() => Promise.resolve()),
  addComment: vi.fn(() => Promise.resolve()),
  mergePr: vi.fn(() => Promise.resolve()),
};

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn((sel?: (s: typeof projectState) => unknown) =>
    sel ? sel(projectState) : projectState
  ),
}));

vi.mock("../../stores/prStore", () => ({
  usePrStore: vi.fn((sel?: (s: typeof prState) => unknown) =>
    sel ? sel(prState) : prState
  ),
}));

// PR sub-components: mock to expose props
vi.mock("../../components/pr/PRFilterBar", () => ({
  PRFilterBar: ({ onChange, onSync }: {
    filter: string; onChange: (f: string) => void; onSync: () => void; syncing: boolean;
  }) => (
    <div data-testid="pr-filter-bar">
      <button onClick={() => onChange("closed")}>filter-closed</button>
      <button onClick={onSync}>sync</button>
    </div>
  ),
}));

vi.mock("../../components/pr/PRList", () => ({
  PRList: ({ prs, onSelect }: { prs: typeof mockPr[]; loading: boolean; selectedPrId: number | null; onSelect: (pr: typeof mockPr) => void }) => (
    <div data-testid="pr-list">
      {prs.map((p) => (
        <button key={p.id} onClick={() => onSelect(p)}>{p.title}</button>
      ))}
    </div>
  ),
}));

vi.mock("../../components/pr/PRDetailHeader", () => ({
  PRDetailHeader: ({ pr }: { pr: typeof mockPr }) => (
    <div data-testid="pr-detail-header">{pr.title}</div>
  ),
}));

vi.mock("../../components/pr/PRDetailTabs", () => ({
  PRDetailTabs: ({ activeTab: _activeTab, onChange }: { activeTab: string; onChange: (t: string) => void; codeFileCount: number }) => (
    <div data-testid="pr-detail-tabs">
      <button onClick={() => onChange("overview")}>tab-overview</button>
      <button onClick={() => onChange("code-diff")}>tab-code-diff</button>
      <button onClick={() => onChange("design-docs")}>tab-design-docs</button>
    </div>
  ),
}));

vi.mock("../../components/pr/TabOverview", () => ({
  TabOverview: () => <div data-testid="tab-overview" />,
}));

vi.mock("../../components/pr/TabCodeDiff", () => ({
  TabCodeDiff: ({ onLoadFiles, onLoadDiff, onAddComment }: {
    files: unknown[]; diff: string; filesStatus: string; diffStatus: string; comments: unknown[];
    onLoadFiles: () => void; onLoadDiff: () => void;
    onAddComment: (path: string, line: number, body: string) => Promise<void>;
  }) => (
    <div data-testid="tab-code-diff">
      <button onClick={onLoadFiles}>load-files</button>
      <button onClick={onLoadDiff}>load-diff</button>
      <button onClick={() => onAddComment("src/foo.ts", 1, "comment")}>add-comment</button>
    </div>
  ),
}));

vi.mock("../../components/pr/ReviewPanel", () => ({
  ReviewPanel: ({ onSubmitReview }: { reviewStatus: string; onSubmitReview: (state: string, body: string) => void }) => (
    <div data-testid="review-panel">
      <button onClick={() => onSubmitReview("approved", "LGTM")}>submit-review</button>
    </div>
  ),
}));

vi.mock("../../components/pr/MergePanel", () => ({
  MergePanel: ({ onMerge }: { canMerge: boolean; mergeStatus: string; onMerge: () => void; headBranch: string; baseBranch: string }) => (
    <div data-testid="merge-panel">
      <button onClick={onMerge}>merge</button>
    </div>
  ),
}));

import { PRScreen } from "../PRScreen";

describe("PRScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    prState.prs = [];
    prState.selectedPrId = null;
    prState.fetchStatus = "idle";
    prState.syncStatus = "idle";
    prState.stateFilter = "open";
    prState.detail = null;
    prState.detailStatus = "idle";
    prState.files = [];
    prState.diff = "";
    prState.docDiffs = [];
    prState.filesStatus = "idle";
    prState.diffStatus = "idle";
    prState.docDiffStatus = "idle";
    prState.requestChangesStatus = "idle";
    prState.activeTab = "overview";
    prState.mergeStatus = "idle";
    prState.reviewStatus = "idle";
    prState.fetchPrs = vi.fn(() => Promise.resolve());
    prState.syncPrs = vi.fn(() => Promise.resolve());
    prState.selectPr = vi.fn();
    prState.setStateFilter = vi.fn();
    prState.listenSyncDone = vi.fn(() => () => {});
    prState.setActiveTab = vi.fn();
    prState.fetchFiles = vi.fn(() => Promise.resolve());
    prState.fetchDiff = vi.fn(() => Promise.resolve());
    prState.loadDocDiff = vi.fn(() => Promise.resolve());
    prState.requestChanges = vi.fn(() => Promise.resolve());
    prState.submitReview = vi.fn(() => Promise.resolve());
    prState.addComment = vi.fn(() => Promise.resolve());
    prState.mergePr = vi.fn(() => Promise.resolve());
  });

  it("プロジェクト未選択時は案内文を表示", () => {
    projectState.currentProject = null;
    render(<PRScreen />);
    expect(screen.getByText("Select a project first")).toBeInTheDocument();
  });

  it("マウント時に fetchPrs が呼ばれる", () => {
    render(<PRScreen />);
    expect(prState.fetchPrs).toHaveBeenCalledWith(1);
  });

  it("フィルタ変更で setStateFilter が呼ばれる", () => {
    render(<PRScreen />);
    fireEvent.click(screen.getByText("filter-closed"));
    expect(prState.setStateFilter).toHaveBeenCalledWith("closed");
  });

  it("sync ボタンで syncPrs が呼ばれる", () => {
    render(<PRScreen />);
    fireEvent.click(screen.getByText("sync"));
    expect(prState.syncPrs).toHaveBeenCalledWith(1);
  });

  it("PR 選択で selectPr が呼ばれる", () => {
    prState.prs = [mockPr];
    render(<PRScreen />);
    fireEvent.click(screen.getByText("feat: new feature"));
    expect(prState.selectPr).toHaveBeenCalledWith(10, 1);
  });

  it("detail=null のとき Select a PR メッセージを表示", () => {
    render(<PRScreen />);
    expect(screen.getByText("Select a PR to view details")).toBeInTheDocument();
  });

  it("detailStatus=loading のとき Loading... を表示", () => {
    prState.detailStatus = "loading";
    render(<PRScreen />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("detail ありのとき PRDetailHeader を表示", () => {
    prState.detail = mockDetail;
    render(<PRScreen />);
    expect(screen.getByTestId("pr-detail-header")).toBeInTheDocument();
    expect(screen.getByText("feat: new feature")).toBeInTheDocument();
  });

  it("overview タブで TabOverview を表示", () => {
    prState.detail = mockDetail;
    prState.activeTab = "overview";
    render(<PRScreen />);
    expect(screen.getByTestId("tab-overview")).toBeInTheDocument();
  });

  it("overview タブで PR open のとき ReviewPanel と MergePanel を表示", () => {
    prState.detail = mockDetail;
    prState.activeTab = "overview";
    render(<PRScreen />);
    expect(screen.getByTestId("review-panel")).toBeInTheDocument();
    expect(screen.getByTestId("merge-panel")).toBeInTheDocument();
  });

  it("code-diff タブで TabCodeDiff を表示", () => {
    prState.detail = mockDetail;
    prState.activeTab = "code-diff";
    render(<PRScreen />);
    expect(screen.getByTestId("tab-code-diff")).toBeInTheDocument();
  });

  it("code-diff タブの load-files で fetchFiles が呼ばれる", () => {
    prState.detail = mockDetail;
    prState.activeTab = "code-diff";
    render(<PRScreen />);
    fireEvent.click(screen.getByText("load-files"));
    expect(prState.fetchFiles).toHaveBeenCalledWith(1, 10);
  });

  it("code-diff タブの load-diff で fetchDiff が呼ばれる", () => {
    prState.detail = mockDetail;
    prState.activeTab = "code-diff";
    render(<PRScreen />);
    fireEvent.click(screen.getByText("load-diff"));
    expect(prState.fetchDiff).toHaveBeenCalledWith(1, 10);
  });

  it("code-diff タブの add-comment で addComment が呼ばれる", async () => {
    prState.detail = mockDetail;
    prState.activeTab = "code-diff";
    render(<PRScreen />);
    fireEvent.click(screen.getByText("add-comment"));
    await waitFor(() => expect(prState.addComment).toHaveBeenCalledWith(1, 10, "comment", "src/foo.ts", 1));
  });

  it("overview タブの submit-review で submitReview が呼ばれる", () => {
    prState.detail = mockDetail;
    prState.activeTab = "overview";
    render(<PRScreen />);
    fireEvent.click(screen.getByText("submit-review"));
    expect(prState.submitReview).toHaveBeenCalledWith(1, 10, "approved", "LGTM");
  });

  it("overview タブの merge で mergePr が呼ばれる", () => {
    prState.detail = mockDetail;
    prState.activeTab = "overview";
    render(<PRScreen />);
    fireEvent.click(screen.getByText("merge"));
    expect(prState.mergePr).toHaveBeenCalledWith(1, 10, "squash");
  });
});

describe("PRScreen — TabDesignDocs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    prState.prs = [];
    prState.selectedPrId = null;
    prState.fetchStatus = "idle";
    prState.syncStatus = "idle";
    prState.stateFilter = "open";
    prState.detail = mockDetail;
    prState.detailStatus = "idle";
    prState.activeTab = "design-docs";
    prState.files = [];
    prState.diff = "";
    prState.docDiffs = [];
    prState.filesStatus = "idle";
    prState.diffStatus = "idle";
    prState.docDiffStatus = "idle";
    prState.requestChangesStatus = "idle";
    prState.mergeStatus = "idle";
    prState.reviewStatus = "idle";
    prState.listenSyncDone = vi.fn(() => () => {});
    prState.fetchPrs = vi.fn(() => Promise.resolve());
    prState.syncPrs = vi.fn(() => Promise.resolve());
    prState.selectPr = vi.fn();
    prState.setStateFilter = vi.fn();
    prState.setActiveTab = vi.fn();
    prState.loadDocDiff = vi.fn(() => Promise.resolve());
    prState.requestChanges = vi.fn(() => Promise.resolve());
    prState.submitReview = vi.fn(() => Promise.resolve());
    prState.addComment = vi.fn(() => Promise.resolve());
    prState.mergePr = vi.fn(() => Promise.resolve());
    prState.fetchFiles = vi.fn(() => Promise.resolve());
    prState.fetchDiff = vi.fn(() => Promise.resolve());
  });

  it("docDiffStatus=idle のとき Load Design Docs diff ボタンを表示", () => {
    render(<PRScreen />);
    expect(screen.getByText("Load Design Docs diff")).toBeInTheDocument();
  });

  it("Load Design Docs diff クリックで loadDocDiff が呼ばれる", () => {
    render(<PRScreen />);
    fireEvent.click(screen.getByText("Load Design Docs diff"));
    expect(prState.loadDocDiff).toHaveBeenCalledWith(1, 10);
  });

  it("docDiffStatus=loading のとき Loading… を表示", () => {
    prState.docDiffStatus = "loading";
    render(<PRScreen />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("docDiffStatus=error のときエラーと RETRY を表示", () => {
    prState.docDiffStatus = "error";
    render(<PRScreen />);
    expect(screen.getByText(/diff の取得に失敗/)).toBeInTheDocument();
    expect(screen.getByText("RETRY")).toBeInTheDocument();
  });

  it("RETRY クリックで loadDocDiff が呼ばれる", () => {
    prState.docDiffStatus = "error";
    render(<PRScreen />);
    fireEvent.click(screen.getByText("RETRY"));
    expect(prState.loadDocDiff).toHaveBeenCalledWith(1, 10);
  });

  it("docDiffStatus=success + 空のとき 設計書の変更はありません を表示", () => {
    prState.docDiffStatus = "success";
    prState.docDiffs = [];
    render(<PRScreen />);
    expect(screen.getByText(/設計書（.md ファイル）の変更はありません/)).toBeInTheDocument();
  });

  it("docDiffs ありのとき diff ファイル名とライン数を表示", () => {
    prState.docDiffStatus = "success";
    prState.docDiffs = [mockDocDiff];
    render(<PRScreen />);
    expect(screen.getAllByText("docs/spec.md").length).toBeGreaterThan(0);
    expect(screen.getByText("Design Docs Changes")).toBeInTheDocument();
  });

  it("REQUEST CHANGES ボタンで RequestChangesPanel を表示", () => {
    prState.docDiffStatus = "success";
    prState.docDiffs = [mockDocDiff];
    render(<PRScreen />);
    fireEvent.click(screen.getByText("↩ REQUEST CHANGES"));
    expect(screen.getByPlaceholderText(/修正指示を入力/)).toBeInTheDocument();
  });

  it("RequestChangesPanel: CANCEL でパネルを閉じる", () => {
    prState.docDiffStatus = "success";
    prState.docDiffs = [mockDocDiff];
    render(<PRScreen />);
    fireEvent.click(screen.getByText("↩ REQUEST CHANGES"));
    fireEvent.click(screen.getByText("CANCEL"));
    expect(screen.queryByPlaceholderText(/修正指示を入力/)).not.toBeInTheDocument();
  });

  it("RequestChangesPanel: テキスト入力して SEND で requestChanges が呼ばれる", () => {
    prState.docDiffStatus = "success";
    prState.docDiffs = [mockDocDiff];
    render(<PRScreen />);
    fireEvent.click(screen.getByText("↩ REQUEST CHANGES"));
    const textarea = screen.getByPlaceholderText(/修正指示を入力/);
    fireEvent.change(textarea, { target: { value: "修正してください" } });
    fireEvent.click(screen.getByText("SEND TO CLAUDE CODE"));
    expect(prState.requestChanges).toHaveBeenCalledWith(1, 10, "修正してください");
  });

  it("RequestChangesPanel: テキスト空では SEND ボタンが disabled", () => {
    prState.docDiffStatus = "success";
    prState.docDiffs = [mockDocDiff];
    render(<PRScreen />);
    fireEvent.click(screen.getByText("↩ REQUEST CHANGES"));
    const sendBtn = screen.getByText("SEND TO CLAUDE CODE").closest("button");
    expect(sendBtn).toBeDisabled();
  });

  it("RequestChangesPanel: status=error のときエラー文を表示", () => {
    prState.docDiffStatus = "success";
    prState.docDiffs = [mockDocDiff];
    prState.requestChangesStatus = "error";
    render(<PRScreen />);
    fireEvent.click(screen.getByText("↩ REQUEST CHANGES"));
    expect(screen.getByText("送信に失敗しました。もう一度お試しください。")).toBeInTheDocument();
  });
});
