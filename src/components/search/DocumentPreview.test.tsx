import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DocumentPreview } from "./DocumentPreview";
import type { SearchResult } from "../../types";

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunk_id: 1,
    document_id: 10,
    path: "docs/design.md",
    title: null,
    section_heading: null,
    content: "line one\nline two\nline three",
    start_line: 5,
    score: 0.9,
    ...overrides,
  };
}

describe("DocumentPreview", () => {
  it("result=null のとき「検索結果を選択してプレビュー」を表示する", () => {
    render(<DocumentPreview result={null} keyword="" onOpen={vi.fn()} />);
    expect(screen.getByText("検索結果を選択してプレビュー")).toBeInTheDocument();
  });

  it("result.path を表示する", () => {
    render(
      <DocumentPreview
        result={makeResult({ path: "docs/api.md" })}
        keyword=""
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("docs/api.md")).toBeInTheDocument();
  });

  it("「エディタで開く」ボタンが存在する", () => {
    render(
      <DocumentPreview result={makeResult()} keyword="" onOpen={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /エディタで開く/ })).toBeInTheDocument();
  });

  it("「エディタで開く」ボタンクリックで onOpen(documentId, startLine) が呼ばれる", () => {
    const onOpen = vi.fn();
    render(
      <DocumentPreview
        result={makeResult({ document_id: 42, start_line: 10 })}
        keyword=""
        onOpen={onOpen}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /エディタで開く/ }));
    expect(onOpen).toHaveBeenCalledWith(42, 10);
  });

  it("result.content の行をライン番号付きで表示する", () => {
    render(
      <DocumentPreview
        result={makeResult({ content: "line one\nline two", start_line: 3 })}
        keyword=""
        onOpen={vi.fn()}
      />
    );
    expect(screen.getByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument();
    // line numbers: 3, 4
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
