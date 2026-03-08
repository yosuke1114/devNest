import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { IssueFilterBar } from "./IssueFilterBar";

describe("IssueFilterBar", () => {
  it("select の value が statusFilter と一致する", () => {
    render(
      <IssueFilterBar
        statusFilter="open"
        syncing={false}
        onFilterChange={vi.fn()}
        onSync={vi.fn()}
      />
    );
    const select = screen.getByRole("combobox");
    expect((select as HTMLSelectElement).value).toBe("open");
  });

  it("select を変更すると onFilterChange が呼ばれる", () => {
    const onFilterChange = vi.fn();
    render(
      <IssueFilterBar
        statusFilter="open"
        syncing={false}
        onFilterChange={onFilterChange}
        onSync={vi.fn()}
      />
    );
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "closed" } });
    expect(onFilterChange).toHaveBeenCalledWith("closed");
  });

  it("同期ボタンが存在する", () => {
    render(
      <IssueFilterBar
        statusFilter="open"
        syncing={false}
        onFilterChange={vi.fn()}
        onSync={vi.fn()}
      />
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
  });

  it("syncing=true のとき同期ボタンが disabled になる", () => {
    render(
      <IssueFilterBar
        statusFilter="open"
        syncing={true}
        onFilterChange={vi.fn()}
        onSync={vi.fn()}
      />
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
  });

  it("同期ボタンクリックで onSync が呼ばれる", () => {
    const onSync = vi.fn();
    render(
      <IssueFilterBar
        statusFilter="open"
        syncing={false}
        onFilterChange={vi.fn()}
        onSync={onSync}
      />
    );
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onSync).toHaveBeenCalled();
  });
});
