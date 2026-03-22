import { useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconTerminal2,
  IconFileText,
  IconX,
} from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useConflictStore } from "../stores/conflictStore";
import { useUiStore } from "../stores/uiStore";
import type { ConflictBlock, ConflictFile } from "../types";
import { ConflictBlockItem } from "../components/conflict/ConflictBlockItem";
import { ConflictFileListItem } from "../components/conflict/ConflictFileListItem";
import { Button } from "../components/ui/button";

// ─── ConflictFileEditor ────────────────────────────────────────────────────────

function ConflictFileEditor({ file }: { file: ConflictFile }) {
  const { resolutions, setBlockResolution, resolveAllBlocks } = useConflictStore();
  const fileRes = resolutions[file.id] ?? {};

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* ツールバー */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => resolveAllBlocks(file.id, "ours")}
          className="h-7 px-3 text-xs"
        >
          USE ALL MINE
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => resolveAllBlocks(file.id, "theirs")}
          className="h-7 px-3 text-xs"
        >
          USE ALL THEIRS
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {Object.keys(fileRes).length} / {file.blocks.length} 解消済み
        </span>
      </div>

      {file.blocks.length === 0 ? (
        <div className="text-xs text-green-400 flex items-center gap-2">
          <IconCircleCheck size={13} /> コンフリクトマーカーは見つかりませんでした
        </div>
      ) : (
        file.blocks.map((block: ConflictBlock) => {
          const res = fileRes[block.index];
          return (
            <ConflictBlockItem
              key={block.index}
              block={block}
              filePath={file.file_path}
              resolution={res?.resolution}
              manualContent={res?.manualContent}
              onResolve={(r, manual) =>
                setBlockResolution(file.id, block.index, {
                  resolution: r,
                  manualContent: manual,
                })
              }
              onManualChange={(content) =>
                setBlockResolution(file.id, block.index, {
                  resolution: "manual",
                  manualContent: content,
                })
              }
            />
          );
        })
      )}
    </div>
  );
}

// ─── ResolvedOverlay ──────────────────────────────────────────────────────────

function ResolvedOverlay({
  result,
  onClose,
}: {
  result: { commit_sha: string; resolved_files: number };
  onClose: () => void;
}) {
  const navigate = useUiStore((s) => s.navigate);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-green-950/60 z-10">
      <div className="bg-card border border-green-700/50 rounded-xl p-8 max-w-sm w-full text-center space-y-4">
        <IconCircleCheck size={40} className="text-green-400 mx-auto" />
        <div className="text-sm font-semibold text-foreground">Conflicts resolved</div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-2 justify-center">
            <IconCheck size={11} className="text-green-400" /> Merge commit created
          </div>
          <div className="flex items-center gap-2 justify-center">
            <IconCheck size={11} className="text-green-400" /> Pushed to origin
          </div>
          <div className="text-muted-foreground font-mono text-[10px]">
            {result.commit_sha.slice(0, 8)}
          </div>
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("editor")}
            className="h-7 px-3 text-xs flex items-center gap-1"
          >
            <IconFileText size={12} /> VIEW IN EDITOR
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("terminal")}
            className="h-7 px-3 text-xs flex items-center gap-1"
          >
            <IconTerminal2 size={12} /> OPEN TERMINAL
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7 text-muted-foreground ml-1">
            <IconX size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ConflictScreen ───────────────────────────────────────────────────────────

