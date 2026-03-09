// ─── AppError（Rust の AppError と対応） ────────────────────────────────────
export type AppErrorCode =
  | "Db" | "Git" | "GitHub" | "GitHubAuthRequired" | "GitHubRateLimit"
  | "Anthropic" | "Io" | "Validation" | "Keychain" | "NotFound" | "Internal";

export interface AppError {
  code: AppErrorCode;
  message?: string;
  reset_at?: string; // GitHubRateLimit 用
}

export type AsyncStatus = "idle" | "loading" | "success" | "error";

// ─── Project ─────────────────────────────────────────────────────────────────
export interface Project {
  id: number;
  name: string;
  repo_owner: string;
  repo_name: string;
  local_path: string;
  default_branch: string;
  docs_root: string;
  sync_mode: "auto" | "manual";
  debounce_ms: number;
  commit_msg_format: string;
  remote_poll_interval_min: number;
  github_installation_id: string | null;
  last_opened_document_id: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreateResult {
  project: Project;
  document_count: number;
}

export interface ProjectStatus {
  id: number;
  name: string;
  local_path: string;
  issue_count: number;
  open_issue_count: number;
  document_count: number;
  github_connected: boolean;
  last_synced_at: string | null;
  // 設計書追加フィールド
  syncStatus: "idle" | "syncing" | "error";
  dirtyCount: number;
  pendingPushCount: number;
  branch: string | null;
  hasUnresolvedConflict: boolean;
  pendingAiReviewCount: number;
}

export interface ProjectPatch {
  id: number;
  name?: string | null;
  repo_owner?: string | null;
  repo_name?: string | null;
  default_branch?: string | null;
  docs_root?: string | null;
  sync_mode?: "auto" | "manual" | null;
  debounce_ms?: number | null;
  commit_msg_format?: string | null;
  remote_poll_interval_min?: number | null;
  github_installation_id?: string | null;
  last_synced_at?: string | null;
}

// ─── Document ────────────────────────────────────────────────────────────────
export interface ScanResult {
  added: number;
  updated: number;
  deleted: number;
  total: number;
}

export interface Document {
  id: number;
  project_id: number;
  path: string;
  title: string | null;
  sha: string | null;
  size_bytes: number | null;
  embedding_status: "pending" | "indexed" | "stale" | "error" | "conflict";
  push_status: "synced" | "pending_push" | "push_failed";
  is_dirty: boolean;
  last_indexed_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentWithContent extends Document {
  content: string;
}

export interface SaveResult {
  sha: string;
  committed: boolean;
  push_status: "synced" | "pending_push" | "push_failed";
}

export interface SyncLog {
  id: number;
  project_id: number;
  operation: string;
  status: string;
  commit_sha: string | null;
  branch: string | null;
  file_path: string | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
}

// ─── Issue ───────────────────────────────────────────────────────────────────
export interface Issue {
  id: number;
  project_id: number;
  github_number: number;
  github_id: number;
  title: string;
  body: string | null;
  status: "open" | "in_progress" | "closed";
  author_login: string;
  assignee_login: string | null;
  labels: string; // JSON 配列文字列
  milestone: string | null;
  linked_pr_number: number | null;
  created_by: "user" | "ai_wizard";
  github_created_at: string;
  github_updated_at: string;
  synced_at: string;
}

export interface IssueDocLink {
  id: number;
  issue_id: number;
  document_id: number;
  link_type: "manual" | "ai_suggested" | "ai_confirmed" | "user_rejected";
  created_by: "user" | "ai";
  created_at: string;
  path: string | null;
  title: string | null;
}

export interface IssueDraft {
  id: number;
  project_id: number;
  title: string;
  body: string;
  draft_body: string | null;
  wizard_context: string | null;
  labels: string; // JSON 配列文字列
  assignee_login: string | null;
  status: "draft" | "submitting" | "submitted" | "failed";
  github_issue_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface IssueDraftPatch {
  id: number;
  title?: string;
  body?: string;
  draft_body?: string;
  wizard_context?: string;
  labels?: string;
  assignee_login?: string;
  status?: "draft" | "submitting" | "submitted" | "failed";
  github_issue_id?: number;
}

export interface IssueSyncResult {
  synced_count: number;
}

// ─── PR ──────────────────────────────────────────────────────────────────────
export interface PullRequest {
  id: number;
  project_id: number;
  github_number: number;
  github_id: number;
  title: string;
  body: string | null;
  state: "open" | "closed" | "merged" | "draft";
  head_branch: string;
  base_branch: string;
  author_login: string;
  checks_status: "pending" | "passing" | "failing" | "unknown";
  linked_issue_number: number | null;
  created_by: "user" | "claude_code";
  draft: boolean;
  merged_at: string | null;
  github_created_at: string;
  github_updated_at: string;
  synced_at: string;
}

export interface PrReview {
  id: number;
  pr_id: number;
  github_id: number | null;
  reviewer_login: string;
  state: "pending" | "approved" | "changes_requested" | "commented" | "dismissed";
  submit_status: "pending_submit" | "submitted";
  body: string | null;
  submitted_at: string | null;
  synced_at: string;
}

export interface PrComment {
  id: number;
  pr_id: number;
  github_id: number | null;
  author_login: string;
  body: string;
  path: string | null;
  line: number | null;
  comment_type: "inline" | "review" | "issue_comment";
  diff_hunk: string | null;
  resolved: boolean;
  in_reply_to_id: number | null;
  is_pending: boolean;
  synced_at: string | null;
  created_at: string;
}

export interface PrDetail {
  pr: PullRequest;
  reviews: PrReview[];
  comments: PrComment[];
}

export interface PrFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PrSyncResult {
  synced_count: number;
}

export interface PrCreateResult {
  id: number;
  github_number: number;
  title: string;
  head_branch: string;
  base_branch: string;
}

export interface ReviewSubmitPayload {
  pr_id: number;
  state: "approved" | "changes_requested" | "commented";
  body?: string;
}

// ─── GitHub ──────────────────────────────────────────────────────────────────
export interface GitHubAuthStatus {
  connected: boolean;
  user_login: string | null;
  avatar_url: string | null;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

// ─── Settings ────────────────────────────────────────────────────────────────
export interface SettingValue {
  key: string;
  value: string;
}

// ─── Terminal ────────────────────────────────────────────────────────────────
export interface TerminalSession {
  id: number;
  project_id: number;
  branch_name: string | null;
  has_doc_changes: boolean;
  prompt_summary: string | null;
  output_log: string | null;
  exit_code: number | null;
  status: "running" | "completed" | "failed" | "aborted";
  started_at: string;
  ended_at: string | null;
}

export interface TerminalDonePayload {
  session_id: number;
  branch_name: string;
  commit_sha: string;
  has_doc_changes: boolean;
  changed_files: string[];
  exit_code: number;
}

// ─── Search ──────────────────────────────────────────────────────────────────
export interface SearchResult {
  document_id: number;
  chunk_id: number;
  path: string;
  title: string | null;
  section_heading: string | null;
  content: string;
  start_line: number;
  score: number;
}

export interface IssueContextChunk {
  path: string;
  section_heading: string | null;
  content: string;
}

export interface SearchHistory {
  id: number;
  project_id: number;
  query: string;
  search_type: "keyword" | "semantic" | "both";
  result_count: number | null;
  created_at: string;
}

// ─── Conflict ────────────────────────────────────────────────────────────────
export interface ConflictBlock {
  index: number;
  ours: string;
  theirs: string;
}

export type BlockResolutionKind = "ours" | "theirs" | "manual";

export interface BlockResolutionInput {
  block_index: number;
  resolution: BlockResolutionKind;
  manual_content?: string;
}

export interface ConflictFile {
  id: number;
  project_id: number;
  file_path: string;
  is_managed: boolean;
  sync_log_id: number | null;
  document_id: number | null;
  our_content: string | null;
  their_content: string | null;
  merged_content: string | null;
  resolution: string | null;
  resolved_at: string | null;
  blocks: ConflictBlock[];
}

export interface ConflictScanResult {
  managed: ConflictFile[];
  unmanaged_count: number;
}

export interface ResolveAllResult {
  commit_sha: string;
  resolved_files: number;
}

// ─── Notifications ───────────────────────────────────────────────────────────
export type NotificationEventType =
  | "ci_pass" | "ci_passed" | "ci_fail"
  | "pr_comment" | "pr_opened"
  | "issue_assigned"
  | "conflict" | "conflict_detected"
  | "ai_edit" | "ai_pr_created"
  | (string & {});

export interface Notification {
  id: number;
  project_id: number;
  event_type: NotificationEventType;
  title: string;
  body: string | null;
  dest_screen: string | null;
  dest_resource_id: number | null;
  is_read: boolean;
  os_notified: boolean;
  created_at: string;
}

export interface NavigationTarget {
  screen: string;
  resource_id: number | null;
  tab?: string | null;
  anchor?: string | null;
}

// ─── Document save progress ──────────────────────────────────────────────────
export interface DocSaveProgress {
  status: "committing" | "pushing" | "synced" | "push_failed";
  message?: string;
}

// ─── Navigation ──────────────────────────────────────────────────────────────
export type ScreenName =
  | "setup"
  | "editor"
  | "issues"
  | "settings"
  | "terminal"
  | "pr"
  | "search"
  | "notifications"
  | "conflict";

export interface NavigateParams {
  prId?: number;
  issueId?: number;
  documentId?: number;
  tab?: string;
  anchor?: string;
  scrollToLine?: number;
}

export type SetupStep = 0 | 1 | 2 | 3 | 4 | 5;

export interface Modal {
  id: string;
  props?: Record<string, unknown>;
}
