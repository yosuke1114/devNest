import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FileDiffHeader } from "./FileDiffHeader";

describe("FileDiffHeader", () => {
  it("filename を表示する", () => {
    render(<FileDiffHeader filename="src/foo.ts" additions={3} deletions={1} />);
    expect(screen.getByText("src/foo.ts")).toBeInTheDocument();
  });

  it("+N 形式で additions を表示する", () => {
    render(<FileDiffHeader filename="src/foo.ts" additions={5} deletions={0} />);
    expect(screen.getByText("+5")).toBeInTheDocument();
  });

  it("-N 形式で deletions を表示する", () => {
    render(<FileDiffHeader filename="src/foo.ts" additions={0} deletions={3} />);
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  it("additions を緑色で表示する", () => {
    render(<FileDiffHeader filename="src/foo.ts" additions={2} deletions={0} />);
    const el = screen.getByText("+2");
    expect(el.className).toMatch(/green/);
  });

  it("deletions を赤色で表示する", () => {
    render(<FileDiffHeader filename="src/foo.ts" additions={0} deletions={4} />);
    const el = screen.getByText("-4");
    expect(el.className).toMatch(/red/);
  });

  it("className prop が適用される", () => {
    const { container } = render(
      <FileDiffHeader filename="f.ts" additions={0} deletions={0} className="custom-class" />
    );
    expect(container.firstChild as HTMLElement).toHaveProperty(
      "className",
      expect.stringContaining("custom-class")
    );
  });
});
