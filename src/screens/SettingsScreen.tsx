import React, { useEffect, useState } from "react";
import {
  IconBell,
  IconBrandGithub,
  IconCheck,
  IconX,
  IconLoader,
  IconDatabase,
  IconPlug,
  IconSettings,
  IconShield,
} from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useNotificationsStore } from "../stores/notificationsStore";
import { McpScreen } from "./McpScreen";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import * as ipc from "../lib/ipc";
import type { PolicyConfig, Project, ToolPolicy } from "../types";

type SettingsTab = "connections" | "notifications" | "policy" | "env";

export function SettingsScreen() {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("connections");
  const { currentProject } = useProjectStore();
  const { permissionStatus, requestPermission } = useNotificationsStore();
  const {
    theme,
    authStatus,
    authStatus2,
    clientId,
    clientSecret,
    anthropicApiKey,
    setTheme,
    fetchAuthStatus,
    startAuth,
    revokeAuth,
    setClientId,
    setClientSecret,
    setAnthropicApiKey,
    saveGithubCredentials,
    saveAnthropicKey,
    loadCredentials,
    listenAuthDone,
  } = useSettingsStore();

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [authStarted, setAuthStarted] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [indexResetting, setIndexResetting] = useState(false);
  const [indexResetMsg, setIndexResetMsg] = useState<string | null>(null);


  useEffect(() => {
    loadCredentials();
    if (!currentProject) return;
    fetchAuthStatus(currentProject.id);
    let cleanup: (() => void) | undefined;
    listenAuthDone(currentProject.id, (errMsg) => {
      setAuthStarted(false);
      setAuthError(errMsg ?? "認証に失敗しました");
    }).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [currentProject?.id]);

  const handleSaveCredentials = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      await saveGithubCredentials(currentProject?.id ?? 0);
      await saveAnthropicKey();
      setSavedMsg("保存しました");
      setTimeout(() => setSavedMsg(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleStartAuth = async () => {
    if (!currentProject) return;
    setAuthError(null);

    const { clientId: cid, clientSecret: cs } = useSettingsStore.getState();
    if (!cid || !cs) {
      setAuthError("先に「GitHub App 設定」で Client ID と Client Secret を入力して「設定を保存」してください。");
      return;
    }

    setAuthStarted(true);
    try {
      await startAuth(currentProject.id);
    } catch (e: unknown) {
      setAuthStarted(false);
      const msg = (e as { message?: string })?.message ?? String(e);
      setAuthError(msg);
    }
  };

  const handleIndexReset = async () => {
    if (!currentProject) return;
    if (!confirm("検索インデックスをリセットしますか？")) return;
    setIndexResetting(true);
    setIndexResetMsg(null);
    try {
      const count = await ipc.indexReset(currentProject.id);
      setIndexResetMsg(`${count} 件のドキュメントのインデックスをリセットしました`);
      setTimeout(() => setIndexResetMsg(null), 4000);
    } catch {
      setIndexResetMsg("リセットに失敗しました");
    } finally {
      setIndexResetting(false);
    }
  };

  const handleRevoke = async () => {
    if (!currentProject) return;
    if (!confirm("GitHub 認証を解除しますか？")) return;
    await revokeAuth(currentProject.id);
  };

  return (
    <div data-testid="settings-screen" className="flex-1 flex flex-col overflow-hidden">
      {/* タブバー */}
      <div className="flex gap-1 px-6 pt-6 pb-0 border-b border-border bg-background flex-shrink-0">
        <TabBtn
          active={settingsTab === "connections"}
          onClick={() => setSettingsTab("connections")}
          icon={<IconPlug size={14} />}
          label="接続"
        />
        <TabBtn
          active={settingsTab === "notifications"}
          onClick={() => setSettingsTab("notifications")}
          icon={<IconBell size={14} />}
          label="通知"
        />
        <TabBtn
          active={settingsTab === "policy"}
          onClick={() => setSettingsTab("policy")}
          icon={<IconShield size={14} />}
          label="ポリシー"
        />
        <TabBtn
          active={settingsTab === "env"}
          onClick={() => setSettingsTab("env")}
          icon={<IconSettings size={14} />}
          label="環境設定"
        />
      </div>

      {/* 接続タブ: MCP + GitHub */}
      {settingsTab === "connections" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* MCP section */}
          <McpScreen />

          {/* GitHub auth section - compact */}
          <div className="px-6 py-4 border-t border-border flex-shrink-0">
            <h2 className="text-[14px] font-semibold mb-3 text-secondary-foreground">GitHub App 設定</h2>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Client ID</label>
                <Input
                  type="password"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Ghid_..."
                  className="text-xs"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-muted-foreground mb-1">Client Secret</label>
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="..."
                  className="text-xs"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveCredentials} disabled={saving} size="sm">
                {saving ? "保存中…" : "設定を保存"}
              </Button>
              {savedMsg ? (
                <span className="text-green-400 text-sm flex items-center gap-1">
                  <IconCheck size={14} /> {savedMsg}
                </span>
              ) : null}
              {currentProject ? (
                authStatus2 === "loading" ? (
                  <span className="text-muted-foreground text-sm flex items-center gap-1"><IconLoader size={14} />確認中…</span>
                ) : authStatus?.connected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 text-sm flex items-center gap-1"><IconCheck size={14} />@{authStatus.user_login}</span>
                    <Button variant="destructive" size="sm" onClick={handleRevoke}><IconX size={12} /></Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {authError ? <span className="text-destructive text-xs">{authError}</span> : null}
                    <Button variant="outline" size="sm" onClick={handleStartAuth} disabled={authStarted} className="flex items-center gap-1">
                      <IconBrandGithub size={14} />
                      {authStarted ? "ブラウザで認証中…" : "GitHub で認証"}
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 通知タブ */}
      {settingsTab === "notifications" ? (
        <NotificationsTab permissionStatus={permissionStatus} onRequestPermission={requestPermission} />
      ) : null}

      {/* ポリシータブ */}
      {settingsTab === "policy" ? <PolicyTab projectPath={currentProject?.local_path ?? ""} /> : null}

      {/* 環境設定タブ */}
      {settingsTab === "env" ? (
        <EnvTab
          theme={theme}
          onThemeChange={setTheme}
          anthropicApiKey={anthropicApiKey}
          onApiKeyChange={setAnthropicApiKey}
          onSaveApiKey={saveAnthropicKey}
          currentProject={currentProject}
          onIndexReset={handleIndexReset}
          indexResetting={indexResetting}
          indexResetMsg={indexResetMsg}
        />
      ) : null}
    </div>
  );
}

// ─── Notifications tab ────────────────────────────────────────────────────────

interface CategoryToggle {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_CATEGORIES: CategoryToggle[] = [
  { id: "vulnerability", label: "脆弱性アラート", description: "依存パッケージの脆弱性を通知", enabled: true },
  { id: "agent",        label: "エージェントタスク", description: "AI タスク完了・承認リクエスト", enabled: true },
  { id: "doc_staleness", label: "設計書鮮度低下", description: "設計書のスコアが閾値を超えた時", enabled: true },
  { id: "github_event",  label: "GitHub イベント", description: "PR・Issue・CI 結果", enabled: true },
];

function NotificationsTab({
  permissionStatus,
  onRequestPermission,
}: {
  permissionStatus: string;
  onRequestPermission: () => void;
}) {
  const [categories, setCategories] = useState<CategoryToggle[]>(DEFAULT_CATEGORIES);

  const toggle = (id: string) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-[600px]">
      <h1 className="text-xl font-bold mb-6 text-foreground">通知設定</h1>

      {/* OS permission */}
      <section className="mb-6 pb-6 border-b border-border">
        <h2 className="text-[14px] font-semibold mb-3 text-secondary-foreground">OS 通知</h2>
        {permissionStatus === "granted" ? (
          <div className="flex items-center gap-1.5 text-green-400 text-sm">
            <IconCheck size={14} /> 通知が許可されています
          </div>
        ) : permissionStatus === "denied" ? (
          <div className="text-destructive text-sm">通知がブロックされています。システム設定から許可してください。</div>
        ) : (
          <Button variant="outline" size="sm" onClick={onRequestPermission} className="flex items-center gap-1.5">
            <IconBell size={14} /> 通知を許可する
          </Button>
        )}
      </section>

      {/* Category toggles */}
      <section>
        <h2 className="text-[14px] font-semibold mb-3 text-secondary-foreground">カテゴリ別配信設定</h2>
        <div className="flex flex-col gap-3">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-border">
              <div>
                <div className="text-sm font-medium text-foreground">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.description}</div>
              </div>
              <button
                onClick={() => toggle(c.id)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: c.enabled ? "#7c6af7" : "#2a2a3f",
                  border: "none",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: c.enabled ? 23 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    background: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Policy tab ───────────────────────────────────────────────────────────────

function PolicyTab({ projectPath }: { projectPath: string }) {
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectPath) return;
    setLoading(true);
    ipc.mcpGetPolicy(projectPath)
      .then((p) => setPolicy(p))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectPath]);

  const handleChange = async (newDefault: ToolPolicy) => {
    if (!policy || !projectPath) return;
    const updated = { ...policy, default_policy: newDefault };
    await ipc.mcpSavePolicy(projectPath, updated).catch(() => {});
    setPolicy(updated);
  };

  if (!projectPath) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-[600px]">
      <h1 className="text-xl font-bold mb-6 text-foreground">ポリシー設定</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Claude Code エージェントがツールを使用する際のアクセスポリシーを設定します。
      </p>

      {loading ? (
        <div className="text-muted-foreground text-sm">読み込み中...</div>
      ) : policy ? (
        <section className="mb-6 pb-6 border-b border-border">
          <h2 className="text-[14px] font-semibold mb-3 text-secondary-foreground">デフォルトポリシー</h2>
          <div className="flex gap-3">
            {(["allow", "require_approval", "deny"] as ToolPolicy[]).map((p) => (
              <button
                key={p}
                onClick={() => handleChange(p)}
                className={`px-4 py-2 rounded-md border text-sm transition-colors ${
                  policy.default_policy === p
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
                }`}
              >
                {p === "allow" ? "許可 (Allow)" : p === "require_approval" ? "承認必須 (Approval)" : "拒否 (Block)"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            「承認必須」に設定すると、エージェントがツールを実行する前にエージェント画面の「承認待ち」タブで確認が必要になります。
          </p>
        </section>
      ) : (
        <div className="text-muted-foreground text-sm">ポリシー設定を読み込めませんでした</div>
      )}
    </div>
  );
}

// ─── Env tab ──────────────────────────────────────────────────────────────────

interface EnvTabProps {
  theme: string;
  onThemeChange: (t: "system" | "light" | "dark") => void;
  anthropicApiKey: string;
  onApiKeyChange: (v: string) => void;
  onSaveApiKey: () => Promise<void>;
  currentProject: Project | null;
  onIndexReset: () => void;
  indexResetting: boolean;
  indexResetMsg: string | null;
}

function EnvTab({
  theme,
  onThemeChange,
  anthropicApiKey,
  onApiKeyChange,
  onSaveApiKey,
  currentProject,
  onIndexReset,
  indexResetting,
  indexResetMsg,
}: EnvTabProps) {
  const [sprintDays, setSprintDays] = useState(14);
  const [coverageTarget, setCoverageTarget] = useState(80);
  const [claudeCodePath, setClaudeCodePath] = useState("claude");
  const [keySaved, setKeySaved] = useState(false);

  const handleSaveApiKey = async () => {
    await onSaveApiKey();
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-[600px]">
      <h1 className="text-xl font-bold mb-6 text-foreground">環境設定</h1>

      {/* Theme */}
      <Section title="テーマ">
        <div className="flex gap-2">
          {(["system", "light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => onThemeChange(t)}
              className={`px-4 py-1.5 rounded-md border text-sm transition-colors ${
                theme === t
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
              }`}
            >
              {{ system: "システム", light: "ライト", dark: "ダーク" }[t]}
            </button>
          ))}
        </div>
      </Section>

      {/* Sprint duration */}
      <Section title="スプリント期間（日）">
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={sprintDays}
            onChange={(e) => setSprintDays(Number(e.target.value))}
            min={1}
            max={30}
            className="w-24 bg-secondary text-foreground border border-border rounded px-2 py-1 text-sm"
          />
          <span className="text-muted-foreground text-sm">日</span>
        </div>
      </Section>

      {/* Coverage target */}
      <Section title="カバレッジ目標 (%)">
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={coverageTarget}
            onChange={(e) => setCoverageTarget(Number(e.target.value))}
            min={0}
            max={100}
            className="w-24 bg-secondary text-foreground border border-border rounded px-2 py-1 text-sm"
          />
          <span className="text-muted-foreground text-sm">%</span>
        </div>
      </Section>

      {/* Claude Code path */}
      <Section title="Claude Code CLI パス">
        <Input
          value={claudeCodePath}
          onChange={(e) => setClaudeCodePath(e.target.value)}
          placeholder="claude"
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground mt-1">
          デフォルト: claude（PATH が通っている場合）
        </p>
      </Section>

      {/* Anthropic API key */}
      <Section title="Anthropic API キー">
        <div className="flex items-center gap-3">
          <Input
            type="password"
            value={anthropicApiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="sk-ant-..."
            className="max-w-xs"
          />
          <Button size="sm" onClick={handleSaveApiKey}>
            {keySaved ? "保存済み ✓" : "保存"}
          </Button>
        </div>
      </Section>

      {/* Index reset */}
      <Section title="検索インデックス">
        {!currentProject ? (
          <p className="text-muted-foreground text-sm">プロジェクトを選択してください</p>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onIndexReset}
              disabled={indexResetting}
              className="flex items-center gap-1.5"
            >
              <IconDatabase size={14} />
              {indexResetting ? "リセット中…" : "インデックスをリセット"}
            </Button>
            {indexResetMsg ? (
              <span className="text-green-400 text-sm">{indexResetMsg}</span>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-t-md border-b-2 transition-all ${
        active
          ? "border-primary text-primary font-semibold bg-secondary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-7 pb-7 border-b border-border ${className ?? ""}`}>
      <h2 className="text-[15px] font-semibold mb-3.5 text-secondary-foreground">{title}</h2>
      {children}
    </section>
  );
}

