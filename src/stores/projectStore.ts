import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type { AppError, AsyncStatus, Project, ProjectPatch, ProjectStatus } from "../types";
import { useDocumentStore } from "./documentStore";
import { useIssueStore } from "./issueStore";
import { usePrStore } from "./prStore";
import { useConflictStore } from "./conflictStore";
import { useSearchStore } from "./searchStore";
import { useTerminalStore } from "./terminalStore";
import { useNotificationsStore } from "./notificationsStore";
import { useUiStore } from "./uiStore";

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  currentStatus: ProjectStatus | null;
  listStatus: AsyncStatus;
  error: AppError | null;

  fetchProjects: () => Promise<void>;
  selectProject: (project: Project) => Promise<void>;
  createProject: (name: string, localPath: string) => Promise<void>;
  updateProject: (patch: ProjectPatch) => Promise<void>;
  deleteProject: (projectId: number) => Promise<void>;
  fetchStatus: (projectId: number) => Promise<void>;
  setLastOpenedDocument: (projectId: number, documentId: number | null) => Promise<void>;
  reset: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  currentStatus: null,
  listStatus: "idle",
  error: null,

  fetchProjects: async () => {
    set({ listStatus: "loading", error: null });
    try {
      const projects = await ipc.projectList();
      const current = get().currentProject;
      const updated = current
        ? (projects.find((p) => p.id === current.id) ?? null)
        : null;
      set({ projects, currentProject: updated, listStatus: "success" });
    } catch (e) {
      set({ listStatus: "error", error: e as AppError });
    }
  },

  selectProject: async (project) => {
    const prev = get().currentProject;

    // プロジェクト切替フラグ
    useUiStore.getState().setProjectSwitching(true);

    // 前のプロジェクトのポーリングを停止
    if (prev && prev.id !== project.id) {
      ipc.pollingStop(prev.id).catch(() => {});
    }

    // ドメインストアをリセット
    _resetDomainStores();

    set({ currentProject: project });

    // 新プロジェクトのポーリングを開始
    ipc.pollingStart(project.id).catch(() => {});

    // ステータス取得
    get().fetchStatus(project.id).catch(() => {});

    useUiStore.getState().setProjectSwitching(false);
  },

  createProject: async (name, localPath) => {
    set({ listStatus: "loading", error: null });
    try {
      const result = await ipc.projectCreate(name, localPath);
      set((s) => ({
        projects: [result.project, ...s.projects],
        currentProject: result.project,
        listStatus: "success",
      }));
    } catch (e) {
      set({ listStatus: "error", error: e as AppError });
      throw e;
    }
  },

  updateProject: async (patch) => {
    try {
      const updated = await ipc.projectUpdate(patch);
      set((s) => ({
        projects: s.projects.map((p) => (p.id === updated.id ? updated : p)),
        currentProject:
          s.currentProject?.id === updated.id ? updated : s.currentProject,
      }));
    } catch (e) {
      set({ error: e as AppError });
      throw e;
    }
  },

  deleteProject: async (projectId) => {
    try {
      await ipc.projectDelete(projectId);
      set((s) => ({
        projects: s.projects.filter((p) => p.id !== projectId),
        currentProject:
          s.currentProject?.id === projectId ? null : s.currentProject,
      }));
    } catch (e) {
      set({ error: e as AppError });
      throw e;
    }
  },

  fetchStatus: async (projectId) => {
    try {
      const status = await ipc.projectGetStatus(projectId);
      set({ currentStatus: status });
    } catch (e) {
      set({ error: e as AppError });
    }
  },

  setLastOpenedDocument: async (projectId, documentId) => {
    await ipc.projectSetLastOpenedDocument(projectId, documentId);
  },

  reset: () =>
    set({
      projects: [],
      currentProject: null,
      currentStatus: null,
      listStatus: "idle",
      error: null,
    }),
}));

/** プロジェクト切替時に全ドメインストアをリセットする */
function _resetDomainStores() {
  useDocumentStore.getState().reset();
  useIssueStore.getState().reset();
  usePrStore.getState().reset();
  useConflictStore.getState().reset();
  useSearchStore.getState().reset();
  useTerminalStore.getState().reset();
  useNotificationsStore.getState().reset();
}
