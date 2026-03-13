/**
 * Tauri IPC ラッパー。
 * コンポーネントは直接 invoke しない — 必ずストア経由で呼ぶこと。
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  BlockResolutionInput,
  FileContent,
  FileNode,
  ConflictScanResult,
  Document,
  DocumentWithContent,
  GitHubAuthStatus,
  GitHubLabel,
  Issue,
  IssueContextChunk,
  IssueDocLink,
  IssueDraft,
  IssueDraftPatch,
  IssueSyncResult,
  NavigationTarget,
  Notification,
  PrDetail,
  PrFile,
  PrSyncResult,
  PullRequest,
  ResolveAllResult,
  ReviewSubmitPayload,
  Project,
  ProjectCreateResult,
  ProjectPatch,
  ProjectStatus,
  SaveResult,
  ScanResult,
  SearchHistory,
  SearchResult,
  SettingValue,
  SyncLog,
  TerminalSession,
} from "../types";

// PullRequest is also the create result
type PullRequestFromBranch = PullRequest;

// ─── Project ─────────────────────────────────────────────────────────────────
export const projectCreate = (name: string, localPath: string) =>
  invoke<ProjectCreateResult>("project_create", { name, localPath });

export const projectList = () => invoke<Project[]>("project_list");

export const projectUpdate = (patch: ProjectPatch) =>
  invoke<Project>("project_update", { patch });

export const projectGetStatus = (projectId: number) =>
  invoke<ProjectStatus>("project_get_status", { projectId });

export const projectDelete = (projectId: number) =>
  invoke<void>("project_delete", { projectId });

export const projectSetLastOpenedDocument = (
  projectId: number,
  documentId: number | null
) =>
  invoke<void>("project_set_last_opened_document", { projectId, documentId });

// ─── Document ────────────────────────────────────────────────────────────────
export const documentList = (projectId: number) =>
  invoke<Document[]>("document_list", { projectId });

export const documentGet = (projectId: number, documentId: number) =>
  invoke<DocumentWithContent>("document_get", { projectId, documentId });

export const documentScan = (projectId: number) =>
  invoke<ScanResult>("document_scan", { projectId });

export const documentSave = (projectId: number, documentId: number, content: string) =>
  invoke<SaveResult>("document_save", { projectId, documentId, content });

export const documentSetDirty = (projectId: number, documentId: number, dirty: boolean) =>
  invoke<void>("document_set_dirty", { projectId, documentId, dirty });

export const documentPushRetry = (projectId: number, documentId: number) =>
  invoke<void>("document_push_retry", { projectId, documentId });

export const documentLinkedIssues = (projectId: number, documentId: number) =>
  invoke<Issue[]>("document_linked_issues", { projectId, documentId });

export const documentCreate = (projectId: number, relPath: string) =>
  invoke<Document>("document_create", { projectId, relPath });

export const documentRename = (projectId: number, documentId: number, newRelPath: string) =>
  invoke<Document>("document_rename", { projectId, documentId, newRelPath });

// ─── CodeViewer ───────────────────────────────────────────────────────────────
export const fileTree = (projectId: number) =>
  invoke<FileNode[]>("file_tree", { projectId });

export const fileRead = (projectId: number, path: string, maxLines?: number) =>
  invoke<FileContent>("file_read", { projectId, path, maxLines });

export const fileSave = (projectId: number, path: string, content: string) =>
  invoke<{ sha: string; push_status: string }>("file_save", { projectId, path, content });

// ─── Settings ────────────────────────────────────────────────────────────────
export const settingsGet = (key: string) =>
  invoke<string | null>("settings_get", { key });

export const settingsSet = (setting: SettingValue) =>
  invoke<void>("settings_set", { setting });

// ─── Util ────────────────────────────────────────────────────────────────────
export const startupCleanup = () => invoke<void>("startup_cleanup");

export const syncLogList = (projectId: number, limit?: number) =>
  invoke<SyncLog[]>("sync_log_list", { projectId, limit });

// ─── GitHub Auth ─────────────────────────────────────────────────────────────
export const githubAuthStart = (projectId: number) =>
  invoke<void>("github_auth_start", { projectId });

export const githubAuthComplete = (projectId: number, code: string) =>
  invoke<void>("github_auth_complete", { projectId, code });

export const githubAuthStatus = (projectId: number) =>
  invoke<GitHubAuthStatus>("github_auth_status", { projectId });

export const githubAuthRevoke = (projectId: number) =>
  invoke<void>("github_auth_revoke", { projectId });

// ─── Issue ───────────────────────────────────────────────────────────────────
export const issueSync = (projectId: number, stateFilter?: string) =>
  invoke<IssueSyncResult>("issue_sync", { projectId, stateFilter });

export const issueList = (projectId: number, statusFilter?: string) =>
  invoke<Issue[]>("issue_list", { projectId, statusFilter });

export const issueDocLinkList = (projectId: number, issueId: number) =>
  invoke<IssueDocLink[]>("issue_doc_link_list", { projectId, issueId });

export const issueDocLinkAdd = (
  issueId: number,
  documentId: number,
  linkType?: string
) => invoke<void>("issue_doc_link_add", { issueId, documentId, linkType });

export const issueDocLinkRemove = (issueId: number, documentId: number) =>
  invoke<void>("issue_doc_link_remove", { issueId, documentId });

export const issueDraftCreate = (projectId: number) =>
  invoke<IssueDraft>("issue_draft_create", { projectId });

export const issueDraftUpdate = (patch: IssueDraftPatch) =>
  invoke<IssueDraft>("issue_draft_update", { patch });

export const issueDraftList = (projectId: number) =>
  invoke<IssueDraft[]>("issue_draft_list", { projectId });

export const issueDraftGenerate = (draftId: number) =>
  invoke<void>("issue_draft_generate", { draftId });

export const issueDraftCancel = (draftId: number) =>
  invoke<void>("issue_draft_cancel", { draftId });

export const issueCreate = (draftId: number) =>
  invoke<Issue>("issue_create", { draftId });

export const githubLabelsList = (projectId: number) =>
  invoke<GitHubLabel[]>("github_labels_list", { projectId });

// ─── PR ──────────────────────────────────────────────────────────────────────
export const prSync = (projectId: number, stateFilter?: string) =>
  invoke<PrSyncResult>("pr_sync", { projectId, stateFilter });

export const prList = (projectId: number, stateFilter?: string) =>
  invoke<PullRequest[]>("pr_list", { projectId, stateFilter });

export const prGetDetail = (prId: number) =>
  invoke<PrDetail>("pr_get_detail", { prId });

export const prGetFiles = (projectId: number, prId: number) =>
  invoke<PrFile[]>("pr_get_files", { projectId, prId });

export const prGetDiff = (projectId: number, prId: number) =>
  invoke<string>("pr_get_diff", { projectId, prId });

export const prAddComment = (
  projectId: number,
  prId: number,
  body: string,
  path?: string,
  line?: number
) => invoke<void>("pr_add_comment", { projectId, prId, body, path, line });

export const prReviewSubmit = (projectId: number, payload: ReviewSubmitPayload) =>
  invoke<void>("pr_review_submit", { projectId, payload });

export const prCreateFromBranch = (
  projectId: number,
  branchName: string,
  title: string,
  body?: string
) =>
  invoke<PullRequestFromBranch>("pr_create_from_branch", {
    projectId,
    branchName,
    title,
    body,
  });

export const prMerge = (
  projectId: number,
  prId: number,
  mergeMethod?: string
) => invoke<void>("pr_merge", { projectId, prId, mergeMethod });

export const gitPull = (projectId: number) =>
  invoke<string>("git_pull", { projectId });

export const prDocDiffGet = (projectId: number, prId: number) =>
  invoke<string>("pr_doc_diff_get", { projectId, prId });

// ─── Search ──────────────────────────────────────────────────────────────────
export const indexBuild = (projectId: number) =>
  invoke<number>("index_build", { projectId });

export const documentIndexBuild = (projectId: number, documentId: number) =>
  invoke<number>("document_index_build", { projectId, documentId });

export const indexReset = (projectId: number) =>
  invoke<number>("index_reset", { projectId });

export const documentSearchKeyword = (projectId: number, query: string) =>
  invoke<SearchResult[]>("document_search_keyword", { projectId, query });

export const documentSearchSemantic = (projectId: number, query: string) =>
  invoke<SearchResult[]>("document_search_semantic", { projectId, query });

export const searchHistoryList = (projectId: number) =>
  invoke<SearchHistory[]>("search_history_list", { projectId });

export const searchContextForIssue = (projectId: number, issueId: number) =>
  invoke<IssueContextChunk[]>("search_context_for_issue", { projectId, issueId });

// ─── Terminal ────────────────────────────────────────────────────────────────
export const terminalSessionStart = (
  projectId: number,
  promptSummary?: string,
  options?: {
    issueNumber?: number;
    issueId?: number;
    contextDocIds?: number[];
    branchName?: string;
    requestChangesComment?: string;
    cols?: number;
    rows?: number;
  }
) =>
  invoke<TerminalSession>("terminal_session_start", {
    projectId,
    promptSummary,
    issueNumber: options?.issueNumber,
    issueId: options?.issueId,
    contextDocIds: options?.contextDocIds,
    branchName: options?.branchName,
    requestChangesComment: options?.requestChangesComment,
    cols: options?.cols,
    rows: options?.rows,
  });

export const terminalSessionStop = (sessionId: number) =>
  invoke<void>("terminal_session_stop", { sessionId });

export const terminalInputSend = (sessionId: number, input: string) =>
  invoke<void>("terminal_input_send", { sessionId, input });

export const terminalResize = (sessionId: number, cols: number, rows: number) =>
  invoke<void>("terminal_resize", { sessionId, cols, rows });

export const terminalSessionList = (projectId: number) =>
  invoke<TerminalSession[]>("terminal_session_list", { projectId });

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationList = (projectId: number) =>
  invoke<Notification[]>("notification_list", { projectId });

export const notificationUnreadCount = (projectId: number) =>
  invoke<number>("notification_unread_count", { projectId });

export const notificationMarkRead = (notificationId: number) =>
  invoke<void>("notification_mark_read", { notificationId });

export const notificationMarkAllRead = (projectId: number) =>
  invoke<void>("notification_mark_all_read", { projectId });

export const notificationNavigate = (notificationId: number) =>
  invoke<NavigationTarget>("notification_navigate", { notificationId });

export const notificationPush = (
  projectId: number,
  eventType: string,
  title: string,
  body?: string,
  destScreen?: string,
  destResourceId?: number
) =>
  invoke<number>("notification_push", {
    projectId,
    eventType,
    title,
    body,
    destScreen,
    destResourceId,
  });

export const notificationPermissionRequest = () =>
  invoke<string>("notification_permission_request");

// ─── Polling ─────────────────────────────────────────────────────────────────
export const pollingStart = (projectId: number) =>
  invoke<void>("polling_start", { projectId });
export const pollingStop = (projectId: number) =>
  invoke<void>("polling_stop", { projectId });
export const pollingStatus = (projectId?: number) =>
  invoke<boolean>("polling_status", { projectId });

// ─── Conflict ─────────────────────────────────────────────────────────────────
export const conflictScan = (projectId: number) =>
  invoke<ConflictScanResult>("conflict_scan", { projectId });

export const conflictList = (projectId: number) =>
  invoke<ConflictScanResult>("conflict_list", { projectId });

export const conflictResolve = (
  projectId: number,
  fileId: number,
  filePath: string,
  resolutions: BlockResolutionInput[]
) =>
  invoke<void>("conflict_resolve", { projectId, fileId, filePath, resolutions });

export const conflictResolveAll = (projectId: number) =>
  invoke<ResolveAllResult>("conflict_resolve_all", { projectId });

// ─── Maintenance ──────────────────────────────────────────────────────────────
export const maintenanceScanDependencies = (projectPath: string) =>
  invoke<import("../types").DependencyReport>("maintenance_scan_dependencies", { projectPath });

export const maintenanceScanTechDebt = (projectPath: string) =>
  invoke<import("../types").TechDebtReport>("maintenance_scan_tech_debt", { projectPath });

export const maintenanceRunCoverage = (projectPath: string) =>
  invoke<import("../types").CoverageReport>("maintenance_run_coverage", { projectPath });

export const maintenanceRefactorCandidates = (projectPath: string, topN: number = 20) =>
  invoke<import("../types").RefactorCandidate[]>("maintenance_refactor_candidates", { projectPath, topN });

// ─── Doc Mapping ──────────────────────────────────────────────────────────────
export const rebuildDocIndex = (projectPath: string) =>
  invoke<import("../types").DocIndex>("rebuild_doc_index", { projectPath });

export const checkDocStaleness = (projectPath: string) =>
  invoke<import("../types").DocStaleness[]>("check_doc_staleness", { projectPath });

// ─── Phase 6: AI アシスタント ─────────────────────────────────────────────────

export const aiGetContext = (projectPath: string, filePath?: string) =>
  invoke<import("../types").AiContext>("ai_get_context", { projectPath, filePath });

export const aiReviewChanges = (
  projectPath: string,
  request: import("../types").ReviewRequest,
) => invoke<import("../types").ReviewResult>("ai_review_changes", { projectPath, request });

export const aiGenerateCode = (
  projectPath: string,
  request: import("../types").CodegenRequest,
) => invoke<import("../types").CodegenResult>("ai_generate_code", { projectPath, request });
