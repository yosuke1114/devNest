import { describe, it, expect } from "vitest";
import { parseDiff } from "./diffParser";

// ─── parseDiff ────────────────────────────────────────────────────────────────

describe("parseDiff", () => {
  // 🔴 Red: 空文字列は空配列を返すこと
  it("空文字列は空配列を返す", () => {
    expect(parseDiff("")).toEqual([]);
  });

  // 🔴 Red: 単一ファイルの diff が正しくパースされること
  it("単一ファイルの diff をパースする", () => {
    const raw = [
      "diff --git a/src/foo.ts b/src/foo.ts",
      "@@ -1,3 +1,4 @@",
      " context line",
      "-removed line",
      "+added line",
      "+another added",
    ].join("\n");

    const result = parseDiff(raw);
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("src/foo.ts");
  });

  // 🔴 Red: filename と oldFilename が正しく設定されること
  it("filename と oldFilename を正しく設定する", () => {
    const raw = "diff --git a/old/path.ts b/new/path.ts\n@@ -1 +1 @@\n context";
    const result = parseDiff(raw);
    expect(result[0].filename).toBe("new/path.ts");
    expect(result[0].oldFilename).toBe("old/path.ts");
  });

  // 🔴 Red: 追加行 (+) が type="add" になること
  it("追加行は type='add' になる", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1 +1,2 @@",
      " context",
      "+new line",
    ].join("\n");

    const result = parseDiff(raw);
    const lines = result[0].hunks[0].lines;
    const addLine = lines.find((l) => l.type === "add");
    expect(addLine).toBeDefined();
    expect(addLine?.content).toBe("new line");
  });

  // 🔴 Red: 削除行 (-) が type="remove" になること
  it("削除行は type='remove' になる", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1,2 +1 @@",
      " context",
      "-old line",
    ].join("\n");

    const result = parseDiff(raw);
    const lines = result[0].hunks[0].lines;
    const removeLine = lines.find((l) => l.type === "remove");
    expect(removeLine).toBeDefined();
    expect(removeLine?.content).toBe("old line");
  });

  // 🔴 Red: コンテキスト行が type="context" になること
  it("コンテキスト行は type='context' になる", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1 +1 @@",
      " unchanged line",
    ].join("\n");

    const result = parseDiff(raw);
    const lines = result[0].hunks[0].lines;
    expect(lines[0].type).toBe("context");
    expect(lines[0].content).toBe("unchanged line");
  });

  // 🔴 Red: 追加行の oldLineNo が null、newLineNo が連番になること
  it("追加行は oldLineNo=null, newLineNo が連番になる", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1 +1,2 @@",
      "+line one",
      "+line two",
    ].join("\n");

    const result = parseDiff(raw);
    const lines = result[0].hunks[0].lines;
    expect(lines[0].oldLineNo).toBeNull();
    expect(lines[0].newLineNo).toBe(1);
    expect(lines[1].newLineNo).toBe(2);
  });

  // 🔴 Red: 削除行の newLineNo が null、oldLineNo が連番になること
  it("削除行は newLineNo=null, oldLineNo が連番になる", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1,2 +1 @@",
      "-line one",
      "-line two",
    ].join("\n");

    const result = parseDiff(raw);
    const lines = result[0].hunks[0].lines;
    expect(lines[0].newLineNo).toBeNull();
    expect(lines[0].oldLineNo).toBe(1);
    expect(lines[1].oldLineNo).toBe(2);
  });

  // 🔴 Red: 複数ファイルの diff が正しくパースされること
  it("複数ファイルの diff をパースする", () => {
    const raw = [
      "diff --git a/foo.ts b/foo.ts",
      "@@ -1 +1 @@",
      " foo",
      "diff --git a/bar.ts b/bar.ts",
      "@@ -1 +1 @@",
      " bar",
    ].join("\n");

    const result = parseDiff(raw);
    expect(result).toHaveLength(2);
    expect(result[0].filename).toBe("foo.ts");
    expect(result[1].filename).toBe("bar.ts");
  });

  // 🔴 Red: hunk ヘッダーが hunks に含まれること
  it("hunk ヘッダーが hunks.header に設定される", () => {
    const hunkHeader = "@@ -1,3 +1,4 @@";
    const raw = [
      "diff --git a/a.ts b/a.ts",
      hunkHeader,
      " context",
    ].join("\n");

    const result = parseDiff(raw);
    expect(result[0].hunks[0].header).toBe(hunkHeader);
  });

  // 🔴 Red: "\ No newline at end of file" 行は無視されること
  it('"backslash" で始まる行は無視される', () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file",
      "+new",
    ].join("\n");

    const result = parseDiff(raw);
    const lines = result[0].hunks[0].lines;
    // "\" で始まる行はスキップされるので remove + add の 2 行のみ
    expect(lines.every((l) => l.type !== "header")).toBe(true);
    expect(lines).toHaveLength(2);
  });

  // 🔴 Red: 複数 hunk が正しく分割されること
  it("複数 hunk が正しく分割される", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1 +1 @@",
      " hunk1",
      "@@ -10 +10 @@",
      " hunk2",
    ].join("\n");

    const result = parseDiff(raw);
    expect(result[0].hunks).toHaveLength(2);
  });
});
