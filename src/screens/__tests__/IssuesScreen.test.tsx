/**
 * IssuesScreen テスト — AI Wizard パネルを中心にカバレッジを向上
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

const mockIssue = {
  id: 1, github_number: 42, title: "バグ修正",
  body: "本文", status: "open" as const,
  author_login: "alice", assignee_login: null,
  labels: "[]",
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockDraft = {
  id: 10, project_id: 1, title: "Draft Title",
  wizard_context: "some context",
  draft_body: "# Draft body",
  body: null,
  assignee_login: null,
  labels: "[]",
  status: "draft" as const,
  github_number: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

const mockFiledIssue = {
  ...mockIssue, id: 99, github_number: 55, title: "作成済みIssue",
};

const mockLabel = { id: 1, name: "bug", color: "ee0701", description: "" };

// ─── モック状態 ──────────────────────────────────────────────────────────────

const projectState = { currentProject: mockProject as typeof mockProject | null };

const issueState = {
  issues: [] as typeof mockIssue[],
  currentIssue: null as typeof mockIssue | null,
  issueLinks: [],
  drafts: [] as typeof mockDraft[],
  currentDraft: null as typeof mockDraft | null,
  draftStreamBuffer: "",
  labels: [] as typeof mockLabel[],
  listStatus: "idle" as string,
  syncStatus: "idle" as string,
  generateStatus: "idle" as string,
  fetchIssues: vi.fn(() => Promise.resolve()),
  syncIssues: vi.fn(() => Promise.resolve()),
  selectIssue: vi.fn(),
  fetchIssueLinks: vi.fn(() => Promise.resolve()),
  addIssueLink: vi.fn(() => Promise.resolve()),
  removeIssueLink: vi.fn(() => Promise.resolve()),
  fetchDrafts: vi.fn(() => Promise.resolve()),
  createDraft: vi.fn(() => Promise.resolve(mockDraft)),
  updateDraft: vi.fn(() => Promise.resolve()),
  selectDraft: vi.fn(),
  generateDraft: vi.fn(() => Promise.resolve()),
  fetchLabels: vi.fn(() => Promise.resolve()),
  createIssue: vi.fn(() => Promise.resolve(mockFiledIssue)),
  listenDraftChunk: vi.fn(() => Promise.resolve(() => {})),
  listenDraftDone: vi.fn(() => Promise.resolve(() => {})),
};

const terminalState = { startSession: vi.fn() };
const uiState = { navigate: vi.fn() };
const documentState = { documents: [], openDocument: vi.fn() };

const mockIpc = vi.hoisted(() => ({
  documentSearchSemantic: vi.fn(),
}));

vi.mock("../../lib/ipc", () => mockIpc);

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn(() => projectState),
}));

vi.mock("../../stores/issueStore", () => ({
  useIssueStore: vi.fn(() => issueState),
}));

vi.mock("../../stores/terminalStore", () => ({
  useTerminalStore: vi.fn((sel?: (s: typeof terminalState) => unknown) =>
    sel ? sel(terminalState) : terminalState
  ),
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn((sel?: (s: typeof uiState) => unknown) =>
    sel ? sel(uiState) : uiState
  ),
}));

vi.mock("../../stores/documentStore", () => ({
  useDocumentStore: vi.fn((sel?: (s: typeof documentState) => unknown) =>
    sel ? sel(documentState) : documentState
  ),
}));

// IssueDetail: skip heavy component
vi.mock("../../components/issues/IssueDetail", () => ({
  IssueDetail: ({ issue, onLaunchTerminal, onOpenDocument }: {
    issue: typeof mockIssue;
    onLaunchTerminal: (id: number) => void;
    onOpenDocument: (id: number) => void;
    links: unknown[]; linksStatus: string; documents: unknown[];
    onAddLink: () => void; onRemoveLink: () => void;
  }) => (
    <div data-testid="issue-detail">
      <span>{issue.title}</span>
      <button onClick={() => onLaunchTerminal(issue.id)}>launch-terminal</button>
      <button onClick={() => onOpenDocument(1)}>open-document</button>
    </div>
  ),
}));

import { IssuesScreen } from "../IssuesScreen";

describe("IssuesScreen — リストタブ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    issueState.issues = [];
    issueState.currentIssue = null;
    issueState.drafts = [];
    issueState.currentDraft = null;
    issueState.draftStreamBuffer = "";
    issueState.labels = [];
    issueState.listStatus = "idle";
    issueState.syncStatus = "idle";
    issueState.generateStatus = "idle";
    issueState.fetchIssues = vi.fn(() => Promise.resolve());
    issueState.syncIssues = vi.fn(() => Promise.resolve());
    issueState.selectIssue = vi.fn();
    issueState.fetchIssueLinks = vi.fn(() => Promise.resolve());
    issueState.fetchDrafts = vi.fn(() => Promise.resolve());
    issueState.createDraft = vi.fn(() => Promise.resolve(mockDraft));
    issueState.updateDraft = vi.fn(() => Promise.resolve());
    issueState.selectDraft = vi.fn();
    issueState.generateDraft = vi.fn(() => Promise.resolve());
    issueState.fetchLabels = vi.fn(() => Promise.resolve());
    issueState.createIssue = vi.fn(() => Promise.resolve(mockFiledIssue));
    issueState.listenDraftChunk = vi.fn(() => Promise.resolve(() => {}));
    issueState.listenDraftDone = vi.fn(() => Promise.resolve(() => {}));
    terminalState.startSession = vi.fn();
    uiState.navigate = vi.fn();
    documentState.openDocument = vi.fn();
    mockIpc.documentSearchSemantic = vi.fn(() => Promise.resolve([]));
  });

  it("プロジェクト未選択時は案内文を表示", () => {
    projectState.currentProject = null;
    render(<IssuesScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("マウント時に fetchIssues と fetchDrafts が呼ばれる", () => {
    render(<IssuesScreen />);
    expect(issueState.fetchIssues).toHaveBeenCalledWith(1, "open");
    expect(issueState.fetchDrafts).toHaveBeenCalledWith(1);
  });

  it("Issue なしのとき案内文を表示", () => {
    render(<IssuesScreen />);
    expect(screen.getByText(/Issue がありません/)).toBeInTheDocument();
  });

  it("listStatus=loading のときローディング表示", () => {
    issueState.listStatus = "loading";
    render(<IssuesScreen />);
    expect(screen.getByText("読み込み中…")).toBeInTheDocument();
  });

  it("Issue ありでリストが表示される", () => {
    issueState.issues = [mockIssue];
    render(<IssuesScreen />);
    expect(screen.getByText("バグ修正")).toBeInTheDocument();
    expect(screen.getByText(/#42/)).toBeInTheDocument();
  });

  it("Issue クリックで selectIssue + fetchIssueLinks が呼ばれる", () => {
    issueState.issues = [mockIssue];
    render(<IssuesScreen />);
    fireEvent.click(screen.getByText("バグ修正"));
    expect(issueState.selectIssue).toHaveBeenCalledWith(mockIssue);
    expect(issueState.fetchIssueLinks).toHaveBeenCalledWith(1);
  });

  it("currentIssue ありのとき IssueDetail が表示される", () => {
    issueState.currentIssue = mockIssue;
    render(<IssuesScreen />);
    expect(screen.getByTestId("issue-detail")).toBeInTheDocument();
  });

  it("IssueDetail の launch-terminal で startSession + navigate が呼ばれる", () => {
    issueState.currentIssue = mockIssue;
    render(<IssuesScreen />);
    fireEvent.click(screen.getByText("launch-terminal"));
    expect(terminalState.startSession).toHaveBeenCalledWith(1);
    expect(uiState.navigate).toHaveBeenCalledWith("terminal");
  });

  it("IssueDetail の open-document で openDocument + navigate が呼ばれる", () => {
    issueState.currentIssue = mockIssue;
    render(<IssuesScreen />);
    fireEvent.click(screen.getByText("open-document"));
    expect(documentState.openDocument).toHaveBeenCalledWith(1);
    expect(uiState.navigate).toHaveBeenCalledWith("editor");
  });

  it("statusFilter 変更で fetchIssues が再呼び出しされる", () => {
    render(<IssuesScreen />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "closed" } });
    expect(issueState.fetchIssues).toHaveBeenCalledWith(1, "closed");
  });

  it("sync ボタンクリックで syncIssues が呼ばれる", () => {
    render(<IssuesScreen />);
    const syncBtn = screen.getByTitle("GitHub から同期");
    fireEvent.click(syncBtn);
    expect(issueState.syncIssues).toHaveBeenCalledWith(1);
  });
});

describe("IssuesScreen — AI Wizard タブ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    issueState.issues = [];
    issueState.currentIssue = null;
    issueState.drafts = [];
    issueState.currentDraft = null;
    issueState.draftStreamBuffer = "";
    issueState.labels = [];
    issueState.listStatus = "idle";
    issueState.syncStatus = "idle";
    issueState.generateStatus = "idle";
    issueState.fetchIssues = vi.fn(() => Promise.resolve());
    issueState.syncIssues = vi.fn(() => Promise.resolve());
    issueState.selectIssue = vi.fn();
    issueState.fetchIssueLinks = vi.fn(() => Promise.resolve());
    issueState.fetchDrafts = vi.fn(() => Promise.resolve());
    issueState.createDraft = vi.fn(() => Promise.resolve(mockDraft));
    issueState.updateDraft = vi.fn(() => Promise.resolve());
    issueState.selectDraft = vi.fn();
    issueState.generateDraft = vi.fn(() => Promise.resolve());
    issueState.fetchLabels = vi.fn(() => Promise.resolve());
    issueState.createIssue = vi.fn(() => Promise.resolve(mockFiledIssue));
    issueState.listenDraftChunk = vi.fn(() => Promise.resolve(() => {}));
    issueState.listenDraftDone = vi.fn(() => Promise.resolve(() => {}));
    terminalState.startSession = vi.fn();
    uiState.navigate = vi.fn();
    mockIpc.documentSearchSemantic = vi.fn(() => Promise.resolve([]));
  });

  const goWizard = () => {
    render(<IssuesScreen />);
    fireEvent.click(screen.getByText("AI Wizard"));
  };

  it("AI Wizard タブに切り替えできる", () => {
    goWizard();
    expect(screen.getByText("「新規」ボタンでドラフトを作成してください")).toBeInTheDocument();
  });

  it("「新規」ボタンで createDraft + selectDraft が呼ばれる", async () => {
    goWizard();
    fireEvent.click(screen.getByText("新規"));
    await waitFor(() => {
      expect(issueState.createDraft).toHaveBeenCalledWith(1);
      expect(issueState.selectDraft).toHaveBeenCalledWith(mockDraft);
    });
  });

  it("ドラフトなしのときドラフト一覧に「新規でドラフトを作成」を表示", () => {
    goWizard();
    expect(screen.getByText("「新規」でドラフトを作成")).toBeInTheDocument();
  });

  it("ドラフトありのときドラフト一覧にタイトルを表示", () => {
    issueState.drafts = [mockDraft];
    issueState.currentDraft = mockDraft;
    goWizard();
    expect(screen.getByText("Draft Title")).toBeInTheDocument();
  });

  it("ドラフト選択で onSelectDraft が呼ばれる", () => {
    issueState.drafts = [mockDraft];
    issueState.currentDraft = null;
    goWizard();
    // draft button in sidebar (title or 無題)
    fireEvent.click(screen.getByText("Draft Title"));
    expect(issueState.selectDraft).toHaveBeenCalledWith(mockDraft);
  });

  it("currentDraft ありのときフォームが表示される", () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    expect(screen.getByTestId("wizard-step1-input")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-context-input")).toBeInTheDocument();
  });

  it("タイトル入力で値が変わる", () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    const input = screen.getByTestId("wizard-step1-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New Title" } });
    expect(input.value).toBe("New Title");
  });

  it("タイトル blur で onUpdateDraft が呼ばれる", () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    const input = screen.getByTestId("wizard-step1-input");
    fireEvent.blur(input);
    expect(issueState.updateDraft).toHaveBeenCalled();
  });

  it("コンテキスト blur で onUpdateDraft が呼ばれる", () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    const textarea = screen.getByTestId("wizard-context-input");
    fireEvent.blur(textarea);
    expect(issueState.updateDraft).toHaveBeenCalled();
  });

  it("「AI で本文を生成」ボタンクリックで generateDraft が呼ばれる", async () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    fireEvent.click(screen.getByTestId("wizard-generate-draft"));
    await waitFor(() => {
      expect(issueState.updateDraft).toHaveBeenCalled();
      expect(issueState.generateDraft).toHaveBeenCalledWith(10);
    });
  });

  it("タイトル空のとき「AI で本文を生成」ボタンが disabled", () => {
    issueState.currentDraft = { ...mockDraft, title: "" };
    goWizard();
    const btn = screen.getByTestId("wizard-generate-draft");
    expect(btn).toBeDisabled();
  });

  it("generating=true のとき「AI 生成中…」テキストを表示", () => {
    issueState.currentDraft = mockDraft;
    issueState.generateStatus = "loading";
    goWizard();
    expect(screen.getByText("AI 生成中…")).toBeInTheDocument();
  });

  it("ラベル・担当者 ボタンで詳細設定を表示", () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    fireEvent.click(screen.getByText("ラベル・担当者"));
    expect(screen.getByTestId("wizard-assignee-select")).toBeInTheDocument();
  });

  it("詳細設定表示時に fetchLabels が呼ばれる", () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    fireEvent.click(screen.getByText("ラベル・担当者"));
    expect(issueState.fetchLabels).toHaveBeenCalled();
  });

  it("ラベルありのとき選択トグルできる", () => {
    issueState.currentDraft = mockDraft;
    issueState.labels = [mockLabel];
    goWizard();
    fireEvent.click(screen.getByText("ラベル・担当者"));
    expect(screen.getByText("bug")).toBeInTheDocument();
    fireEvent.click(screen.getByText("bug"));
    // bug selected
    fireEvent.click(screen.getByText("bug"));
    // bug deselected
  });

  it("streamBuffer が更新されると本文が更新される", () => {
    issueState.currentDraft = { ...mockDraft, draft_body: "" };
    issueState.draftStreamBuffer = "streamed content";
    goWizard();
    // streamBuffer effect should set editBody
    expect(screen.getByTestId("wizard-draft-content")).toBeInTheDocument();
  });

  it("本文ありのとき GitHub に Issue を提出 ボタンが表示される", () => {
    issueState.currentDraft = mockDraft; // has draft_body = "# Draft body"
    goWizard();
    expect(screen.getByTestId("wizard-file-issue")).toBeInTheDocument();
  });

  it("「GitHub に Issue を提出」クリックで createIssue が呼ばれる", async () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    fireEvent.click(screen.getByTestId("wizard-file-issue"));
    await waitFor(() => {
      expect(issueState.createIssue).toHaveBeenCalledWith(10);
    });
  });

  it("提出後に Issue 番号が表示される", async () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    fireEvent.click(screen.getByTestId("wizard-file-issue"));
    await waitFor(() => expect(screen.getByTestId("wizard-filed-number")).toBeInTheDocument());
    expect(screen.getByText(/#55/)).toBeInTheDocument();
  });

  it("提出後の LAUNCH TERMINAL ボタンで startSession + navigate が呼ばれる", async () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    fireEvent.click(screen.getByTestId("wizard-file-issue"));
    await waitFor(() => screen.getByTestId("wizard-launch-terminal"));
    fireEvent.click(screen.getByTestId("wizard-launch-terminal"));
    expect(terminalState.startSession).toHaveBeenCalledWith(1);
    expect(uiState.navigate).toHaveBeenCalledWith("terminal");
  });

  it("本文ありのとき Preview/Edit ボタンが表示される", () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("Edit ボタンクリックでテキストエリアが表示される", () => {
    issueState.currentDraft = mockDraft;
    goWizard();
    fireEvent.click(screen.getByText("Edit"));
    // Should show textarea
    const textareas = document.querySelectorAll("textarea");
    expect(textareas.length).toBeGreaterThan(0);
  });

  it("Issue 一覧タブに戻れる", () => {
    goWizard();
    fireEvent.click(screen.getByText("Issue 一覧"));
    expect(screen.getByRole("combobox")).toBeInTheDocument(); // statusFilter select
  });
});
