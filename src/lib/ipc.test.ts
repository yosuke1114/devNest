/**
 * ipc.ts — invoke ラッパーの呼び出し引数テスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import * as ipc from "./ipc";

describe("ipc — Project", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("projectCreate", async () => {
    await ipc.projectCreate("MyProject", "/tmp/proj");
    expect(mockInvoke).toHaveBeenCalledWith("project_create", { name: "MyProject", localPath: "/tmp/proj" });
  });

  it("projectList", async () => {
    await ipc.projectList();
    expect(mockInvoke).toHaveBeenCalledWith("project_list");
  });

  it("projectUpdate", async () => {
    const patch = { id: 1, name: "New" } as Parameters<typeof ipc.projectUpdate>[0];
    await ipc.projectUpdate(patch);
    expect(mockInvoke).toHaveBeenCalledWith("project_update", { patch });
  });

  it("projectGetStatus", async () => {
    await ipc.projectGetStatus(1);
    expect(mockInvoke).toHaveBeenCalledWith("project_get_status", { projectId: 1 });
  });

  it("projectDelete", async () => {
    await ipc.projectDelete(1);
    expect(mockInvoke).toHaveBeenCalledWith("project_delete", { projectId: 1 });
  });

  it("projectSetLastOpenedDocument", async () => {
    await ipc.projectSetLastOpenedDocument(1, 5);
    expect(mockInvoke).toHaveBeenCalledWith("project_set_last_opened_document", { projectId: 1, documentId: 5 });
  });
});

describe("ipc — Document", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("documentList", async () => {
    await ipc.documentList(1);
    expect(mockInvoke).toHaveBeenCalledWith("document_list", { projectId: 1 });
  });

  it("documentGet", async () => {
    await ipc.documentGet(1, 10);
    expect(mockInvoke).toHaveBeenCalledWith("document_get", { projectId: 1, documentId: 10 });
  });

  it("documentScan", async () => {
    await ipc.documentScan(1);
    expect(mockInvoke).toHaveBeenCalledWith("document_scan", { projectId: 1 });
  });

  it("documentSave", async () => {
    await ipc.documentSave(1, 10, "content");
    expect(mockInvoke).toHaveBeenCalledWith("document_save", { projectId: 1, documentId: 10, content: "content" });
  });

  it("documentSetDirty", async () => {
    await ipc.documentSetDirty(1, 10, true);
    expect(mockInvoke).toHaveBeenCalledWith("document_set_dirty", { projectId: 1, documentId: 10, dirty: true });
  });

  it("documentPushRetry", async () => {
    await ipc.documentPushRetry(1, 10);
    expect(mockInvoke).toHaveBeenCalledWith("document_push_retry", { projectId: 1, documentId: 10 });
  });

  it("documentLinkedIssues", async () => {
    await ipc.documentLinkedIssues(1, 10);
    expect(mockInvoke).toHaveBeenCalledWith("document_linked_issues", { projectId: 1, documentId: 10 });
  });

  it("documentCreate", async () => {
    await ipc.documentCreate(1, "docs/new.md");
    expect(mockInvoke).toHaveBeenCalledWith("document_create", { projectId: 1, relPath: "docs/new.md" });
  });

  it("documentRename", async () => {
    await ipc.documentRename(1, 10, "docs/renamed.md");
    expect(mockInvoke).toHaveBeenCalledWith("document_rename", { projectId: 1, documentId: 10, newRelPath: "docs/renamed.md" });
  });
});

describe("ipc — File", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("fileTree", async () => {
    await ipc.fileTree(1);
    expect(mockInvoke).toHaveBeenCalledWith("file_tree", { projectId: 1 });
  });

  it("fileRead without maxLines", async () => {
    await ipc.fileRead(1, "src/main.ts");
    expect(mockInvoke).toHaveBeenCalledWith("file_read", { projectId: 1, path: "src/main.ts", maxLines: undefined });
  });

  it("fileRead with maxLines", async () => {
    await ipc.fileRead(1, "src/main.ts", 100);
    expect(mockInvoke).toHaveBeenCalledWith("file_read", { projectId: 1, path: "src/main.ts", maxLines: 100 });
  });

  it("fileSave", async () => {
    await ipc.fileSave(1, "src/main.ts", "content");
    expect(mockInvoke).toHaveBeenCalledWith("file_save", { projectId: 1, path: "src/main.ts", content: "content" });
  });
});

describe("ipc — Settings & Sync", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("settingsGet", async () => {
    await ipc.settingsGet("theme");
    expect(mockInvoke).toHaveBeenCalledWith("settings_get", { key: "theme" });
  });

  it("settingsSet", async () => {
    const setting = { key: "theme", value: "dark" } as Parameters<typeof ipc.settingsSet>[0];
    await ipc.settingsSet(setting);
    expect(mockInvoke).toHaveBeenCalledWith("settings_set", { setting });
  });

  it("startupCleanup", async () => {
    await ipc.startupCleanup();
    expect(mockInvoke).toHaveBeenCalledWith("startup_cleanup");
  });

  it("syncLogList without limit", async () => {
    await ipc.syncLogList(1);
    expect(mockInvoke).toHaveBeenCalledWith("sync_log_list", { projectId: 1, limit: undefined });
  });

  it("syncLogList with limit", async () => {
    await ipc.syncLogList(1, 50);
    expect(mockInvoke).toHaveBeenCalledWith("sync_log_list", { projectId: 1, limit: 50 });
  });
});

describe("ipc — GitHub Auth", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("githubAuthStart", async () => {
    await ipc.githubAuthStart(1);
    expect(mockInvoke).toHaveBeenCalledWith("github_auth_start", { projectId: 1 });
  });

  it("githubAuthComplete", async () => {
    await ipc.githubAuthComplete(1, "code123");
    expect(mockInvoke).toHaveBeenCalledWith("github_auth_complete", { projectId: 1, code: "code123" });
  });

  it("githubAuthStatus", async () => {
    await ipc.githubAuthStatus(1);
    expect(mockInvoke).toHaveBeenCalledWith("github_auth_status", { projectId: 1 });
  });

  it("githubAuthRevoke", async () => {
    await ipc.githubAuthRevoke(1);
    expect(mockInvoke).toHaveBeenCalledWith("github_auth_revoke", { projectId: 1 });
  });
});

describe("ipc — Issues", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("issueSync", async () => {
    await ipc.issueSync(1, "open");
    expect(mockInvoke).toHaveBeenCalledWith("issue_sync", { projectId: 1, stateFilter: "open" });
  });

  it("issueList", async () => {
    await ipc.issueList(1, "open");
    expect(mockInvoke).toHaveBeenCalledWith("issue_list", { projectId: 1, statusFilter: "open" });
  });

  it("issueDocLinkList", async () => {
    await ipc.issueDocLinkList(1, 5);
    expect(mockInvoke).toHaveBeenCalledWith("issue_doc_link_list", { projectId: 1, issueId: 5 });
  });

  it("issueDocLinkAdd", async () => {
    await ipc.issueDocLinkAdd(5, 10);
    expect(mockInvoke).toHaveBeenCalledWith("issue_doc_link_add", { issueId: 5, documentId: 10, linkType: undefined });
  });

  it("issueDocLinkRemove", async () => {
    await ipc.issueDocLinkRemove(5, 10);
    expect(mockInvoke).toHaveBeenCalledWith("issue_doc_link_remove", { issueId: 5, documentId: 10 });
  });

  it("issueDraftCreate", async () => {
    await ipc.issueDraftCreate(1);
    expect(mockInvoke).toHaveBeenCalledWith("issue_draft_create", { projectId: 1 });
  });

  it("issueDraftUpdate", async () => {
    const patch = { id: 1 } as Parameters<typeof ipc.issueDraftUpdate>[0];
    await ipc.issueDraftUpdate(patch);
    expect(mockInvoke).toHaveBeenCalledWith("issue_draft_update", { patch });
  });

  it("issueDraftList", async () => {
    await ipc.issueDraftList(1);
    expect(mockInvoke).toHaveBeenCalledWith("issue_draft_list", { projectId: 1 });
  });

  it("issueDraftGenerate", async () => {
    await ipc.issueDraftGenerate(3);
    expect(mockInvoke).toHaveBeenCalledWith("issue_draft_generate", { draftId: 3 });
  });

  it("issueDraftCancel", async () => {
    await ipc.issueDraftCancel(3);
    expect(mockInvoke).toHaveBeenCalledWith("issue_draft_cancel", { draftId: 3 });
  });

  it("issueCreate", async () => {
    await ipc.issueCreate(3);
    expect(mockInvoke).toHaveBeenCalledWith("issue_create", { draftId: 3 });
  });

  it("githubLabelsList", async () => {
    await ipc.githubLabelsList(1);
    expect(mockInvoke).toHaveBeenCalledWith("github_labels_list", { projectId: 1 });
  });
});

describe("ipc — PR", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("prSync", async () => {
    await ipc.prSync(1, "open");
    expect(mockInvoke).toHaveBeenCalledWith("pr_sync", { projectId: 1, stateFilter: "open" });
  });

  it("prList", async () => {
    await ipc.prList(1, "open");
    expect(mockInvoke).toHaveBeenCalledWith("pr_list", { projectId: 1, stateFilter: "open" });
  });

  it("prGetDetail", async () => {
    await ipc.prGetDetail(5);
    expect(mockInvoke).toHaveBeenCalledWith("pr_get_detail", { prId: 5 });
  });

  it("prGetFiles", async () => {
    await ipc.prGetFiles(1, 5);
    expect(mockInvoke).toHaveBeenCalledWith("pr_get_files", { projectId: 1, prId: 5 });
  });

  it("prGetDiff", async () => {
    await ipc.prGetDiff(1, 5);
    expect(mockInvoke).toHaveBeenCalledWith("pr_get_diff", { projectId: 1, prId: 5 });
  });

  it("prAddComment", async () => {
    await ipc.prAddComment(1, 5, "great work");
    expect(mockInvoke).toHaveBeenCalledWith("pr_add_comment", { projectId: 1, prId: 5, body: "great work", path: undefined, line: undefined });
  });

  it("prReviewSubmit", async () => {
    const payload = { prId: 5 } as Parameters<typeof ipc.prReviewSubmit>[1];
    await ipc.prReviewSubmit(1, payload);
    expect(mockInvoke).toHaveBeenCalledWith("pr_review_submit", { projectId: 1, payload });
  });

  it("prCreateFromBranch without body", async () => {
    await ipc.prCreateFromBranch(1, "feat/x", "Title");
    expect(mockInvoke).toHaveBeenCalledWith("pr_create_from_branch", {
      projectId: 1, branchName: "feat/x", title: "Title", body: undefined,
    });
  });

  it("prCreateFromBranch with body", async () => {
    await ipc.prCreateFromBranch(1, "feat/x", "Title", "Body text");
    expect(mockInvoke).toHaveBeenCalledWith("pr_create_from_branch", {
      projectId: 1, branchName: "feat/x", title: "Title", body: "Body text",
    });
  });

  it("prMerge", async () => {
    await ipc.prMerge(1, 5, "squash");
    expect(mockInvoke).toHaveBeenCalledWith("pr_merge", { projectId: 1, prId: 5, mergeMethod: "squash" });
  });

  it("gitPull", async () => {
    await ipc.gitPull(1);
    expect(mockInvoke).toHaveBeenCalledWith("git_pull", { projectId: 1 });
  });

  it("prDocDiffGet", async () => {
    await ipc.prDocDiffGet(1, 5);
    expect(mockInvoke).toHaveBeenCalledWith("pr_doc_diff_get", { projectId: 1, prId: 5 });
  });
});

describe("ipc — Search & Index", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("indexBuild", async () => {
    await ipc.indexBuild(1);
    expect(mockInvoke).toHaveBeenCalledWith("index_build", { projectId: 1 });
  });

  it("documentIndexBuild", async () => {
    await ipc.documentIndexBuild(1, 10);
    expect(mockInvoke).toHaveBeenCalledWith("document_index_build", { projectId: 1, documentId: 10 });
  });

  it("indexReset", async () => {
    await ipc.indexReset(1);
    expect(mockInvoke).toHaveBeenCalledWith("index_reset", { projectId: 1 });
  });

  it("documentSearchKeyword", async () => {
    await ipc.documentSearchKeyword(1, "query");
    expect(mockInvoke).toHaveBeenCalledWith("document_search_keyword", { projectId: 1, query: "query" });
  });

  it("documentSearchSemantic", async () => {
    await ipc.documentSearchSemantic(1, "query");
    expect(mockInvoke).toHaveBeenCalledWith("document_search_semantic", { projectId: 1, query: "query" });
  });

  it("searchHistoryList", async () => {
    await ipc.searchHistoryList(1);
    expect(mockInvoke).toHaveBeenCalledWith("search_history_list", { projectId: 1 });
  });

  it("searchContextForIssue", async () => {
    await ipc.searchContextForIssue(1, 5);
    expect(mockInvoke).toHaveBeenCalledWith("search_context_for_issue", { projectId: 1, issueId: 5 });
  });
});

describe("ipc — Terminal", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("terminalSessionStart minimal", async () => {
    await ipc.terminalSessionStart(1);
    expect(mockInvoke).toHaveBeenCalledWith("terminal_session_start", expect.objectContaining({
      projectId: 1,
    }));
  });

  it("terminalSessionStart with options", async () => {
    await ipc.terminalSessionStart(1, "fix bug", { issueNumber: 42, cols: 80, rows: 24 });
    expect(mockInvoke).toHaveBeenCalledWith("terminal_session_start", expect.objectContaining({
      projectId: 1, promptSummary: "fix bug", issueNumber: 42, cols: 80, rows: 24,
    }));
  });

  it("terminalSessionStop", async () => {
    await ipc.terminalSessionStop(1);
    expect(mockInvoke).toHaveBeenCalledWith("terminal_session_stop", { sessionId: 1 });
  });

  it("terminalInputSend", async () => {
    await ipc.terminalInputSend(1, "ls -la");
    expect(mockInvoke).toHaveBeenCalledWith("terminal_input_send", { sessionId: 1, input: "ls -la" });
  });

  it("terminalResize", async () => {
    await ipc.terminalResize(1, 80, 24);
    expect(mockInvoke).toHaveBeenCalledWith("terminal_resize", { sessionId: 1, cols: 80, rows: 24 });
  });

  it("terminalSessionList", async () => {
    await ipc.terminalSessionList(1);
    expect(mockInvoke).toHaveBeenCalledWith("terminal_session_list", { projectId: 1 });
  });
});

describe("ipc — Notifications", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("notificationList", async () => {
    await ipc.notificationList(1);
    expect(mockInvoke).toHaveBeenCalledWith("notification_list", { projectId: 1 });
  });

  it("notificationUnreadCount", async () => {
    await ipc.notificationUnreadCount(1);
    expect(mockInvoke).toHaveBeenCalledWith("notification_unread_count", { projectId: 1 });
  });

  it("notificationMarkRead", async () => {
    await ipc.notificationMarkRead(5);
    expect(mockInvoke).toHaveBeenCalledWith("notification_mark_read", { notificationId: 5 });
  });

  it("notificationMarkAllRead", async () => {
    await ipc.notificationMarkAllRead(1);
    expect(mockInvoke).toHaveBeenCalledWith("notification_mark_all_read", { projectId: 1 });
  });

  it("notificationNavigate", async () => {
    await ipc.notificationNavigate(5);
    expect(mockInvoke).toHaveBeenCalledWith("notification_navigate", { notificationId: 5 });
  });

  it("notificationPush", async () => {
    await ipc.notificationPush(1, "pr_merged", "PR Merged", "body", "pr", 5);
    expect(mockInvoke).toHaveBeenCalledWith("notification_push", {
      projectId: 1, eventType: "pr_merged", title: "PR Merged",
      body: "body", destScreen: "pr", destResourceId: 5,
    });
  });

  it("notificationPermissionRequest", async () => {
    await ipc.notificationPermissionRequest();
    expect(mockInvoke).toHaveBeenCalledWith("notification_permission_request");
  });
});

describe("ipc — Polling", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("pollingStart", async () => {
    await ipc.pollingStart(1);
    expect(mockInvoke).toHaveBeenCalledWith("polling_start", { projectId: 1 });
  });

  it("pollingStop", async () => {
    await ipc.pollingStop(1);
    expect(mockInvoke).toHaveBeenCalledWith("polling_stop", { projectId: 1 });
  });

  it("pollingStatus", async () => {
    await ipc.pollingStatus(1);
    expect(mockInvoke).toHaveBeenCalledWith("polling_status", { projectId: 1 });
  });
});

describe("ipc — Conflict", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("conflictScan", async () => {
    await ipc.conflictScan(1);
    expect(mockInvoke).toHaveBeenCalledWith("conflict_scan", { projectId: 1 });
  });

  it("conflictList", async () => {
    await ipc.conflictList(1);
    expect(mockInvoke).toHaveBeenCalledWith("conflict_list", { projectId: 1 });
  });

  it("conflictResolve", async () => {
    await ipc.conflictResolve(1, 10, "file.md", []);
    expect(mockInvoke).toHaveBeenCalledWith("conflict_resolve", {
      projectId: 1, fileId: 10, filePath: "file.md", resolutions: [],
    });
  });

  it("conflictResolveAll", async () => {
    await ipc.conflictResolveAll(1);
    expect(mockInvoke).toHaveBeenCalledWith("conflict_resolve_all", { projectId: 1 });
  });
});

describe("ipc — Maintenance", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("maintenanceScanDependencies", async () => {
    await ipc.maintenanceScanDependencies("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("maintenance_scan_dependencies", { projectPath: "/proj" });
  });

  it("maintenanceScanTechDebt", async () => {
    await ipc.maintenanceScanTechDebt("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("maintenance_scan_tech_debt", { projectPath: "/proj" });
  });

  it("maintenanceRunCoverage", async () => {
    await ipc.maintenanceRunCoverage("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("maintenance_run_coverage", { projectPath: "/proj" });
  });

  it("maintenanceGenerateCoverage default target", async () => {
    await ipc.maintenanceGenerateCoverage("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("maintenance_generate_coverage", { projectPath: "/proj", target: "node" });
  });

  it("maintenanceGenerateCoverage with target", async () => {
    await ipc.maintenanceGenerateCoverage("/proj", "rust");
    expect(mockInvoke).toHaveBeenCalledWith("maintenance_generate_coverage", { projectPath: "/proj", target: "rust" });
  });

  it("maintenanceRefactorCandidates default topN", async () => {
    await ipc.maintenanceRefactorCandidates("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("maintenance_refactor_candidates", { projectPath: "/proj", topN: 20 });
  });

  it("maintenanceRefactorCandidates custom topN", async () => {
    await ipc.maintenanceRefactorCandidates("/proj", 5);
    expect(mockInvoke).toHaveBeenCalledWith("maintenance_refactor_candidates", { projectPath: "/proj", topN: 5 });
  });

  it("rebuildDocIndex", async () => {
    await ipc.rebuildDocIndex("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("rebuild_doc_index", { projectPath: "/proj" });
  });

  it("checkDocStaleness", async () => {
    await ipc.checkDocStaleness("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("check_doc_staleness", { projectPath: "/proj" });
  });
});

describe("ipc — AI", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("aiGetContext", async () => {
    await ipc.aiGetContext("/proj", "src/main.ts");
    expect(mockInvoke).toHaveBeenCalledWith("ai_get_context", { projectPath: "/proj", filePath: "src/main.ts" });
  });

  it("aiReviewChanges", async () => {
    const request = { scope: "full" } as Parameters<typeof ipc.aiReviewChanges>[1];
    await ipc.aiReviewChanges("/proj", request);
    expect(mockInvoke).toHaveBeenCalledWith("ai_review_changes", { projectPath: "/proj", request });
  });

  it("aiGenerateCode", async () => {
    const request = { prompt: "add tests" } as Parameters<typeof ipc.aiGenerateCode>[1];
    await ipc.aiGenerateCode("/proj", request);
    expect(mockInvoke).toHaveBeenCalledWith("ai_generate_code", { projectPath: "/proj", request });
  });
});

describe("ipc — Analytics", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("getVelocityMetrics", async () => {
    const period = { start: "2026-01-01", end: "2026-01-31" } as Parameters<typeof ipc.getVelocityMetrics>[1];
    await ipc.getVelocityMetrics("/proj", period);
    expect(mockInvoke).toHaveBeenCalledWith("get_velocity_metrics", { projectPath: "/proj", period });
  });

  it("getAiImpact", async () => {
    const period = { start: "2026-01-01", end: "2026-01-31" } as Parameters<typeof ipc.getAiImpact>[1];
    await ipc.getAiImpact("/proj", period);
    expect(mockInvoke).toHaveBeenCalledWith("get_ai_impact", { projectPath: "/proj", period });
  });

  it("getSprintAnalysis", async () => {
    const sprint = { id: "s1" } as Parameters<typeof ipc.getSprintAnalysis>[1];
    await ipc.getSprintAnalysis("/proj", sprint);
    expect(mockInvoke).toHaveBeenCalledWith("get_sprint_analysis", { projectPath: "/proj", sprint });
  });

  it("getSprintHistory", async () => {
    await ipc.getSprintHistory("/proj", 5);
    expect(mockInvoke).toHaveBeenCalledWith("get_sprint_history", { projectPath: "/proj", count: 5 });
  });
});

describe("ipc — Kanban & Sprint", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("kanbanGetBoard", async () => {
    await ipc.kanbanGetBoard("/proj", "p1");
    expect(mockInvoke).toHaveBeenCalledWith("kanban_get_board", { projectPath: "/proj", productId: "p1" });
  });

  it("kanbanMoveCard", async () => {
    await ipc.kanbanMoveCard("/proj", "p1", "c1", "done");
    expect(mockInvoke).toHaveBeenCalledWith("kanban_move_card", { projectPath: "/proj", productId: "p1", cardId: "c1", toColumn: "done" });
  });

  it("kanbanCreateCard", async () => {
    const card = { title: "New card" } as Parameters<typeof ipc.kanbanCreateCard>[2];
    await ipc.kanbanCreateCard("/proj", "p1", card);
    expect(mockInvoke).toHaveBeenCalledWith("kanban_create_card", { projectPath: "/proj", productId: "p1", card });
  });

  it("kanbanDeleteCard", async () => {
    await ipc.kanbanDeleteCard("/proj", "p1", "c1");
    expect(mockInvoke).toHaveBeenCalledWith("kanban_delete_card", { projectPath: "/proj", productId: "p1", cardId: "c1" });
  });

  it("sprintSuggestPlan", async () => {
    const sprint = { id: "s1" } as Parameters<typeof ipc.sprintSuggestPlan>[1];
    await ipc.sprintSuggestPlan("/proj", sprint);
    expect(mockInvoke).toHaveBeenCalledWith("sprint_suggest_plan", { projectPath: "/proj", sprintInfo: sprint });
  });

  it("sprintGenerateRetro", async () => {
    const sprint = { id: "s1" } as Parameters<typeof ipc.sprintGenerateRetro>[1];
    await ipc.sprintGenerateRetro("/proj", sprint);
    expect(mockInvoke).toHaveBeenCalledWith("sprint_generate_retro", { projectPath: "/proj", sprintInfo: sprint });
  });

});

describe("ipc — MCP", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("mcpGetStatus", async () => {
    await ipc.mcpGetStatus("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("mcp_get_status", { projectPath: "/proj" });
  });

  it("mcpAddServer", async () => {
    const config = { name: "test" } as Parameters<typeof ipc.mcpAddServer>[1];
    await ipc.mcpAddServer("/proj", config);
    expect(mockInvoke).toHaveBeenCalledWith("mcp_add_server", { projectPath: "/proj", config });
  });

  it("mcpRemoveServer", async () => {
    await ipc.mcpRemoveServer("/proj", "test");
    expect(mockInvoke).toHaveBeenCalledWith("mcp_remove_server", { projectPath: "/proj", name: "test" });
  });

  it("mcpListServers", async () => {
    await ipc.mcpListServers("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("mcp_list_servers", { projectPath: "/proj" });
  });

  it("mcpGetPolicy", async () => {
    await ipc.mcpGetPolicy("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("mcp_get_policy", { projectPath: "/proj" });
  });

  it("mcpSavePolicy", async () => {
    const config = { default_policy: "allow" } as Parameters<typeof ipc.mcpSavePolicy>[1];
    await ipc.mcpSavePolicy("/proj", config);
    expect(mockInvoke).toHaveBeenCalledWith("mcp_save_policy", { projectPath: "/proj", config });
  });
});

describe("ipc — Team & Knowledge", () => {
  beforeEach(() => { mockInvoke.mockResolvedValue(undefined); });

  it("teamGetDashboard", async () => {
    await ipc.teamGetDashboard("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("team_get_dashboard", { projectPath: "/proj" });
  });

  it("knowledgeList", async () => {
    await ipc.knowledgeList("/proj");
    expect(mockInvoke).toHaveBeenCalledWith("knowledge_list", { projectPath: "/proj" });
  });

  it("knowledgeSearch", async () => {
    await ipc.knowledgeSearch("/proj", "search query");
    expect(mockInvoke).toHaveBeenCalledWith("knowledge_search", { projectPath: "/proj", query: "search query" });
  });

  it("knowledgeAdd", async () => {
    await ipc.knowledgeAdd("/proj", "Title", "Content", "note", ["tag1"], ["doc1"], "author");
    expect(mockInvoke).toHaveBeenCalledWith("knowledge_add", {
      projectPath: "/proj", title: "Title", content: "Content",
      entryType: "note", tags: ["tag1"], linkedDocs: ["doc1"], author: "author",
    });
  });

  it("knowledgeAddComment", async () => {
    await ipc.knowledgeAddComment("/proj", "entry-1", "author", "Great point!");
    expect(mockInvoke).toHaveBeenCalledWith("knowledge_add_comment", {
      projectPath: "/proj", entryId: "entry-1", author: "author", content: "Great point!",
    });
  });
});
