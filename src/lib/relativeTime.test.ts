import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { relativeTime } from "./relativeTime";

describe("relativeTime", () => {
  const BASE = new Date("2024-01-01T12:00:00.000Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('0秒前（直後）は "just now" を返す', () => {
    const iso = new Date(BASE).toISOString();
    expect(relativeTime(iso)).toBe("just now");
  });

  it('1分前は "1m ago" を返す', () => {
    const iso = new Date(BASE - 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe("1m ago");
  });

  it('59分前は "59m ago" を返す', () => {
    const iso = new Date(BASE - 59 * 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe("59m ago");
  });

  it('2時間前は "2h ago" を返す', () => {
    const iso = new Date(BASE - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe("2h ago");
  });

  it('2日前は "2d ago" を返す', () => {
    const iso = new Date(BASE - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(iso)).toBe("2d ago");
  });
});
