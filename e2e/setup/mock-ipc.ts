/**
 * Tauri IPC モックデータ
 * window.__TAURI_INTERNALS__.invoke を差し替えて、E2E テストで
 * バックエンドを使わずに全機能をテストできるようにする。
 */

export const MOCK_PROJECT = {
  id: 1,
  name: "DevNest",
  repo_owner: "yosuke",
  repo_name: "devnest",
  local_path: "/tmp/devnest",
  default_branch: "main",
  docs_root: "docs/",
  sync_mode: "auto",
  debounce_ms: 1000,
  commit_msg_format: "docs: update {filename}",
  remote_poll_interval_min: 5,
  github_installation_id: null,
  last_opened_document_id: 1,
  last_synced_at: "2026-03-09T00:00:00Z",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-09T00:00:00Z",
};

export const MOCK_PROJECT_2 = {
  ...MOCK_PROJECT,
  id: 2,
  name: "SideProject",
  repo_name: "sideproject",
  last_opened_document_id: null,
};

export const MOCK_DOCUMENT = {
  id: 1,
  project_id: 1,
  path: "docs/architecture.md",
  title: "Architecture",
  sha: "abc123",
  size_bytes: 500,
  embedding_status: "indexed",
  push_status: "synced",
  is_dirty: false,
  last_indexed_at: "2026-03-09T00:00:00Z",
  last_synced_at: "2026-03-09T00:00:00Z",
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-09T00:00:00Z",
};

export const MOCK_DOC_CONTENT = {
  ...MOCK_DOCUMENT,
  content: "# Architecture\n\n## Overview\n\ngit2-rs を使った自動コミット設計。\n\n## Components\n\n- `document_save` command\n- `git2::Repository` wrapper",
};

export const MOCK_DOCUMENT_2 = {
  ...MOCK_DOCUMENT,
  id: 2,
  path: "docs/api-spec.md",
  title: "API Spec",
};

export const MOCK_ISSUE = {
  id: 1,
  project_id: 1,
  github_number: 43,
  github_id: 1043,
  title: "feat: Auto git-commit on save",
  body: "## Overview\nエディタ保存時に自動でgit commitを走らせてGitHubにプッシュする。\n\n## Acceptance Criteria\n- [ ] Cmd+Sで保存するとauto-commitが走る\n- [ ] push失敗時はリトライボタンを表示する",
  state: "open",
  assignees: ["yosuke"],
  labels: ["enhancement"],
  linked_document_id: null,
  synced_at: "2026-03-09T00:00:00Z",
  github_created_at: "2026-03-09T00:00:00Z",
  github_updated_at: "2026-03-09T00:00:00Z",
};

export const MOCK_DRAFT = {
  id: 1,
  project_id: 1,
  title: "feat: Auto git-commit on save",
  body: "## Overview\nエディタ保存時に自動でgit commitを走らせてGitHubにプッシュする。",
  labels: ["enhancement"],
  assignees: [],
  status: "draft",
  created_at: "2026-03-09T00:00:00Z",
  updated_at: "2026-03-09T00:00:00Z",
};

export const MOCK_PR = {
  id: 1,
  project_id: 1,
  github_number: 44,
  github_id: 1044,
  title: "feat: auto git-commit on save",
  body: "Closes #43\n\n自動コミット機能を実装。",
  state: "open",
  head_branch: "feat/43-auto-git-commit",
  base_branch: "main",
  author_login: "claude-code",
  checks_status: "passing",
  linked_issue_number: 43,
  draft: false,
  merged_at: null,
  github_created_at: "2026-03-09T00:00:00Z",
  github_updated_at: "2026-03-09T00:00:00Z",
  synced_at: "2026-03-09T00:00:00Z",
};

export const MOCK_SEARCH_RESULTS = [
  {
    chunk_id: 1,
    document_id: 1,
    path: "docs/architecture.md",
    title: null,
    section_heading: "Overview",
    content: "git2-rs を使った自動コミット設計。",
    start_line: 5,
    score: 0.94,
  },
  {
    chunk_id: 2,
    document_id: 2,
    path: "docs/api-spec.md",
    title: null,
    section_heading: null,
    content: "document_save コマンドの API 仕様。",
    start_line: 10,
    score: 0.81,
  },
];

export const MOCK_CONFLICT_FILE = {
  id: 1,
  project_id: 1,
  file_path: "docs/architecture.md",
  is_managed: true,
  resolution: null,
  resolved_at: null,
  blocks: [
    {
      index: 0,
      ours: "# Architecture v2\n\n新しい設計",
      theirs: "# Architecture v1\n\n古い設計",
    },
  ],
};

