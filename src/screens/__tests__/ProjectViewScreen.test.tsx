import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

// 子スクリーンはモックして import コストを回避
vi.mock("../MaintenanceScreen", () => ({
  MaintenanceScreen: () => <div data-testid="maintenance-screen">MaintenanceScreen</div>,
}));
vi.mock("../AnalyticsScreen", () => ({
  AnalyticsScreen: () => <div data-testid="analytics-screen">AnalyticsScreen</div>,
}));
vi.mock("../KanbanScreen", () => ({
  KanbanScreen: () => <div data-testid="kanban-screen">KanbanScreen</div>,
}));
vi.mock("../CollaborationScreen", () => ({
  CollaborationScreen: () => <div data-testid="review-screen">CollaborationScreen</div>,
}));

import { ProjectViewScreen } from "../ProjectViewScreen";
import { useProjectStore } from "../../stores/projectStore";
import type { Project, ProjectStatus } from "../../types";

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 1,
  name: "Test Project",
  repo_owner: "owner",
  repo_name: "repo",
  local_path: "/tmp/test",
  default_branch: "main",
  docs_root: "docs/",
  sync_mode: "manual",
  debounce_ms: 500,
  commit_msg_format: "docs: update {filename}",
  remote_poll_interval_min: 0,
  github_installation_id: null,
  last_opened_document_id: null,
  last_synced_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeStatus = (overrides: Partial<ProjectStatus> = {}): ProjectStatus => ({
  id: 1,
  name: "Test Project",
  local_path: "/tmp/test",
  issue_count: 10,
  open_issue_count: 5,
  document_count: 3,
  github_connected: true,
  last_synced_at: null,
  syncStatus: "idle",
  dirtyCount: 0,
  pendingPushCount: 0,
  branch: "main",
  hasUnresolvedConflict: false,
  pendingAiReviewCount: 2,
  ...overrides,
});

describe("ProjectViewScreen", () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(undefined);
    useProjectStore.setState({
      currentProject: null,
      currentStatus: null,
      projects: [],
      listStatus: "idle",
      error: null,
    });
  });

  it("タブバーが5タブ表示される", () => {
    render(<ProjectViewScreen />);
    expect(screen.getByText("概要")).toBeTruthy();
    expect(screen.getByText("保守")).toBeTruthy();
    expect(screen.getByText("分析")).toBeTruthy();
    expect(screen.getByText("カンバン")).toBeTruthy();
    expect(screen.getByText("AI レビュー")).toBeTruthy();
  });

  it("初期タブは「概要」でプロジェクト未選択メッセージが表示される", () => {
    render(<ProjectViewScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeTruthy();
  });

  it("プロジェクトが設定されると概要が表示される", () => {
    useProjectStore.setState({ currentProject: makeProject({ name: "My Project" }) });
    render(<ProjectViewScreen />);
    expect(screen.getByText("My Project")).toBeTruthy();
  });

  it("プロジェクト情報の各フィールドが表示される", () => {
    useProjectStore.setState({
      currentProject: makeProject({
        repo_owner: "acme",
        repo_name: "app",
        local_path: "/home/user/app",
        default_branch: "develop",
        docs_root: "docs/",
        sync_mode: "auto",
      }),
    });
    render(<ProjectViewScreen />);
    expect(screen.getByText("acme/app")).toBeTruthy();
    expect(screen.getByText("/home/user/app")).toBeTruthy();
    expect(screen.getByText("develop")).toBeTruthy();
    expect(screen.getByText("自動")).toBeTruthy();
  });

  it("last_synced_at がある場合に最終同期日時が表示される (line 117-119)", () => {
    useProjectStore.setState({
      currentProject: makeProject({
        last_synced_at: "2026-03-17T10:00:00Z",
      }),
    });
    render(<ProjectViewScreen />);
    expect(screen.getByText("最終同期")).toBeTruthy();
  });

  it("currentStatus があるとき StatCard が表示される (lines 123-137)", () => {
    useProjectStore.setState({
      currentProject: makeProject(),
      currentStatus: makeStatus({
        open_issue_count: 7,
        document_count: 4,
        hasUnresolvedConflict: false,
        pendingAiReviewCount: 3,
      }),
    });
    render(<ProjectViewScreen />);
    expect(screen.getByText("Issues")).toBeTruthy();
    expect(screen.getByText("ドキュメント")).toBeTruthy();
    expect(screen.getByText("未解決コンフリクト")).toBeTruthy();
    expect(screen.getByText("AI レビュー待ち")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("hasUnresolvedConflict=true のとき StatCard に 1 が表示される", () => {
    useProjectStore.setState({
      currentProject: makeProject(),
      currentStatus: makeStatus({ hasUnresolvedConflict: true }),
    });
    render(<ProjectViewScreen />);
    // conflict count = 1
    const ones = screen.getAllByText("1");
    expect(ones.length).toBeGreaterThan(0);
  });

  // タブ切替 (lines 65-68)
  it("「保守」タブをクリックすると MaintenanceScreen が表示される (line 65)", () => {
    render(<ProjectViewScreen />);
    fireEvent.click(screen.getByText("保守"));
    expect(screen.getByTestId("maintenance-screen")).toBeTruthy();
  });

  it("「分析」タブをクリックすると AnalyticsScreen が表示される (line 66)", () => {
    render(<ProjectViewScreen />);
    fireEvent.click(screen.getByText("分析"));
    expect(screen.getByTestId("analytics-screen")).toBeTruthy();
  });

  it("「カンバン」タブをクリックすると KanbanScreen が表示される (line 67)", () => {
    render(<ProjectViewScreen />);
    fireEvent.click(screen.getByText("カンバン"));
    expect(screen.getByTestId("kanban-screen")).toBeTruthy();
  });

  it("「AI レビュー」タブをクリックすると CollaborationScreen が表示される (line 68)", () => {
    render(<ProjectViewScreen />);
    fireEvent.click(screen.getByText("AI レビュー"));
    expect(screen.getByTestId("review-screen")).toBeTruthy();
  });

  it("タブ切替後に概要タブに戻れる", () => {
    useProjectStore.setState({ currentProject: makeProject({ name: "Back Test" }) });
    render(<ProjectViewScreen />);
    fireEvent.click(screen.getByText("保守"));
    expect(screen.getByTestId("maintenance-screen")).toBeTruthy();
    fireEvent.click(screen.getByText("概要"));
    expect(screen.getByText("Back Test")).toBeTruthy();
  });

  it("sync_mode が manual のとき '手動' が表示される", () => {
    useProjectStore.setState({
      currentProject: makeProject({ sync_mode: "manual" }),
    });
    render(<ProjectViewScreen />);
    expect(screen.getByText("手動")).toBeTruthy();
  });
});
