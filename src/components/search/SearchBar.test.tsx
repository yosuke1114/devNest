import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SearchBar } from "./SearchBar";

describe("SearchBar", () => {
  const defaultProps = {
    query: "",
    searchType: "keyword" as const,
    history: [],
    isLoading: false,
    onQueryChange: vi.fn(),
    onSearchTypeChange: vi.fn(),
    onSelectHistory: vi.fn(),
  };

  it("入力フィールドに query が表示される", () => {
    render(<SearchBar {...defaultProps} query="テスト" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("テスト");
  });

  it("入力変更で onQueryChange が呼ばれる", () => {
    const onQueryChange = vi.fn();
    render(<SearchBar {...defaultProps} onQueryChange={onQueryChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "new query" } });
    expect(onQueryChange).toHaveBeenCalledWith("new query");
  });

  it("query がある場合にクリアボタンが表示される", () => {
    render(<SearchBar {...defaultProps} query="something" />);
    // クリアボタン（X）が存在する
    const buttons = screen.getAllByRole("button");
    const clearBtn = buttons.find((b) => b.getAttribute("aria-label") === "クリア" || b.querySelector("svg"));
    expect(clearBtn).toBeTruthy();
    // より具体的に: クリアボタンが見つかること
    const clearButton = screen.getByRole("button", { name: /クリア|clear/i });
    expect(clearButton).toBeInTheDocument();
  });

  it("クリアボタンクリックで onQueryChange(\"\") が呼ばれる", () => {
    const onQueryChange = vi.fn();
    render(<SearchBar {...defaultProps} query="something" onQueryChange={onQueryChange} />);
    const clearButton = screen.getByRole("button", { name: /クリア|clear/i });
    fireEvent.click(clearButton);
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("isLoading=true のときローディングインジケーターを表示する", () => {
    const { container } = render(<SearchBar {...defaultProps} isLoading={true} />);
    const spinner = container.querySelector("[data-testid='search-loading']");
    expect(spinner).toBeInTheDocument();
  });

  it("keyword ボタン / semantic ボタンが表示される", () => {
    render(<SearchBar {...defaultProps} />);
    expect(screen.getByRole("button", { name: /keyword/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /semantic/i })).toBeInTheDocument();
  });

  it("activeTab (keyword/semantic) に aria-pressed=\"true\" がつく", () => {
    render(<SearchBar {...defaultProps} searchType="semantic" />);
    const semanticBtn = screen.getByRole("button", { name: /semantic/i });
    const keywordBtn = screen.getByRole("button", { name: /keyword/i });
    expect(semanticBtn).toHaveAttribute("aria-pressed", "true");
    expect(keywordBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("検索タイプボタンクリックで onSearchTypeChange が呼ばれる", () => {
    const onSearchTypeChange = vi.fn();
    render(<SearchBar {...defaultProps} onSearchTypeChange={onSearchTypeChange} />);
    fireEvent.click(screen.getByRole("button", { name: /semantic/i }));
    expect(onSearchTypeChange).toHaveBeenCalledWith("semantic");
  });
});
