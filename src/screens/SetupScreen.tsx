import { useEffect, useRef, useState } from "react";
import {
  IconFolder,
  IconPlus,
  IconTrash,
  IconCheck,
  IconChevronRight,
  IconChevronLeft,
  IconDatabase,
} from "@tabler/icons-react";
import { listen } from "@tauri-apps/api/event";
import { useProjectStore } from "../stores/projectStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useNotificationsStore } from "../stores/notificationsStore";
import { useUiStore } from "../stores/uiStore";
import { SetupStepDots } from "../components/shared/SetupStepDots";
import { FilePicker } from "../components/shared/FilePicker";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import * as ipc from "../lib/ipc";
import type { Project } from "../types";

// ─── ステップ定義 ──────────────────────────────────────────────────────────────

const STEP_LABELS = ["Project", "GitHub", "Sync", "Index", "Notify", "Done"];
const TOTAL_STEPS = STEP_LABELS.length;

// ─── ステップ 0: Project ───────────────────────────────────────────────────────

function Step0Project({
  onNext,
}: {
  onNext: (name: string, localPath: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!name.trim() || !localPath.trim()) {
      setError("プロジェクト名とパスを入力してください");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onNext(name.trim(), localPath.trim());
    } catch (e) {
      const err = e as { message?: string };
      setError(err.message ?? "プロジェクト作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-muted-foreground mb-1">プロジェクト名</label>
        <Input
          data-testid="setup-project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="MyApp"
        />
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1">
          ローカルパス（git リポジトリルート）
        </label>
        <div className="flex gap-2">
          <Input
            data-testid="setup-local-dir"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="/Users/you/projects/myapp"
            className="flex-1"
          />
          <FilePicker
            directory
            onPick={setLocalPath}
            label="選択"
          />
        </div>
      </div>
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/40 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex justify-end pt-2">
        <Button
          data-testid="setup-next"
          onClick={handleNext}
          disabled={loading || !name.trim() || !localPath.trim()}
        >
          {loading ? "作成中…" : "NEXT"}
          <IconChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}

// ─── ステップ 1: GitHub ───────────────────────────────────────────────────────

function Step1GitHub({
  projectId,
  onNext,
  onBack,
}: {
  projectId: number;
  onNext: () => void;
  onBack: () => void;
}) {
  const { authStatus, authStatus2, startAuth, fetchAuthStatus } = useSettingsStore();
  const [authError, setAuthError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchAuthStatus(projectId);
  }, [projectId]);

  const connected = authStatus?.connected;

  const handleConnect = async () => {
    setAuthError(null);
    setConnecting(true);
    try {
      await startAuth(projectId);
    } catch (e) {
      const err = e as { message?: string };
      setAuthError(err.message ?? "GitHub 認証の開始に失敗しました");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        GitHub と接続して PR・Issue 同期を有効にします。スキップして後から Settings で設定できます。
      </p>

      {authStatus2 === "loading" ? (
        <div className="text-xs text-muted-foreground">確認中…</div>
      ) : connected ? (
        <div data-testid="setup-github-status" className="flex items-center gap-2 p-3 rounded-lg border border-green-700/50 bg-green-900/20">
          <IconCheck size={16} className="text-green-400" />
          <div>
            <div className="text-sm font-medium text-green-300">接続済み</div>
            {authStatus?.user_login && (
              <div className="text-xs text-muted-foreground">@{authStatus.user_login}</div>
            )}
          </div>
        </div>
      ) : (
        <Button
          data-testid="setup-connect-github"
          variant="outline"
          onClick={handleConnect}
          disabled={connecting}
        >
          {connecting ? "開始中…" : "CONNECT WITH GITHUB"}
        </Button>
      )}

      {authError && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/40 rounded-md px-3 py-2">
          {authError}
        </p>
      )}

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={connected ? "NEXT" : "SKIP"} />
    </div>
  );
}

// ─── ステップ 2: Sync ─────────────────────────────────────────────────────────

function Step2Sync({
  onNext,
  onBack,
}: {
  onNext: (syncMode: string, policy: string) => void;
  onBack: () => void;
}) {
  const [syncMode, setSyncMode] = useState<"auto" | "manual">("auto");
  const [policy, setPolicy] = useState<"separate" | "direct">("separate");

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-muted-foreground mb-2">保存時の同期モード</label>
        <div className="flex gap-2">
          {(["auto", "manual"] as const).map((m) => (
            <button
              key={m}
              data-testid={`setup-sync-${m}`}
              onClick={() => setSyncMode(m)}
              className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                syncMode === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
              }`}
            >
              {m === "auto" ? "Auto（保存時自動コミット）" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-muted-foreground mb-2">AI 編集ポリシー</label>
        <div className="flex gap-2">
          {(["separate", "direct"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPolicy(p)}
              className={`px-4 py-2 rounded-md text-sm border transition-colors ${
                policy === p
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:bg-secondary"
              }`}
            >
              {p === "separate" ? "別ブランチ + PR レビュー" : "直接コミット"}
            </button>
          ))}
        </div>
      </div>

      <NavButtons onBack={onBack} onNext={() => onNext(syncMode, policy)} />
    </div>
  );
}

// ─── ステップ 3: Index ────────────────────────────────────────────────────────

function Step3Index({
  projectId,
  onNext,
  onBack,
}: {
  projectId: number;
  onNext: () => void;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState<{ done: number; total: number; currentPath?: string } | null>(null);
  const [indexed, setIndexed] = useState<number | null>(null);
  const unlistenRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    const setupListeners = async () => {
      const unlisten1 = await listen<{ done: number; total: number; current_path?: string }>(
        "index_progress",
        (e) => setProgress({ done: e.payload.done, total: e.payload.total, currentPath: e.payload.current_path })
      );
      const unlisten2 = await listen<{ project_id: number; indexed: number }>(
        "index_done",
        (e) => {
          setIndexed(e.payload.indexed);
          setStatus("done");
        }
      );
      unlistenRef.current = [unlisten1, unlisten2];
    };
    setupListeners();
    return () => unlistenRef.current.forEach((u) => u());
  }, []);

  const handleBuild = async () => {
    if (!projectId) return;
    setStatus("running");
    setProgress(null);
    try {
      await ipc.indexBuild(projectId);
    } catch (e) {
      setStatus("error");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        設計書をインデックス化すると AI Issue 作成時にコンテキスト検索が利用できます。
        後から Settings でも実行できます。
      </p>

      {status === "idle" && (
        <Button
          data-testid="setup-build-index"
          onClick={handleBuild}
        >
          <IconDatabase size={15} />
          BUILD INDEX
        </Button>
      )}

      {status === "running" && (
        <div data-testid="setup-index-status" className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-primary">
            <IconDatabase size={15} className="animate-pulse" />
            インデックス構築中…
          </div>
          {progress && (
            <>
              <div className="w-full bg-secondary rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all"
                  style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {progress.done}/{progress.total}{progress.currentPath ? ` — ${progress.currentPath}` : ""}
              </p>
            </>
          )}
        </div>
      )}

      {status === "done" && (
        <div data-testid="setup-index-status" className="flex items-center gap-2 p-3 rounded-lg border border-green-700/50 bg-green-900/20">
          <IconCheck size={16} className="text-green-400" />
          <span className="text-sm text-green-300">{indexed} ファイルをインデックス化しました</span>
        </div>
      )}

      {status === "error" && (
        <p className="text-xs text-destructive">インデックス構築に失敗しました。後から Settings で再試行できます。</p>
      )}

      <NavButtons
        onBack={onBack}
        onNext={onNext}
        nextLabel={status === "done" ? "NEXT" : "SKIP"}
      />
    </div>
  );
}

// ─── ステップ 4: Notify ───────────────────────────────────────────────────────

function Step4Notify({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const { requestPermission, permissionStatus } = useNotificationsStore();
  const granted = permissionStatus === "granted";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        CI 結果・PR コメント・コンフリクト検知を OS 通知で受け取れます。
      </p>

      {granted ? (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-green-700/50 bg-green-900/20">
          <IconCheck size={16} className="text-green-400" />
          <span className="text-sm text-green-300">通知が許可されています</span>
        </div>
      ) : (
        <Button variant="outline" onClick={requestPermission}>
          🔔 ALLOW NOTIFICATIONS
        </Button>
      )}

      <NavButtons onBack={onBack} onNext={onNext} nextLabel={granted ? "NEXT" : "SKIP"} />
    </div>
  );
}

// ─── ステップ 5: Done ─────────────────────────────────────────────────────────

function Step5Done({
  projectName,
  onFinish,
}: {
  projectName: string;
  onFinish: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="text-4xl">🎉</div>
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-1">{projectName} を登録しました</h3>
        <p className="text-sm text-muted-foreground">DevNest でプロジェクト管理を始めましょう。</p>
      </div>
      <Button
        data-testid="setup-open-editor"
        onClick={onFinish}
        size="lg"
        className="mx-auto"
      >
        OPEN EDITOR <IconChevronRight size={16} />
      </Button>
    </div>
  );
}

// ─── NavButtons ────────────────────────────────────────────────────────────────

function NavButtons({
  onBack,
  onNext,
  nextLabel = "NEXT",
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <Button
          data-testid="setup-back"
          variant="ghost"
          size="sm"
          onClick={onBack}
        >
          <IconChevronLeft size={15} /> BACK
        </Button>
      ) : (
        <div />
      )}
      <Button onClick={onNext} size="sm">
        {nextLabel} <IconChevronRight size={15} />
      </Button>
    </div>
  );
}

// ─── Wizard ────────────────────────────────────────────────────────────────────

function SetupWizard({ onCancel }: { onCancel?: () => void }) {
  const { createProject, currentProject, updateProject } = useProjectStore();
  const { navigate } = useUiStore();

  const [step, setStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [projectName, setProjectName] = useState("");

  const advance = (from: number) => {
    setCompletedSteps((prev) => Array.from(new Set([...prev, from])));
    setStep(from + 1);
  };

  const handleStep0 = async (name: string, localPath: string) => {
    await createProject(name, localPath);
    setProjectName(name);
    advance(0);
  };

  const handleStep2 = async (syncMode: string, _policy: string) => {
    if (currentProject) {
      try {
        await updateProject({
          id: currentProject.id,
          sync_mode: syncMode as "auto" | "manual",
        });
      } catch (e) {
        console.error("sync mode update failed:", e);
      }
    }
    advance(2);
  };

  const projectId = currentProject?.id ?? 0;

  return (
    <div data-testid="setup-screen" className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        {/* ヘッダー */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-1">新規プロジェクト</h1>
          <p className="text-sm text-muted-foreground">{STEP_LABELS[step]}</p>
        </div>

        {/* ステップドット */}
        <SetupStepDots
          totalSteps={TOTAL_STEPS}
          currentStep={step}
          completedSteps={completedSteps}
          onGoTo={setStep}
        />

        {/* ステップコンテンツ */}
        <div className="bg-card border border-border rounded-xl p-6 mt-4">
          {step === 0 && <Step0Project onNext={handleStep0} />}
          {step === 1 && (
            <Step1GitHub
              projectId={projectId}
              onNext={() => advance(1)}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <Step2Sync
              onNext={handleStep2}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step3Index projectId={projectId} onNext={() => advance(3)} onBack={() => setStep(2)} />
          )}
          {step === 4 && (
            <Step4Notify onNext={() => advance(4)} onBack={() => setStep(3)} />
          )}
          {step === 5 && (
            <Step5Done
              projectName={projectName}
              onFinish={() => navigate("editor")}
            />
          )}
        </div>

        {/* キャンセル */}
        {onCancel && step < 5 && (
          <div className="text-center mt-4">
            <button
              onClick={onCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SetupScreen ───────────────────────────────────────────────────────────────

export function SetupScreen() {
  const { projects, currentProject, deleteProject, selectProject } = useProjectStore();
  const { navigate } = useUiStore();

  const [mode, setMode] = useState<"list" | "wizard">(
    projects.length === 0 ? "wizard" : "list"
  );

  const handleSelect = (p: Project) => {
    selectProject(p);
    navigate("editor");
  };

  const handleDelete = async (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${p.name}" を削除しますか？`)) return;
    await deleteProject(p.id);
  };

  if (mode === "wizard") {
    return (
      <SetupWizard
        onCancel={projects.length > 0 ? () => setMode("list") : undefined}
      />
    );
  }

  return (
    <div data-testid="setup-screen" className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-foreground mb-2">プロジェクト管理</h1>
        <p className="text-sm text-muted-foreground mb-8">
          ローカルの git リポジトリを DevNest に登録します。
        </p>

        {/* 登録済みプロジェクト一覧 */}
        <div className="space-y-2 mb-6">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => handleSelect(p)}
              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                currentProject?.id === p.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:bg-secondary"
              }`}
            >
              <IconFolder size={20} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground truncate">{p.local_path}</div>
              </div>
              <button
                onClick={(e) => handleDelete(p, e)}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))}
        </div>

        {/* 新規追加ボタン */}
        <button
          onClick={() => setMode("wizard")}
          className="flex items-center gap-2 w-full p-4 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
        >
          <IconPlus size={16} />
          新規プロジェクトを追加
        </button>
      </div>
    </div>
  );
}
