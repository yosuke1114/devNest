import { useCallback } from "react";
import {
  IconRefresh,
  IconPackage,
  IconAlertTriangle,
  IconTestPipe,
  IconRefreshDot,
  IconFileDescription,
} from "@tabler/icons-react";
import { useProjectStore } from "../stores/projectStore";
import { useMaintenanceStore } from "../stores/maintenanceStore";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import type {
  DependencyStatus,
  TechDebtItem,
  RefactorCandidate,
} from "../types";

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

function SeverityBadge({ sev }: { sev: string }) {
  const colors: Record<string, string> = {
    Critical: "bg-red-900/60 text-red-300 border-red-700",
    High: "bg-orange-900/60 text-orange-300 border-orange-700",
    Medium: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
    Low: "bg-zinc-800 text-zinc-400 border-zinc-700",
  };
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded border font-medium",
        colors[sev] ?? colors.Low
      )}
    >
      {sev}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  );
}

// ─── Dependencies パネル ───────────────────────────────────────────────────────

function DepsPanel() {
  const { depReport, depStatus } = useMaintenanceStore();

  if (depStatus === "idle") return <PanelEmpty>スキャン未実行</PanelEmpty>;
  if (depStatus === "loading") return <PanelLoading />;

  const deps = [...(depReport?.rust_deps ?? []), ...(depReport?.node_deps ?? [])];
  const outdated = deps.filter((d) => d.update_type !== "Unknown");
  const vulnerable = deps.filter((d) => d.has_vulnerability);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Outdated" value={depReport?.total_outdated ?? 0} accent="yellow" />
        <Stat label="Vulnerable" value={depReport?.total_vulnerable ?? 0} accent="red" />
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">
        Rust: {depReport?.rust_deps.length ?? 0} / Node: {depReport?.node_deps.length ?? 0} 件
      </div>
      {vulnerable.length > 0 && (
        <ul className="mt-1 space-y-1">
          {vulnerable.slice(0, 3).map((d) => (
            <DepRow key={d.name} dep={d} />
          ))}
        </ul>
      )}
      {outdated.length > 0 && vulnerable.length === 0 && (
        <ul className="mt-1 space-y-1">
          {outdated.slice(0, 3).map((d) => (
            <DepRow key={d.name} dep={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DepRow({ dep }: { dep: DependencyStatus }) {
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span className="flex-1 truncate text-foreground">{dep.name}</span>
      <span className="text-muted-foreground">{dep.current_version} → {dep.latest_version}</span>
      {dep.has_vulnerability && dep.vulnerability_severity && (
        <SeverityBadge sev={dep.vulnerability_severity} />
      )}
    </li>
  );
}

// ─── Tech Debt パネル ──────────────────────────────────────────────────────────

function DebtPanel() {
  const { debtReport, debtStatus } = useMaintenanceStore();

  if (debtStatus === "idle") return <PanelEmpty>スキャン未実行</PanelEmpty>;
  if (debtStatus === "loading") return <PanelLoading />;

  const critical = debtReport?.items.filter((i) => i.severity === "Critical" || i.severity === "High") ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Stat label="Score" value={debtReport?.total_score ?? 0} accent="yellow" />
        <Stat label="Items" value={debtReport?.items.length ?? 0} />
      </div>
      {debtReport && (
        <div className="text-[11px] text-muted-foreground">
          {Object.entries(debtReport.by_category).map(([k, v]) => (
            <span key={k} className="mr-3">{k}: {v}</span>
          ))}
        </div>
      )}
      {critical.length > 0 && (
        <ul className="mt-1 space-y-1">
          {critical.slice(0, 3).map((item) => (
            <DebtItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DebtItemRow({ item }: { item: TechDebtItem }) {
  return (
    <li className="text-[11px] flex items-start gap-2">
      <SeverityBadge sev={item.severity} />
      <span className="flex-1 truncate text-foreground">
        {item.file_path}{item.line ? `:${item.line}` : ""}
      </span>
    </li>
  );
}

// ─── Coverage パネル ───────────────────────────────────────────────────────────

function CoveragePanel() {
  const { coverageReport, coverageStatus } = useMaintenanceStore();

  if (coverageStatus === "idle") return <PanelEmpty>スキャン未実行</PanelEmpty>;
  if (coverageStatus === "loading") return <PanelLoading />;

  const pct = coverageReport?.overall_pct ?? 0;
  const barWidth = Math.round(pct);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-foreground">{pct.toFixed(1)}%</span>
        <span className="text-[11px] text-muted-foreground mb-1">overall</span>
      </div>
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {coverageReport?.rust_available ? "✓ Rust" : "✗ Rust"}{" "}
        {coverageReport?.node_available ? "✓ Node" : "✗ Node"}
        {" — "}
        {coverageReport?.files.length ?? 0} ファイル
      </div>
    </div>
  );
}

// ─── Refactor パネル ──────────────────────────────────────────────────────────

function RefactorPanel() {
  const { refactorCandidates, refactorStatus } = useMaintenanceStore();

  if (refactorStatus === "idle") return <PanelEmpty>スキャン未実行</PanelEmpty>;
  if (refactorStatus === "loading") return <PanelLoading />;

  return (
    <div className="flex flex-col gap-1">
      {refactorCandidates.length === 0 ? (
        <PanelEmpty>候補なし</PanelEmpty>
      ) : (
        <ul className="space-y-1">
          {refactorCandidates.slice(0, 8).map((c, i) => (
            <RefactorRow key={c.file_path} rank={i + 1} candidate={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RefactorRow({ rank, candidate }: { rank: number; candidate: RefactorCandidate }) {
  const impactColor =
    candidate.estimated_impact === "High"
      ? "text-red-400"
      : candidate.estimated_impact === "Medium"
      ? "text-yellow-400"
      : "text-muted-foreground";

  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span className="text-muted-foreground w-4 text-right">{rank}.</span>
      <span className="flex-1 truncate text-foreground">{candidate.file_path}</span>
      <span className={cn("font-mono tabular-nums", impactColor)}>
        {candidate.score.toFixed(2)}
      </span>
    </li>
  );
}

// ─── Doc Health バー ──────────────────────────────────────────────────────────

function DocHealthBar() {
  const { docStaleness, docStalenessStatus } = useMaintenanceStore();

  if (docStalenessStatus === "idle" || docStalenessStatus === "loading") {
    return null;
  }

  const current = docStaleness.filter((d) => d.staleness_score < 0.3).length;
  const outdated = docStaleness.filter((d) => d.staleness_score >= 0.3 && d.staleness_score < 0.7).length;
  const stale = docStaleness.filter((d) => d.staleness_score >= 0.7).length;

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border bg-card/50 text-[12px]">
      <span className="flex items-center gap-1 text-muted-foreground">
        <IconFileDescription size={13} />
        Doc Health
      </span>
      <span className="text-green-400">🟢 {current}</span>
      <span className="text-yellow-400">🟡 {outdated}</span>
      <span className="text-red-400">🔴 {stale}</span>
      <span className="text-muted-foreground text-[11px]">（doc-mapping より）</span>
    </div>
  );
}

// ─── 汎用サブコンポーネント ───────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: number; accent?: "yellow" | "red" }) {
  const color =
    accent === "red" && value > 0
      ? "text-red-400"
      : accent === "yellow" && value > 0
      ? "text-yellow-400"
      : "text-foreground";
  return (
    <div className="bg-secondary/50 rounded px-2 py-1.5">
      <div className={cn("text-lg font-bold", color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-muted-foreground">{children}</div>;
}

function PanelLoading() {
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
      <LoadingSpinner /> スキャン中…
    </div>
  );
}

function PanelCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── MaintenanceScreen ────────────────────────────────────────────────────────

export function MaintenanceScreen() {
  const currentProject = useProjectStore((s) => s.currentProject);
  const { scanAll, debtStatus, depStatus, coverageStatus, refactorStatus } = useMaintenanceStore();

  const isLoading =
    depStatus === "loading" ||
    debtStatus === "loading" ||
    coverageStatus === "loading" ||
    refactorStatus === "loading";

  const handleScanAll = useCallback(() => {
    if (currentProject) scanAll(currentProject.local_path);
  }, [currentProject, scanAll]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        プロジェクトを選択してください
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
        <span className="text-sm font-medium text-foreground flex-1">
          Maintenance Dashboard — {currentProject.name}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleScanAll}
          disabled={isLoading}
          className="h-7 px-3 text-xs gap-1.5"
        >
          {isLoading ? <LoadingSpinner /> : <IconRefresh size={12} />}
          全スキャン
        </Button>
      </div>

      {/* 4 パネル */}
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-4 content-start">
        <PanelCard title="Dependencies" icon={<IconPackage size={14} />}>
          <DepsPanel />
        </PanelCard>

        <PanelCard title="Test Coverage" icon={<IconTestPipe size={14} />}>
          <CoveragePanel />
        </PanelCard>

        <PanelCard title="Tech Debt" icon={<IconAlertTriangle size={14} />}>
          <DebtPanel />
        </PanelCard>

        <PanelCard title="Refactor Candidates" icon={<IconRefreshDot size={14} />}>
          <RefactorPanel />
        </PanelCard>
      </div>

      {/* Doc Health バー */}
      <DocHealthBar />
    </div>
  );
}
