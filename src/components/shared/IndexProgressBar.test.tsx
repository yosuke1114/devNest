import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { IndexProgressBar } from "./IndexProgressBar";

describe("IndexProgressBar", () => {
  // ─── 基本レンダリング ────────────────────────────────────────────────────

  it("total=0 のとき 0% を表示する", () => {
    render(<IndexProgressBar indexed={0} total={0} />);
    expect(screen.getByText(/0\s*%|\s*0\s*\/\s*0/)).toBeInTheDocument();
  });

  it("indexed/total を表示する", () => {
    render(<IndexProgressBar indexed={3} total={10} />);
    expect(screen.getByText(/3\s*\/\s*10|30\s*%/)).toBeInTheDocument();
  });

  it("100% 完了を正しく表示する", () => {
    render(<IndexProgressBar indexed={5} total={5} />);
    expect(screen.getByText(/100\s*%|5\s*\/\s*5/)).toBeInTheDocument();
  });

  // ─── プログレスバーの width ────────────────────────────────────────────

  it("プログレスバー要素が存在する", () => {
    const { container } = render(<IndexProgressBar indexed={5} total={10} />);
    // role='progressbar' またはカスタム div
    const bar =
      container.querySelector("[role='progressbar']") ??
      container.querySelector(".progress-bar, [data-testid='progress-bar']");
    expect(bar).not.toBeNull();
  });

  it("total=0 でも安全にレンダリングできる（ゼロ除算しない）", () => {
    expect(() =>
      render(<IndexProgressBar indexed={0} total={0} />)
    ).not.toThrow();
  });

  // ─── label ───────────────────────────────────────────────────────────────

  it("label を表示できる", () => {
    render(<IndexProgressBar indexed={1} total={5} label="インデックス中" />);
    expect(screen.getByText("インデックス中")).toBeInTheDocument();
  });

  // ─── className ────────────────────────────────────────────────────────────

  it("className を追加できる", () => {
    const { container } = render(
      <IndexProgressBar indexed={1} total={5} className="my-bar" />
    );
    expect(container.querySelector(".my-bar")).toBeInTheDocument();
  });
});
