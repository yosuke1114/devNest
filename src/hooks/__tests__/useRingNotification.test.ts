import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// @tauri-apps/api/event のモック
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { listen } from "@tauri-apps/api/event";
import { useRingNotification } from "../useRingNotification";
import type { RingEvent } from "../useRingNotification";

describe("useRingNotification", () => {
  let capturedListener: ((event: { payload: RingEvent }) => void) | null = null;

  beforeEach(() => {
    capturedListener = null;
    vi.mocked(listen).mockImplementation((_eventName, listener) => {
      capturedListener = listener as (event: { payload: RingEvent }) => void;
      return Promise.resolve(() => {});
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const makeEvent = (urgency: RingEvent["urgency"]): RingEvent => ({
    type: "agentAttention",
    urgency,
    message: "テスト",
  });

  it("ring-event を受信してリストに追加される", async () => {
    const { result } = renderHook(() => useRingNotification());

    await act(async () => {});

    act(() => {
      capturedListener?.({ payload: makeEvent("warning") });
    });

    expect(result.current.rings).toHaveLength(1);
    expect(result.current.rings[0].event.urgency).toBe("warning");
  });

  it("Info urgency のリングが5秒後に自動消去される", async () => {
    const { result } = renderHook(() => useRingNotification());

    await act(async () => {});

    act(() => {
      capturedListener?.({ payload: makeEvent("info") });
    });
    expect(result.current.rings).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5001);
    });
    expect(result.current.rings).toHaveLength(0);
  });

  it("複数イベントが正しくキューイングされる", async () => {
    const { result } = renderHook(() => useRingNotification());

    await act(async () => {});

    act(() => {
      capturedListener?.({ payload: makeEvent("critical") });
      capturedListener?.({ payload: makeEvent("warning") });
      capturedListener?.({ payload: makeEvent("info") });
    });

    expect(result.current.rings).toHaveLength(3);
  });

  it("criticalCount が warning/critical のリングをカウントする", async () => {
    const { result } = renderHook(() => useRingNotification());
    await act(async () => {});

    act(() => {
      capturedListener?.({ payload: makeEvent("critical") });
      capturedListener?.({ payload: makeEvent("warning") });
      capturedListener?.({ payload: makeEvent("info") });
    });

    expect(result.current.criticalCount).toBe(1);
    expect(result.current.warningCount).toBe(1);
  });

  it("dismissRing でリングを個別に消去できる", async () => {
    const { result } = renderHook(() => useRingNotification());
    await act(async () => {});

    act(() => {
      capturedListener?.({ payload: makeEvent("critical") });
    });

    const ringId = result.current.rings[0].id;
    act(() => {
      result.current.dismissRing(ringId);
    });
    expect(result.current.rings).toHaveLength(0);
  });
});
