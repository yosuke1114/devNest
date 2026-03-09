import { IconTerminal2, IconX, IconFileText } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Issue, IssueDocLink } from "../../types";

interface IssueDetailProps {
  issue: Issue;
  links: IssueDocLink[];
  linksStatus: string;
  onAddLink: (issueId: number, documentId: number) => Promise<void>;
  onRemoveLink: (issueId: number, documentId: number) => Promise<void>;
  onLaunchTerminal: (issueId: number) => void;
  onOpenDocument: (documentId: number) => void;
}

function StatusBadge({ status }: { status: Issue["status"] }) {
  const colors: Record<Issue["status"], string> = {
    open: "bg-green-900/60 text-green-300 border-green-700/50",
    in_progress: "bg-blue-900/60 text-blue-300 border-blue-700/50",
    closed: "bg-gray-800 text-gray-400 border-gray-600/50",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded border text-[11px] font-medium ${colors[status]}`}
    >
      {status}
    </span>
  );
}

export function IssueDetail({
  issue,
  links,
  linksStatus,
  onRemoveLink,
  onLaunchTerminal,
  onOpenDocument,
}: IssueDetailProps) {
  const isOpen = issue.status !== "closed";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-start gap-2 mb-1">
          <span className="text-xs text-gray-500 font-mono shrink-0 mt-0.5">
            #{issue.github_number}
          </span>
          <h2 className="text-sm font-medium text-white leading-snug flex-1">
            {issue.title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={issue.status} />
          {issue.author_login && (
            <span className="text-xs text-gray-500">by {issue.author_login}</span>
          )}
        </div>
      </div>

      {/* スクロール領域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Body */}
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs font-medium text-gray-400 mb-2">Description</div>
          {issue.body ? (
            <div className="text-xs text-gray-300 leading-relaxed prose prose-invert prose-xs max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {issue.body}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs text-gray-600 italic">説明なし</p>
          )}
        </div>

        {/* DocLinkPanel */}
        <div className="rounded-lg border border-white/10 p-3">
          <div className="text-xs font-medium text-gray-400 mb-2">Design Docs</div>
          {linksStatus === "loading" ? (
            <div className="text-xs text-gray-500">Loading...</div>
          ) : links.length === 0 ? (
            <div className="text-xs text-gray-600">リンクなし</div>
          ) : (
            <div className="space-y-1">
              {links.map((link) => (
                <div key={link.id} className="flex items-center gap-2 group">
                  <IconFileText size={11} className="text-gray-500 shrink-0" />
                  <button
                    onClick={() => onOpenDocument(link.document_id)}
                    className="flex-1 text-xs font-mono text-blue-300 hover:text-blue-200 text-left truncate"
                  >
                    {link.path ?? "(unknown)"}
                  </button>
                  <button
                    onClick={() => onRemoveLink(issue.id, link.document_id)}
                    aria-label="削除"
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-500 hover:text-red-400 transition-opacity"
                  >
                    <IconX size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onLaunchTerminal(issue.id)}
            disabled={!isOpen}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <IconTerminal2 size={13} />
            LAUNCH TERMINAL
          </button>
        </div>
      </div>
    </div>
  );
}
