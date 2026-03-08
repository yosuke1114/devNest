import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PRDescriptionPanel } from "./PRDescriptionPanel";

describe("PRDescriptionPanel", () => {
  it("body があるとき内容を表示する", () => {
    render(<PRDescriptionPanel body="This PR fixes the authentication bug." />);
    expect(screen.getByText("This PR fixes the authentication bug.")).toBeInTheDocument();
  });

  it("body=null のとき「No description」を表示する", () => {
    render(<PRDescriptionPanel body={null} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("body='' のとき「No description」を表示する", () => {
    render(<PRDescriptionPanel body="" />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("body=null のとき本文コンテンツを表示しない", () => {
    render(<PRDescriptionPanel body={null} />);
    expect(screen.queryByText(/This PR/)).toBeNull();
  });
});
