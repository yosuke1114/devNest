import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── store モック ──────────────────────────────────────────────────────────────
const mockProjectStore = {
  projects: [] as { id: number; name: string; local_path: string }[],
  currentProject: null as { id: number; name: string } | null,
  createProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  selectProject: vi.fn(),
  updateProject: vi.fn().mockResolvedValue(undefined),
};

const mockUiStore = {
  navigate: vi.fn(),
};

const mockSettingsStore = {
  authStatus: null as { connected: boolean; user_login?: string } | null,
  authStatus2: "idle" as string,
  startAuth: vi.fn().mockResolvedValue(undefined),
  fetchAuthStatus: vi.fn(),
};

const mockNotificationsStore = {
  permissionStatus: "default" as string,
  requestPermission: vi.fn(),
};

vi.mock("../stores/projectStore", () => ({
  useProjectStore: (sel?: (s: typeof mockProjectStore) => unknown) =>
    sel ? sel(mockProjectStore) : mockProjectStore,
}));
vi.mock("../stores/uiStore", () => ({
  useUiStore: (sel?: (s: typeof mockUiStore) => unknown) =>
    sel ? sel(mockUiStore) : mockUiStore,
}));
vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: (sel?: (s: typeof mockSettingsStore) => unknown) =>
    sel ? sel(mockSettingsStore) : mockSettingsStore,
}));
vi.mock("../stores/notificationsStore", () => ({
  useNotificationsStore: (sel?: (s: typeof mockNotificationsStore) => unknown) =>
    sel ? sel(mockNotificationsStore) : mockNotificationsStore,
}));
vi.mock("../lib/ipc", () => ({
  indexBuild: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../components/shared/SetupStepDots", () => ({
  SetupStepDots: () => <div data-testid="setup-step-dots" />,
}));
vi.mock("../components/shared/FilePicker", () => ({
  FilePicker: ({ onPick }: { onPick: (v: string) => void }) => (
    <button data-testid="file-picker" onClick={() => onPick("/test/path")}>
      選択
    </button>
  ),
}));

import { SetupScreen } from "./SetupScreen";

// ─── テスト ────────────────────────────────────────────────────────────────────
describe("SetupScreen — リストモード", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.projects = [
      { id: 1, name: "Project A", local_path: "/path/a" },
      { id: 2, name: "Project B", local_path: "/path/b" },
    ];
    mockProjectStore.currentProject = null;
  });

  it("プロジェクトがある場合にリストモードで表示される", () => {
    render(<SetupScreen />);
    expect(screen.getByText("プロジェクト管理")).toBeInTheDocument();
    expect(screen.getByText("Project A")).toBeInTheDocument();
    expect(screen.getByText("Project B")).toBeInTheDocument();
  });

  it("プロジェクトをクリックすると selectProject と navigate('editor') が呼ばれる", () => {
    render(<SetupScreen />);
    fireEvent.click(screen.getByText("Project A"));
    expect(mockProjectStore.selectProject).toHaveBeenCalledWith(
      mockProjectStore.projects[0]
    );
    expect(mockUiStore.navigate).toHaveBeenCalledWith("editor");
  });

  it("「新規プロジェクトを追加」ボタンでウィザードモードに切り替わる", () => {
    render(<SetupScreen />);
    fireEvent.click(screen.getByText("新規プロジェクトを追加"));
    expect(screen.getByText("新規プロジェクト")).toBeInTheDocument();
  });

  it("ローカルパスが表示される", () => {
    render(<SetupScreen />);
    expect(screen.getByText("/path/a")).toBeInTheDocument();
    expect(screen.getByText("/path/b")).toBeInTheDocument();
  });
});

describe("SetupScreen — ウィザードモード", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectStore.projects = [];
    mockProjectStore.currentProject = null;
  });

  it("プロジェクトがない場合にウィザードモードで表示される", () => {
    render(<SetupScreen />);
    expect(screen.getByText("新規プロジェクト")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument(); // Step label
  });

  it("Step0: プロジェクト名とパスの入力フィールドが表示される", () => {
    render(<SetupScreen />);
    expect(screen.getByPlaceholderText("MyApp")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("/Users/you/projects/myapp")
    ).toBeInTheDocument();
  });

  it("Step0: 名前とパスが空の場合 NEXT ボタンが disabled", () => {
    render(<SetupScreen />);
    const nextBtn = screen.getByText("NEXT").closest("button")!;
    expect(nextBtn).toBeDisabled();
  });

  it("Step0: 名前とパスを入力すると NEXT ボタンが有効になる", () => {
    render(<SetupScreen />);
    fireEvent.change(screen.getByPlaceholderText("MyApp"), {
      target: { value: "TestApp" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("/Users/you/projects/myapp"),
      { target: { value: "/test/path" } }
    );
    const nextBtn = screen.getByText("NEXT").closest("button")!;
    expect(nextBtn).not.toBeDisabled();
  });

  it("Step0: NEXT クリックで createProject が呼ばれる", async () => {
    render(<SetupScreen />);
    fireEvent.change(screen.getByPlaceholderText("MyApp"), {
      target: { value: "TestApp" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("/Users/you/projects/myapp"),
      { target: { value: "/test/path" } }
    );
    fireEvent.click(screen.getByText("NEXT"));
    await waitFor(() => {
      expect(mockProjectStore.createProject).toHaveBeenCalledWith(
        "TestApp",
        "/test/path"
      );
    });
  });

  it("Step0: createProject 失敗時にエラーが表示される", async () => {
    mockProjectStore.createProject.mockRejectedValueOnce(
      new Error("パス不正")
    );
    render(<SetupScreen />);
    fireEvent.change(screen.getByPlaceholderText("MyApp"), {
      target: { value: "TestApp" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("/Users/you/projects/myapp"),
      { target: { value: "/bad/path" } }
    );
    fireEvent.click(screen.getByText("NEXT"));
    await waitFor(() => {
      expect(screen.getByText("パス不正")).toBeInTheDocument();
    });
  });

  it("ウィザードからリストモードに戻れる（キャンセル）", () => {
    mockProjectStore.projects = [
      { id: 1, name: "Project A", local_path: "/path/a" },
    ];
    render(<SetupScreen />);
    // リストモードからウィザードに切り替え
    fireEvent.click(screen.getByText("新規プロジェクトを追加"));
    expect(screen.getByText("新規プロジェクト")).toBeInTheDocument();
    // キャンセルで戻る
    fireEvent.click(screen.getByText("キャンセル"));
    expect(screen.getByText("プロジェクト管理")).toBeInTheDocument();
  });
});
