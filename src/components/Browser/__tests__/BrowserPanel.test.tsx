import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

import { BrowserPanel } from "../BrowserPanel";

describe("BrowserPanel", () => {
  beforeEach(() => {
    mockInvoke.mockResolvedValue(null);
  });

  const defaultProps = {
    url: "https://example.com",
    panelId: "panel-1",
    title: "テスト",
    onClose: vi.fn(),
  };

  it("URL指定でiframeが表示される", () => {
    render(<BrowserPanel {...defaultProps} />);
    const iframe = screen.getByTestId("browser-iframe") as HTMLIFrameElement;
    expect(iframe.src).toContain("example.com");
  });

  it("タイトルバーにURLが表示される", () => {
    render(<BrowserPanel {...defaultProps} />);
    const input = screen.getByTestId("browser-url-input") as HTMLInputElement;
    expect(input.value).toBe("https://example.com");
  });

  it("閉じるボタンでonCloseが呼ばれる", async () => {
    const onClose = vi.fn();
    render(<BrowserPanel {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByLabelText("ブラウザパネルを閉じる"));
    expect(onClose).toHaveBeenCalled();
  });

  it("戻るボタンが表示される", () => {
    render(<BrowserPanel {...defaultProps} />);
    expect(screen.getByLabelText("前のページに戻る")).toBeInTheDocument();
  });

  it("進むボタンが表示される", () => {
    render(<BrowserPanel {...defaultProps} />);
    expect(screen.getByLabelText("次のページに進む")).toBeInTheDocument();
  });

  it("URL入力変更で inputUrl が更新される (line 75)", async () => {
    render(<BrowserPanel {...defaultProps} />);
    const input = screen.getByTestId("browser-url-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://github.com" } });
    expect(input.value).toBe("https://github.com");
  });

  it("Enter キーで handleNavigate が呼ばれ invoke される (lines 36-39)", async () => {
    const onNavigate = vi.fn();
    render(<BrowserPanel {...defaultProps} onNavigate={onNavigate} />);
    const input = screen.getByTestId("browser-url-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://github.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("navigate_browser", {
        panelId: "panel-1",
        url: "https://github.com",
      });
    });
    expect(onNavigate).toHaveBeenCalledWith("https://github.com");
  });

  it("title が未指定のとき「ブラウザ」が表示される (line 70)", () => {
    render(<BrowserPanel {...defaultProps} title={undefined} />);
    expect(screen.getByText("ブラウザ")).toBeInTheDocument();
  });

  it("戻るボタンクリックで contentWindow.history.back が呼ばれる (line 28)", () => {
    render(<BrowserPanel {...defaultProps} />);
    const iframe = screen.getByTestId("browser-iframe") as HTMLIFrameElement;
    const mockBack = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { history: { back: mockBack, forward: vi.fn() } },
      writable: true,
    });
    fireEvent.click(screen.getByLabelText("前のページに戻る"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("進むボタンクリックで contentWindow.history.forward が呼ばれる (line 32)", () => {
    render(<BrowserPanel {...defaultProps} />);
    const iframe = screen.getByTestId("browser-iframe") as HTMLIFrameElement;
    const mockForward = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { history: { back: vi.fn(), forward: mockForward } },
      writable: true,
    });
    fireEvent.click(screen.getByLabelText("次のページに進む"));
    expect(mockForward).toHaveBeenCalled();
  });
});
