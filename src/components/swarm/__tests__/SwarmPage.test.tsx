import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));

// SwarmScreen をモック（タブUI全体をシンプルに差し替え）
vi.mock("../SwarmScreen", () => ({
  SwarmScreen: ({ workingDir }: { workingDir: string }) => (
    <div data-testid="swarm-screen" data-dir={workingDir}>SwarmScreen</div>
  ),
}));

import { SwarmPage } from "../SwarmPage";
import { useProjectStore } from "../../../stores/projectStore";
import type { Project } from "../../../types";

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 1,
  name: "TestProject",
  repo_owner: "owner",
  repo_name: "repo",
  local_path: "/home/user/project",
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
});

describe("SwarmPage", () => {
  it("swarm-page が表示される", () => {
    useProjectStore.setState({ currentProject: null });
    render(<SwarmPage />);
    expect(screen.getByTestId("swarm-page")).toBeTruthy();
  });

  it("ヘッダーに 'DevNest Swarm' が表示される", () => {
    useProjectStore.setState({ currentProject: null });
    render(<SwarmPage />);
    expect(screen.getByText("DevNest Swarm")).toBeTruthy();
  });

  it("SwarmScreen が表示される", () => {
    useProjectStore.setState({ currentProject: null });
    render(<SwarmPage />);
    expect(screen.getByTestId("swarm-screen")).toBeTruthy();
  });

  it("currentProject が null のとき workingDir が '/' になる", () => {
    useProjectStore.setState({ currentProject: null });
    render(<SwarmPage />);
    expect(screen.getByTestId("swarm-screen").getAttribute("data-dir")).toBe("/");
  });

  it("currentProject が設定されているとき local_path が workingDir になる", () => {
    useProjectStore.setState({ currentProject: makeProject({ local_path: "/home/user/project" }) });
    render(<SwarmPage />);
    expect(screen.getByTestId("swarm-screen").getAttribute("data-dir")).toBe("/home/user/project");
  });

  it("currentProject があるとき local_path がヘッダーに表示される", () => {
    useProjectStore.setState({ currentProject: makeProject({ local_path: "/workspace/myapp" }) });
    render(<SwarmPage />);
    expect(screen.getByText("/workspace/myapp")).toBeTruthy();
  });

  it("currentProject が null のとき local_path は表示されない", () => {
    useProjectStore.setState({ currentProject: null });
    render(<SwarmPage />);
    expect(screen.queryByText("/home/user/project")).toBeNull();
  });

  it("ヘッダーに Phase 12 バッジが表示される", () => {
    useProjectStore.setState({ currentProject: null });
    render(<SwarmPage />);
    expect(screen.getByText("Phase 12")).toBeTruthy();
  });
});
