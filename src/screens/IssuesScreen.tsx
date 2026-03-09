import { useEffect, useState } from "react";
import {
  IconRefresh,
  IconPlus,
  IconSparkles,
  IconCircleCheck,
  IconCircleDot,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useIssueStore } from "../stores/issueStore";
import { useProjectStore } from "../stores/projectStore";
import { useDocumentStore } from "../stores/documentStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useUiStore } from "../stores/uiStore";
import { IssueDetail } from "../components/issues/IssueDetail";
import type { Issue, IssueDraft, IssueDraftPatch } from "../types";

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
  const { documents, openDocument } = useDocumentStore((s) => ({ documents: s.documents, openDocument: s.openDocument }));

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
      <div style={centerStyle}>プロジェクトを選択してください</div>
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

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    padding: "0 16px",
    borderBottom: "1px solid #2a2a3a",
    background: "#1a1a2e",
    height: 48,
    flexShrink: 0,
  };

  if (tab === "wizard") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <header style={headerStyle}>
          <TabBtn active={false} onClick={() => setTab("list")}>
            Issue 一覧
          </TabBtn>
          <TabBtn active={true} onClick={() => setTab("wizard")}>
            <IconSparkles size={14} style={{ marginRight: 4 }} />
            AI Wizard
          </TabBtn>
          <div style={{ flex: 1 }} />
          <button
            onClick={async () => {
              const draft = await createDraft(currentProject.id);
              selectDraft(draft);
            }}
            className="btn-primary"
            style={{ padding: "4px 10px", fontSize: 12 }}
          >
            <IconPlus size={14} />
            新規
          </button>
        </header>
        <WizardPanel
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
    <div className="flex-1 flex overflow-hidden">
      {/* 左ペイン: リスト + タブヘッダー */}
      <div className="w-72 shrink-0 flex flex-col border-r border-white/10">
        <header style={headerStyle}>
          <TabBtn active={true} onClick={() => setTab("list")}>
            Issue 一覧
          </TabBtn>
          <TabBtn active={false} onClick={() => setTab("wizard")}>
            <IconSparkles size={14} style={{ marginRight: 4 }} />
            AI Wizard
          </TabBtn>
          <div style={{ flex: 1 }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="">すべて</option>
          </select>
          <button
            onClick={() => syncIssues(currentProject.id)}
            disabled={syncStatus === "loading"}
            className="btn-icon"
            title="GitHub から同期"
          >
            <IconRefresh
              size={15}
              style={{
                animation:
                  syncStatus === "loading" ? "spin 1s linear infinite" : undefined,
              }}
            />
          </button>
        </header>
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
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Issue を選択してください
        </div>
      )}
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
    return <div style={centerStyle}>読み込み中…</div>;
  }
  if (issues.length === 0) {
    return (
      <div style={centerStyle}>
        Issue がありません。右上の ↻ で GitHub から同期してください。
      </div>
    );
  }
  return (
    <div style={{ overflow: "auto", flex: 1 }}>
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
      style={{
        display: "flex",
        alignItems: "flex-start",
        padding: "12px 16px",
        borderBottom: "1px solid #2a2a3a",
        gap: 12,
        cursor: "pointer",
        background: selected ? "#2a2a42" : "transparent",
      }}
    >
      {issue.status === "closed" ? (
        <IconCircleCheck size={18} color="#8e44ad" style={{ marginTop: 2, flexShrink: 0 }} />
      ) : (
        <IconCircleDot size={18} color="#2ecc71" style={{ marginTop: 2, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{issue.title}</span>
          {labels.map((l) => (
            <span
              key={l}
              style={{
                fontSize: 11,
                padding: "1px 6px",
                borderRadius: 10,
                background: "#2a3a4a",
                color: "#6ab0de",
                border: "1px solid #3a4a5a",
              }}
            >
              {l}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          #{issue.github_number} · {issue.author_login}
          {issue.assignee_login && ` → ${issue.assignee_login}`}
        </div>
      </div>
    </div>
  );
}

// ─── AI Wizard Panel ──────────────────────────────────────────────────────────

interface WizardPanelProps {
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

type WizardStep = "edit" | "labels" | "confirm" | "done";

function WizardPanel({
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
  const [step, setStep] = useState<WizardStep>("edit");
  const [filing, setFiling] = useState(false);
  const [filedIssue, setFiledIssue] = useState<Issue | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(currentDraft?.title ?? "");
    setContext(currentDraft?.wizard_context ?? "");
    setAssignee(currentDraft?.assignee_login ?? "");
    try { setSelectedLabels(JSON.parse(currentDraft?.labels ?? "[]")); } catch { setSelectedLabels([]); }
    setStep("edit");
    setFiledIssue(null);
    setFileError(null);
  }, [currentDraft?.id]);

  const handleBlur = () => {
    if (!currentDraft) return;
    onUpdateDraft({ id: currentDraft.id, title, wizard_context: context });
  };

  const handleGoToLabels = () => {
    if (!currentDraft) return;
    onFetchLabels();
    setStep("labels");
  };

  const handleSaveLabels = async () => {
    if (!currentDraft) return;
    await onUpdateDraft({
      id: currentDraft.id,
      labels: JSON.stringify(selectedLabels),
      assignee_login: assignee || undefined,
    });
    setStep("confirm");
  };

  const handleFile = async () => {
    if (!currentDraft) return;
    setFiling(true);
    setFileError(null);
    try {
      const issue = await onCreateIssue(currentDraft.id);
      setFiledIssue(issue);
      setStep("done");
    } catch (e) {
      setFileError(String(e));
    } finally {
      setFiling(false);
    }
  };

  const toggleLabel = (name: string) => {
    setSelectedLabels((prev) =>
      prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]
    );
  };

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* ドラフト一覧 */}
      <aside
        style={{
          width: 200,
          borderRight: "1px solid #2a2a3a",
          overflow: "auto",
          background: "#161622",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            fontSize: 11,
            color: "#888",
            textTransform: "uppercase",
          }}
        >
          Drafts
        </div>
        {drafts.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelectDraft(d)}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              background: currentDraft?.id === d.id ? "#2a2a42" : "transparent",
              border: "none",
              borderLeft:
                currentDraft?.id === d.id
                  ? "2px solid #7c6cf2"
                  : "2px solid transparent",
              color: "#ccc",
              cursor: "pointer",
              textAlign: "left",
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {d.title || "（無題）"}
          </button>
        ))}
      </aside>

      {/* メインエリア */}
      {!currentDraft ? (
        <div style={{ ...centerStyle, flex: 1 }}>
          ドラフトを選択するか、新規作成してください
        </div>
      ) : step === "edit" ? (
        <div style={{ flex: 1, display: "flex", gap: 0, overflow: "hidden" }}>
          {/* 入力フォーム */}
          <div style={{ flex: 1, padding: 20, overflow: "auto", borderRight: "1px solid #2a2a3a" }}>
            <label style={labelStyle}>タイトル</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleBlur}
              placeholder="Issue のタイトル"
              style={inputStyle}
            />

            <label style={{ ...labelStyle, marginTop: 16 }}>
              コンテキスト（何を解決したいか）
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onBlur={handleBlur}
              rows={8}
              placeholder="Issue の背景・目的・詳細を自由に記入してください"
              style={{ ...inputStyle, resize: "vertical" }}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => onGenerate(currentDraft.id)}
                disabled={generating}
                className="btn-primary"
              >
                <IconSparkles size={16} />
                {generating ? "生成中…" : "AI で本文を生成"}
              </button>
              {streamBuffer && (
                <button onClick={handleGoToLabels} className="btn-secondary">
                  次へ →
                </button>
              )}
            </div>
          </div>

          {/* プレビュー */}
          <div style={{ flex: 1, padding: 20, overflow: "auto", background: "#161622" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 12, textTransform: "uppercase" }}>
              Preview
            </div>
            <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
              {streamBuffer ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamBuffer}</ReactMarkdown>
              ) : (
                <span style={{ color: "#555" }}>生成ボタンを押すと AI が本文を生成します</span>
              )}
            </div>
          </div>
        </div>
      ) : step === "labels" ? (
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: "#c0c0d0" }}>
            ラベル・担当者
          </h3>

          <label style={labelStyle}>担当者 (GitHub ログイン名)</label>
          <input
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            placeholder="例: alice"
            style={{ ...inputStyle, marginBottom: 20 }}
          />

          <label style={{ ...labelStyle, marginBottom: 10 }}>ラベル</label>
          {labels.length === 0 ? (
            <p style={{ color: "#666", fontSize: 13 }}>ラベルが取得できませんでした</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {labels.map((l) => (
                <button
                  key={l.id}
                  onClick={() => toggleLabel(l.name)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 12,
                    border: `1px solid #${l.color}`,
                    background: selectedLabels.includes(l.name) ? `#${l.color}33` : "transparent",
                    color: selectedLabels.includes(l.name) ? `#${l.color}` : "#888",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: selectedLabels.includes(l.name) ? 600 : 400,
                  }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("edit")} className="btn-secondary">← 戻る</button>
            <button onClick={handleSaveLabels} className="btn-primary">確認へ →</button>
          </div>
        </div>
      ) : step === "confirm" ? (
        <div style={{ flex: 1, padding: 24, overflow: "auto" }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: "#c0c0d0" }}>
            Issue 確認
          </h3>

          <div style={{ background: "#1e1e30", border: "1px solid #2a2a3a", borderRadius: 8, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{currentDraft.title}</div>
            {selectedLabels.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {selectedLabels.map((l) => (
                  <span key={l} style={{ fontSize: 11, padding: "1px 8px", borderRadius: 10, background: "#2a3a4a", color: "#6ab0de", border: "1px solid #3a4a5a" }}>{l}</span>
                ))}
              </div>
            )}
            {assignee && (
              <div style={{ fontSize: 12, color: "#888" }}>担当: @{assignee}</div>
            )}
          </div>

          <div className="markdown-body" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 24, background: "#161622", padding: 16, borderRadius: 8 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {currentDraft.draft_body ?? currentDraft.body}
            </ReactMarkdown>
          </div>

          {fileError && (
            <p style={{ color: "#e74c3c", fontSize: 13, marginBottom: 12 }}>{fileError}</p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep("labels")} className="btn-secondary">← 戻る</button>
            <button onClick={handleFile} disabled={filing} className="btn-primary">
              <IconSparkles size={14} />
              {filing ? "提出中…" : "GitHub に Issue を提出"}
            </button>
          </div>
        </div>
      ) : (
        /* step === "done" */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e0e0e0" }}>Issue を提出しました！</div>
          {filedIssue && (
            <div style={{ color: "#888", fontSize: 14 }}>
              #{filedIssue.github_number} {filedIssue.title}
            </div>
          )}
          <button onClick={onLaunchTerminal} className="btn-primary" style={{ marginTop: 8 }}>
            <IconSparkles size={14} />
            LAUNCH TERMINAL
          </button>
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
      style={{
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid #7c6cf2" : "2px solid transparent",
        color: active ? "#e0e0e0" : "#888",
        padding: "0 16px",
        height: 48,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        display: "flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

const centerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#666",
  fontSize: 14,
  padding: 32,
};

const selectStyle: React.CSSProperties = {
  background: "#2a2a42",
  color: "#e0e0e0",
  border: "1px solid #3a3a52",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 13,
  marginRight: 8,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#888",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1a2e",
  border: "1px solid #3a3a52",
  borderRadius: 6,
  padding: "8px 12px",
  color: "#e0e0e0",
  fontSize: 14,
  boxSizing: "border-box",
};