export function ConflictScreen() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const {
    managedFiles,
    unmanagedCount,
    unmanagedFiles,
    activeFileId,
    resolutions,
    listStatus,
    resolveStatus,
    resolveAllStatus,
    resolveAllResult,
    error,
    totalBlocks,
    resolvedBlocks,
    allResolved,
    activeFile,
    loadConflicts,
    setActiveFile,
    saveResolutions,
    resolveAll,
    reset,
  } = useConflictStore();

  const [savingFileId, setSavingFileId] = useState<number | null>(null);

  useEffect(() => {
    if (currentProject) {
      loadConflicts(currentProject.id);
    }
    return () => { reset(); };
  }, [currentProject?.id]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        プロジェクトを選択してください
      </div>
    );
  }

  const total = totalBlocks();
  const resolved = resolvedBlocks();
  const allDone = allResolved();
  const current = activeFile();

  const handleSaveAndMerge = async () => {
    if (!allDone) return;
    try {
      for (const file of managedFiles) {
        setSavingFileId(file.id);
        await saveResolutions(currentProject.id, file.id);
      }
      setSavingFileId(null);
      await resolveAll(currentProject.id);
    } catch {
      setSavingFileId(null);
    }
  };

  return (
    <div data-testid="conflict-screen" className="flex-1 flex flex-col overflow-hidden relative">
      {/* 解消完了オーバーレイ */}
      {resolveAllStatus === "success" && resolveAllResult && (
        <ResolvedOverlay result={resolveAllResult} onClose={reset} />
      )}

      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <IconAlertTriangle size={16} className="text-yellow-400 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground">CONFLICT RESOLUTION</div>
          {total > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-xs">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${(resolved / total) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {resolved} / {total} ブロック解消済み
              </span>
            </div>
          )}
          {unmanagedCount > 0 && (
            <div className="text-[10px] text-yellow-500 mt-1">
              docs/ 外に {unmanagedCount} ファイルのコンフリクトがあります（手動で解消してください）
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleSaveAndMerge}
          disabled={!allDone || resolveAllStatus === "loading" || resolveStatus === "loading"}
          className="h-7 px-3 text-xs bg-green-700 hover:bg-green-600 text-white disabled:opacity-40 flex items-center gap-1.5"
        >
          <IconCheck size={12} />
          {resolveAllStatus === "loading" || savingFileId != null ? "Saving…" : "SAVE & MERGE"}
        </Button>
      </div>

      {/* エラー */}
      {error && (
        <div className="px-4 py-2 bg-destructive/20 border-b border-destructive/40 text-xs text-destructive">
          {error}
        </div>
      )}

      {listStatus === "loading" && (
        <div className="p-4 text-xs text-muted-foreground text-center">コンフリクトを検索中…</div>
      )}

      {listStatus === "success" && managedFiles.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
          <IconCircleCheck size={32} className="text-green-600" />
          <div className="text-sm text-muted-foreground">コンフリクトは見つかりませんでした</div>
        </div>
      )}

      {managedFiles.length > 0 && (
        <div className="flex-1 flex overflow-hidden">
          {/* ファイルリスト */}
          <div className="w-52 shrink-0 border-r border-border overflow-y-auto">
            {managedFiles.map((file) => {
              const fileRes = resolutions[file.id] ?? {};
              const fileResolved = Object.keys(fileRes).length;
              const isActive = file.id === activeFileId;

              return (
                <ConflictFileListItem
                  key={file.id}
                  file={file}
                  isActive={isActive}
                  resolvedCount={fileResolved}
                  onClick={() => setActiveFile(file.id)}
                />
              );
            })}
            <div className="px-3 py-2 text-[10px] text-muted-foreground">
              解消済み: {resolved} / {total} ブロック
            </div>

            {/* 未管理ファイル一覧 */}
            {unmanagedFiles.length > 0 && (
              <div className="border-t border-border px-3 py-2">
                <div className="text-[10px] text-yellow-500 font-medium mb-1">
                  docs/ 外のコンフリクト ({unmanagedCount})
                </div>
                {unmanagedFiles.map((fp) => (
                  <div key={fp} className="text-[10px] text-muted-foreground truncate py-0.5 font-mono" title={fp}>
                    {fp.split("/").pop()}
                  </div>
                ))}
                <div className="text-[9px] text-muted-foreground mt-1">
                  手動で解消してください
                </div>
              </div>
            )}
          </div>

          {/* ブロックエディタ */}
          {current ? (
            <ConflictFileEditor file={current} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              ファイルを選択してください
            </div>
          )}
        </div>
      )}
    </div>
  );
}
