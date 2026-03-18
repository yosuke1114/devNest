/**
 * SetupScreen テスト
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

// ─── モック状態 ──────────────────────────────────────────────────────────────

const projectState = {
  projects: [] as typeof mockProject[],
  currentProject: null as typeof mockProject | null,
  createProject: vi.fn(() => Promise.resolve()),
  updateProject: vi.fn(() => Promise.resolve()),
  deleteProject: vi.fn(() => Promise.resolve()),
  selectProject: vi.fn(),
};

const settingsState = {
  authStatus: null as { connected: boolean; user_login?: string } | null,
  authStatus2: "idle" as string,
  startAuth: vi.fn(() => Promise.resolve()),
  fetchAuthStatus: vi.fn(),
};

const notificationsState = {
  permissionStatus: "default" as string,
  requestPermission: vi.fn(),
};

const uiState = { navigate: vi.fn() };

// Tauri listen mock
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// FilePicker: Tauri plugin-dialog を回避するため簡易モック
vi.mock("../../components/shared/FilePicker", () => ({
  FilePicker: ({ label, onPick }: { label?: string; onPick: (p: string) => void }) => (
    <button data-testid="file-picker" onClick={() => onPick("/picked/path")}>{label ?? "選択"}</button>
  ),
}));

const mockIpc = vi.hoisted(() => ({
  indexBuild: vi.fn(),
}));
vi.mock("../../lib/ipc", () => mockIpc);

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: vi.fn(() => projectState),
}));

vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: vi.fn(() => settingsState),
}));

vi.mock("../../stores/notificationsStore", () => ({
  useNotificationsStore: vi.fn(() => notificationsState),
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: vi.fn(() => uiState),
}));

// SetupStepDots: 単純化
vi.mock("../../components/shared/SetupStepDots", () => ({
  SetupStepDots: () => <div data-testid="step-dots" />,
}));

import { SetupScreen } from "../SetupScreen";

describe("SetupScreen — リストモード", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.projects = [mockProject];
    projectState.currentProject = mockProject;
    projectState.createProject = vi.fn(() => Promise.resolve());
    projectState.updateProject = vi.fn(() => Promise.resolve());
    projectState.deleteProject = vi.fn(() => Promise.resolve());
    projectState.selectProject = vi.fn();
    settingsState.authStatus = null;
    settingsState.authStatus2 = "idle";
    settingsState.fetchAuthStatus = vi.fn();
    uiState.navigate = vi.fn();
    notificationsState.permissionStatus = "default";
    mockIpc.indexBuild = vi.fn(() => Promise.resolve());
  });

  it("プロジェクト一覧ヘッダーが表示される", () => {
    render(<SetupScreen />);
    expect(screen.getByText("プロジェクト管理")).toBeInTheDocument();
  });

  it("プロジェクト名とパスが表示される", () => {
    render(<SetupScreen />);
    expect(screen.getByText("DevNest")).toBeInTheDocument();
    expect(screen.getByText("/tmp/devnest")).toBeInTheDocument();
  });

  it("プロジェクトクリックで selectProject と navigate が呼ばれる", () => {
    render(<SetupScreen />);
    fireEvent.click(screen.getByText("DevNest"));
    expect(projectState.selectProject).toHaveBeenCalledWith(mockProject);
    expect(uiState.navigate).toHaveBeenCalledWith("editor");
  });

  it("「新規プロジェクトを追加」クリックでウィザードに切り替わる", () => {
    render(<SetupScreen />);
    fireEvent.click(screen.getByText("新規プロジェクトを追加"));
    expect(screen.getByText("新規プロジェクト")).toBeInTheDocument();
  });

  it("削除ボタンクリック → confirm=true → deleteProject が呼ばれる (lines 553-555, 592)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SetupScreen />);
    // アイコンのみのボタン (テキストなし) = 削除ボタン
    const allBtns = screen.getAllByRole("button");
    const deleteBtn = allBtns.find(b => !(b.textContent?.trim()))!;
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(projectState.deleteProject).toHaveBeenCalledWith(mockProject.id);
    });
    vi.restoreAllMocks();
  });

  it("削除ボタンクリック → confirm=false → deleteProject が呼ばれない (line 554)", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SetupScreen />);
    const allBtns = screen.getAllByRole("button");
    const deleteBtn = allBtns.find(b => !(b.textContent?.trim()))!;
    fireEvent.click(deleteBtn);
    expect(projectState.deleteProject).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("SetupScreen — ウィザードモード (projects=[])", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.projects = [];
    projectState.currentProject = null;
    projectState.createProject = vi.fn(() => {
      projectState.currentProject = mockProject;
      return Promise.resolve();
    });
    projectState.updateProject = vi.fn(() => Promise.resolve());
    projectState.deleteProject = vi.fn(() => Promise.resolve());
    projectState.selectProject = vi.fn();
    settingsState.authStatus = null;
    settingsState.authStatus2 = "idle";
    settingsState.startAuth = vi.fn(() => Promise.resolve());
    settingsState.fetchAuthStatus = vi.fn();
    uiState.navigate = vi.fn();
    notificationsState.permissionStatus = "default";
    notificationsState.requestPermission = vi.fn();
    mockIpc.indexBuild = vi.fn(() => Promise.resolve());
  });

  it("ステップ 0: 新規プロジェクト ヘッダーが表示される", () => {
    render(<SetupScreen />);
    expect(screen.getByText("新規プロジェクト")).toBeInTheDocument();
  });

  it("ステップ 0: プロジェクト名とパス入力が表示される", () => {
    render(<SetupScreen />);
    expect(screen.getByTestId("setup-project-name")).toBeInTheDocument();
    expect(screen.getByTestId("setup-local-dir")).toBeInTheDocument();
  });

  it("ステップ 0: 入力なしで NEXT ボタンが disabled", () => {
    render(<SetupScreen />);
    const nextBtn = screen.getByTestId("setup-next");
    expect(nextBtn).toBeDisabled();
  });

  it("ステップ 0: 入力後 NEXT ボタンが有効になる", () => {
    render(<SetupScreen />);
    fireEvent.change(screen.getByTestId("setup-project-name"), { target: { value: "MyApp" } });
    fireEvent.change(screen.getByTestId("setup-local-dir"), { target: { value: "/tmp/myapp" } });
    expect(screen.getByTestId("setup-next")).not.toBeDisabled();
  });

  it("ステップ 0: FilePicker でパスが設定される", () => {
    render(<SetupScreen />);
    fireEvent.click(screen.getByTestId("file-picker"));
    const input = screen.getByTestId("setup-local-dir") as HTMLInputElement;
    expect(input.value).toBe("/picked/path");
  });

  it("ステップ 0 → 1: NEXT で createProject が呼ばれ Step1 に進む", async () => {
    render(<SetupScreen />);
    fireEvent.change(screen.getByTestId("setup-project-name"), { target: { value: "MyApp" } });
    fireEvent.change(screen.getByTestId("setup-local-dir"), { target: { value: "/tmp/myapp" } });
    fireEvent.click(screen.getByTestId("setup-next"));
    await waitFor(() => {
      expect(projectState.createProject).toHaveBeenCalledWith("MyApp", "/tmp/myapp");
    });
    await waitFor(() => {
      expect(screen.getByText("CONNECT WITH GITHUB")).toBeInTheDocument();
    });
  });

  it("ステップ 1: GitHub 接続済み状態を表示", async () => {
    // Advance to step 1 first
    render(<SetupScreen />);
    fireEvent.change(screen.getByTestId("setup-project-name"), { target: { value: "MyApp" } });
    fireEvent.change(screen.getByTestId("setup-local-dir"), { target: { value: "/tmp/myapp" } });
    // Set authStatus before clicking NEXT
    settingsState.authStatus = { connected: true, user_login: "alice" };
    fireEvent.click(screen.getByTestId("setup-next"));
    await waitFor(() => expect(screen.getByTestId("setup-github-status")).toBeInTheDocument());
    expect(screen.getByText("接続済み")).toBeInTheDocument();
  });

  it("ステップ 1 → 2: SKIP で Step2 に進む", async () => {
    render(<SetupScreen />);
    // Go to step 1
    fireEvent.change(screen.getByTestId("setup-project-name"), { target: { value: "MyApp" } });
    fireEvent.change(screen.getByTestId("setup-local-dir"), { target: { value: "/tmp/myapp" } });
    fireEvent.click(screen.getByTestId("setup-next"));
    // Wait for step 1
    await waitFor(() => screen.getByText("CONNECT WITH GITHUB"));
    // Click SKIP (NavButtons next button)
    const skipBtns = screen.getAllByRole("button").filter(b => b.textContent?.includes("SKIP"));
    fireEvent.click(skipBtns[0]);
    await waitFor(() => expect(screen.getByText("保存時の同期モード")).toBeInTheDocument());
  });

  it("ステップ 2: sync モード切り替えができる", async () => {
    render(<SetupScreen />);
    // Navigate to step 2
    fireEvent.change(screen.getByTestId("setup-project-name"), { target: { value: "X" } });
    fireEvent.change(screen.getByTestId("setup-local-dir"), { target: { value: "/tmp/x" } });
    fireEvent.click(screen.getByTestId("setup-next"));
    await waitFor(() => screen.getByText("CONNECT WITH GITHUB"));
    const skipBtns = screen.getAllByRole("button").filter(b => b.textContent?.includes("SKIP"));
    fireEvent.click(skipBtns[0]);
    await waitFor(() => screen.getByTestId("setup-sync-auto"));
    fireEvent.click(screen.getByTestId("setup-sync-manual"));
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("ステップ 0 BACK は存在しない (最初のステップ)", () => {
    render(<SetupScreen />);
    expect(screen.queryByTestId("setup-back")).not.toBeInTheDocument();
  });

  it("ステップ 2 → BACK でステップ 1 に戻る (line 504)", async () => {
    render(<SetupScreen />);
    fireEvent.change(screen.getByTestId("setup-project-name"), { target: { value: "App" } });
    fireEvent.change(screen.getByTestId("setup-local-dir"), { target: { value: "/tmp/app" } });
    fireEvent.click(screen.getByTestId("setup-next"));
    await waitFor(() => screen.getByText("CONNECT WITH GITHUB"));
    const skipBtns = screen.getAllByRole("button").filter(b => b.textContent?.includes("SKIP"));
    fireEvent.click(skipBtns[0]);
    await waitFor(() => screen.getByText("保存時の同期モード"));
    // BACK ボタンをクリック
    const backBtns = screen.getAllByRole("button").filter(b => b.textContent?.includes("BACK"));
    fireEvent.click(backBtns[0]);
    await waitFor(() => screen.getByText("CONNECT WITH GITHUB"));
  });
});

describe("SetupScreen — Step4/Step5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectState.projects = [];
    projectState.currentProject = null;
    projectState.createProject = vi.fn(() => {
      projectState.currentProject = mockProject;
      return Promise.resolve();
    });
    projectState.updateProject = vi.fn(() => Promise.resolve());
    settingsState.authStatus = null;
    settingsState.authStatus2 = "idle";
    settingsState.startAuth = vi.fn(() => Promise.resolve());
    settingsState.fetchAuthStatus = vi.fn();
    uiState.navigate = vi.fn();
    notificationsState.permissionStatus = "default";
    notificationsState.requestPermission = vi.fn();
    mockIpc.indexBuild = vi.fn(() => Promise.resolve());
  });

  const advanceTo = async (targetStep: number) => {
    render(<SetupScreen />);

    // Step 0 → 1
    fireEvent.change(screen.getByTestId("setup-project-name"), { target: { value: "App" } });
    fireEvent.change(screen.getByTestId("setup-local-dir"), { target: { value: "/tmp/app" } });
    fireEvent.click(screen.getByTestId("setup-next"));
    await waitFor(() => screen.getByText("CONNECT WITH GITHUB"));
    if (targetStep <= 1) return;

    // Step 1 → 2 (SKIP)
    const skip1 = screen.getAllByRole("button").filter(b => b.textContent?.includes("SKIP"));
    fireEvent.click(skip1[0]);
    await waitFor(() => screen.getByTestId("setup-sync-auto"));
    if (targetStep <= 2) return;

    // Step 2 → 3 (NEXT)
    const next2 = screen.getAllByRole("button").filter(b => b.textContent?.includes("NEXT"));
    fireEvent.click(next2[0]);
    await waitFor(() => screen.getByTestId("setup-build-index"));
    if (targetStep <= 3) return;

    // Step 3 → 4 (SKIP)
    const skip3 = screen.getAllByRole("button").filter(b => b.textContent?.includes("SKIP"));
    fireEvent.click(skip3[0]);
    await waitFor(() => {
      const notifyBtn = screen.queryByText("🔔 ALLOW NOTIFICATIONS");
      const granted = screen.queryByText("通知が許可されています");
      if (!notifyBtn && !granted) throw new Error("step 4 not reached");
    });
    if (targetStep <= 4) return;

    // Step 4 → 5 (SKIP)
    const skip4 = screen.getAllByRole("button").filter(b => b.textContent?.includes("SKIP"));
    fireEvent.click(skip4[0]);
    await waitFor(() => screen.getByTestId("setup-open-editor"));
  };

  it("ステップ 3: BUILD INDEX ボタンが表示される", async () => {
    await advanceTo(3);
    expect(screen.getByTestId("setup-build-index")).toBeInTheDocument();
  });

  it("ステップ 3: BUILD INDEX クリックで ipc.indexBuild が呼ばれる", async () => {
    await advanceTo(3);
    fireEvent.click(screen.getByTestId("setup-build-index"));
    await waitFor(() => expect(mockIpc.indexBuild).toHaveBeenCalledWith(1));
  });

  it("ステップ 4: 通知許可ボタンが表示される", async () => {
    await advanceTo(4);
    expect(screen.getByText("🔔 ALLOW NOTIFICATIONS")).toBeInTheDocument();
  });

  it("ステップ 4: 通知許可ボタンクリックで requestPermission が呼ばれる", async () => {
    await advanceTo(4);
    fireEvent.click(screen.getByText("🔔 ALLOW NOTIFICATIONS"));
    expect(notificationsState.requestPermission).toHaveBeenCalled();
  });

  it("ステップ 4: permissionStatus=granted のとき許可済み表示", async () => {
    notificationsState.permissionStatus = "granted";
    await advanceTo(4);
    expect(screen.getByText("通知が許可されています")).toBeInTheDocument();
  });

  it("ステップ 5: プロジェクト名と完了メッセージが表示される", async () => {
    await advanceTo(5);
    expect(screen.getByText(/App を登録しました/)).toBeInTheDocument();
  });

  it("ステップ 5: OPEN EDITOR ボタンで navigate(editor) が呼ばれる", async () => {
    await advanceTo(5);
    fireEvent.click(screen.getByTestId("setup-open-editor"));
    expect(uiState.navigate).toHaveBeenCalledWith("editor");
  });
});
