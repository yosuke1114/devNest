import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

import { BrowserPanel } from "../BrowserPanel";

describe("BrowserPanel", () => {
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
});
