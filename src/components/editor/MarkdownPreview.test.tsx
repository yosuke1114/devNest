import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-body">{children}</div>
  ),
}));
vi.mock("remark-gfm", () => ({ default: vi.fn() }));

import { MarkdownPreview } from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("PREVIEW ヘッダーを表示する", () => {
    render(<MarkdownPreview content="" />);
    expect(screen.getByText("PREVIEW")).toBeInTheDocument();
  });

  it("content を ReactMarkdown に渡して表示する", () => {
    render(<MarkdownPreview content="# Hello" />);
    expect(screen.getByTestId("markdown-body")).toHaveTextContent("# Hello");
  });

  it("content が空のとき空の markdown-body を表示する", () => {
    render(<MarkdownPreview content="" />);
    const body = screen.getByTestId("markdown-body");
    expect(body).toBeInTheDocument();
    expect(body.textContent).toBe("");
  });

  it("content が変わると表示が更新される", () => {
    const { rerender } = render(<MarkdownPreview content="# Hello" />);
    expect(screen.getByTestId("markdown-body")).toHaveTextContent("# Hello");
    rerender(<MarkdownPreview content="## World" />);
    expect(screen.getByTestId("markdown-body")).toHaveTextContent("## World");
  });
});
