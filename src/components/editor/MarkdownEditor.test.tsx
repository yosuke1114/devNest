import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor";

// コードミラー動的インポートをモック（lines 28-55 をカバーするため）
const mockUpdateListenerOf = vi.fn((cb: unknown) => [cb]);
const mockDocToString = vi.fn(() => "mock content");
const mockDestroy = vi.fn();
const mockOnReady = vi.fn();
const mockOnContentChange = vi.fn();

vi.mock("codemirror", () => {
  const EditorView = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.state = { doc: { toString: mockDocToString } };
    this.destroy = mockDestroy;
  }) as ReturnType<typeof vi.fn> & { updateListener?: { of: ReturnType<typeof vi.fn> }; lineWrapping?: unknown };
  EditorView.updateListener = { of: mockUpdateListenerOf };
  EditorView.lineWrapping = {};
  return { EditorView, basicSetup: [] };
});

vi.mock("@codemirror/lang-markdown", () => ({
  markdown: vi.fn(() => []),
}));

vi.mock("@codemirror/theme-one-dark", () => ({
  oneDark: [],
}));

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: vi.fn((config: { doc: string }) => ({ doc: config.doc })),
  },
}));

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

  it("docId がある場合に EditorView が初期化され onReady が呼ばれる (lines 30-55)", async () => {
    render(
      <MarkdownEditor
        docId={1}
        initialContent="# Hello"
        onContentChange={mockOnContentChange}
        onReady={mockOnReady}
      />
    );
    await waitFor(() => {
      expect(mockOnReady).toHaveBeenCalled();
    });
    // onReady に getValue 関数が渡される
    const getValue = mockOnReady.mock.calls[0][0] as () => string;
    expect(typeof getValue).toBe("function");
    expect(getValue()).toBe("mock content");
  });

  it("updateListener が docChanged=true のとき onContentChange を呼ぶ (lines 35-38)", async () => {
    const onContentChange = vi.fn();
    render(
      <MarkdownEditor
        docId={2}
        initialContent="test"
        onContentChange={onContentChange}
        onReady={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(mockUpdateListenerOf).toHaveBeenCalled();
    });
    // updateListener.of に渡されたコールバックを取得
    const updateCb = mockUpdateListenerOf.mock.calls[mockUpdateListenerOf.mock.calls.length - 1][0] as (
      update: { docChanged: boolean; state: { doc: { toString(): string } } }
    ) => void;
    updateCb({ docChanged: true, state: { doc: { toString: () => "updated" } } });
    expect(onContentChange).toHaveBeenCalledWith("updated");
    // docChanged=false のときは呼ばれない
    const callsBefore = onContentChange.mock.calls.length;
    updateCb({ docChanged: false, state: { doc: { toString: () => "same" } } });
    expect(onContentChange.mock.calls.length).toBe(callsBefore);
  });
});
