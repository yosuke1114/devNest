import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SearchResultItem } from "./SearchResultItem";
import type { SearchResult } from "../../types";

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunk_id: 1,
    document_id: 10,
    path: "docs/design.md",
    title: null,
    section_heading: null,
    content: "This is some content",
    start_line: 1,
    score: 0.9,
    ...overrides,
  };
}

describe("SearchResultItem", () => {
  it("result.path を表示する", () => {
    render(
      <SearchResultItem
        result={makeResult({ path: "docs/design.md" })}
        isActive={false}
        keyword=""
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("docs/design.md")).toBeInTheDocument();
  });

  it("result.section_heading がある場合に表示する", () => {
    render(
      <SearchResultItem
        result={makeResult({ section_heading: "## 概要" })}
        isActive={false}
        keyword=""
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("## 概要")).toBeInTheDocument();
  });

  it("result.section_heading が null の場合に表示しない", () => {
    render(
      <SearchResultItem
        result={makeResult({ section_heading: null })}
        isActive={false}
        keyword=""
        onClick={vi.fn()}
      />
    );
    expect(screen.queryByText(/##/)).toBeNull();
  });

  it("isActive=true のとき data-active=\"true\" 属性を持つ", () => {
    const { container } = render(
      <SearchResultItem
        result={makeResult()}
        isActive={true}
        keyword=""
        onClick={vi.fn()}
      />
    );
    const el = container.querySelector("[data-active='true']");
    expect(el).toBeInTheDocument();
  });

  it("isActive=false のとき data-active=\"false\" 属性を持つ", () => {
    const { container } = render(
      <SearchResultItem
        result={makeResult()}
        isActive={false}
        keyword=""
        onClick={vi.fn()}
      />
    );
    const el = container.querySelector("[data-active='false']");
    expect(el).toBeInTheDocument();
  });

  it("クリックで onClick が呼ばれる", () => {
    const onClick = vi.fn();
    render(
      <SearchResultItem
        result={makeResult()}
        isActive={false}
        keyword=""
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByText("docs/design.md"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
