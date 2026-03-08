import { useEffect, useRef, useState } from "react";
import {
  IconFileText,
  IconSend,
} from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { usePrStore } from "../stores/prStore";
import type { FileDiffResult } from "../lib/diffParser";
import { PRFilterBar } from "../components/pr/PRFilterBar";
import { PRList } from "../components/pr/PRList";
import { PRDetailHeader } from "../components/pr/PRDetailHeader";
import { PRDetailTabs } from "../components/pr/PRDetailTabs";
import { TabOverview } from "../components/pr/TabOverview";
import { TabCodeDiff } from "../components/pr/TabCodeDiff";
import { ReviewPanel } from "../components/pr/ReviewPanel";
import { MergePanel } from "../components/pr/MergePanel";

// ─── TabDesignDocs ────────────────────────────────────────────────────────────

function RequestChangesPanel({
  onSubmit,
  onCancel,
  status,
}: {
  onSubmit: (comment: string) => void;
  onCancel: () => void;
  status: string;
}) {
  const [text, setText] = useState("");
  return (
    <div className="border border-yellow-700/50 rounded-lg p-3 bg-yellow-900/20 space-y-2">
      <div className="text-xs font-medium text-yellow-300">↩ Claude Code に修正を依頼</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="修正指示を入力…（例: retry 回数を 5 回に変更してください）"
        className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-gray-200 resize-none h-20 focus:outline-none focus:border-purple-500"
      />
      {status === "error" && (
        <div className="text-xs text-red-400">送信に失敗しました。もう一度お試しください。</div>
      )}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded text-xs text-gray-400 hover:bg-white/10 transition-colors"
        >
          CANCEL
        </button>
        <button
          onClick={() => { if (text.trim()) onSubmit(text.trim()); }}
          disabled={!text.trim() || status === "loading"}
          className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50 transition-colors"
        >
          <IconSend size={11} /> SEND TO CLAUDE CODE
        </button>
      </div>
    </div>
  );
}

