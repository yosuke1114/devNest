import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PermissionBanner } from "./PermissionBanner";

describe("PermissionBanner", () => {
  it("permissionStatus='granted' のとき何も表示しない", () => {
    const { container } = render(
      <PermissionBanner
        permissionStatus="granted"
        onRequestPermission={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("permissionStatus='denied' のとき赤いバナーを表示する", () => {
    render(
      <PermissionBanner
        permissionStatus="denied"
        onRequestPermission={vi.fn()}
      />
    );
    expect(screen.getByText(/ブロック|blocked/i)).toBeInTheDocument();
  });

  it("permissionStatus='skipped' のとき黄色いバナーと ALLOW ボタンを表示する", () => {
    render(
      <PermissionBanner
        permissionStatus="skipped"
        onRequestPermission={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /allow/i })).toBeInTheDocument();
  });

  it("permissionStatus='unknown' のとき ALLOW ボタンを表示する", () => {
    render(
      <PermissionBanner
        permissionStatus="unknown"
        onRequestPermission={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /allow/i })).toBeInTheDocument();
  });

  it("ALLOW ボタンを押すと onRequestPermission が呼ばれる", () => {
    const onRequest = vi.fn();
    render(
      <PermissionBanner
        permissionStatus="skipped"
        onRequestPermission={onRequest}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /allow/i }));
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("denied のとき ALLOW ボタンは表示しない", () => {
    render(
      <PermissionBanner
        permissionStatus="denied"
        onRequestPermission={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /allow/i })).toBeNull();
  });
});
