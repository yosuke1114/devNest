import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RingIndicator } from "../RingIndicator";

describe("RingIndicator", () => {
  it("Info → ring-indicator-info が表示される", () => {
    render(
      <RingIndicator urgency="info">
        <span>アイコン</span>
      </RingIndicator>
    );
    expect(screen.getByTestId("ring-indicator-info")).toBeInTheDocument();
  });

  it("Critical → ring-indicator-critical が表示される", () => {
    render(
      <RingIndicator urgency="critical">
        <span>アイコン</span>
      </RingIndicator>
    );
    expect(screen.getByTestId("ring-indicator-critical")).toBeInTheDocument();
  });

  it("urgency=null → アニメーション要素なし（children のみ表示）", () => {
    const { container } = render(
      <RingIndicator urgency={null}>
        <span data-testid="child">アイコン</span>
      </RingIndicator>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(container.querySelector("[data-testid^='ring-indicator']")).toBeNull();
  });
});
