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
    listenDraftChunk,
    listenDraftDone,
  } = useIssueStore();

  const startSession = useTerminalStore((s) => s.startSession);
  const navigate = useUiStore((s) => s.navigate);
  const documents = useDocumentStore((s) => s.documents);

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

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 左ペイン: リスト + タブヘッダー */}
      <div className="w-72 shrink-0 flex flex-col border-r border-white/10">
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            padding: "0 16px",
            borderBottom: "1px solid #2a2a3a",
            background: "#1a1a2e",
            height: 48,
          }}
        >
          <TabBtn active={tab === "list"} onClick={() => setTab("list")}>
            Issue 一覧
          </TabBtn>
          <TabBtn active={tab === "wizard"} onClick={() => setTab("wizard")}>
            <IconSparkles size={14} style={{ marginRight: 4 }} />
            AI Wizard
          </TabBtn>

          <div style={{ flex: 1 }} />

          {tab === "list" && (
            <>
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
                style={actionBtnStyle}
                title="GitHub から同期"
              >
                <IconRefresh
                  size={16}
                  style={{
                    animation:
                      syncStatus === "loading" ? "spin 1s linear infinite" : undefined,
                  }}
                />
              </button>
            </>
          )}

          {tab === "wizard" && (
            <button
              onClick={async () => {
                const draft = await createDraft(currentProject.id);
                selectDraft(draft);
              }}
              style={{ ...actionBtnStyle, gap: 4, display: "flex", alignItems: "center" }}
            >
              <IconPlus size={16} />
              新規
            </button>
          )}
        </header>

        {tab === "list" ? (
          <IssueList
            issues={issues}
            loading={listStatus === "loading"}
            selectedId={currentIssue?.id ?? null}
            onSelect={handleSelectIssue}
          />
        ) : (
          <WizardPanel
            drafts={drafts}
            currentDraft={currentDraft}
            streamBuffer={draftStreamBuffer}
            generating={generateStatus === "loading"}
            onSelectDraft={selectDraft}
            onUpdateDraft={updateDraft}
            onGenerate={generateDraft}
          />
        )}
      </div>

      {/* 右ペイン: Issue 詳細 */}
      {tab === "list" && currentIssue ? (
        <IssueDetail
          issue={currentIssue}
          links={issueLinks}
          linksStatus="success"
          documents={documents}
          onAddLink={(issueId, documentId) => addIssueLink(issueId, documentId)}
          onRemoveLink={(issueId, documentId) => removeIssueLink(issueId, documentId)}
          onLaunchTerminal={handleLaunchTerminal}
          onOpenDocument={() => {}}
        />
      ) : tab === "list" ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
          Issue を選択してください
        </div>
      ) : null}
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
  onSelectDraft: (d: IssueDraft | null) => void;
  onUpdateDraft: (patch: IssueDraftPatch) => Promise<void>;
  onGenerate: (draftId: number) => Promise<void>;
}

function WizardPanel({
  drafts,
  currentDraft,
  streamBuffer,
  generating,
  onSelectDraft,
  onUpdateDraft,
  onGenerate,
}: WizardPanelProps) {
  const [title, setTitle] = useState(currentDraft?.title ?? "");
  const [context, setContext] = useState(currentDraft?.wizard_context ?? "");

  useEffect(() => {
    setTitle(currentDraft?.title ?? "");
    setContext(currentDraft?.wizard_context ?? "");
  }, [currentDraft?.id]);

  const handleBlur = () => {
    if (!currentDraft) return;
    onUpdateDraft({ id: currentDraft.id, title, wizard_context: context });
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

      {/* エディタ */}
      {currentDraft ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: 0,
            overflow: "hidden",
          }}
        >
          {/* 入力フォーム */}
          <div
            style={{
              flex: 1,
              padding: 20,
              overflow: "auto",
              borderRight: "1px solid #2a2a3a",
            }}
          >
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

            <button
              onClick={() => onGenerate(currentDraft.id)}
              disabled={generating}
              style={{
                marginTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#7c6cf2",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "10px 18px",
                cursor: generating ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 14,
                opacity: generating ? 0.7 : 1,
              }}
            >
              <IconSparkles size={16} />
              {generating ? "生成中…" : "AI で本文を生成"}
            </button>
          </div>

          {/* プレビュー */}
          <div
            style={{
              flex: 1,
              padding: 20,
              overflow: "auto",
              background: "#161622",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#888",
                marginBottom: 12,
                textTransform: "uppercase",
              }}
            >
              Preview
            </div>
            <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.7 }}>
              {streamBuffer ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamBuffer}
                </ReactMarkdown>
              ) : (
                <span style={{ color: "#555" }}>
                  生成ボタンを押すと AI が本文を生成します
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ...centerStyle, flex: 1 }}>
          ドラフトを選択するか、新規作成してください
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

const actionBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #3a3a52",
  borderRadius: 4,
  color: "#aaa",
  cursor: "pointer",
  padding: 6,
  display: "flex",
  alignItems: "center",
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
