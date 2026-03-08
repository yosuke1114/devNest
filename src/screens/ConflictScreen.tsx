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

// ─── ConflictBlock コンポーネント ──────────────────────────────────────────────

type Resolution = "ours" | "theirs" | "manual";

function ConflictBlockItem({
  block,
  resolution,
  manualContent,
  onResolve,
  onManualChange,
}: {
  block: ConflictBlock;
  resolution: Resolution | undefined;
  manualContent: string | undefined;
  onResolve: (r: Resolution, manual?: string) => void;
  onManualChange: (content: string) => void;
}) {
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden mb-3">
      {/* ブロックヘッダー */}
      <div className="flex items-center gap-3 px-3 py-2 bg-white/5 border-b border-white/10">
        <IconAlertTriangle size={13} className="text-yellow-400 shrink-0" />
        <span className="text-xs text-gray-300 font-medium">Conflict block #{block.index + 1}</span>
        {resolution && (
          <span className="ml-auto text-[10px] text-green-400 flex items-center gap-1">
            <IconCheck size={10} /> {resolution.toUpperCase()} を選択
          </span>
        )}
        <div className="flex gap-1.5 ml-auto">
          <button
            onClick={() => onResolve("ours")}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              resolution === "ours"
                ? "bg-green-700 text-white"
                : "bg-white/10 hover:bg-white/20 text-gray-300"
            }`}
          >
            USE MINE
          </button>
          <button
            onClick={() => onResolve("theirs")}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              resolution === "theirs"
                ? "bg-blue-700 text-white"
                : "bg-white/10 hover:bg-white/20 text-gray-300"
            }`}
          >
            USE THEIRS
          </button>
          <button
            onClick={() => onResolve("manual", block.ours)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              resolution === "manual"
                ? "bg-purple-700 text-white"
                : "bg-white/10 hover:bg-white/20 text-gray-300"
            }`}
          >
            MANUAL
          </button>
        </div>
      </div>

      {/* HEAD 側 */}
      <div
        className={`px-3 py-2 border-b border-white/10 ${
          resolution === "ours" ? "bg-green-950/40" : "bg-red-950/20"
        }`}
      >
        <div className="text-[10px] text-red-300 mb-1 font-mono">HEAD (ours)</div>
        <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap leading-5">
          {block.ours || "(empty)"}
        </pre>
      </div>

      {/* THEIRS 側 */}
      <div
        className={`px-3 py-2 ${
          resolution === "theirs" ? "bg-blue-950/40" : "bg-blue-950/10"
        }`}
      >
        <div className="text-[10px] text-blue-300 mb-1 font-mono">THEIRS</div>
        <pre className="text-[11px] text-gray-300 font-mono whitespace-pre-wrap leading-5">
          {block.theirs || "(empty)"}
        </pre>
      </div>

      {/* MANUAL エディタ */}
      {resolution === "manual" && (
        <div className="px-3 py-2 bg-purple-950/30 border-t border-white/10">
          <div className="text-[10px] text-purple-300 mb-1">MANUAL EDIT:</div>
          <textarea
            value={manualContent ?? block.ours}
            onChange={(e) => onManualChange(e.target.value)}
            className="w-full bg-white/5 border border-purple-700/50 rounded p-2 text-[11px] font-mono text-gray-200 resize-none h-24 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

// ─── ConflictFileEditor ────────────────────────────────────────────────────────

function ConflictFileEditor({ file }: { file: ConflictFile }) {
  const { resolutions, setBlockResolution, resolveAllBlocks } = useConflictStore();
  const fileRes = resolutions[file.id] ?? {};

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* ツールバー */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => resolveAllBlocks(file.id, "ours")}
          className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
        >
          USE ALL MINE
        </button>
        <button
          onClick={() => resolveAllBlocks(file.id, "theirs")}
          className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
        >
          USE ALL THEIRS
        </button>
        <span className="ml-auto text-xs text-gray-500">
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
      <div className="bg-gray-900 border border-green-700/50 rounded-xl p-8 max-w-sm w-full text-center space-y-4">
        <IconCircleCheck size={40} className="text-green-400 mx-auto" />
        <div className="text-sm font-semibold text-white">Conflicts resolved</div>
        <div className="text-xs text-gray-400 space-y-1">
          <div className="flex items-center gap-2 justify-center">
            <IconCheck size={11} className="text-green-400" /> Merge commit created
          </div>
          <div className="flex items-center gap-2 justify-center">
            <IconCheck size={11} className="text-green-400" /> Pushed to origin
          </div>
          <div className="text-gray-600 font-mono text-[10px]">
            {result.commit_sha.slice(0, 8)}
          </div>
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={() => navigate("editor")}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
          >
            <IconFileText size={12} /> VIEW IN EDITOR
          </button>
          <button
            onClick={() => navigate("terminal")}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
          >
            <IconTerminal2 size={12} /> OPEN TERMINAL
          </button>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 ml-1">
            <IconX size={14} />
          </button>
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
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
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
      // 全ファイルの resolutions を保存
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
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* 解消完了オーバーレイ */}
      {resolveAllStatus === "success" && resolveAllResult && (
        <ResolvedOverlay result={resolveAllResult} onClose={reset} />
      )}

      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <IconAlertTriangle size={16} className="text-yellow-400 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium text-white">CONFLICT RESOLUTION</div>
          {total > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden max-w-xs">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${(resolved / total) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400">
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
        <button
          onClick={handleSaveAndMerge}
          disabled={!allDone || resolveAllStatus === "loading" || resolveStatus === "loading"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-green-700 hover:bg-green-600 text-white disabled:opacity-40 transition-colors"
        >
          <IconCheck size={12} />
          {resolveAllStatus === "loading" || savingFileId != null ? "Saving…" : "SAVE & MERGE"}
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800/50 text-xs text-red-300">
          {error}
        </div>
      )}

      {listStatus === "loading" && (
        <div className="p-4 text-xs text-gray-500 text-center">コンフリクトを検索中…</div>
      )}

      {listStatus === "success" && managedFiles.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
          <IconCircleCheck size={32} className="text-green-600" />
          <div className="text-sm text-gray-400">コンフリクトは見つかりませんでした</div>
        </div>
      )}

      {managedFiles.length > 0 && (
        <div className="flex-1 flex overflow-hidden">
          {/* ファイルリスト */}
          <div className="w-52 shrink-0 border-r border-white/10 overflow-y-auto">
            {managedFiles.map((file) => {
              const fileRes = resolutions[file.id] ?? {};
              const fileResolved = Object.keys(fileRes).length;
              const fileTotal = file.blocks.length;
              const isActive = file.id === activeFileId;
              const isAllResolved = fileTotal > 0 && fileResolved >= fileTotal;

              return (
                <button
                  key={file.id}
                  onClick={() => setActiveFile(file.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-white/5 hover:bg-white/5 transition-colors ${
                    isActive ? "bg-white/10" : ""
                  }`}
                  style={{
                    borderLeft: isActive
                      ? "3px solid #fbbf24"
                      : isAllResolved
                      ? "3px solid #22c55e"
                      : "3px solid transparent",
                  }}
                >
                  <div className="text-xs font-mono text-gray-300 truncate">
                    {file.file_path.split("/").pop()}
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      isAllResolved ? "text-green-400" : "text-yellow-500"
                    }`}
                  >
                    {isAllResolved ? "ready" : `${fileTotal - fileResolved} conflicts`}
                  </div>
                </button>
              );
            })}
            <div className="px-3 py-2 text-[10px] text-gray-600">
              解消済み: {resolved} / {total} ブロック
            </div>
          </div>

          {/* ブロックエディタ */}
          {current ? (
            <ConflictFileEditor file={current} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
              ファイルを選択してください
            </div>
          )}
        </div>
      )}
    </div>
  );
}
