import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PullRequest } from "../types";

// ─── store モック ──────────────────────────────────────────────────────────────
const mockPr: PullRequest = {
  id: 1,
  project_id: 1,
  github_id: 200,
  github_number: 10,
  title: "Add auto commit",
  body: "PR body",
  state: "open",
  author_login: "alice",
  head_branch: "feature/auto-commit",
  base_branch: "main",
  checks_status: "passing",
  linked_issue_number: null,
  created_by: "user",
  draft: false,
  merged_at: null,
  github_created_at: "2024-01-01T00:00:00Z",
  github_updated_at: "2024-01-01T00:00:00Z",
  synced_at: "2024-01-01T00:00:00Z",
};

const mockProjectStore = {
  currentProject: { id: 1, name: "TestProject" } as { id: number; name: string } | null,
};

const mockPrStore = {
  prs: [mockPr] as PullRequest[],
  selectedPrId: null as number | null,
  detail: null as { pr: PullRequest; reviews: { state: string }[]; comments: unknown[] } | null,
  detailStatus: "idle" as string,
  files: [],
  diff: "",
  docDiffs: [],
  filesStatus: "idle" as string,
  diffStatus: "idle" as string,
  docDiffStatus: "idle" as string,
  requestChangesStatus: "idle" as string,
  fetchStatus: "success" as string,
  syncStatus: "idle" as string,
  stateFilter: "open" as string,
  activeTab: "overview" as string,
  mergeStatus: "idle" as string,
  reviewStatus: "idle" as string,
  fetchPrs: vi.fn(),
  syncPrs: vi.fn(),
  selectPr: vi.fn(),
  setStateFilter: vi.fn(),
  setActiveTab: vi.fn(),
  fetchFiles: vi.fn(),
  fetchDiff: vi.fn(),
  loadDocDiff: vi.fn(),
  requestChanges: vi.fn(),
  submitReview: vi.fn(),
  addComment: vi.fn(),
  mergePr: vi.fn(),
  listenSyncDone: vi.fn().mockReturnValue(() => {}),
};

vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/prStore", () => ({
  usePrStore: (sel?: (s: typeof mockPrStore) => unknown) =>
    sel ? sel(mockPrStore) : mockPrStore,
}));
vi.mock("../components/pr/PRFilterBar", () => ({
  PRFilterBar: ({
    filter,
    onChange,
    onSync,
    syncing,
  }: {
    filter: string;
    onChange: (f: string) => void;
    onSync: () => void;
    syncing: boolean;
  }) => (
    <div data-testid="pr-filter-bar">
      <span data-testid="pr-filter-value">{filter}</span>
      <button data-testid="pr-filter-open" onClick={() => onChange("open")}>Open</button>
      <button data-testid="pr-filter-closed" onClick={() => onChange("closed")}>Closed</button>
      <button data-testid="pr-sync" onClick={onSync} disabled={syncing}>
        Sync
      </button>
    </div>
  ),
}));
vi.mock("../components/pr/PRList", () => ({
  PRList: ({
    prs,
    onSelect,
    loading,
  }: {
    prs: PullRequest[];
    onSelect: (pr: PullRequest) => void;
    loading: boolean;
  }) => (
    <div data-testid="pr-list">
      {loading && <span>Loading PRs…</span>}
      {prs.map((pr) => (
        <button key={pr.id} data-testid={`pr-item-${pr.id}`} onClick={() => onSelect(pr)}>
          {pr.title}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("../components/pr/PRDetailHeader", () => ({
  PRDetailHeader: ({ pr }: { pr: PullRequest }) => (
    <div data-testid="pr-detail-header">{pr.title}</div>
  ),
}));
vi.mock("../components/pr/PRDetailTabs", () => ({
  PRDetailTabs: ({ onChange }: { activeTab: string; onChange: (t: string) => void }) => (
    <div data-testid="pr-detail-tabs">
      <button onClick={() => onChange("overview")}>Overview</button>
      <button onClick={() => onChange("code-diff")}>Code Diff</button>
    </div>
  ),
}));
vi.mock("../components/pr/TabOverview", () => ({
  TabOverview: () => <div data-testid="tab-overview" />,
}));
vi.mock("../components/pr/TabCodeDiff", () => ({
  TabCodeDiff: () => <div data-testid="tab-code-diff" />,
}));
vi.mock("../components/pr/ReviewPanel", () => ({
  ReviewPanel: () => <div data-testid="review-panel" />,
}));
vi.mock("../components/pr/MergePanel", () => ({
  MergePanel: () => <div data-testid="merge-panel" />,
}));

import { PRScreen } from "./PRScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("PRScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.currentProject = { id: 1, name: "TestProject" };
    mockPrStore.prs = [mockPr];
    mockPrStore.detail = null;
    mockPrStore.detailStatus = "idle";
    mockPrStore.fetchStatus = "success";
    mockPrStore.activeTab = "overview";
  });

  it("currentProject が null の場合「Select a project first」が表示される", () => {
    mockProjectStore.currentProject = null;
    render(<PRScreen />);
    expect(screen.getByText("Select a project first")).toBeInTheDocument();
  });

  it("初期マウント時に fetchPrs が呼ばれる", () => {
    render(<PRScreen />);
    expect(mockPrStore.fetchPrs).toHaveBeenCalledWith(1);
  });

  it("PR 一覧が表示される", () => {
    render(<PRScreen />);
    expect(screen.getByText("Add auto commit")).toBeInTheDocument();
  });

  it("フィルタ切り替えで setStateFilter が呼ばれる", () => {
    render(<PRScreen />);
    fireEvent.click(screen.getByTestId("pr-filter-closed"));
    expect(mockPrStore.setStateFilter).toHaveBeenCalledWith("closed");
  });

  it("PR をクリックすると selectPr が呼ばれる", () => {
    render(<PRScreen />);
    fireEvent.click(screen.getByTestId("pr-item-1"));
    expect(mockPrStore.selectPr).toHaveBeenCalledWith(1, 1);
  });

  it("detail が null の場合「Select a PR to view details」が表示される", () => {
    mockPrStore.detail = null;
    mockPrStore.detailStatus = "idle";
    render(<PRScreen />);
    expect(screen.getByText("Select a PR to view details")).toBeInTheDocument();
  });

  it("detailStatus が loading の場合「Loading...」が表示される", () => {
    mockPrStore.detailStatus = "loading";
    render(<PRScreen />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("detail がある場合に PRDetailHeader と TabOverview が表示される", () => {
    mockPrStore.detail = {
      pr: mockPr,
      reviews: [{ state: "approved" }],
      comments: [],
    };
    mockPrStore.detailStatus = "success";
    render(<PRScreen />);
    expect(screen.getByTestId("pr-detail-header")).toBeInTheDocument();
    expect(screen.getByTestId("tab-overview")).toBeInTheDocument();
  });

  it("Sync ボタンクリックで syncPrs が呼ばれる", () => {
    render(<PRScreen />);
    fireEvent.click(screen.getByTestId("pr-sync"));
    expect(mockPrStore.syncPrs).toHaveBeenCalledWith(1);
  });

  it("open PR で review + merge パネルが表示される", () => {
    mockPrStore.detail = {
      pr: { ...mockPr, state: "open" },
      reviews: [{ state: "approved" }],
      comments: [],
    };
    mockPrStore.detailStatus = "success";
    render(<PRScreen />);
    expect(screen.getByTestId("review-panel")).toBeInTheDocument();
    expect(screen.getByTestId("merge-panel")).toBeInTheDocument();
  });
});
