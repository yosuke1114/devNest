import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it('「通知はありません」というテキストを表示する', () => {
    render(<EmptyState />);
    expect(screen.getByText("通知はありません")).toBeInTheDocument();
  });

  it("CI 結果・PR コメント等の説明文を表示する", () => {
    render(<EmptyState />);
    expect(screen.getByText(/CI 結果・PR コメント/)).toBeInTheDocument();
  });
});
