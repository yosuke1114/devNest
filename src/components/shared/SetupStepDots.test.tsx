import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SetupStepDots } from "./SetupStepDots";

describe("SetupStepDots", () => {
  it("ステップ数分のドットを表示する", () => {
    render(
      <SetupStepDots totalSteps={6} currentStep={0} completedSteps={[]} onGoTo={vi.fn()} />
    );
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });

  it("現在のステップのドットに aria-current='step' を付与する", () => {
    render(
      <SetupStepDots totalSteps={6} currentStep={2} completedSteps={[]} onGoTo={vi.fn()} />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[2]).toHaveAttribute("aria-current", "step");
  });

  it("完了済みステップはクリック可能で onGoTo が呼ばれる", () => {
    const onGoTo = vi.fn();
    render(
      <SetupStepDots totalSteps={6} currentStep={3} completedSteps={[0, 1, 2]} onGoTo={onGoTo} />
    );
    fireEvent.click(screen.getAllByRole("button")[1]); // step 1 (completed)
    expect(onGoTo).toHaveBeenCalledWith(1);
  });

  it("未完了・現在ステップより後のドットはクリックしても onGoTo が呼ばれない", () => {
    const onGoTo = vi.fn();
    render(
      <SetupStepDots totalSteps={6} currentStep={2} completedSteps={[0, 1]} onGoTo={onGoTo} />
    );
    fireEvent.click(screen.getAllByRole("button")[4]); // step 4 (future)
    expect(onGoTo).not.toHaveBeenCalled();
  });

  it("完了済みステップのドットに data-completed 属性を付与する", () => {
    render(
      <SetupStepDots totalSteps={6} currentStep={3} completedSteps={[0, 1, 2]} onGoTo={vi.fn()} />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAttribute("data-completed", "true");
    expect(buttons[1]).toHaveAttribute("data-completed", "true");
    expect(buttons[3]).not.toHaveAttribute("data-completed", "true");
  });
});
