import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrashRecoveryDialog } from "../CrashRecoveryDialog";

// vi.hoisted で invoke モックを宣言し、返値を制御できるようにする
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

// テスト用のクラッシュセッションデータ
const makeCrashedSession = () => ({
  id: "session-001",
  taskInput: "テストタスクの詳細な説明文がここに入ります（長い文字列）",
  workers: [
    { workerId: "w-001", role: "scout", status: "done", hasCommits: true },
    { workerId: "w-002", role: "builder", status: "running", hasCommits: true },
    { workerId: "w-003", role: "reviewer", status: "idle", hasCommits: false },
  ],
});

describe("CrashRecoveryDialog", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  // ITb-13-12: check_crashed_sessions が null を返すときダイアログが表示されない
  it("ITb-13-12: check_crashed_sessions が null を返すときダイアログが表示されない", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    await act(async () => {
      render(<CrashRecoveryDialog />);
    });

    expect(screen.queryByTestId("crash-recovery-dialog")).toBeNull();
  });

  // ITb-13-13: クラッシュセッションがある場合ダイアログが表示される
  it("ITb-13-13: クラッシュセッションがある場合ダイアログが表示される", async () => {
    mockInvoke.mockResolvedValueOnce(makeCrashedSession());

    await act(async () => {
      render(<CrashRecoveryDialog />);
    });

    expect(screen.getByTestId("crash-recovery-dialog")).toBeTruthy();
  });

  // ITb-13-14: 完了済み Worker に ✅スキップ が表示される
  it("ITb-13-14: 完了済み Worker に ✅スキップ が表示される", async () => {
    mockInvoke.mockResolvedValueOnce(makeCrashedSession());

    await act(async () => {
      render(<CrashRecoveryDialog />);
    });

    const completedEl = screen.getByTestId("completed-worker-w-001");
    expect(completedEl).toBeTruthy();
    expect(completedEl.textContent).toContain("✅");
    expect(completedEl.textContent).toContain("スキップ");
  });

  // ITb-13-15: コミットありの未完了 Worker に 🔄続きから再開 が表示される
  it("ITb-13-15: コミットあり Worker に 🔄続きから再開 が表示される", async () => {
    mockInvoke.mockResolvedValueOnce(makeCrashedSession());

    await act(async () => {
      render(<CrashRecoveryDialog />);
    });

    const pendingEl = screen.getByTestId("pending-worker-w-002");
    expect(pendingEl).toBeTruthy();
    expect(pendingEl.textContent).toContain("🔄");
    expect(pendingEl.textContent).toContain("続きから再開");
  });

  // ITb-13-16: コミットなしの未完了 Worker に 🆕新規ブランチで再実行 が表示される
  it("ITb-13-16: コミットなし Worker に 🆕新規ブランチで再実行 が表示される", async () => {
    mockInvoke.mockResolvedValueOnce(makeCrashedSession());

    await act(async () => {
      render(<CrashRecoveryDialog />);
    });

    const pendingEl = screen.getByTestId("pending-worker-w-003");
    expect(pendingEl).toBeTruthy();
    expect(pendingEl.textContent).toContain("🆕");
    expect(pendingEl.textContent).toContain("新規ブランチで再実行");
  });

  // ITb-13-17: [再開する] クリックで resume_crashed_session が呼ばれる
  it("ITb-13-17: 再開ボタンクリックで resume_crashed_session が呼ばれる", async () => {
    mockInvoke.mockResolvedValueOnce(makeCrashedSession());
    mockInvoke.mockResolvedValue(undefined); // resume_crashed_session の戻り値

    await act(async () => {
      render(<CrashRecoveryDialog />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("crash-resume-button"));
    });

    expect(mockInvoke).toHaveBeenCalledWith("resume_crashed_session", {
      sessionId: "session-001",
    });
  });

  // ITb-13-18: [破棄する] クリックで discard_crashed_session が呼ばれる
  it("ITb-13-18: 破棄ボタンクリックで discard_crashed_session が呼ばれる", async () => {
    mockInvoke.mockResolvedValueOnce(makeCrashedSession());
    mockInvoke.mockResolvedValue(undefined); // discard_crashed_session の戻り値

    await act(async () => {
      render(<CrashRecoveryDialog />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("crash-discard-button"));
    });

    expect(mockInvoke).toHaveBeenCalledWith("discard_crashed_session", {
      sessionId: "session-001",
    });
  });

  // ITb-13-19: [再開する] クリック後にダイアログが閉じる
  it("ITb-13-19: 再開ボタンクリック後にダイアログが閉じる", async () => {
    mockInvoke.mockResolvedValueOnce(makeCrashedSession());
    mockInvoke.mockResolvedValue(undefined);

    await act(async () => {
      render(<CrashRecoveryDialog />);
    });

    expect(screen.getByTestId("crash-recovery-dialog")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("crash-resume-button"));
    });

    expect(screen.queryByTestId("crash-recovery-dialog")).toBeNull();
  });
});