function TabDesignDocs({
  docDiffs,
  docDiffStatus,
  requestChangesStatus,
  onLoadDocDiff,
  onRequestChanges,
}: {
  docDiffs: FileDiffResult[];
  docDiffStatus: string;
  requestChangesStatus: string;
  onLoadDocDiff: () => void;
  onRequestChanges: (comment: string) => void;
}) {
  const [showRequestChanges, setShowRequestChanges] = useState(false);

  if (docDiffStatus === "idle") {
    return (
      <div className="p-4">
        <button
          onClick={onLoadDocDiff}
          className="px-3 py-2 rounded text-xs bg-white/10 hover:bg-white/20 text-gray-300 transition-colors"
        >
          Load Design Docs diff
        </button>
      </div>
    );
  }

  if (docDiffStatus === "loading") {
    return <div className="p-4 text-xs text-gray-400">Loading…</div>;
  }

  if (docDiffStatus === "error") {
    return (
      <div className="p-4 text-xs text-red-400">
        diff の取得に失敗しました。
        <button onClick={onLoadDocDiff} className="ml-2 text-purple-400 hover:underline">
          RETRY
        </button>
      </div>
    );
  }

  if (docDiffs.length === 0) {
    return (
      <div className="p-4 text-xs text-gray-500">
        設計書（.md ファイル）の変更はありません。
      </div>
    );
  }

  const totalAdd = docDiffs.reduce(
    (acc, f) => acc + f.hunks.flatMap((h) => h.lines).filter((l) => l.type === "add").length,
    0
  );
  const totalDel = docDiffs.reduce(
    (acc, f) => acc + f.hunks.flatMap((h) => h.lines).filter((l) => l.type === "remove").length,
    0
  );

  return (
    <div className="overflow-y-auto p-4 space-y-4">
      {/* ヘッダー */}
      <div className="rounded-lg border border-white/10 p-3 space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-300">Design Docs Changes</span>
          <span className="text-xs text-green-400">+{totalAdd}</span>
          <span className="text-xs text-red-400">-{totalDel}</span>
          <button
            onClick={() => setShowRequestChanges((v) => !v)}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-yellow-800/60 hover:bg-yellow-700/60 text-yellow-200 transition-colors"
          >
            ↩ REQUEST CHANGES
          </button>
        </div>
        {docDiffs.map((f) => (
          <div key={f.filename} className="flex items-center gap-2 text-xs">
            <IconFileText size={11} className="text-gray-500 shrink-0" />
            <span className="font-mono text-gray-300 flex-1 truncate">{f.filename}</span>
            <span className="text-green-400">
              +{f.hunks.flatMap((h) => h.lines).filter((l) => l.type === "add").length}
            </span>
            <span className="text-red-400">
              -{f.hunks.flatMap((h) => h.lines).filter((l) => l.type === "remove").length}
            </span>
          </div>
        ))}
      </div>

      {showRequestChanges && (
        <RequestChangesPanel
          status={requestChangesStatus}
          onSubmit={(c) => {
            onRequestChanges(c);
            setShowRequestChanges(false);
          }}
          onCancel={() => setShowRequestChanges(false)}
        />
      )}

      {/* Diff hunks */}
      {docDiffs.map((fd) => (
        <div key={fd.filename} className="rounded-lg border border-white/10 overflow-hidden">
          <div className="px-3 py-2 bg-white/5 text-xs font-mono text-blue-200 border-b border-white/10">
            {fd.filename}
          </div>
          {fd.hunks.map((hunk, hi) => (
            <div key={hi}>
              <div className="px-3 py-1 bg-blue-950/40 text-[10px] font-mono text-blue-300">
                {hunk.header}
              </div>
              <div className="font-mono text-[11px] leading-5">
                {hunk.lines.map((line, li) => (
                  <div
                    key={li}
                    className={`flex ${
                      line.type === "add"
                        ? "bg-green-950/40 text-green-300"
                        : line.type === "remove"
                        ? "bg-red-950/40 text-red-300"
                        : "text-gray-400"
                    }`}
                  >
                    <span className="w-10 px-2 text-right text-gray-600 select-none shrink-0">
                      {line.oldLineNo ?? ""}
                    </span>
                    <span className="w-10 px-2 text-right text-gray-600 select-none shrink-0">
                      {line.newLineNo ?? ""}
                    </span>
                    <span className="px-2 whitespace-pre flex-1 overflow-x-auto">
                      {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                      {line.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── PRDetail ─────────────────────────────────────────────────────────────────

function PRDetailPanel({ projectId }: { projectId: number }) {
  const detail = usePrStore((s) => s.detail);
  const detailStatus = usePrStore((s) => s.detailStatus);
  const files = usePrStore((s) => s.files);
  const diff = usePrStore((s) => s.diff);
  const docDiffs = usePrStore((s) => s.docDiffs);
  const filesStatus = usePrStore((s) => s.filesStatus);
  const diffStatus = usePrStore((s) => s.diffStatus);
  const docDiffStatus = usePrStore((s) => s.docDiffStatus);
  const requestChangesStatus = usePrStore((s) => s.requestChangesStatus);
  const activeTab = usePrStore((s) => s.activeTab);
  const setActiveTab = usePrStore((s) => s.setActiveTab);
  const fetchFiles = usePrStore((s) => s.fetchFiles);
  const fetchDiff = usePrStore((s) => s.fetchDiff);
  const loadDocDiff = usePrStore((s) => s.loadDocDiff);
  const requestChanges = usePrStore((s) => s.requestChanges);
  const submitReview = usePrStore((s) => s.submitReview);
  const mergePr = usePrStore((s) => s.mergePr);
  const mergeStatus = usePrStore((s) => s.mergeStatus);
  const reviewStatus = usePrStore((s) => s.reviewStatus);

  if (detailStatus === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
        Loading...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-500">
        Select a PR to view details
      </div>
    );
  }

  // canMerge: passing checks + approved review
  const canMerge =
    detail.pr.checks_status === "passing" &&
    detail.reviews.some((r) => r.state === "approved");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* PR ヘッダー */}
      <PRDetailHeader pr={detail.pr} />

      {/* タブバー */}
      <PRDetailTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        codeFileCount={files.length}
      />

      {activeTab === "overview" ? (
        <div className="overflow-y-auto p-4 space-y-4">
          <TabOverview detail={detail} />
          {detail.pr.state === "open" && (
            <>
              <ReviewPanel
                reviewStatus={reviewStatus}
                onSubmitReview={(state, body) =>
                  submitReview(projectId, detail.pr.id, state, body)
                }
              />
              <MergePanel
                canMerge={canMerge}
                mergeStatus={mergeStatus}
                onMerge={() => mergePr(projectId, detail.pr.id, "squash")}
                headBranch={detail.pr.head_branch}
                baseBranch={detail.pr.base_branch}
              />
            </>
          )}
        </div>
      ) : activeTab === "code-diff" ? (
        <TabCodeDiff
          files={files}
          diff={diff}
          filesStatus={filesStatus}
          diffStatus={diffStatus}
          onLoadFiles={() => fetchFiles(projectId, detail.pr.id)}
          onLoadDiff={() => fetchDiff(projectId, detail.pr.id)}
        />
      ) : (
        <TabDesignDocs
          docDiffs={docDiffs}
          docDiffStatus={docDiffStatus}
          requestChangesStatus={requestChangesStatus}
          onLoadDocDiff={() => loadDocDiff(projectId, detail.pr.id)}
          onRequestChanges={(comment) => requestChanges(projectId, detail.pr.id, comment)}
        />
      )}
    </div>
  );
}

// ─── PRScreen ────────────────────────────────────────────────────────────────

export function PRScreen() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const prs = usePrStore((s) => s.prs);
  const selectedPrId = usePrStore((s) => s.selectedPrId);
  const fetchStatus = usePrStore((s) => s.fetchStatus);
  const syncStatus = usePrStore((s) => s.syncStatus);
  const stateFilter = usePrStore((s) => s.stateFilter);
  const fetchPrs = usePrStore((s) => s.fetchPrs);
  const syncPrs = usePrStore((s) => s.syncPrs);
  const selectPr = usePrStore((s) => s.selectPr);
  const setStateFilter = usePrStore((s) => s.setStateFilter);
  const listenSyncDone = usePrStore((s) => s.listenSyncDone);

  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    unlistenRef.current = listenSyncDone();
    return () => unlistenRef.current?.();
  }, [listenSyncDone]);

  useEffect(() => {
    if (currentProject) {
      fetchPrs(currentProject.id);
    }
  }, [currentProject, stateFilter, fetchPrs]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        Select a project first
      </div>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* PR List panel */}
      <div className="w-72 shrink-0 flex flex-col border-r border-white/10 overflow-hidden">
        <PRFilterBar
          filter={stateFilter}
          onChange={(f) => {
            setStateFilter(f);
          }}
          onSync={() => syncPrs(currentProject.id)}
          syncing={syncStatus === "loading"}
        />

        <PRList
          prs={prs}
          loading={fetchStatus === "loading"}
          selectedPrId={selectedPrId}
          onSelect={(pr) => selectPr(pr.id, currentProject.id)}
        />
      </div>

      {/* PR Detail panel */}
      <PRDetailPanel projectId={currentProject.id} />
    </div>
  );
}
