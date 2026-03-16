/**
 * CollaborationScreen テスト
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

const mockEntries = [
  {
    id: "e1", entry_type: "design_decision" as const,
    title: "アーキテクチャ決定", content: "Tauri を選択した理由。".repeat(20),
    author: "alice", product_id: "prod-1",
    linked_docs: [], tags: ["tauri", "rust"],
    created_at: "2026-01-15T00:00:00Z",
    comments: [{ id: "c1", author: "bob", content: "LGTM", created_at: "2026-01-16T00:00:00Z" }],
  },
  {
    id: "e2", entry_type: "tech_note" as const,
    title: "テスト手法メモ", content: "短いコンテンツ",
    author: "bob", product_id: "prod-1",
    linked_docs: [], tags: [],
    created_at: "2026-02-01T00:00:00Z",
    comments: [],
  },
];

const mockTeamDashboard = {
  total_open_prs: 5,
  total_open_issues: 12,
  pending_reviews: [
    { pr_number: 44, title: "feat: auto commit", author: "alice", requested_reviewers: [], created_at: "2026-03-01T00:00:00Z" },
  ],
  members: [
    { github_username: "alice", display_name: "Alice", recent_commits: 15, open_prs: 2, review_requests: 1, active_cards: 3 },
    { github_username: "bob", display_name: "Bob", recent_commits: 8, open_prs: 1, review_requests: 0, active_cards: 1 },
  ],
};

const mockIpc = vi.hoisted(() => ({
  knowledgeList: vi.fn(),
  knowledgeSearch: vi.fn(),
  knowledgeAdd: vi.fn(),
  teamGetDashboard: vi.fn(),
}));

vi.mock("../../lib/ipc", () => mockIpc);

const projectState = { currentProject: mockProject as typeof mockProject | null };

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn(() => projectState),
}));

import { CollaborationScreen } from "../CollaborationScreen";

describe("CollaborationScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.currentProject = mockProject;
    mockIpc.knowledgeList.mockResolvedValue([]);
    mockIpc.knowledgeSearch.mockResolvedValue([]);
    mockIpc.knowledgeAdd.mockResolvedValue(null);
    mockIpc.teamGetDashboard.mockResolvedValue(null);
  });

  it("プロジェクト未選択時は案内文を表示", () => {
    projectState.currentProject = null;
    render(<CollaborationScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("ヘッダーとタブが表示される", () => {
    render(<CollaborationScreen />);
    expect(screen.getByText("コラボレーション")).toBeInTheDocument();
    expect(screen.getByText("ナレッジベース")).toBeInTheDocument();
    expect(screen.getByText("チーム")).toBeInTheDocument();
  });

  it("マウント時に knowledgeList と teamGetDashboard が呼ばれる", async () => {
    render(<CollaborationScreen />);
    await waitFor(() => {
      expect(mockIpc.knowledgeList).toHaveBeenCalledWith("/tmp/devnest");
      expect(mockIpc.teamGetDashboard).toHaveBeenCalledWith("/tmp/devnest");
    });
  });

  it("エントリなしのとき ナレッジがありません を表示", async () => {
    render(<CollaborationScreen />);
    await waitFor(() => expect(screen.getByText("ナレッジがありません")).toBeInTheDocument());
  });

  it("エントリありのときリストを表示", async () => {
    mockIpc.knowledgeList.mockResolvedValue(mockEntries);
    render(<CollaborationScreen />);
    await waitFor(() => {
      expect(screen.getByText("アーキテクチャ決定")).toBeInTheDocument();
      expect(screen.getByText("テスト手法メモ")).toBeInTheDocument();
    });
  });

  it("entry_type ラベルが表示される", async () => {
    mockIpc.knowledgeList.mockResolvedValue(mockEntries);
    render(<CollaborationScreen />);
    await waitFor(() => {
      expect(screen.getByText("設計判断")).toBeInTheDocument();
      expect(screen.getByText("技術メモ")).toBeInTheDocument();
    });
  });

  it("タグが表示される", async () => {
    mockIpc.knowledgeList.mockResolvedValue(mockEntries);
    render(<CollaborationScreen />);
    await waitFor(() => {
      expect(screen.getByText("#tauri")).toBeInTheDocument();
      expect(screen.getByText("#rust")).toBeInTheDocument();
    });
  });

  it("コメント数が表示される", async () => {
    mockIpc.knowledgeList.mockResolvedValue(mockEntries);
    render(<CollaborationScreen />);
    await waitFor(() => expect(screen.getByText("1 コメント")).toBeInTheDocument());
  });

  it("コンテンツが 200 字超は省略される", async () => {
    mockIpc.knowledgeList.mockResolvedValue(mockEntries);
    render(<CollaborationScreen />);
    await waitFor(() => {
      const text = screen.getByText(/Tauri を選択した理由.*\.\.\./);
      expect(text).toBeInTheDocument();
    });
  });

  it("検索ボタンで knowledgeSearch が呼ばれる", async () => {
    render(<CollaborationScreen />);
    const input = screen.getByPlaceholderText("ナレッジを検索...");
    fireEvent.change(input, { target: { value: "Tauri" } });
    fireEvent.click(screen.getByText("検索"));
    await waitFor(() => expect(mockIpc.knowledgeSearch).toHaveBeenCalledWith("/tmp/devnest", "Tauri"));
  });

  it("検索フィールドで Enter でも検索される", async () => {
    render(<CollaborationScreen />);
    const input = screen.getByPlaceholderText("ナレッジを検索...");
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mockIpc.knowledgeSearch).toHaveBeenCalledWith("/tmp/devnest", "test"));
  });

  it("+ 追加 でフォームを表示", () => {
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    expect(screen.getByPlaceholderText("タイトル")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("内容")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("タグ（カンマ区切り）")).toBeInTheDocument();
  });

  it("キャンセル ボタンでフォームを閉じる", () => {
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    fireEvent.click(screen.getByText("キャンセル"));
    expect(screen.queryByPlaceholderText("タイトル")).not.toBeInTheDocument();
  });

  it("type を 振り返り に変更できる", () => {
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "retro_learning" } });
    expect((select as HTMLSelectElement).value).toBe("retro_learning");
  });

  it("タイトルと内容を入力して保存で knowledgeAdd が呼ばれる", async () => {
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    fireEvent.change(screen.getByPlaceholderText("タイトル"), { target: { value: "新エントリ" } });
    fireEvent.change(screen.getByPlaceholderText("内容"), { target: { value: "詳細内容" } });
    fireEvent.change(screen.getByPlaceholderText("タグ（カンマ区切り）"), { target: { value: "a, b" } });
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() => expect(mockIpc.knowledgeAdd).toHaveBeenCalledWith(
      "/tmp/devnest", "新エントリ", "詳細内容", "design_decision",
      ["a", "b"], [], "user"
    ));
  });

  it("タイトルが空では knowledgeAdd を呼ばない", async () => {
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("+ 追加"));
    fireEvent.change(screen.getByPlaceholderText("内容"), { target: { value: "内容だけ" } });
    fireEvent.click(screen.getByText("保存"));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockIpc.knowledgeAdd).not.toHaveBeenCalled();
  });

  // ─── チームタブ ───────────────────────────────────────────────────────────

  it("チーム タブに切り替えできる", () => {
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("チーム"));
    expect(screen.getByText("レビュー待ち")).toBeInTheDocument();
    expect(screen.getByText("チームメンバー")).toBeInTheDocument();
  });

  it("teamDashboard なしのとき空状態を表示", () => {
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("チーム"));
    expect(screen.getByText("レビュー待ちなし")).toBeInTheDocument();
    expect(screen.getByText("GitHub 連携後に表示されます")).toBeInTheDocument();
  });

  it("teamDashboard ありのときデータを表示", async () => {
    mockIpc.teamGetDashboard.mockResolvedValue(mockTeamDashboard);
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("チーム"));
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
    });
  });

  it("pending_reviews を表示", async () => {
    mockIpc.teamGetDashboard.mockResolvedValue(mockTeamDashboard);
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("チーム"));
    await waitFor(() => {
      expect(screen.getByText("#44")).toBeInTheDocument();
      expect(screen.getByText("feat: auto commit")).toBeInTheDocument();
    });
  });

  it("members を表示", async () => {
    mockIpc.teamGetDashboard.mockResolvedValue(mockTeamDashboard);
    render(<CollaborationScreen />);
    fireEvent.click(screen.getByText("チーム"));
    await waitFor(() => {
      expect(screen.getByText("@alice")).toBeInTheDocument();
      expect(screen.getByText("@bob")).toBeInTheDocument();
      expect(screen.getByText("15 コミット")).toBeInTheDocument();
    });
  });
});
