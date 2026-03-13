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
  | "conflict"
  | "maintenance";

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

// ─── CodeViewer ───────────────────────────────────────────────────────────────
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  ext?: string;
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  truncated: boolean;
  total_lines: number;
}

export type OpenedFile =
  | { type: "doc"; docId: number }
  | { type: "code"; path: string; content: string; truncated: boolean; totalLines: number }
  | { type: "code-error"; path: string; error: string };

// ─── Maintenance ──────────────────────────────────────────────────────────────

export interface DependencyStatus {
  name: string;
  ecosystem: "Rust" | "Node";
  current_version: string;
  latest_version: string;
  update_type: "Patch" | "Minor" | "Major" | "Unknown";
  has_vulnerability: boolean;
  vulnerability_severity: "Low" | "Medium" | "High" | "Critical" | null;
  affected_sources: string[];
}

export interface DependencyReport {
  checked_at: string;
  rust_deps: DependencyStatus[];
  node_deps: DependencyStatus[];
  total_outdated: number;
  total_vulnerable: number;
}

export interface TechDebtItem {
  id: string;
  category: "TodoFixme" | "LargeFile" | "CodeDuplication" | "DeadCode" | "MissingTests" | "ManualEntry";
  file_path: string;
  line: number | null;
  severity: "Low" | "Medium" | "High" | "Critical";
  description: string;
  auto_detected: boolean;
}

export interface TechDebtReport {
  scanned_at: string;
  items: TechDebtItem[];
  total_score: number;
  by_category: Record<string, number>;
}

export interface FileCoverage {
  path: string;
  covered_lines: number;
  total_lines: number;
  coverage_pct: number;
}

export interface CoverageReport {
  overall_pct: number;
  files: FileCoverage[];
  rust_available: boolean;
  node_available: boolean;
}

export interface RefactorFactors {
  change_frequency: number;
  complexity: number;
  file_size: number;
}

export interface RefactorCandidate {
  file_path: string;
  score: number;
  factors: RefactorFactors;
  estimated_impact: "Low" | "Medium" | "High";
}

// ─── Doc Mapping ──────────────────────────────────────────────────────────────

export interface DocStaleness {
  doc_path: string;
  current_status: string;
  staleness_score: number;
  recommended_status: string;
  days_since_sync: number;
  commits_since_sync: number;
  lines_changed_in_sources: number;
  total_source_lines: number;
}

export interface DocIndex {
  generated_at: string;
  generated_from_commit: string;
  source_index: Record<string, Array<{ doc: string; sections: string[] }>>;
  doc_index: Record<string, { sources: string[]; depends_on: string[] }>;
}

// ─── Phase 6: AI アシスタント ─────────────────────────────────────────────────

export interface FileContext {
  path: string;
  language: string;
  content: string;
  line_count: number;
}

export interface DocContext {
  path: string;
  title: string;
  content_snippet: string;
  relevance_score: number;
}

export interface MaintenanceSnapshot {
  coverage_pct?: number;
  debt_score?: number;
  outdated_deps_count: number;
  stale_docs_count: number;
}

export interface CommitSummary {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
}

export interface GitContext {
  current_branch: string;
  recent_commits: CommitSummary[];
  recent_changed_files: string[];
}

export interface ProductContext {
  name: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  docs_root: string;
}

export interface AiContext {
  file_context?: FileContext;
  doc_context: DocContext[];
  maintenance_context: MaintenanceSnapshot;
  git_context: GitContext;
  product_context: ProductContext;
}

export interface ReviewRequest {
  diff: string;
  changed_files: string[];
  pr_description?: string;
  review_scope: "full" | "design_consistency" | "security_focus" | "test_coverage";
}

export type FindingSeverity = "critical" | "warning" | "info" | "suggestion";
export type FindingCategory =
  | "design_consistency" | "security" | "performance"
  | "test_coverage" | "code_quality" | "naming" | "documentation";
export type Assessment = "approve" | "request_changes" | "comment";

export interface ReviewFinding {
  file: string;
  line_start?: number;
  line_end?: number;
  severity: FindingSeverity;
  category: FindingCategory;
  message: string;
  suggested_fix?: string;
}

export interface DesignInconsistency {
  doc_path: string;
  description: string;
  severity: FindingSeverity;
}

export interface DesignConsistencyReport {
  checked_docs: string[];
  inconsistencies: DesignInconsistency[];
  missing_doc_updates: string[];
}

export interface DocUpdateSuggestion {
  doc_path: string;
  reason: string;
  suggested_change: string;
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  design_consistency: DesignConsistencyReport;
  suggested_doc_updates: DocUpdateSuggestion[];
  overall_assessment: Assessment;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: string;
  file_type: string;
}

export interface MappingUpdate {
  doc_path: string;
  source_path: string;
}

export interface CodegenRequest {
  doc_path: string;
  target_sections?: string[];
  generation_mode: "scaffold" | "implementation" | "test_only";
}

export interface CodegenResult {
  generated_files: GeneratedFile[];
  mapping_updates: MappingUpdate[];
  warnings: string[];
}
