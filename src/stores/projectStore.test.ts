import { beforeEach, describe, it, expect, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "./projectStore";
import type { Project, ProjectStatus } from "../types";

const mockInvoke = vi.mocked(invoke);

// テスト用プロジェクトファクトリ
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: "Test Project",
    repo_owner: "owner",
    repo_name: "repo",
    local_path: "/tmp/test",
    default_branch: "main",
    docs_root: "docs/",
    sync_mode: "manual",
    debounce_ms: 500,
    commit_msg_format: "docs: update {filename}",
    remote_poll_interval_min: 0,
    github_installation_id: null,
    last_opened_document_id: null,
    last_synced_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── projectStore ─────────────────────────────────────────────────────────────

describe("projectStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      currentStatus: null,
      listStatus: "idle",
      error: null,
    });
  });

  // 🔴 Red: 初期状態が正しいこと
  it("初期状態が正しい", () => {
    const state = useProjectStore.getState();
    expect(state.projects).toEqual([]);
    expect(state.currentProject).toBeNull();
    expect(state.listStatus).toBe("idle");
    expect(state.error).toBeNull();
  });

  // 🔴 Red: fetchProjects() が project_list を呼び出すこと
  it("fetchProjects() が invoke('project_list') を呼ぶ", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await useProjectStore.getState().fetchProjects();
    expect(mockInvoke).toHaveBeenCalledWith("project_list");
  });

  // 🔴 Red: fetchProjects() 成功時に projects が更新されること
  it("fetchProjects() 成功時に projects がセットされる", async () => {
    const projects = [makeProject({ id: 1 }), makeProject({ id: 2, name: "P2" })];
    mockInvoke.mockResolvedValueOnce(projects);

    await useProjectStore.getState().fetchProjects();

    expect(useProjectStore.getState().projects).toHaveLength(2);
    expect(useProjectStore.getState().listStatus).toBe("success");
  });

  // 🔴 Red: fetchProjects() 中は listStatus が "loading" になること
  it("fetchProjects() 呼び出し中に listStatus が 'loading' になる", async () => {
    let resolveInvoke!: (v: Project[]) => void;
    mockInvoke.mockReturnValueOnce(
      new Promise<Project[]>((res) => { resolveInvoke = res; })
    );

    const promise = useProjectStore.getState().fetchProjects();
    expect(useProjectStore.getState().listStatus).toBe("loading");

    resolveInvoke([]);
    await promise;
    expect(useProjectStore.getState().listStatus).toBe("success");
  });

  // 🔴 Red: fetchProjects() 失敗時に error がセットされること
  it("fetchProjects() 失敗時に error がセットされる", async () => {
    const err = { code: "Git", message: "not a git repo" };
    mockInvoke.mockRejectedValueOnce(err);

    await useProjectStore.getState().fetchProjects();

    expect(useProjectStore.getState().listStatus).toBe("error");
    expect(useProjectStore.getState().error).toEqual(err);
  });

  // 🔴 Red: selectProject() で currentProject が変わること
  it("selectProject() で currentProject がセットされる", () => {
    const project = makeProject();
    useProjectStore.getState().selectProject(project);
    expect(useProjectStore.getState().currentProject).toEqual(project);
  });

  // 🔴 Red: createProject() が project_create を呼び出すこと
  it("createProject() が invoke('project_create') を呼ぶ", async () => {
    const project = makeProject();
    mockInvoke.mockResolvedValueOnce({ project, document_count: 0 });

    await useProjectStore.getState().createProject("Test Project", "/tmp/test");

    expect(mockInvoke).toHaveBeenCalledWith(
      "project_create",
      expect.objectContaining({ name: "Test Project", localPath: "/tmp/test" })
    );
  });

  // 🔴 Red: createProject() 成功後に currentProject がセットされること
  it("createProject() 成功後に currentProject がセットされる", async () => {
    const project = makeProject({ id: 99, name: "New Project" });
    mockInvoke.mockResolvedValueOnce({ project, document_count: 0 });

    await useProjectStore.getState().createProject("New Project", "/tmp/new");

    expect(useProjectStore.getState().currentProject?.id).toBe(99);
    expect(useProjectStore.getState().projects).toHaveLength(1);
  });

  // 🔴 Red: deleteProject() が project_delete を呼び出すこと
  it("deleteProject() が invoke('project_delete') を呼ぶ", async () => {
    const project = makeProject({ id: 5 });
    useProjectStore.setState({ projects: [project], currentProject: project });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useProjectStore.getState().deleteProject(5);

    expect(mockInvoke).toHaveBeenCalledWith(
      "project_delete",
      expect.objectContaining({ projectId: 5 })
    );
  });

  // 🔴 Red: deleteProject() 後に projects から除去され currentProject が null になること
  it("deleteProject() 後に projects から除去される", async () => {
    const p1 = makeProject({ id: 1 });
    const p2 = makeProject({ id: 2, name: "P2" });
    useProjectStore.setState({ projects: [p1, p2], currentProject: p1 });
    mockInvoke.mockResolvedValueOnce(undefined);

    await useProjectStore.getState().deleteProject(1);

    expect(useProjectStore.getState().projects).toHaveLength(1);
    expect(useProjectStore.getState().projects[0].id).toBe(2);
    expect(useProjectStore.getState().currentProject).toBeNull();
  });

  // 🔴 Red: fetchProjects() が currentProject を最新データで更新すること
  it("fetchProjects() 後に currentProject が最新データに更新される", async () => {
    const old = makeProject({ name: "Old Name" });
    useProjectStore.setState({ currentProject: old });

    const updated = makeProject({ name: "Updated Name" });
    mockInvoke.mockResolvedValueOnce([updated]);

    await useProjectStore.getState().fetchProjects();

    expect(useProjectStore.getState().currentProject?.name).toBe("Updated Name");
  });

  // ─── updateProject ────────────────────────────────────────────────────────

  it("updateProject() が invoke('project_update') を呼ぶ", async () => {
    const project = makeProject({ id: 3 });
    useProjectStore.setState({ projects: [project], currentProject: project });
    const updated = makeProject({ id: 3, name: "Renamed" });
    mockInvoke.mockResolvedValueOnce(updated);

    await useProjectStore.getState().updateProject({ id: 3, name: "Renamed" });

    expect(mockInvoke).toHaveBeenCalledWith(
      "project_update",
      { patch: expect.objectContaining({ id: 3, name: "Renamed" }) }
    );
  });

  it("updateProject() 成功後に projects と currentProject が更新される", async () => {
    const project = makeProject({ id: 3, name: "Old" });
    useProjectStore.setState({ projects: [project], currentProject: project });
    const updated = makeProject({ id: 3, name: "New" });
    mockInvoke.mockResolvedValueOnce(updated);

    await useProjectStore.getState().updateProject({ id: 3, name: "New" });

    expect(useProjectStore.getState().projects[0].name).toBe("New");
    expect(useProjectStore.getState().currentProject?.name).toBe("New");
  });

  it("updateProject() 失敗時に error がセットされる", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("not found"));

    await expect(
      useProjectStore.getState().updateProject({ id: 99, name: "X" })
    ).rejects.toBeTruthy();

    expect(useProjectStore.getState().error).toBeTruthy();
  });

  // ─── fetchStatus ──────────────────────────────────────────────────────────

  it("fetchStatus() が invoke('project_get_status') を呼ぶ", async () => {
    const status: ProjectStatus = {
      id: 1, name: "P", local_path: "/tmp", issue_count: 5, open_issue_count: 3,
      document_count: 2, github_connected: true, last_synced_at: null,
    };
    mockInvoke.mockResolvedValueOnce(status);

    await useProjectStore.getState().fetchStatus(1);

    expect(mockInvoke).toHaveBeenCalledWith(
      "project_get_status",
      expect.objectContaining({ projectId: 1 })
    );
  });

  it("fetchStatus() 成功後に currentStatus がセットされる", async () => {
    const status: ProjectStatus = {
      id: 1, name: "P", local_path: "/tmp", issue_count: 5, open_issue_count: 3,
      document_count: 2, github_connected: true, last_synced_at: null,
    };
    mockInvoke.mockResolvedValueOnce(status);

    await useProjectStore.getState().fetchStatus(1);

    expect(useProjectStore.getState().currentStatus?.issue_count).toBe(5);
  });

  // ─── setLastOpenedDocument ────────────────────────────────────────────────

  it("setLastOpenedDocument() が invoke('project_set_last_opened_document') を呼ぶ", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useProjectStore.getState().setLastOpenedDocument(1, 42);

    expect(mockInvoke).toHaveBeenCalledWith(
      "project_set_last_opened_document",
      expect.objectContaining({ projectId: 1, documentId: 42 })
    );
  });

  it("setLastOpenedDocument() に null を渡せる", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useProjectStore.getState().setLastOpenedDocument(1, null);

    expect(mockInvoke).toHaveBeenCalledWith(
      "project_set_last_opened_document",
      expect.objectContaining({ projectId: 1, documentId: null })
    );
  });
});
