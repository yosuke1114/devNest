/**
 * Unified diff 文字列を FileDiffResult[] にパースする。
 */

export interface DiffLine {
  type: "context" | "add" | "remove" | "header";
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiffResult {
  filename: string;
  oldFilename: string | null;
  hunks: DiffHunk[];
}

const DIFF_HEADER = /^diff --git a\/(.*) b\/(.*)/;
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/;

export function parseDiff(raw: string): FileDiffResult[] {
  const results: FileDiffResult[] = [];
  let current: FileDiffResult | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of raw.split("\n")) {
    const diffMatch = line.match(DIFF_HEADER);
    if (diffMatch) {
      if (current) results.push(current);
      current = { filename: diffMatch[2], oldFilename: diffMatch[1], hunks: [] };
      currentHunk = null;
      continue;
    }

    if (!current) continue;

    const hunkMatch = line.match(HUNK_HEADER);
    if (hunkMatch) {
      currentHunk = { header: line, lines: [] };
      current.hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        content: line.slice(1),
        oldLineNo: null,
        newLineNo: newLine++,
      });
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "remove",
        content: line.slice(1),
        oldLineNo: oldLine++,
        newLineNo: null,
      });
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" などは無視
    } else {
      const content = line.startsWith(" ") ? line.slice(1) : line;
      currentHunk.lines.push({
        type: "context",
        content,
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      });
    }
  }

  if (current) results.push(current);
  return results;
}
