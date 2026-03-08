import { beforeEach, describe, it, expect, vi } from "vitest";
import { useTerminalStore } from "./terminalStore";
import * as ipc from "../lib/ipc";
import type { TerminalDonePayload, TerminalSession } from "../types";

vi.mock("../lib/ipc");
const mockIpc = vi.mocked(ipc);

function makeSession(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 1,
    project_id: 1,
    branch_name: "feat/test",
    has_doc_changes: false,
    prompt_summary: null,
    output_log: null,
    exit_code: null,
    status: "running",
    started_at: "2026-01-01T00:00:00Z",
    ended_at: null,
    ...overrides,
  };
}

function makeDonePayload(overrides: Partial<TerminalDonePayload> = {}): TerminalDonePayload {
  return {
    session_id: 1,
    branch_name: "feat/new-feature",
    commit_sha: "abc123",
    has_doc_changes: false,
    changed_files: [],
    exit_code: 0,
    ...overrides,
  };
}

describe("terminalStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.setState({
      session: null,
      sessions: [],
      startStatus: "idle",
      showPrReadyBanner: false,
      readyBranch: "",
      hasDocChanges: false,
      changedFiles: [],
      error: null,
    });
  });

  // ─── 初期状態 ───────────────────────────────────────────────────────────────

  it("初期状態が正しい", () => {
    const s = useTerminalStore.getState();
    expect(s.session).toBeNull();
    expect(s.startStatus).toBe("idle");
    expect(s.showPrReadyBanner).toBe(false);
  });

  // ─── startSession ─────────────────────────────────────────────────────────

  it("startSession() が terminalSessionStart を呼ぶ", async () => {
    const session = makeSession();
    mockIpc.terminalSessionStart.mockResolvedValueOnce(session);

    await useTerminalStore.getState().startSession(1, "Fix the bug");

    expect(mockIpc.terminalSessionStart).toHaveBeenCalledWith(1, "Fix the bug");
  });

  it("startSession() 成功時に session がセットされる", async () => {
    const session = makeSession({ id: 42 });
    mockIpc.terminalSessionStart.mockResolvedValueOnce(session);

    await useTerminalStore.getState().startSession(1);

    expect(useTerminalStore.getState().session?.id).toBe(42);
    expect(useTerminalStore.getState().startStatus).toBe("success");
  });

  it("startSession() 成功時に showPrReadyBanner がリセットされる", async () => {
    useTerminalStore.setState({ showPrReadyBanner: true });
    mockIpc.terminalSessionStart.mockResolvedValueOnce(makeSession());

    await useTerminalStore.getState().startSession(1);

    expect(useTerminalStore.getState().showPrReadyBanner).toBe(false);
  });

  it("startSession() 失敗時に error がセットされる", async () => {
    mockIpc.terminalSessionStart.mockRejectedValueOnce(new Error("pty failed"));

    await useTerminalStore.getState().startSession(1);

    expect(useTerminalStore.getState().startStatus).toBe("error");
    expect(useTerminalStore.getState().error).toBeTruthy();
  });

  // ─── stopSession ──────────────────────────────────────────────────────────

  it("stopSession() が terminalSessionStop を呼ぶ", async () => {
    useTerminalStore.setState({ session: makeSession({ id: 5 }) });
    mockIpc.terminalSessionStop.mockResolvedValueOnce(undefined);

    await useTerminalStore.getState().stopSession();

    expect(mockIpc.terminalSessionStop).toHaveBeenCalledWith(5);
  });

  it("stopSession() 後に session.status が 'aborted' になる", async () => {
    useTerminalStore.setState({ session: makeSession({ id: 5 }) });
    mockIpc.terminalSessionStop.mockResolvedValueOnce(undefined);

    await useTerminalStore.getState().stopSession();

    expect(useTerminalStore.getState().session?.status).toBe("aborted");
  });

  it("stopSession() で session が null のとき何もしない", async () => {
    useTerminalStore.setState({ session: null });
    await useTerminalStore.getState().stopSession();
    expect(mockIpc.terminalSessionStop).not.toHaveBeenCalled();
  });

  // ─── sendInput ────────────────────────────────────────────────────────────

  it("sendInput() が terminalInputSend を呼ぶ", async () => {
    useTerminalStore.setState({ session: makeSession({ id: 3, status: "running" }) });
    mockIpc.terminalInputSend.mockResolvedValueOnce(undefined);

    await useTerminalStore.getState().sendInput("ls -la\n");

    expect(mockIpc.terminalInputSend).toHaveBeenCalledWith(3, "ls -la\n");
  });

  it("sendInput() で session が null のとき何もしない", async () => {
    useTerminalStore.setState({ session: null });
    await useTerminalStore.getState().sendInput("ls\n");
    expect(mockIpc.terminalInputSend).not.toHaveBeenCalled();
  });

  it("sendInput() で session.status が 'running' でないとき何もしない", async () => {
    useTerminalStore.setState({ session: makeSession({ status: "completed" }) });
    await useTerminalStore.getState().sendInput("ls\n");
    expect(mockIpc.terminalInputSend).not.toHaveBeenCalled();
  });

  // ─── loadSessions ─────────────────────────────────────────────────────────

  it("loadSessions() が terminalSessionList を呼ぶ", async () => {
    mockIpc.terminalSessionList.mockResolvedValueOnce([]);
    await useTerminalStore.getState().loadSessions(1);
    expect(mockIpc.terminalSessionList).toHaveBeenCalledWith(1);
  });

  it("loadSessions() 成功時に sessions がセットされる", async () => {
    const sessions = [makeSession({ id: 1 }), makeSession({ id: 2, status: "completed" })];
    mockIpc.terminalSessionList.mockResolvedValueOnce(sessions);

    await useTerminalStore.getState().loadSessions(1);

    expect(useTerminalStore.getState().sessions).toHaveLength(2);
  });

  // ─── dismissBanner ────────────────────────────────────────────────────────

  it("dismissBanner() で showPrReadyBanner が false になる", () => {
    useTerminalStore.setState({ showPrReadyBanner: true });
    useTerminalStore.getState().dismissBanner();
    expect(useTerminalStore.getState().showPrReadyBanner).toBe(false);
  });

  // ─── onTerminalDone ───────────────────────────────────────────────────────

  it("onTerminalDone() が exit_code=0 のとき showPrReadyBanner が true になる", () => {
    useTerminalStore.setState({ session: makeSession() });
    const payload = makeDonePayload({ exit_code: 0, branch_name: "feat/done" });

    useTerminalStore.getState().onTerminalDone(payload);

    expect(useTerminalStore.getState().showPrReadyBanner).toBe(true);
    expect(useTerminalStore.getState().readyBranch).toBe("feat/done");
  });

  it("onTerminalDone() が exit_code!=0 のとき showPrReadyBanner は false", () => {
    useTerminalStore.setState({ session: makeSession() });
    const payload = makeDonePayload({ exit_code: 1 });

    useTerminalStore.getState().onTerminalDone(payload);

    expect(useTerminalStore.getState().showPrReadyBanner).toBe(false);
  });

  it("onTerminalDone() で session.status が 'completed' になる（exit_code=0）", () => {
    useTerminalStore.setState({ session: makeSession({ id: 1, status: "running" }) });
    useTerminalStore.getState().onTerminalDone(makeDonePayload({ exit_code: 0 }));

    expect(useTerminalStore.getState().session?.status).toBe("completed");
  });

  it("onTerminalDone() で session.status が 'failed' になる（exit_code!=0）", () => {
    useTerminalStore.setState({ session: makeSession({ id: 1, status: "running" }) });
    useTerminalStore.getState().onTerminalDone(makeDonePayload({ exit_code: 1 }));

    expect(useTerminalStore.getState().session?.status).toBe("failed");
  });

  it("onTerminalDone() で has_doc_changes が反映される", () => {
    useTerminalStore.setState({ session: makeSession() });
    const payload = makeDonePayload({ has_doc_changes: true, changed_files: ["docs/spec.md"] });

    useTerminalStore.getState().onTerminalDone(payload);

    expect(useTerminalStore.getState().hasDocChanges).toBe(true);
    expect(useTerminalStore.getState().changedFiles).toEqual(["docs/spec.md"]);
  });

  it("onTerminalDone() で session が null のとき session は null のまま", () => {
    useTerminalStore.setState({ session: null });
    useTerminalStore.getState().onTerminalDone(makeDonePayload());
    expect(useTerminalStore.getState().session).toBeNull();
  });

  it("onTerminalDone() で session.branch_name が更新される", () => {
    useTerminalStore.setState({ session: makeSession({ branch_name: null }) });
    useTerminalStore.getState().onTerminalDone(makeDonePayload({ branch_name: "feat/new" }));
    expect(useTerminalStore.getState().session?.branch_name).toBe("feat/new");
  });
});
