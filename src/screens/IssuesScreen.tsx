import { useEffect, useState } from "react";
import {
  IconRefresh,
  IconPlus,
  IconSparkles,
  IconCircleCheck,
  IconCircleDot,
  IconFileText,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useIssueStore } from "../stores/issueStore";
import { useProjectStore } from "../stores/projectStore";
import { useDocumentStore } from "../stores/documentStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useUiStore } from "../stores/uiStore";
import { IssueDetail } from "../components/issues/IssueDetail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";
import * as ipc from "../lib/ipc";
import type { Issue, IssueDraft, IssueDraftPatch, IssueContextChunk } from "../types";

type Tab = "list" | "wizard";

export function IssuesScreen() {
  const { currentProject } = useProjectStore();
  const {
    issues,
    currentIssue,
    issueLinks,
    drafts,
    currentDraft,
    draftStreamBuffer,
    labels,
    listStatus,
    syncStatus,
    generateStatus,
    fetchIssues,
    syncIssues,
    selectIssue,
    fetchIssueLinks,
    addIssueLink,
    removeIssueLink,
    fetchDrafts,
    createDraft,
    updateDraft,
    selectDraft,
    generateDraft,
    fetchLabels,
    createIssue,
    listenDraftChunk,
    listenDraftDone,
  } = useIssueStore();

  const startSession = useTerminalStore((s) => s.startSession);
  const navigate = useUiStore((s) => s.navigate);
  const documents = useDocumentStore((s) => s.documents);
  const openDocument = useDocumentStore((s) => s.openDocument);

  const [tab, setTab] = useState<Tab>("list");
  const [statusFilter, setStatusFilter] = useState<string>("open");

  useEffect(() => {
    if (!currentProject) return;
    fetchIssues(currentProject.id, statusFilter);
    fetchDrafts(currentProject.id);

    let cleanupChunk: (() => void) | undefined;
    let cleanupDone: (() => void) | undefined;
    listenDraftChunk().then((fn) => { cleanupChunk = fn; });
    listenDraftDone().then((fn) => { cleanupDone = fn; });

    return () => {
      cleanupChunk?.();
      cleanupDone?.();
    };
  }, [currentProject?.id, statusFilter]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        プロジェクトを選択してください
      </div>
    );
  }

  const handleSelectIssue = (issue: Issue) => {
    selectIssue(issue);
    fetchIssueLinks(issue.id);
  };

  const handleLaunchTerminal = (_issueId: number) => {
    if (!currentProject) return;
    startSession(currentProject.id);
    navigate("terminal");
  };

  if (tab === "wizard") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" data-testid="issues-screen">
        <header className="flex items-center gap-0 px-4 border-b border-border bg-background h-12 shrink-0">
          <TabBtn active={false} onClick={() => setTab("list")}>
            Issue 一覧
          </TabBtn>
          <TabBtn active={true} onClick={() => setTab("wizard")}>
            <IconSparkles size={14} className="mr-1" />
            AI Wizard
          </TabBtn>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={async () => {
              const draft = await createDraft(currentProject.id);
              selectDraft(draft);
            }}
          >
            <IconPlus size={14} />
            新規
          </Button>
        </header>
        <WizardPanel
          projectId={currentProject.id}
          drafts={drafts}
          currentDraft={currentDraft}
          streamBuffer={draftStreamBuffer}
          generating={generateStatus === "loading"}
          labels={labels}
          onSelectDraft={selectDraft}
          onUpdateDraft={updateDraft}
          onGenerate={generateDraft}
          onFetchLabels={() => currentProject && fetchLabels(currentProject.id)}
          onCreateIssue={createIssue}
          onLaunchTerminal={() => {
            startSession(currentProject.id);
            navigate("terminal");
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="issues-screen">
      {/* ヘッダー（全幅） */}
      <header className="flex items-center gap-0 px-4 border-b border-border bg-background h-12 shrink-0">
        <TabBtn active={true} onClick={() => setTab("list")}>
          Issue 一覧
        </TabBtn>
        <TabBtn active={false} onClick={() => setTab("wizard")}>
          <IconSparkles size={14} className="mr-1" />
          AI Wizard
        </TabBtn>
        <div className="flex-1" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-secondary text-foreground border border-border rounded px-2 py-1 text-[13px] mr-2"
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="">すべて</option>
        </select>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => syncIssues(currentProject.id)}
          disabled={syncStatus === "loading"}
          title="GitHub から同期"
          className="h-8 w-8"
        >
          <IconRefresh
            size={15}
            style={{
              animation:
                syncStatus === "loading" ? "spin 1s linear infinite" : undefined,
            }}
          />
        </Button>
      </header>

      {/* コンテンツ（左: リスト / 右: 詳細） */}
      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 shrink-0 flex flex-col border-r border-border overflow-y-auto">
          <IssueList
            issues={issues}
            loading={listStatus === "loading"}
            selectedId={currentIssue?.id ?? null}
            onSelect={handleSelectIssue}
          />
        </div>

        {/* 右ペイン: Issue 詳細 */}
        {currentIssue ? (
          <IssueDetail
            issue={currentIssue}
            links={issueLinks}
            linksStatus="success"
            documents={documents}
            onAddLink={(issueId, documentId) => addIssueLink(issueId, documentId)}
            onRemoveLink={(issueId, documentId) => removeIssueLink(issueId, documentId)}
            onLaunchTerminal={handleLaunchTerminal}
            onOpenDocument={(documentId) => {
              openDocument(documentId);
              navigate("editor");
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Issue を選択してください
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Issue List ───────────────────────────────────────────────────────────────

function IssueList({
  issues,
  loading,
  selectedId,
  onSelect,
}: {
  issues: Issue[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (issue: Issue) => void;
}) {
  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">読み込み中…</div>;
  }
  if (issues.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
        Issue がありません。右上の ↻ で GitHub から同期してください。
      </div>
    );
  }
  return (
    <div className="overflow-auto flex-1">
      {issues.map((issue) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          selected={issue.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function IssueRow({
  issue,
  selected,
  onSelect,
}: {
  issue: Issue;
  selected: boolean;
  onSelect: (issue: Issue) => void;
}) {
  const labels: string[] = (() => {
    try { return JSON.parse(issue.labels); } catch { return []; }
  })();

  return (
    <div
      onClick={() => onSelect(issue)}
      className={cn(
        "flex items-start px-4 py-3 border-b border-border gap-3 cursor-pointer transition-colors",
        selected ? "bg-secondary" : "hover:bg-secondary/50"
      )}
    >
      {issue.status === "closed" ? (
        <IconCircleCheck size={18} color="#8e44ad" className="mt-0.5 shrink-0" />
      ) : (
        <IconCircleDot size={18} color="#2ecc71" className="mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground">{issue.title}</span>
          {labels.map((l) => (
            <Badge key={l} variant="outline" className="text-[11px] px-1.5 py-0 text-blue-300 border-blue-800/50 bg-blue-900/20">
              {l}
            </Badge>
          ))}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          #{issue.github_number} · {issue.author_login}
          {issue.assignee_login && ` → ${issue.assignee_login}`}
        </div>
      </div>
    </div>
  );
}

// ─── AI Wizard Panel ──────────────────────────────────────────────────────────

interface WizardPanelProps {
  projectId: number;
  drafts: IssueDraft[];
  currentDraft: IssueDraft | null;
  streamBuffer: string;
  generating: boolean;
  labels: import("../types").GitHubLabel[];
  onSelectDraft: (d: IssueDraft | null) => void;
  onUpdateDraft: (patch: IssueDraftPatch) => Promise<void>;
  onGenerate: (draftId: number) => Promise<void>;
  onFetchLabels: () => void;
  onCreateIssue: (draftId: number) => Promise<Issue>;
  onLaunchTerminal: () => void;
}

function WizardPanel({
  projectId,
  drafts,
  currentDraft,
  streamBuffer,
  generating,
  labels,
  onSelectDraft,
  onUpdateDraft,
  onGenerate,
  onFetchLabels,
  onCreateIssue,
  onLaunchTerminal,
}: WizardPanelProps) {
  const [title, setTitle] = useState(currentDraft?.title ?? "");
  const [context, setContext] = useState(currentDraft?.wizard_context ?? "");
  const [assignee, setAssignee] = useState(currentDraft?.assignee_login ?? "");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [editBody, setEditBody] = useState("");
  const [bodyPreview, setBodyPreview] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [labelsLoaded, setLabelsLoaded] = useState(false);
  const [filing, setFiling] = useState(false);
  const [filedIssue, setFiledIssue] = useState<Issue | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [contextChunks, setContextChunks] = useState<IssueContextChunk[]>([]);

  useEffect(() => {
    setTitle(currentDraft?.title ?? "");
    setContext(currentDraft?.wizard_context ?? "");
    setAssignee(currentDraft?.assignee_login ?? "");
    try { setSelectedLabels(JSON.parse(currentDraft?.labels ?? "[]")); } catch { setSelectedLabels([]); }
    const body = currentDraft?.draft_body ?? currentDraft?.body ?? "";
    setEditBody(body);
    setBodyPreview(true);
    setShowDetails(false);
    setLabelsLoaded(false);
    setFiledIssue(null);
    setFileError(null);
    setContextChunks([]);
  }, [currentDraft?.id]);

  useEffect(() => {
    if (streamBuffer) setEditBody(streamBuffer);
  }, [streamBuffer]);

  const handleBlur = () => {
    if (!currentDraft) return;
    onUpdateDraft({ id: currentDraft.id, title, wizard_context: context });
  };

  const handleTitleChange = (v: string) => {
    setTitle(v);
  };

  const handleGenerate = async () => {
    if (!currentDraft) return;
    await onUpdateDraft({ id: currentDraft.id, title, wizard_context: context });
    onGenerate(currentDraft.id);
    setBodyPreview(true);
    try {
      const query = `${title} ${context}`.trim();
      if (query.length >= 2) {
        const chunks = await ipc.documentSearchSemantic(projectId, query);
        setContextChunks(chunks.slice(0, 3).map((r) => ({
          path: r.path,
          section_heading: r.section_heading ?? null,
          content: r.content,
        })));
      }
    } catch { /* ignore */ }
  };

  const handleToggleDetails = () => {
    if (!labelsLoaded) {
      onFetchLabels();
      setLabelsLoaded(true);
    }
    setShowDetails((v) => !v);
  };

  const toggleLabel = (name: string) => {
    setSelectedLabels((prev) =>
      prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]
    );
  };

  const handleFile = async () => {
    if (!currentDraft) return;
    setFiling(true);
    setFileError(null);
    try {
      await onUpdateDraft({
        id: currentDraft.id,
        labels: JSON.stringify(selectedLabels),
        assignee_login: assignee || undefined,
      });
      const issue = await onCreateIssue(currentDraft.id);
      setFiledIssue(issue);
    } catch (e) {
      setFileError(String(e));
    } finally {
      setFiling(false);
    }
  };

  const hasBody = editBody.trim().length > 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ─── ドラフト一覧 ─── */}
      <aside className="w-[200px] border-r border-border overflow-auto bg-card shrink-0 flex flex-col">
        <div className="px-3 py-2 text-[11px] text-muted-foreground uppercase tracking-wider">
          Drafts
        </div>
        {drafts.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            「新規」でドラフトを作成
          </div>
        )}
        {drafts.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelectDraft(d)}
            className={cn(
              "block w-full px-3 py-2.5 text-left text-[13px] overflow-hidden text-ellipsis whitespace-nowrap border-l-2 transition-colors",
              currentDraft?.id === d.id
                ? "bg-secondary border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:bg-secondary/50"
            )}
          >
            {d.title || "（無題）"}
          </button>
        ))}
      </aside>

      {/* ─── メインエリア ─── */}
      {!currentDraft ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          「新規」ボタンでドラフトを作成してください
        </div>
      ) : filedIssue ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-[40px]">✅</div>
          <div className="text-lg font-bold text-foreground">Issue を提出しました！</div>
          <div className="text-muted-foreground text-sm" data-testid="wizard-filed-number">
            #{filedIssue.github_number} {filedIssue.title}
          </div>
          <Button onClick={onLaunchTerminal} className="mt-2" data-testid="wizard-launch-terminal">
            <IconSparkles size={14} />
            LAUNCH TERMINAL
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* ─── 左: 入力フォーム ─── */}
          <div className="w-[380px] shrink-0 border-r border-border flex flex-col overflow-hidden">
            <div className="flex-1 p-4 pb-0 overflow-auto">
              {/* タイトル */}
              <label className="block text-xs text-muted-foreground mb-1.5">タイトル</label>
              <Input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                onBlur={handleBlur}
                placeholder="Issue のタイトル"
                data-testid="wizard-step1-input"
                className="mb-3.5 text-[15px]"
              />

              {/* コンテキスト */}
              <label className="block text-xs text-muted-foreground mb-1.5">コンテキスト（何を解決したいか）</label>
              <Textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                onBlur={handleBlur}
                placeholder="Issue の背景・目的・詳細を自由に記入してください"
                data-testid="wizard-context-input"
                className="resize-none h-[130px] mb-3.5"
              />

              {/* 詳細設定（ラベル・担当者）*/}
              <button
                onClick={handleToggleDetails}
                className="w-full flex items-center justify-between bg-transparent border border-border rounded-md px-3 py-1.5 text-muted-foreground cursor-pointer text-xs mb-3.5 hover:bg-secondary transition-colors"
              >
                <span>ラベル・担当者</span>
                <span>{showDetails ? "▲" : "▼"}</span>
              </button>

              {showDetails && (
                <div className="border border-border border-t-0 rounded-b-md p-3 mb-3.5">
                  <label className="block text-xs text-muted-foreground mb-1.5">担当者 (GitHub ログイン名)</label>
                  <Input
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="例: alice"
                    data-testid="wizard-assignee-select"
                    className="mb-2.5 text-[13px]"
                  />

                  <label className="block text-xs text-muted-foreground mb-2">ラベル</label>
                  {labels.length === 0 ? (
                    <p className="text-xs text-muted-foreground m-0">ラベルを取得中…</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {labels.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => toggleLabel(l.name)}
                          className="px-2.5 py-0.5 rounded-full border text-[11px] cursor-pointer transition-colors"
                          style={{
                            borderColor: `#${l.color}`,
                            background: selectedLabels.includes(l.name) ? `#${l.color}33` : "transparent",
                            color: selectedLabels.includes(l.name) ? `#${l.color}` : "var(--color-muted-foreground)",
                            fontWeight: selectedLabels.includes(l.name) ? 600 : 400,
                          }}
                        >
                          {l.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 関連設計書 */}
              {contextChunks.length > 0 && (
                <div className="mb-3.5">
                  <div className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide">
                    関連設計書
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {contextChunks.map((chunk, i) => (
                      <div key={i} className="bg-secondary border border-border rounded-md px-2.5 py-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <IconFileText size={11} className="text-primary shrink-0" />
                          <span className="text-[10px] text-primary font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                            {chunk.path}{chunk.section_heading ? ` — ${chunk.section_heading}` : ""}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground m-0 leading-snug overflow-hidden" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {chunk.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* アクションボタン（下部固定）*/}
            <div className="p-4 border-t border-border flex flex-col gap-2 shrink-0">
              <Button
                onClick={handleGenerate}
                disabled={generating || !title.trim()}
                data-testid="wizard-generate-draft"
                className="w-full justify-center"
              >
                <IconSparkles size={15} />
                {generating ? "AI 生成中…" : "AI で本文を生成"}
              </Button>

              {hasBody && (
                <>
                  {fileError && (
                    <p className="text-destructive text-xs m-0">{fileError}</p>
                  )}
                  <Button
                    onClick={handleFile}
                    disabled={filing}
                    variant="outline"
                    data-testid="wizard-file-issue"
                    className="w-full justify-center"
                  >
                    {filing ? "提出中…" : "GitHub に Issue を提出"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ─── 右: 本文エディタ / プレビュー ─── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-card">
            {/* ツールバー */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide flex-1">
                {generating ? "生成中…" : hasBody ? "本文" : "Preview"}
              </span>
              {hasBody && (
                <>
                  <button
                    onClick={() => setBodyPreview(true)}
                    className={cn(
                      "text-[11px] px-2.5 py-0.5 rounded border cursor-pointer transition-colors",
                      bodyPreview
                        ? "bg-secondary border-primary text-primary"
                        : "bg-transparent border-border text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setBodyPreview(false)}
                    className={cn(
                      "text-[11px] px-2.5 py-0.5 rounded border cursor-pointer transition-colors",
                      !bodyPreview
                        ? "bg-secondary border-primary text-primary"
                        : "bg-transparent border-border text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>

            {/* 本文エリア */}
            <div className="flex-1 overflow-auto p-5" data-testid="wizard-draft-content">
              {!hasBody ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  タイトルを入力して「AI で本文を生成」を押してください
                </div>
              ) : bodyPreview ? (
                <div className="markdown-body text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{editBody}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full h-full resize-none bg-background border-none outline-none text-foreground text-[13px] font-mono leading-relaxed"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center h-12 px-4 text-sm cursor-pointer whitespace-nowrap transition-colors border-b-2",
        active
          ? "border-primary text-foreground font-semibold"
          : "border-transparent text-muted-foreground hover:text-foreground font-normal"
      )}
    >
      {children}
    </button>
  );
}