export const MOCK_NOTIFICATION = {
  id: 1,
  project_id: 1,
  event_type: "ci_passed",
  title: "CI が通過しました",
  body: "feat/43-auto-git-commit のチェックがすべて通過しました",
  is_read: false,
  target_screen: "pr",
  target_id: 1,
  created_at: "2026-03-09T00:00:00Z",
};

/**
 * Playwright page に注入するモック IPC スクリプト文字列を生成する。
 * JSON シリアライズしてページ内で eval する。
 */
export function buildMockIpcScript(overrides: Record<string, unknown> = {}): string {
  const defaults: Record<string, unknown> = {
    startup_cleanup: null,
    project_list: [MOCK_PROJECT],
    project_create: { project: MOCK_PROJECT, document_count: 2 },
    project_update: MOCK_PROJECT,
    project_delete: null,
    project_get_status: {
      id: 1, name: "DevNest", local_path: "/tmp/devnest",
      issue_count: 5, open_issue_count: 3, document_count: 2,
      github_connected: true, last_synced_at: "2026-03-09T00:00:00Z",
    },
    project_set_last_opened_document: null,
    document_list: [MOCK_DOCUMENT, MOCK_DOCUMENT_2],
    document_get: MOCK_DOC_CONTENT,
    document_save: { sha: "def456", push_status: "synced" },
    document_set_dirty: null,
    document_scan: { count: 2 },
    document_linked_issues: [],
    document_push_retry: null,
    document_index_build: 3,
    document_search_keyword: MOCK_SEARCH_RESULTS,
    document_search_semantic: MOCK_SEARCH_RESULTS,
    search_history_list: [],
    github_auth_start: { device_code: "abc", user_code: "ABC-DEF", verification_uri: "https://github.com/login/device" },
    github_auth_status: { connected: true, user_login: "yosuke", avatar_url: null },
    github_auth_revoke: null,
    github_labels_list: [{ name: "bug", color: "d73a4a" }, { name: "enhancement", color: "a2eeef" }],
    issue_list: [MOCK_ISSUE],
    issue_sync: null,
    issue_create: { ...MOCK_ISSUE, id: 2, github_number: 44 },
    issue_doc_link_list: [],
    issue_doc_link_add: null,
    issue_doc_link_remove: null,
    issue_draft_create: MOCK_DRAFT,
    issue_draft_update: MOCK_DRAFT,
    issue_draft_list: [MOCK_DRAFT],
    issue_draft_generate: null,
    issue_draft_cancel: null,
    search_context_for_issue: { chunks: MOCK_SEARCH_RESULTS },
    settings_get: null,
    settings_set: null,
    pr_list: [MOCK_PR],
    pr_sync: null,
    pr_get_detail: { pr: MOCK_PR, reviews: [], comments: [] },
    pr_get_files: [],
    pr_get_diff: "",
    pr_review_submit: null,
    pr_add_comment: null,
    pr_merge: null,
    pr_create_from_branch: MOCK_PR,
    terminal_session_start: { id: 1, project_id: 1, status: "running", created_at: "2026-03-09T00:00:00Z" },
    terminal_input_send: null,
    terminal_session_stop: null,
    terminal_session_list: [],
    conflict_scan: { managed: [MOCK_CONFLICT_FILE], unmanaged_count: 0 },
    conflict_list: { managed: [MOCK_CONFLICT_FILE], unmanaged_count: 0 },
    conflict_resolve: null,
    conflict_resolve_all: { commit_sha: "abc12345", resolved_files: 1 },
    notification_list: [MOCK_NOTIFICATION],
    notification_unread_count: 1,
    notification_mark_read: null,
    notification_mark_all_read: null,
    notification_navigate: { screen: "pr", resource_id: 1 },
    notification_permission_request: "granted",
    polling_start: null,
    polling_stop: null,
    index_reset: 2,
    sync_log_list: [],
    git_pull: null,
    ...overrides,
  };

  const doc2Content = {
    ...MOCK_DOCUMENT_2,
    content: "# API Spec\n\n## Overview\n\nAPI 仕様書。\n\n## Endpoints\n\n- `POST /api/v1/documents`",
  };

  return `
    window.__TAURI_INTERNALS__ = {
      invoke: async function(cmd, args) {
        const responses = ${JSON.stringify(defaults)};
        // document_get は documentId に応じて返すデータを切り替える
        if (cmd === 'document_get') {
          const doc2 = ${JSON.stringify(doc2Content)};
          if (args && args.documentId === 2) return doc2;
          return responses['document_get'];
        }
        if (cmd in responses) {
          return responses[cmd];
        }
        console.warn('[mock-ipc] unknown command:', cmd, args);
        return null;
      },
      transformCallback: function(cb, once) { return 0; },
      clearCallback: function(id) {},
      isTauri: true,
    };
    // Tauri イベントシステムのスタブ
    window.__TAURI_INTERNALS__.listen = async function(event, cb) {
      return () => {};
    };
  `;
}
