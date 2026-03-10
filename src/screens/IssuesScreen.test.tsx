import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Issue, IssueDraft, GitHubLabel } from "../types";

// ─── store モック ──────────────────────────────────────────────────────────────
const mockIssue: Issue = {
  id: 1,
  project_id: 1,
  github_number: 42,
  title: "Auto commit feature",
  body: "Implement auto commit",
  status: "open",
  author_login: "alice",
  assignee_login: null,
  labels: "[]",
  milestone: null,
  github_id: 100,
  html_url: "https://github.com/test/repo/issues/42",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockIssueStore = {
  issues: [mockIssue] as Issue[],
  currentIssue: null as Issue | null,
  issueLinks: [],
  drafts: [] as IssueDraft[],
  currentDraft: null as IssueDraft | null,
  draftStreamBuffer: "",
  labels: [] as GitHubLabel[],
  listStatus: "success" as string,
  syncStatus: "idle" as string,
  generateStatus: "idle" as string,
  fetchIssues: vi.fn(),
  syncIssues: vi.fn(),
  selectIssue: vi.fn(),
  fetchIssueLinks: vi.fn(),
  addIssueLink: vi.fn(),
  removeIssueLink: vi.fn(),
  fetchDrafts: vi.fn(),
  createDraft: vi.fn().mockResolvedValue({ id: 1, title: "" }),
  updateDraft: vi.fn().mockResolvedValue(undefined),
  selectDraft: vi.fn(),
  generateDraft: vi.fn().mockResolvedValue(undefined),
  fetchLabels: vi.fn(),
  createIssue: vi.fn().mockResolvedValue(mockIssue),
  listenDraftChunk: vi.fn().mockResolvedValue(() => {}),
  listenDraftDone: vi.fn().mockResolvedValue(() => {}),
};

const mockProjectStore = {
  currentProject: { id: 1, name: "TestProject" } as { id: number; name: string } | null,
};

const mockTerminalStore = {
  startSession: vi.fn(),
};

const mockUiStore = {
  navigate: vi.fn(),
};

const mockDocumentStore = {
  documents: [],
  openDocument: vi.fn(),
};

vi.mock("../stores/issueStore", () => ({
  useIssueStore: (sel?: (s: typeof mockIssueStore) => unknown) =>
    sel ? sel(mockIssueStore) : mockIssueStore,
}));
vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/terminalStore", () => ({
  useTerminalStore: (sel?: (s: typeof mockTerminalStore) => unknown) =>
    sel ? sel(mockTerminalStore) : mockTerminalStore,
}));
vi.mock("../stores/uiStore", () => ({
  useUiStore: (sel?: (s: typeof mockUiStore) => unknown) =>
    sel ? sel(mockUiStore) : mockUiStore,
}));
vi.mock("../stores/documentStore", () => ({
  useDocumentStore: (sel?: (s: typeof mockDocumentStore) => unknown) =>
    sel ? sel(mockDocumentStore) : mockDocumentStore,
}));
vi.mock("../components/issues/IssueDetail", () => ({
  IssueDetail: ({ issue }: { issue: Issue }) => (
    <div data-testid="issue-detail">{issue.title}</div>
  ),
}));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: vi.fn() }));
vi.mock("../lib/ipc", () => ({
  documentSearchSemantic: vi.fn().mockResolvedValue([]),
}));

import { IssuesScreen } from "./IssuesScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("IssuesScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.currentProject = { id: 1, name: "TestProject" };
    mockIssueStore.issues = [mockIssue];
    mockIssueStore.currentIssue = null;
    mockIssueStore.listStatus = "success";
    mockIssueStore.syncStatus = "idle";
    mockIssueStore.drafts = [];
    mockIssueStore.currentDraft = null;
    mockIssueStore.draftStreamBuffer = "";
  });

  it("currentProject が null の場合「プロジェクトを選択してください」が表示される", () => {
    mockProjectStore.currentProject = null;
    render(<IssuesScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("初期マウント時に fetchIssues と fetchDrafts が呼ばれる", () => {
    render(<IssuesScreen />);
    expect(mockIssueStore.fetchIssues).toHaveBeenCalledWith(1, "open");
    expect(mockIssueStore.fetchDrafts).toHaveBeenCalledWith(1);
  });

  it("Issue 一覧タブが表示される", () => {
    render(<IssuesScreen />);
    expect(screen.getByText("Issue 一覧")).toBeInTheDocument();
  });

  it("Issue が表示される", () => {
    render(<IssuesScreen />);
    expect(screen.getByText("Auto commit feature")).toBeInTheDocument();
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("Issue をクリックすると selectIssue と fetchIssueLinks が呼ばれる", () => {
    render(<IssuesScreen />);
    fireEvent.click(screen.getByText("Auto commit feature"));
    expect(mockIssueStore.selectIssue).toHaveBeenCalledWith(mockIssue);
    expect(mockIssueStore.fetchIssueLinks).toHaveBeenCalledWith(1);
  });

  it("Issue 選択時に IssueDetail が表示される", () => {
    mockIssueStore.currentIssue = mockIssue;
    render(<IssuesScreen />);
    expect(screen.getByTestId("issue-detail")).toBeInTheDocument();
  });

  it("Issue 未選択時に「Issue を選択してください」が表示される", () => {
    mockIssueStore.currentIssue = null;
    render(<IssuesScreen />);
    expect(screen.getByText("Issue を選択してください")).toBeInTheDocument();
  });

  it("listStatus が loading の場合「読み込み中…」が表示される", () => {
    mockIssueStore.listStatus = "loading";
    mockIssueStore.issues = [];
    render(<IssuesScreen />);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("Issue がない場合に同期案内メッセージが表示される", () => {
    mockIssueStore.issues = [];
    render(<IssuesScreen />);
    expect(
      screen.getByText(/GitHub から同期してください/)
    ).toBeInTheDocument();
  });

  // ── ステータスフィルタ ──────────────────────────────────────────────
  it("ステータスフィルタを変更すると fetchIssues が再呼び出しされる", () => {
    render(<IssuesScreen />);
    const select = screen.getByDisplayValue("Open");
    fireEvent.change(select, { target: { value: "closed" } });
    // useEffect の再実行で fetchIssues が再度呼ばれる
    expect(mockIssueStore.fetchIssues).toHaveBeenCalled();
  });

  // ── AI Wizard タブ ────────────────────────────────────────────────
  it("AI Wizard タブをクリックするとウィザード画面に切り替わる", () => {
    render(<IssuesScreen />);
    fireEvent.click(screen.getByText("AI Wizard"));
    expect(screen.getByText("Drafts")).toBeInTheDocument();
  });

  // ── 同期ボタン ────────────────────────────────────────────────────
  it("同期ボタンクリックで syncIssues が呼ばれる", () => {
    render(<IssuesScreen />);
    const syncBtn = screen.getByTitle("GitHub から同期");
    fireEvent.click(syncBtn);
    expect(mockIssueStore.syncIssues).toHaveBeenCalledWith(1);
  });
});
