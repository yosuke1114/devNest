import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FreshnessMapScreen } from "../FreshnessMapScreen";
import type { DocStaleness } from "../../types";

const mockNavigate = vi.fn();
const mockScanDocStaleness = vi.fn();

const maintenanceState = {
  docStaleness: [] as DocStaleness[],
  docStalenessStatus: "idle" as "idle" | "loading" | "success" | "error",
  scanDocStaleness: mockScanDocStaleness,
};

const projectState = {
  currentProject: {
    id: 1,
    name: "DevNest",
    local_path: "/tmp/proj",
  } as { id: number; name: string; local_path: string } | null,
};

vi.mock("../../stores/maintenanceStore", () => ({
  useMaintenanceStore: () => maintenanceState,
}));

vi.mock("../../stores/projectStore", () => ({
  useProjectStore: () => projectState,
}));

vi.mock("../../stores/uiStore", () => ({
  useUiStore: {
    getState: () => ({ navigate: mockNavigate }),
  },
}));

function makeDoc(overrides: Partial<DocStaleness> = {}): DocStaleness {
  return {
    doc_path: "docs/spec.md",
    current_status: "fresh",
    staleness_score: 0.1,
    recommended_status: "fresh",
    days_since_sync: 5,
    commits_since_sync: 1,
    lines_changed_in_sources: 10,
    total_source_lines: 200,
    ...overrides,
  };
}

describe("FreshnessMapScreen", () => {
  beforeEach(() => {
    maintenanceState.docStaleness = [];
    maintenanceState.docStalenessStatus = "idle";
    projectState.currentProject = { id: 1, name: "DevNest", local_path: "/tmp/proj" };
    mockScanDocStaleness.mockClear();
    mockNavigate.mockClear();
  });

  it("currentProject が null のとき案内メッセージを表示する", () => {
    projectState.currentProject = null;
    render(<FreshnessMapScreen />);
    expect(screen.getByText("プロジェクトを選択してください")).toBeInTheDocument();
  });

  it("docStalenessStatus=loading のとき「スキャン中...」を表示する (line 61)", () => {
    maintenanceState.docStalenessStatus = "loading";
    render(<FreshnessMapScreen />);
    expect(screen.getByText("スキャン中...")).toBeInTheDocument();
  });

  it("ヘッダーとドキュメント件数が表示される", () => {
    maintenanceState.docStaleness = [makeDoc()];
    render(<FreshnessMapScreen />);
    expect(screen.getByText("設計書 鮮度マップ")).toBeInTheDocument();
    expect(screen.getByText("1 件のドキュメント")).toBeInTheDocument();
  });

  it("docStaleness が空のとき「設計書が見つかりません」メッセージを表示する", () => {
    render(<FreshnessMapScreen />);
    expect(screen.getByText(/設計書が見つかりませんでした/)).toBeInTheDocument();
  });

  it("「再スキャン」ボタンクリックで scanDocStaleness が呼ばれる", () => {
    render(<FreshnessMapScreen />);
    fireEvent.click(screen.getByText("再スキャン"));
    expect(mockScanDocStaleness).toHaveBeenCalledWith("/tmp/proj");
  });

  it("staleness_score >= 0.3 のドキュメントがある場合「AI更新を実行」ボタンを表示する", () => {
    maintenanceState.docStaleness = [makeDoc({ staleness_score: 0.5 })];
    render(<FreshnessMapScreen />);
    expect(screen.getByText("AI更新を実行")).toBeInTheDocument();
  });

  it("「AI更新を実行」ボタンクリックで navigate(agent) が呼ばれる (line 49)", () => {
    maintenanceState.docStaleness = [makeDoc({ staleness_score: 0.8 })];
    render(<FreshnessMapScreen />);
    fireEvent.click(screen.getByText("AI更新を実行"));
    expect(mockNavigate).toHaveBeenCalledWith("agent");
  });

  it("staleness_score < 0.3 のドキュメントのみの場合「AI更新を実行」ボタンを表示しない", () => {
    maintenanceState.docStaleness = [makeDoc({ staleness_score: 0.1 })];
    render(<FreshnessMapScreen />);
    expect(screen.queryByText("AI更新を実行")).toBeNull();
  });

  it("DocRow がドキュメント一覧を表示する", () => {
    maintenanceState.docStaleness = [makeDoc({ doc_path: "docs/spec.md", staleness_score: 0.1 })];
    render(<FreshnessMapScreen />);
    expect(screen.getByText("spec.md")).toBeInTheDocument();
    expect(screen.getByText("docs/spec.md")).toBeInTheDocument();
  });

  it("DocRow: スコア 0.5 は 🟡 アイコン", () => {
    maintenanceState.docStaleness = [makeDoc({ staleness_score: 0.5 })];
    render(<FreshnessMapScreen />);
    expect(screen.getByText("🟡")).toBeInTheDocument();
  });

  it("DocRow: スコア 0.8 は 🔴 アイコン", () => {
    maintenanceState.docStaleness = [makeDoc({ staleness_score: 0.8 })];
    render(<FreshnessMapScreen />);
    expect(screen.getByText("🔴")).toBeInTheDocument();
  });

  it("DocRow: スコア 0.1 は 🟢 アイコン", () => {
    maintenanceState.docStaleness = [makeDoc({ staleness_score: 0.1 })];
    render(<FreshnessMapScreen />);
    expect(screen.getByText("🟢")).toBeInTheDocument();
  });

  it("DocRow: onMouseEnter/onMouseLeave でスタイルが変化する (lines 178-179)", () => {
    maintenanceState.docStaleness = [makeDoc({ doc_path: "docs/spec.md" })];
    render(<FreshnessMapScreen />);
    // filenameEl → parentElement (flex:1 div) → parentElement (DocRow outer div)
    const filenameEl = screen.getByText("spec.md");
    const docRow = filenameEl.parentElement?.parentElement as HTMLDivElement;
    expect(docRow).toBeTruthy();
    fireEvent.mouseEnter(docRow);
    expect(docRow.style.background).toBeTruthy(); // "#1e1e32" がセットされた
    fireEvent.mouseLeave(docRow);
    expect(docRow.style.background).toBe("transparent");
  });

  it("ディレクトリ別グループ表示: 複数パスが同一ディレクトリにグループされる", () => {
    maintenanceState.docStaleness = [
      makeDoc({ doc_path: "docs/spec.md" }),
      makeDoc({ doc_path: "docs/api.md" }),
    ];
    render(<FreshnessMapScreen />);
    // ディレクトリヘッダー「docs」が表示される
    expect(screen.getByText("docs")).toBeInTheDocument();
  });

  it("ディレクトリなしのパスは「.」グループになる", () => {
    maintenanceState.docStaleness = [makeDoc({ doc_path: "README.md" })];
    render(<FreshnessMapScreen />);
    expect(screen.getByText(".")).toBeInTheDocument();
  });

  it("useEffect: idle かつ docStaleness が空のとき scanDocStaleness を呼ぶ", () => {
    maintenanceState.docStaleness = [];
    maintenanceState.docStalenessStatus = "idle";
    render(<FreshnessMapScreen />);
    expect(mockScanDocStaleness).toHaveBeenCalledWith("/tmp/proj");
  });

  it("useEffect: すでに docStaleness があるとき scanDocStaleness を呼ばない", () => {
    maintenanceState.docStaleness = [makeDoc()];
    maintenanceState.docStalenessStatus = "idle";
    render(<FreshnessMapScreen />);
    expect(mockScanDocStaleness).not.toHaveBeenCalled();
  });
});
