import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor";

describe("MarkdownEditor", () => {
  it("docId=null のとき placeholder が表示されるかクラッシュしない", () => {
    expect(() => {
      render(
        <MarkdownEditor
          docId={null}
          initialContent=""
          onContentChange={vi.fn()}
          onReady={vi.fn()}
        />
      );
    }).not.toThrow();
  });

  it("docId=null のとき何らかの placeholder テキストまたはコンテナが表示される", () => {
    const { container } = render(
      <MarkdownEditor
        docId={null}
        initialContent=""
        onContentChange={vi.fn()}
        onReady={vi.fn()}
      />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("docId が渡されたときクラッシュしない", () => {
    expect(() => {
      render(
        <MarkdownEditor
          docId={1}
          initialContent="# Hello"
          onContentChange={vi.fn()}
          onReady={vi.fn()}
        />
      );
    }).not.toThrow();
  });

  it("コンテナ div が render される", () => {
    const { container } = render(
      <MarkdownEditor
        docId={1}
        initialContent="test content"
        onContentChange={vi.fn()}
        onReady={vi.fn()}
      />
    );
    const div = container.querySelector("div");
    expect(div).toBeInTheDocument();
  });
});
