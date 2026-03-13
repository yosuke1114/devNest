import type { Assessment, FindingSeverity, ReviewResult } from "../../types";

interface Props {
  result: ReviewResult;
}

const SEVERITY_CLASS: Record<FindingSeverity, string> = {
  critical: "text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400",
  warning: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400",
  info: "text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400",
  suggestion: "text-muted-foreground bg-muted",
};

const ASSESSMENT_LABEL: Record<Assessment, string> = {
  approve: "✅ 承認",
  request_changes: "❌ 変更要求",
  comment: "💬 コメント",
};

export function ReviewPanel({ result }: Props) {
  return (
    <div className="space-y-3 text-sm">
      {/* 総合評価 */}
      <div className="flex items-center justify-between border border-border rounded px-3 py-2">
        <span className="text-xs text-muted-foreground">総合評価</span>
        <span className="text-xs font-medium">
          {ASSESSMENT_LABEL[result.overall_assessment] ?? result.overall_assessment}
        </span>
      </div>

      {/* サマリー */}
      <p className="text-xs text-muted-foreground leading-relaxed">{result.summary}</p>

      {/* 指摘事項 */}
      {result.findings.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1.5">
            指摘事項
            <span className="ml-1 text-muted-foreground">({result.findings.length})</span>
          </div>
          <div className="space-y-1.5">
            {result.findings.map((f, i) => (
              <div key={i} className="border border-border rounded p-2 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SEVERITY_CLASS[f.severity]}`}
                  >
                    {f.severity.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                    {f.file}
                  </span>
                  {f.line_start != null && (
                    <span className="text-[10px] text-muted-foreground">L{f.line_start}</span>
                  )}
                </div>
                <p className="text-xs">{f.message}</p>
                {f.suggested_fix && (
                  <p className="text-[10px] text-muted-foreground italic border-l-2 border-border pl-2">
                    {f.suggested_fix}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 設計書整合性 */}
      {result.design_consistency.inconsistencies.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">設計書整合性</div>
          <div className="space-y-1">
            {result.design_consistency.inconsistencies.map((inc, i) => (
              <div key={i} className="text-xs text-muted-foreground">
                <span className="font-mono text-[10px]">{inc.doc_path}</span>
                <span className="ml-1">{inc.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 設計書更新提案 */}
      {result.suggested_doc_updates.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">設計書更新提案</div>
          <div className="space-y-1">
            {result.suggested_doc_updates.map((upd, i) => (
              <div key={i} className="text-xs">
                <span className="font-mono text-[10px] text-muted-foreground">{upd.doc_path}</span>
                <p className="text-muted-foreground">{upd.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
