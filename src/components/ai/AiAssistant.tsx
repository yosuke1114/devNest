import { useState } from "react";
import {
  IconBrain,
  IconCode,
  IconLoader2,
  IconX,
} from "@tabler/icons-react";
import { useAiStore } from "../../stores/aiStore";
import { useProjectStore } from "../../stores/projectStore";
import type { CodegenRequest, ReviewRequest } from "../../types";
import { ReviewPanel } from "./ReviewPanel";

type AiTab = "review" | "generate";

interface Props {
  /** レビュー対象ファイルのパス（省略可）*/
  currentFilePath?: string;
  /** レビュー用 git diff 文字列（省略可）*/
  currentDiff?: string;
  onClose: () => void;
}

export function AiAssistant({ currentFilePath, currentDiff, onClose }: Props) {
  const [tab, setTab] = useState<AiTab>("review");
  const [reviewScope, setReviewScope] =
    useState<ReviewRequest["review_scope"]>("full");
  const [genMode, setGenMode] =
    useState<CodegenRequest["generation_mode"]>("scaffold");

  const { currentProject } = useProjectStore();
  const {
    reviewResult,
    reviewStatus,
    reviewError,
    codegenResult,
    codegenStatus,
    codegenError,
    reviewChanges,
    generateCode,
    clearReview,
    clearCodegen,
  } = useAiStore();

  const handleReview = async () => {
    if (!currentProject || !currentDiff) return;
    await reviewChanges(currentProject.local_path, {
      diff: currentDiff,
      changed_files: currentFilePath ? [currentFilePath] : [],
      review_scope: reviewScope,
    });
  };

  const handleGenerate = async () => {
    if (!currentProject || !currentFilePath) return;
    await generateCode(currentProject.local_path, {
      doc_path: currentFilePath,
      generation_mode: genMode,
    });
  };

  return (
    <div
      className="flex flex-col h-full border-l border-border bg-background"
      style={{ width: 320 }}
      data-testid="ai-assistant"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <IconBrain size={16} />
          AI アシスタント
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="閉じる"
        >
          <IconX size={16} />
        </button>
      </div>

      {/* タブ */}
      <div className="flex border-b border-border shrink-0">
        {(["review", "generate"] as const).map((t) => (
          <button
            key={t}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "review" ? "レビュー" : "コード生成"}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === "review" && (
          <>
            <div>
              <label className="text-xs text-muted-foreground">スコープ</label>
              <select
                className="w-full mt-1 text-xs border border-border rounded px-2 py-1.5 bg-background"
                value={reviewScope}
                onChange={(e) =>
                  setReviewScope(e.target.value as ReviewRequest["review_scope"])
                }
              >
                <option value="full">全観点</option>
                <option value="design_consistency">設計書整合性</option>
                <option value="security_focus">セキュリティ</option>
                <option value="test_coverage">テストカバレッジ</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                onClick={handleReview}
                disabled={reviewStatus === "loading" || !currentDiff}
              >
                {reviewStatus === "loading" ? (
                  <><IconLoader2 size={12} className="animate-spin" />レビュー中</>
                ) : (
                  <><IconBrain size={12} />レビュー実行</>
                )}
              </button>
              {reviewResult && (
                <button
                  className="px-2 py-2 text-xs border border-border rounded hover:bg-muted"
                  onClick={clearReview}
                  title="クリア"
                >
                  <IconX size={12} />
                </button>
              )}
            </div>

            {reviewError && (
              <p className="text-xs text-destructive">{reviewError}</p>
            )}
            {reviewResult && <ReviewPanel result={reviewResult} />}
            {!currentDiff && (
              <p className="text-xs text-muted-foreground text-center py-4">
                diff がありません。<br />
                ファイルを編集するかブランチを切り替えてください。
              </p>
            )}
          </>
        )}

        {tab === "generate" && (
          <>
            <div>
              <label className="text-xs text-muted-foreground">生成モード</label>
              <select
                className="w-full mt-1 text-xs border border-border rounded px-2 py-1.5 bg-background"
                value={genMode}
                onChange={(e) =>
                  setGenMode(e.target.value as CodegenRequest["generation_mode"])
                }
              >
                <option value="scaffold">スキャフォールド（型 + シグネチャのみ）</option>
                <option value="implementation">フル実装</option>
                <option value="test_only">テストコードのみ</option>
              </select>
            </div>

            <p className="text-xs text-muted-foreground">
              現在開いている設計書からコードを生成します。
            </p>

            <div className="flex gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                onClick={handleGenerate}
                disabled={codegenStatus === "loading" || !currentFilePath}
              >
                {codegenStatus === "loading" ? (
                  <><IconLoader2 size={12} className="animate-spin" />生成中</>
                ) : (
                  <><IconCode size={12} />コード生成</>
                )}
              </button>
              {codegenResult && (
                <button
                  className="px-2 py-2 text-xs border border-border rounded hover:bg-muted"
                  onClick={clearCodegen}
                  title="クリア"
                >
                  <IconX size={12} />
                </button>
              )}
            </div>

            {codegenError && (
              <p className="text-xs text-destructive">{codegenError}</p>
            )}

            {codegenResult && (
              <div className="space-y-2">
                {codegenResult.generated_files.map((f) => (
                  <div key={f.path} className="border border-border rounded">
                    <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/50">
                      <span className="text-[10px] font-mono text-muted-foreground truncate">
                        {f.path}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-2 shrink-0">
                        {f.file_type}
                      </span>
                    </div>
                    <pre className="text-[10px] p-2 overflow-x-auto max-h-40 leading-relaxed">
                      {f.content.length > 400
                        ? `${f.content.slice(0, 400)}...`
                        : f.content}
                    </pre>
                  </div>
                ))}
                {codegenResult.warnings.length > 0 && (
                  <div className="text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-950 rounded p-2">
                    {codegenResult.warnings.join("\n")}
                  </div>
                )}
                {codegenResult.mapping_updates.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">マッピング更新:</span>{" "}
                    {codegenResult.mapping_updates.length} 件
                  </div>
                )}
              </div>
            )}

            {!currentFilePath && (
              <p className="text-xs text-muted-foreground text-center py-4">
                設計書を開いてからコード生成を実行してください。
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
