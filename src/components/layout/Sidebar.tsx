import React, { memo, useCallback, useState } from "react";
import {
  IconAlertTriangle,
  IconBrandGithub,
  IconChartBar,
  IconChevronRight,
  IconCircleDot,
  IconFileText,
  IconGitPullRequest,
  IconLayoutGrid,
  IconLayoutKanban,
  IconRefresh,
  IconRobot,
  IconSettings,
} from "@tabler/icons-react";
import { useProjectStore } from "../../stores/projectStore";
import { useUiStore } from "../../stores/uiStore";
import { usePrStore } from "../../stores/prStore";
import { useRingNotification } from "../../hooks/useRingNotification";
import { RingIndicator } from "../shared/RingIndicator";
import type { ScreenName } from "../../types";

// ─── SidebarSubItem ──────────────────────────────────────────────────────────

interface SubItemProps {
  screen: ScreenName;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: (screen: ScreenName) => void;
}

const SidebarSubItem = memo(function SidebarSubItem({
  screen,
  label,
  icon,
  active,
  onClick,
}: SubItemProps) {
  const handleClick = useCallback(() => onClick(screen), [onClick, screen]);

  return (
    <button
      data-testid={`nav-${screen}`}
      onClick={handleClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 12px 6px 36px",
        background: active ? "#1e1e32" : "transparent",
        border: "none",
        borderLeft: active ? "2px solid #7c6af7" : "2px solid transparent",
        color: active ? "#7c6af7" : "#888",
        cursor: "pointer",
        fontSize: 13,
        textAlign: "left",
        transition: "all 0.1s",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#1e1e2a";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <span style={{ color: active ? "#7c6af7" : "#666" }}>{icon}</span>
      {label}
    </button>
  );
});

// ─── SidebarItem ─────────────────────────────────────────────────────────────

interface SidebarItemProps {
  screen?: ScreenName;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  expandable?: boolean;
  expanded?: boolean;
  onClick: () => void;
}

const SidebarItem = memo(function SidebarItem({
  label,
  icon,
  active,
  badge,
  expandable,
  expanded,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 12px",
        background: active ? "#1e1e32" : "transparent",
        border: "none",
        borderLeft: active ? "2px solid #7c6af7" : "2px solid transparent",
        color: active ? "#e0e0e0" : "#aaa",
        cursor: "pointer",
        fontSize: 14,
        textAlign: "left",
        transition: "all 0.1s",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#1e1e2a";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <span style={{ color: active ? "#7c6af7" : "#777", flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontWeight: active ? 600 : 400 }}>{label}</span>
      {badge != null && badge > 0 ? (
        <span
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: "#7c6af7",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      {expandable ? (
        <IconChevronRight
          size={14}
          style={{
            color: "#555",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            flexShrink: 0,
          }}
        />
      ) : null}
    </button>
  );
});

// ─── SectionHeader ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: "#555",
        textTransform: "uppercase",
        letterSpacing: 0.8,
        padding: "12px 12px 4px",
      }}
    >
      {label}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const { currentScreen, navigate } = useUiStore();
  const { projects, currentProject, selectProject } = useProjectStore();
  const openPRsCount = usePrStore((s) =>
    s.prs.filter((pr) => pr.state === "open").length
  );

  const { rings } = useRingNotification();
  const agentRingUrgency = rings.find(r => r.event.type === "agentAttention")?.event.urgency ?? null;
  const githubRingUrgency = rings.find(r => r.event.type === "gitHubEvent")?.event.urgency ?? null;

  const [githubOpen, setGithubOpen] = useState(
    () => ["issues", "pr", "conflict"].includes(currentScreen)
  );
  const [docsOpen, setDocsOpen] = useState(
    () => ["editor", "docs-freshness"].includes(currentScreen)
  );

  const handleNavigate = useCallback(
    (screen: ScreenName) => {
      navigate(screen);
    },
    [navigate]
  );

  const handleToggleGithub = useCallback(() => {
    setGithubOpen((prev) => !prev);
  }, []);

  const handleToggleDocs = useCallback(() => {
    setDocsOpen((prev) => !prev);
  }, []);

  // Determine parent-active states
  const githubChildActive = ["issues", "pr", "conflict"].includes(currentScreen);
  const docsChildActive = ["editor", "docs-freshness"].includes(currentScreen);

  return (
    <aside
      style={{
        width: 200,
        flexShrink: 0,
        background: "#13131f",
        borderRight: "1px solid #2a2a3f",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      {/* Project label */}
      <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: 0.8 }}>
        PROJECT
      </div>

      {/* Product switcher */}
      <div style={{ padding: "0 10px 8px", borderBottom: "1px solid #2a2a3f" }}>
        {projects.length === 0 ? (
          <button
            onClick={() => navigate("setup")}
            style={{
              width: "100%",
              padding: "6px 10px",
              background: "#7c6af7",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            + プロジェクト追加
          </button>
        ) : (
          <select
            value={currentProject?.id ?? ""}
            onChange={(e) => {
              const p = projects.find((proj) => proj.id === Number(e.target.value));
              if (p) selectProject(p);
            }}
            style={{
              width: "100%",
              background: "#1e1e32",
              border: "1px solid #2a2a3f",
              borderRadius: 6,
              color: "#e0e0e0",
              padding: "5px 8px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {/* プロジェクト */}
        <div style={{ padding: "8px 0 4px" }}>
          <SidebarItem
            screen="project"
            label="プロジェクト"
            icon={<IconLayoutKanban size={18} />}
            active={currentScreen === "project"}
            onClick={() => handleNavigate("project")}
          />
        </div>

        {/* ── 開発 ── */}
        <SectionHeader label="開発" />

        {/* GitHub (expandable) */}
        <RingIndicator urgency={githubRingUrgency}>
          <SidebarItem
            label="GitHub"
            icon={<IconBrandGithub size={18} />}
            active={githubChildActive && !githubOpen}
            badge={openPRsCount > 0 ? openPRsCount : undefined}
            expandable
            expanded={githubOpen}
            onClick={handleToggleGithub}
          />
        </RingIndicator>
        {githubOpen ? (
          <>
            <SidebarSubItem
              screen="issues"
              label="Issues"
              icon={<IconCircleDot size={14} />}
              active={currentScreen === "issues"}
              onClick={handleNavigate}
            />
            <SidebarSubItem
              screen="pr"
              label="Pull Requests"
              icon={<IconGitPullRequest size={14} />}
              active={currentScreen === "pr"}
              onClick={handleNavigate}
            />
            <SidebarSubItem
              screen="conflict"
              label="コンフリクト"
              icon={<IconAlertTriangle size={14} />}
              active={currentScreen === "conflict"}
              onClick={handleNavigate}
            />
          </>
        ) : null}

        {/* 設計書 (expandable) */}
        <SidebarItem
          label="設計書"
          icon={<IconFileText size={18} />}
          active={docsChildActive && !docsOpen}
          expandable
          expanded={docsOpen}
          onClick={handleToggleDocs}
        />
        {docsOpen ? (
          <>
            <SidebarSubItem
              screen="editor"
              label="一覧"
              icon={<IconFileText size={14} />}
              active={currentScreen === "editor"}
              onClick={handleNavigate}
            />
            <SidebarSubItem
              screen="docs-freshness"
              label="鮮度マップ"
              icon={<IconRefresh size={14} />}
              active={currentScreen === "docs-freshness"}
              onClick={handleNavigate}
            />
          </>
        ) : null}

        {/* ── 管理 ── */}
        <SectionHeader label="管理" />

        <RingIndicator urgency={agentRingUrgency}>
          <SidebarItem
            screen="swarm"
            label="Swarm"
            icon={<IconLayoutGrid size={18} />}
            active={currentScreen === "swarm"}
            onClick={() => handleNavigate("swarm")}
          />
        </RingIndicator>
        <SidebarItem
          screen="agent"
          label="エージェント"
          icon={<IconRobot size={18} />}
          active={currentScreen === "agent"}
          onClick={() => handleNavigate("agent")}
        />
        <SidebarItem
          screen="sprint"
          label="スプリント"
          icon={<IconChartBar size={18} />}
          active={currentScreen === "sprint"}
          onClick={() => handleNavigate("sprint")}
        />
      </nav>

      {/* Bottom: Settings */}
      <div style={{ borderTop: "1px solid #2a2a3f", flexShrink: 0 }}>
        <SidebarItem
          screen="settings"
          label="設定"
          icon={<IconSettings size={18} />}
          active={currentScreen === "settings"}
          onClick={() => handleNavigate("settings")}
        />
      </div>
    </aside>
  );
}
