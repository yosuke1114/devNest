import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// allotment をモック（jsdomではCSSが動かない）
vi.mock("allotment", () => {
  function AllotmentMock({ children, vertical }: { children: React.ReactNode; vertical?: boolean }) {
    return (
      <div data-testid="allotment" data-direction={vertical ? "vertical" : "horizontal"}>
        {children}
      </div>
    );
  }
  AllotmentMock.Pane = function AllotmentPane({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  };
  return { Allotment: AllotmentMock };
});
// allotment/dist/style.css のモック
vi.mock("allotment/dist/style.css", () => ({}));

import { SplitPaneContainer } from "../SplitPaneContainer";
import type { SplitLayout } from "../types";

describe("SplitPaneContainer", () => {
  it("水平分割で2ペインが横並びに表示される", () => {
    const layout: SplitLayout = {
      direction: "horizontal",
      children: [
        { id: "a", type: "browser", props: {} },
        { id: "b", type: "doc-viewer", props: {} },
      ],
    };
    render(<SplitPaneContainer initialLayout={layout} />);
    expect(screen.getByTestId("pane-a")).toBeInTheDocument();
    expect(screen.getByTestId("pane-b")).toBeInTheDocument();
  });

  it("垂直分割で2ペインが縦並びに表示される", () => {
    const layout: SplitLayout = {
      direction: "vertical",
      children: [
        { id: "top", type: "terminal", props: {} },
        { id: "bottom", type: "code-viewer", props: {} },
      ],
    };
    render(<SplitPaneContainer initialLayout={layout} />);
    expect(screen.getByTestId("pane-top")).toBeInTheDocument();
    expect(screen.getByTestId("pane-bottom")).toBeInTheDocument();
  });

  it("各PaneTypeに対応するコンポーネントがレンダリングされる", () => {
    const layout: SplitLayout = {
      direction: "horizontal",
      children: [
        { id: "b", type: "browser", props: {} },
        { id: "k", type: "kanban", props: {} },
      ],
    };
    render(<SplitPaneContainer initialLayout={layout} />);
    expect(screen.getByTestId("pane-b")).toHaveAttribute("data-pane-type", "browser");
    expect(screen.getByTestId("pane-k")).toHaveAttribute("data-pane-type", "kanban");
  });

  it("空のレイアウト（ペイン0）でクラッシュしない", () => {
    const layout: SplitLayout = { direction: "horizontal", children: [] };
    expect(() => render(<SplitPaneContainer initialLayout={layout} />)).not.toThrow();
  });

  it('"code-review" プリセットで3ペイン構成になる', async () => {
    render(<SplitPaneContainer />);
    await userEvent.click(screen.getByTestId("preset-code-review"));
    // code-review は pr, doc, findings の3ペイン
    expect(screen.getByTestId("pane-count")).toHaveTextContent("3 ペイン");
  });

  it('"agent-monitor" プリセットで2ペイン構成になる', async () => {
    render(<SplitPaneContainer />);
    await userEvent.click(screen.getByTestId("preset-agent-monitor"));
    expect(screen.getByTestId("pane-count")).toHaveTextContent("2 ペイン");
  });

  it('"doc-driven" プリセットで2ペイン構成になる', async () => {
    render(<SplitPaneContainer />);
    await userEvent.click(screen.getByTestId("preset-doc-driven"));
    expect(screen.getByTestId("pane-count")).toHaveTextContent("2 ペイン");
  });

  it('"full" プリセットで3ペイン構成になる', async () => {
    render(<SplitPaneContainer />);
    await userEvent.click(screen.getByTestId("preset-full"));
    expect(screen.getByTestId("pane-count")).toHaveTextContent("3 ペイン");
  });

  it("プリセット切替時に既存ペインが正しくアンマウントされる", async () => {
    render(<SplitPaneContainer />);
    await userEvent.click(screen.getByTestId("preset-agent-monitor"));
    expect(screen.queryByTestId("pane-pr")).toBeNull();
    await userEvent.click(screen.getByTestId("preset-code-review"));
    expect(screen.getByTestId("pane-pr")).toBeInTheDocument();
  });

  it("ペインの削除でレイアウトが更新される", async () => {
    const layout: SplitLayout = {
      direction: "horizontal",
      children: [
        { id: "x", type: "browser", props: {} },
        { id: "y", type: "kanban", props: {} },
      ],
    };
    render(<SplitPaneContainer initialLayout={layout} />);
    expect(screen.getByTestId("pane-x")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("ブラウザパネルを閉じる"));
    expect(screen.queryByTestId("pane-x")).toBeNull();
  });

  it("最後のペインを削除するとデフォルトレイアウトに戻る", async () => {
    const layout: SplitLayout = {
      direction: "horizontal",
      children: [{ id: "only", type: "browser", props: {} }],
    };
    render(<SplitPaneContainer initialLayout={layout} />);
    await userEvent.click(screen.getByLabelText("ブラウザパネルを閉じる"));
    // デフォルトレイアウト（agent-monitor）の log ペインが表示される
    expect(screen.getByTestId("pane-log")).toBeInTheDocument();
  });

  it("レイアウト変更が localStorage に保存される", async () => {
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        clear: () => { store = {}; },
      };
    })();
    Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

    render(<SplitPaneContainer />);
    await userEvent.click(screen.getByTestId("preset-doc-driven"));

    const saved = localStorageMock.getItem("devnest-split-layout");
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed.direction).toBeDefined();
  });

  it("アプリ起動時に保存済みレイアウトが復元される", () => {
    const savedLayout: SplitLayout = {
      direction: "horizontal",
      children: [
        { id: "custom", type: "kanban", props: {} },
      ],
    };
    const localStorageMock2 = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; },
      };
    })();
    Object.defineProperty(window, "localStorage", { value: localStorageMock2, writable: true });
    localStorageMock2.setItem("devnest-split-layout", JSON.stringify(savedLayout));

    render(<SplitPaneContainer />);
    expect(screen.getByTestId("pane-custom")).toBeInTheDocument();

    localStorageMock2.removeItem("devnest-split-layout");
  });
});
