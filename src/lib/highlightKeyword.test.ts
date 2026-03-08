import { describe, it, expect } from "vitest";
import React from "react";
import { highlightKeyword } from "./highlightKeyword";

describe("highlightKeyword", () => {
  it("keyword が空文字のとき text をそのまま返す", () => {
    const result = highlightKeyword("hello world", "");
    expect(result).toBe("hello world");
  });

  it("keyword に一致する部分が <mark> で囲まれる", () => {
    const result = highlightKeyword("hello world", "world");
    const el = result as React.ReactElement<{ children: React.ReactNode[] }>;
    const children = el.props.children as React.ReactNode[];
    const mark = children.find(
      (c) => React.isValidElement(c) && c.type === "mark"
    ) as React.ReactElement<{ children: string }> | undefined;
    expect(mark).toBeTruthy();
    expect(mark!.props.children).toBe("world");
  });

  it("大文字小文字を区別しない", () => {
    const result = highlightKeyword("Hello World", "hello");
    const el = result as React.ReactElement<{ children: React.ReactNode[] }>;
    const children = el.props.children as React.ReactNode[];
    const mark = children.find(
      (c) => React.isValidElement(c) && c.type === "mark"
    ) as React.ReactElement<{ children: string }> | undefined;
    expect(mark).toBeTruthy();
    expect(mark!.props.children).toBe("Hello");
  });

  it("複数の一致がすべてハイライトされる", () => {
    const result = highlightKeyword("foo bar foo", "foo");
    const el = result as React.ReactElement<{ children: React.ReactNode[] }>;
    const children = el.props.children as React.ReactNode[];
    const marks = children.filter(
      (c) => React.isValidElement(c) && c.type === "mark"
    );
    expect(marks).toHaveLength(2);
  });
});
