import { useEffect, useState } from "react";
import {
  IconBell,
  IconBrandGithub,
  IconCheck,
  IconX,
  IconLoader,
  IconDatabase,
} from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useNotificationsStore } from "../stores/notificationsStore";
import * as ipc from "../lib/ipc";

export function SettingsScreen() {
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
  const [indexResetting, setIndexResetting] = useState(false);
  const [indexResetMsg, setIndexResetMsg] = useState<string | null>(null);

  useEffect(() => {
    loadCredentials();
    if (currentProject) {
      fetchAuthStatus(currentProject.id);
      let cleanup: (() => void) | undefined;
      listenAuthDone(currentProject.id).then((fn) => {
        cleanup = fn;
      });
      return () => cleanup?.();
    }
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
    setAuthStarted(true);
    try {
      await startAuth(currentProject.id);
    } catch (e) {
      setAuthStarted(false);
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
    <div data-testid="settings-screen" style={{ padding: 32, maxWidth: 600, margin: "0 auto", overflowY: "auto", flex: 1 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>設定</h1>

      {/* テーマ */}
      <Section title="テーマ">
        <div style={{ display: "flex", gap: 8 }}>
          {(["system", "light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: theme === t ? "#7c6cf2" : "#3a3a52",
                background: theme === t ? "#7c6cf21a" : "transparent",
                color: theme === t ? "#7c6cf2" : "#aaa",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: theme === t ? 600 : 400,
              }}
            >
              {{ system: "システム", light: "ライト", dark: "ダーク" }[t]}
            </button>
          ))}
        </div>
      </Section>

      {/* API キー設定 */}
      <Section title="GitHub App 設定">
        <label style={labelStyle}>Client ID</label>
        <input
          type="password"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Ghid_..."
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>Client Secret</label>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="..."
          style={inputStyle}
        />
      </Section>

      <Section title="Anthropic API キー">
        <label style={labelStyle}>API Key</label>
        <input
          type="password"
          value={anthropicApiKey}
          onChange={(e) => setAnthropicApiKey(e.target.value)}
          placeholder="sk-ant-..."
          style={inputStyle}
        />
      </Section>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button
          onClick={handleSaveCredentials}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "保存中…" : "設定を保存"}
        </button>
        {savedMsg && (
          <span style={{ color: "#2ecc71", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
            <IconCheck size={14} />
            {savedMsg}
          </span>
        )}
      </div>

      {/* バックグラウンド同期 */}
      <Section title="バックグラウンド同期" style={{ marginTop: 32 }}>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
          GitHub の CI 結果・PR 更新を自動的にポーリングします。
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={async () => { if (currentProject) await ipc.pollingStart(currentProject.id); }} className="btn-secondary">
            有効にする
          </button>
          <button onClick={async () => { if (currentProject) await ipc.pollingStop(currentProject.id); }} className="btn-secondary">
            無効にする
          </button>
        </div>
      </Section>

      {/* OS 通知 */}
      <Section title="OS 通知" style={{ marginTop: 32 }}>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 12 }}>
          CI 結果・PR コメント・Conflict などをリアルタイムで OS 通知として受け取れます。
        </p>
        {permissionStatus === "granted" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#2ecc71", fontSize: 13 }}>
            <IconCheck size={14} /> 通知が許可されています
          </div>
        ) : permissionStatus === "denied" ? (
          <div style={{ color: "#e74c3c", fontSize: 13 }}>
            通知がブロックされています。システム設定から許可してください。
          </div>
        ) : (
          <button
            onClick={requestPermission}
            className="btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconBell size={14} /> ALLOW NOTIFICATIONS
          </button>
        )}
      </Section>

      {/* 検索インデックス */}
      <Section title="検索インデックス" style={{ marginTop: 32 }}>
        {!currentProject ? (
          <p style={{ color: "#888", fontSize: 14 }}>
            プロジェクトを選択してください
          </p>
        ) : (
          <div>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
              検索インデックスをリセットすると、次回のインデックス構築時に再作成されます。
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={handleIndexReset}
                disabled={indexResetting}
                className="btn-secondary"
              >
                <IconDatabase size={15} />
                {indexResetting ? "リセット中…" : "インデックスをリセット"}
              </button>
              {indexResetMsg && (
                <span style={{ color: "#2ecc71", fontSize: 13 }}>
                  {indexResetMsg}
                </span>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* GitHub 認証 */}
      <Section title="GitHub 認証" style={{ marginTop: 32 }}>
        {!currentProject ? (
          <p style={{ color: "#888", fontSize: 14 }}>
            プロジェクトを選択してください
          </p>
        ) : authStatus2 === "loading" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#888" }}>
            <IconLoader size={16} />
            確認中…
          </div>
        ) : authStatus?.connected ? (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                background: "#1a2a1a",
                border: "1px solid #2ecc71",
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              {authStatus.avatar_url && (
                <img
                  src={authStatus.avatar_url}
                  alt=""
                  style={{ width: 32, height: 32, borderRadius: "50%" }}
                />
              )}
              <div>
                <div style={{ color: "#2ecc71", fontWeight: 600, fontSize: 14 }}>
                  <IconCheck size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                  接続済み
                </div>
                <div style={{ color: "#aaa", fontSize: 13 }}>
                  @{authStatus.user_login}
                </div>
              </div>
            </div>
            <button onClick={handleRevoke} className="btn-danger">
              <IconX size={14} />
              認証を解除
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
              GitHub と連携することで Issue の同期・作成が可能になります。
            </p>
            <button
              onClick={handleStartAuth}
              disabled={authStarted}
              className="btn-secondary"
            >
              <IconBrandGithub size={16} />
              {authStarted ? "ブラウザで認証を完了してください…" : "GitHub で認証する"}
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section
      style={{
        marginBottom: 28,
        paddingBottom: 28,
        borderBottom: "1px solid #2a2a3a",
        ...style,
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: "#c0c0d0" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#888",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1a2e",
  border: "1px solid #3a3a52",
  borderRadius: 6,
  padding: "8px 12px",
  color: "#e0e0e0",
  fontSize: 14,
  boxSizing: "border-box",
};
