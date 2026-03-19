/**
 * AI ReviewPanel テスト
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReviewPanel } from "./ReviewPanel";
import type { ReviewResult } from "../../types";

function makeResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    overall_assessment: "approve",
    summary: "変更は問題ありません",
    findings: [],
    design_consistency: { inconsistencies: [] },
    suggested_doc_updates: [],
    ...overrides,
  };
}

describe("AI ReviewPanel", () => {
  it("総合評価「承認」を表示する", () => {
    render(<ReviewPanel result={makeResult({ overall_assessment: "approve" })} />);
    expect(screen.getByText("✅ 承認")).toBeInTheDocument();
  });

  it("総合評価「変更要求」を表示する", () => {
    render(<ReviewPanel result={makeResult({ overall_assessment: "request_changes" })} />);
    expect(screen.getByText("❌ 変更要求")).toBeInTheDocument();
  });

  it("総合評価「コメント」を表示する", () => {
    render(<ReviewPanel result={makeResult({ overall_assessment: "comment" })} />);
    expect(screen.getByText("💬 コメント")).toBeInTheDocument();
  });

  it("サマリーを表示する", () => {
    render(<ReviewPanel result={makeResult({ summary: "LGTM！" })} />);
    expect(screen.getByText("LGTM！")).toBeInTheDocument();
  });

  it("findings がある場合に指摘事項を表示する", () => {
    render(<ReviewPanel result={makeResult({
      findings: [{
        severity: "warning",
        file: "src/main.rs",
        line_start: 42,
        message: "変数名が不明瞭",
        suggested_fix: "より明確な名前を使用してください",
      }],
    })} />);
    expect(screen.getByText("指摘事項")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
    expect(screen.getByText("src/main.rs")).toBeInTheDocument();
    expect(screen.getByText("変数名が不明瞭")).toBeInTheDocument();
    expect(screen.getByText("より明確な名前を使用してください")).toBeInTheDocument();
  });

  it("findings severity=critical を表示する", () => {
    render(<ReviewPanel result={makeResult({
      findings: [{ severity: "critical", file: "lib.rs", line_start: null, message: "重大なバグ", suggested_fix: null }],
    })} />);
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
  });

  it("findings severity=info を表示する", () => {
    render(<ReviewPanel result={makeResult({
      findings: [{ severity: "info", file: "a.rs", line_start: null, message: "情報", suggested_fix: null }],
    })} />);
    expect(screen.getByText("INFO")).toBeInTheDocument();
  });

  it("findings severity=suggestion を表示する", () => {
    render(<ReviewPanel result={makeResult({
      findings: [{ severity: "suggestion", file: "b.rs", line_start: null, message: "提案", suggested_fix: null }],
    })} />);
    expect(screen.getByText("SUGGESTION")).toBeInTheDocument();
  });

  it("line_start がある場合に行番号を表示する", () => {
    render(<ReviewPanel result={makeResult({
      findings: [{ severity: "info", file: "a.rs", line_start: 99, message: "msg", suggested_fix: null }],
    })} />);
    expect(screen.getByText("L99")).toBeInTheDocument();
  });

  it("design_consistency に矛盾がある場合に表示する", () => {
    render(<ReviewPanel result={makeResult({
      design_consistency: {
        inconsistencies: [{ doc_path: "docs/spec.md", description: "仕様と異なる" }],
      },
    })} />);
    expect(screen.getByText("設計書整合性")).toBeInTheDocument();
    expect(screen.getByText("docs/spec.md")).toBeInTheDocument();
    expect(screen.getByText("仕様と異なる")).toBeInTheDocument();
  });

  it("suggested_doc_updates がある場合に表示する", () => {
    render(<ReviewPanel result={makeResult({
      suggested_doc_updates: [{ doc_path: "docs/readme.md", reason: "更新が必要" }],
    })} />);
    expect(screen.getByText("設計書更新提案")).toBeInTheDocument();
    expect(screen.getByText("docs/readme.md")).toBeInTheDocument();
    expect(screen.getByText("更新が必要")).toBeInTheDocument();
  });

  it("findings=[] の場合に指摘事項セクションを表示しない", () => {
    render(<ReviewPanel result={makeResult({ findings: [] })} />);
    expect(screen.queryByText("指摘事項")).not.toBeInTheDocument();
  });

  it("design_consistency が空の場合に設計書整合性セクションを表示しない", () => {
    render(<ReviewPanel result={makeResult({ design_consistency: { inconsistencies: [] } })} />);
    expect(screen.queryByText("設計書整合性")).not.toBeInTheDocument();
  });
});
