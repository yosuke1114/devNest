import { useState } from "react";
import { IconGitMerge, IconX } from "@tabler/icons-react";
import type { AsyncStatus } from "../../types";

interface PRCreateModalProps {
  branchName: string;
  createStatus: AsyncStatus | string;
  error: string | null;
  onSubmit: (title: string, body?: string) => void;
  onClose: () => void;
}

export function PRCreateModal({
  branchName,
  createStatus,
  error,
  onSubmit,
  onClose,
}: PRCreateModalProps) {
  const [title, setTitle] = useState(`feat: ${branchName}`);
  const [body, setBody] = useState("");

  const handleCreate = () => {
    onSubmit(title, body || undefined);
  };

  return (
    <div
      data-testid="pr-create-modal"
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Create Pull Request</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <IconX size={16} />
          </button>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-gray-400">Branch</div>
          <div className="px-3 py-2 rounded bg-white/5 text-xs font-mono text-gray-300">
            {branchName}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400" htmlFor="pr-title">
            Title
          </label>
          <input
            id="pr-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-purple-500"
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-gray-400">Description (optional)</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-gray-200 resize-none h-24 focus:outline-none focus:border-purple-500"
            placeholder="What does this PR do?"
          />
        </div>
        {error && createStatus === "error" && (
          <div className="text-xs text-red-400">{error}</div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-xs text-gray-400 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || createStatus === "loading"}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-xs bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50"
          >
            <IconGitMerge size={12} />
            {createStatus === "loading" ? "Creating…" : "Create PR"}
          </button>
        </div>
      </div>
    </div>
  );
}
