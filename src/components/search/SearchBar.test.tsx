import { render, screen, fireEvent, act } from "@testing-library/react";
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

  it("入力にフォーカスすると履歴が表示される (line 40)", () => {
    render(<SearchBar
      {...defaultProps}
      query=""
      history={[{ query: "past search" }]}
    />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    expect(screen.getByText("past search")).toBeInTheDocument();
  });

  it("履歴アイテムクリックで onSelectHistory が呼ばれる (lines 88-90)", () => {
    const onSelectHistory = vi.fn();
    render(<SearchBar
      {...defaultProps}
      query=""
      history={[{ query: "past search" }]}
      onSelectHistory={onSelectHistory}
    />);
    fireEvent.focus(screen.getByRole("textbox"));
    fireEvent.click(screen.getByText("past search"));
    expect(onSelectHistory).toHaveBeenCalledWith("past search");
  });

  it("入力がブラーすると履歴が非表示になる (line 41)", async () => {
    vi.useFakeTimers();
    render(<SearchBar
      {...defaultProps}
      query=""
      history={[{ query: "past search" }]}
    />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    expect(screen.getByText("past search")).toBeInTheDocument();
    fireEvent.blur(input);
    // setTimeout 150ms 後に非表示
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText("past search")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
