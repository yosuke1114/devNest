import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SearchResultList } from "./SearchResultList";
import type { SearchResult } from "../../types";

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunk_id: 1,
    document_id: 10,
    path: "docs/design.md",
    title: null,
    section_heading: null,
    content: "some content",
    start_line: 1,
    score: 0.9,
    ...overrides,
  };
}

describe("SearchResultList", () => {
  it("status=\"idle\" かつ query が短い場合「2 文字以上入力して検索」を表示する", () => {
    render(
      <SearchResultList
        results={[]}
        status="idle"
        query="a"
        activeResultId={null}
        keyword="a"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/2 文字以上入力して検索/)).toBeInTheDocument();
  });

  it("results=[] かつ status=\"success\" のとき「見つかりませんでした」を表示する", () => {
    render(
      <SearchResultList
        results={[]}
        status="success"
        query="no match"
        activeResultId={null}
        keyword="no match"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/見つかりませんでした/)).toBeInTheDocument();
  });

  it("results がある場合に件数「{N} 件」を表示する", () => {
    const results = [
      makeResult({ chunk_id: 1 }),
      makeResult({ chunk_id: 2, path: "docs/other.md" }),
    ];
    render(
      <SearchResultList
        results={results}
        status="success"
        query="test"
        activeResultId={null}
        keyword="test"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText(/2 件/)).toBeInTheDocument();
  });

  it("results のパスを表示する", () => {
    const results = [makeResult({ chunk_id: 1, path: "docs/readme.md" })];
    render(
      <SearchResultList
        results={results}
        status="success"
        query="test"
        activeResultId={null}
        keyword="test"
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText("docs/readme.md")).toBeInTheDocument();
  });

  it("アクティブな result に対して SearchResultItem の onClick が呼ばれる", () => {
    const onSelect = vi.fn();
    const results = [makeResult({ chunk_id: 5, path: "docs/active.md" })];
    render(
      <SearchResultList
        results={results}
        status="success"
        query="test"
        activeResultId={5}
        keyword="test"
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByText("docs/active.md"));
    expect(onSelect).toHaveBeenCalledWith(5);
  });
});
