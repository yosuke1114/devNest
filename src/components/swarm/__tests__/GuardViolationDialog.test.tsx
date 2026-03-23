import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GuardViolationDialog } from "../GuardViolationDialog";

// vi.hoisted で listen コールバックをキャプチャできるよう変数を宣言
const { mockListen, mockInvoke, capturedListeners } = vi.hoisted(() => {
  const capturedListeners: Record<string, (e: { payload: unknown }) => void> = {};
  return {
    capturedListeners,
    mockInvoke: vi.fn(),
    mockListen: vi.fn((eventName: string, cb: (e: { payload: unknown }) => void) => {
      capturedListeners[eventName] = cb;
      return Promise.resolve(() => {});
    }),
  };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: mockListen }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

// guard-violation イベントを手動発火するヘルパー
function fireGuardViolation(payload: {
  workerId: string;
  violation: { type: string; file?: string };
}) {
  capturedListeners["guard-violation"]?.({ payload });
}

describe("GuardViolationDialog", () => {
  const onContinue = vi.fn();
  const onStop = vi.fn();

  beforeEach(() => {
    onContinue.mockClear();
    onStop.mockClear();
    mockInvoke.mockClear();
    mockListen.mockClear();
    // capturedListeners をリセット
    for (const key of Object.keys(capturedListeners)) {
      delete capturedListeners[key];
    }
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ITb-13-06: guard-violation(git_push) でトーストが表示される
  it("ITb-13-06: git_push 違反でトーストが表示される", async () => {
    render(<GuardViolationDialog onContinue={onContinue} onStop={onStop} />);

    await act(async () => {
      fireGuardViolation({ workerId: "w-001", violation: { type: "git_push" } });
    });

    expect(screen.getByTestId("guard-violation-toast")).toBeTruthy();
    expect(screen.getByTestId("guard-violation-toast").textContent).toContain("w-001");
    expect(screen.getByTestId("guard-violation-toast").textContent).toContain("gitガード違反");
  });

  // ITb-13-07: git_push 違反ではダイアログが表示されない（トーストのみ）
  it("ITb-13-07: git_push 違反ではダイアログが表示されずトーストのみ", async () => {
    render(<GuardViolationDialog onContinue={onContinue} onStop={onStop} />);

    await act(async () => {
      fireGuardViolation({ workerId: "w-001", violation: { type: "git_push" } });
    });

    expect(screen.queryByTestId("guard-violation-dialog")).toBeNull();
    expect(screen.getByTestId("guard-violation-toast")).toBeTruthy();
  });

  // ITb-13-08: ロール違反(file_write_out_of_scope) でダイアログが表示される
  it("ITb-13-08: file_write_out_of_scope 違反でダイアログが表示される", async () => {
    render(<GuardViolationDialog onContinue={onContinue} onStop={onStop} />);

    await act(async () => {
      fireGuardViolation({
        workerId: "w-002",
        violation: { type: "file_write_out_of_scope", file: "/tmp/secret.txt" },
      });
    });

    expect(screen.getByTestId("guard-violation-dialog")).toBeTruthy();
    // トーストは表示されない
    expect(screen.queryByTestId("guard-violation-toast")).toBeNull();
  });

  // ITb-13-09: [継続させる] クリックでダイアログが閉じ onContinue が呼ばれる
  it("ITb-13-09: 継続ボタンクリックでダイアログが閉じ onContinue が呼ばれる", async () => {
    render(<GuardViolationDialog onContinue={onContinue} onStop={onStop} />);

    await act(async () => {
      fireGuardViolation({
        workerId: "w-003",
        violation: { type: "file_write_out_of_scope", file: "/tmp/foo.txt" },
      });
    });

    expect(screen.getByTestId("guard-violation-dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("guard-continue-button"));
    });

    expect(onContinue).toHaveBeenCalledWith("w-003");
    expect(screen.queryByTestId("guard-violation-dialog")).toBeNull();
  });

  // ITb-13-10: [停止する] クリックでダイアログが閉じ onStop が呼ばれる
  it("ITb-13-10: 停止ボタンクリックでダイアログが閉じ onStop が呼ばれる", async () => {
    render(<GuardViolationDialog onContinue={onContinue} onStop={onStop} />);

    await act(async () => {
      fireGuardViolation({
        workerId: "w-004",
        violation: { type: "file_write_out_of_scope", file: "/tmp/bar.txt" },
      });
    });

    expect(screen.getByTestId("guard-violation-dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("guard-stop-button"));
    });

    expect(onStop).toHaveBeenCalledWith("w-004");
    expect(screen.queryByTestId("guard-violation-dialog")).toBeNull();
  });

  // ITb-13-11: 違反 Worker の ID がダイアログに表示される
  it("ITb-13-11: 違反 Worker の ID がダイアログに表示される", async () => {
    render(<GuardViolationDialog onContinue={onContinue} onStop={onStop} />);

    await act(async () => {
      fireGuardViolation({
        workerId: "worker-xyz",
        violation: { type: "file_write_out_of_scope", file: "/tmp/test.rs" },
      });
    });

    const dialog = screen.getByTestId("guard-violation-dialog");
    expect(dialog.textContent).toContain("worker-xyz");
  });

  // git_reset もトーストが表示されダイアログが表示されないことを確認
  it("git_reset 違反でもトーストのみが表示されダイアログは表示されない", async () => {
    render(<GuardViolationDialog onContinue={onContinue} onStop={onStop} />);

    await act(async () => {
      fireGuardViolation({ workerId: "w-005", violation: { type: "git_reset" } });
    });

    expect(screen.getByTestId("guard-violation-toast")).toBeTruthy();
    expect(screen.queryByTestId("guard-violation-dialog")).toBeNull();
  });

  // トーストは 4000ms 後に自動で消える
  it("トーストは 4000ms 後に自動で消える", async () => {
    render(<GuardViolationDialog onContinue={onContinue} onStop={onStop} />);

    await act(async () => {
      fireGuardViolation({ workerId: "w-006", violation: { type: "git_push" } });
    });

    expect(screen.getByTestId("guard-violation-toast")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByTestId("guard-violation-toast")).toBeNull();
  });
});
