import { useState } from "react";
import { IconGitMerge, IconX } from "@tabler/icons-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
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
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/80"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">Create Pull Request</div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <IconX size={16} />
          </Button>
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Branch</div>
          <div className="px-3 py-2 rounded-md bg-secondary text-xs font-mono text-secondary-foreground">
            {branchName}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pr-title" className="text-xs text-muted-foreground">
            Title
          </Label>
          <Input
            id="pr-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Description (optional)</div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="text-sm resize-none h-24"
            placeholder="What does this PR do?"
          />
        </div>
        {error && createStatus === "error" && (
          <div className="text-xs text-destructive">{error}</div>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={!title.trim() || createStatus === "loading"}
          >
            <IconGitMerge size={12} />
            {createStatus === "loading" ? "Creating…" : "Create PR"}
          </Button>
        </div>
      </div>
    </div>
  );
}
