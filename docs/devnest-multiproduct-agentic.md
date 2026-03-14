# DevNest マルチプロダクト管理 & Agentic Flow 設計書

## 1. 概要

DevNestを「すべてのプロジェクトを横断管理する開発ハブ」として機能させるための
マルチプロダクト切り替え機構と、プロダクト横断で自動保守を実行する
Agentic Flowエンジンを設計する。

### 設計思想

```
DevNest = 開発ポートフォリオマネージャー
         + プロダクト別コンテキストスイッチャー
         + 自律型保守エージェント
```

### 前提ドキュメント
- [ドキュメント↔ソース マッピング構造 設計書](./doc-mapping-design.md)
- [プロダクト保守戦略 設計書](./devnest-maintenance-strategy.md)

---

# Part A: マルチプロダクト管理

## 2. プロダクトレジストリ

### 2.1 GitHub連携による動的取得

DevNestはGitHub APIを通じてユーザーのリポジトリを動的に取得し、
プロダクトとして登録する。手動登録も可能。

```
┌──────────────────────────────────────────────────┐
│ DevNest起動時 / 手動リフレッシュ時                  │
│                                                  │
│  ┌──────────┐    ┌──────────────┐                │
│  │ GitHub   │───▶│ repos一覧    │                │
│  │ API      │    │ 取得         │                │
│  └──────────┘    └──────┬───────┘                │
│                         │                        │
│                         ▼                        │
│              ┌─────────────────────┐             │
│              │ フィルタ & 分類       │             │
│              │                     │             │
│              │ - owner/org で分類  │             │
│              │ - language 検出     │             │
│              │ - activity 判定    │             │
│              │ - .devnest.yaml    │             │
│              │   の有無を確認      │             │
│              └──────────┬──────────┘             │
│                         │                        │
│                         ▼                        │
│              ┌─────────────────────┐             │
│              │ Product Registry    │             │
│              │ (ローカルDB/JSON)   │             │
│              └─────────────────────┘             │
└──────────────────────────────────────────────────┘
```

### 2.2 プロダクトプロファイル

各プロダクトは以下の情報を持つ。リポジトリのルートに `.devnest.yaml` を
置くことで、DevNest固有の設定を宣言できる。

```yaml
# .devnest.yaml（リポジトリルートに配置）
product:
  name: "DevNest"
  category: personal             # personal | work | oss
  description: "Tauri v2 開発管理ハブ"
  priority: high                 # high | medium | low | archived

tech_stack:
  languages: [rust, typescript]
  framework: tauri-v2
  package_managers: [cargo, pnpm]
  test_runners:
    rust: cargo-tarpaulin
    typescript: vitest

docs:
  root: "docs/"
  mapping_enabled: true          # doc-map機能を使うか
  frontmatter_format: yaml

maintenance:
  dependency_scan: true
  coverage_tracking: true
  debt_tracking: true
  scan_schedule: weekly          # daily | weekly | monthly | manual

agentic:
  auto_tasks_enabled: true       # Agentic Flowを有効にするか
  require_approval: true         # 自動タスクに承認を要求するか
  allowed_actions:               # エージェントに許可するアクション
    - doc_update
    - dependency_patch
    - test_suggestion
  blocked_actions:               # 明示的に禁止するアクション
    - force_push
    - branch_delete
    - release_publish
```

### 2.3 `.devnest.yaml` が無いリポジトリ

DevNestが自動推定してデフォルトプロファイルを生成する。

```rust
/// リポジトリを分析してデフォルトプロファイルを推定
pub async fn infer_product_profile(repo_path: &Path) -> ProductProfile {
    // 1. 言語・フレームワーク検出
    //    - Cargo.toml → Rust
    //    - package.json → Node/TypeScript
    //    - tauri.conf.json → Tauri
    //    - go.mod → Go
    //
    // 2. ドキュメント構造検出
    //    - docs/ ディレクトリの有無
    //    - README.md の有無
    //    - frontmatter付きMarkdownの検出
    //
    // 3. テスト構造検出
    //    - tests/ ディレクトリ
    //    - *_test.go, *_test.rs パターン
    //    - __tests__/ ディレクトリ
    //
    // 4. アクティビティ判定
    //    - 最終コミット日時
    //    - 直近30日のコミット数
}
```

### 2.4 プロダクトレジストリのデータモデル

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct ProductRegistry {
    pub products: Vec<Product>,
    pub last_synced: DateTime<Utc>,
    pub github_accounts: Vec<GitHubAccount>,  // 複数アカウント対応
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Product {
    pub id: String,                           // UUID
    pub name: String,
    pub category: ProductCategory,            // Personal | Work | OSS
    pub github: GitHubInfo,
    pub local_path: Option<PathBuf>,          // ローカルにclone済みの場合
    pub profile: ProductProfile,              // .devnest.yaml の内容
    pub status: ProductStatus,                // Active | Maintenance | Archived
    pub last_activity: DateTime<Utc>,
    pub health: Option<HealthSummary>,        // 最新の保守スキャン結果
    pub tags: Vec<String>,
}

pub struct GitHubInfo {
    pub owner: String,
    pub repo: String,
    pub default_branch: String,
    pub is_private: bool,
    pub github_account: String,               // どのアカウントで接続するか
}

/// 複数GitHubアカウント対応（個人 + 職場）
pub struct GitHubAccount {
    pub id: String,
    pub label: String,                        // "Personal", "MUFG" など
    pub account_type: AccountType,            // Personal | Organization
    pub auth: AuthConfig,                     // PAT or GitHub App
    pub repo_filter: Option<RepoFilter>,      // 取得するリポジトリのフィルタ
}

pub struct RepoFilter {
    pub include_patterns: Vec<String>,        // "devnest-*", "team-*"
    pub exclude_patterns: Vec<String>,        // "archived-*", "fork-*"
    pub include_archived: bool,
    pub min_activity_days: Option<u32>,       // N日以内にアクティビティがあるもの
}
```

---

## 3. プロダクトスイッチャーUI

### 3.1 グローバルスイッチャー

DevNestのヘッダーに常駐するプロダクト切り替えUI。

```
┌─────────────────────────────────────────────────────────────┐
│ 🏠 DevNest   [🔄 DevNest ▼]   Dashboard │ Editor │ Sync   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Product Switcher ──────────────────────┐                │
│  │ 🔍 Search products...                   │                │
│  │                                         │                │
│  │ ── Personal ──────────────────────────  │                │
│  │ ● DevNest          🟢 Rust/TS    ★     │                │
│  │ ○ scrum-agents      🟡 TS        ★     │                │
│  │ ○ GoLingo           🟢 Go              │                │
│  │                                         │                │
│  │ ── Work ──────────────────────────────  │                │
│  │ ○ mobile-banking    🟡 Java/Kotlin     │                │
│  │ ○ internal-portal   🔴 Java            │                │
│  │                                         │                │
│  │ ── Recently Active ───────────────────  │                │
│  │ ○ new-experiment    ⚪ Rust   (2h ago) │                │
│  │                                         │                │
│  │ [+ Add Product]  [⚙ Manage Accounts]   │                │
│  └─────────────────────────────────────────┘                │
│                                                             │
│  🟢🟡🔴 = Health Status from maintenance scan               │
│  ★ = Pinned products                                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 コンテキストスイッチ時の動作

プロダクト切り替え時に以下のコンテキストが自動的に切り替わる。

```
Product Switch: DevNest → scrum-agents
    │
    ├── GitHub コンテキスト
    │   ├── リポジトリ: yosuke/scrum-agents
    │   ├── ブランチ一覧の再取得
    │   └── PR/Issue の再取得
    │
    ├── ドキュメントコンテキスト
    │   ├── docs/ の読み込み
    │   ├── .doc-map.yaml の読み込み
    │   └── 設計書一覧の表示切替
    │
    ├── 保守コンテキスト
    │   ├── 依存スキャン結果の読み込み
    │   ├── カバレッジレポートの読み込み
    │   ├── 技術的負債データの読み込み
    │   └── ダッシュボードの表示切替
    │
    ├── Agentic Flow コンテキスト
    │   ├── .devnest.yaml の設定反映
    │   ├── 実行中タスクの状態表示
    │   └── タスクキューの切替
    │
    └── Editor コンテキスト
        ├── 開いていたファイルの保存/復元
        └── ワークスペース設定の切替
```

---

## 4. ポートフォリオダッシュボード

全プロダクトを横断で俯瞰する画面。

```
┌─────────────────────────────────────────────────────────────────┐
│ 🏠 DevNest Portfolio Dashboard                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Health Overview ──────────────────────────────────────────┐ │
│  │ Total: 6 products   🟢 2  🟡 3  🔴 1  ⚪ 0               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────┬──────┬──────┬──────┬──────┬──────┬──────────┐  │
│  │ Product    │Health│ Deps │ Debt │ Cov  │ Docs │ Agent    │  │
│  ├────────────┼──────┼──────┼──────┼──────┼──────┼──────────┤  │
│  │ DevNest    │  🟢  │ 0 ⚠ │  34  │ 72%  │ 3 🟡 │ idle     │  │
│  │ scrum-agt  │  🟡  │ 2 ⚠ │  45  │ 58%  │ 1 🔴 │ running  │  │
│  │ GoLingo    │  🟢  │ 0 ⚠ │  18  │ 81%  │ 0 🟡 │ idle     │  │
│  │ mobile-bk  │  🟡  │ 5 ⚠ │  67  │ 44%  │ 4 🟡 │ blocked  │  │
│  │ int-portal │  🔴  │ 8 ⚠ │  89  │ 31%  │ 6 🔴 │ disabled │  │
│  │ new-exp    │  ⚪  │  -   │  -   │  -   │  -   │ disabled │  │
│  └────────────┴──────┴──────┴──────┴──────┴──────┴──────────┘  │
│                                                                 │
│  ┌─ Attention Required ─────────────────────────────────────┐   │
│  │ 🔴 internal-portal: 8 vulnerable dependencies            │   │
│  │ 🟡 scrum-agents: doc "agent-protocol.md" stale 14 days   │   │
│  │ 🟡 mobile-banking: coverage dropped below 50%            │   │
│  │                                         [View All →]      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─ Agent Activity ─────────────────────────────────────────┐   │
│  │ 🤖 scrum-agents: updating agent-protocol.md ... (3m)     │   │
│  │ ✅ DevNest: dependency patch applied (12m ago)            │   │
│  │ ⏸️ mobile-banking: awaiting approval for tokio update     │   │
│  │                                         [Agent Log →]     │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

# Part B: Agentic Flow エンジン

## 5. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│                     DevNest Agentic Flow Engine                 │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   Triggers   │  │  Task Queue  │  │   Execution Engine    │ │
│  │              │  │              │  │                       │ │
│  │ - Schedule   │─▶│  Priority    │─▶│ - Local Runners       │ │
│  │ - Webhook    │  │  Queue       │  │ - Claude Code Bridge  │ │
│  │ - Threshold  │  │              │  │ - GitHub Actions      │ │
│  │ - Manual     │  │  Per-product │  │                       │ │
│  └──────────────┘  │  isolation   │  └───────────┬───────────┘ │
│                    └──────────────┘              │             │
│                                                  │             │
│  ┌──────────────┐  ┌──────────────┐              │             │
│  │  Approval    │◀─│  Policy      │◀─────────────┘             │
│  │  Gate        │  │  Engine      │                            │
│  │              │  │              │  ┌───────────────────────┐ │
│  │ - Auto       │  │ - .devnest   │  │   Result Store        │ │
│  │ - Manual     │  │   .yaml      │  │                       │ │
│  │ - Escalate   │  │ - Global     │  │ - Scan results        │ │
│  └──────────────┘  │   rules      │  │ - Execution logs      │ │
│                    └──────────────┘  │ - Trend data          │ │
│                                      └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. トリガーシステム

### 6.1 トリガーの種類

```rust
#[derive(Debug, Serialize, Deserialize)]
pub enum Trigger {
    /// 時間ベース（cron式）
    Schedule {
        cron: String,                       // "0 9 * * 1" = 毎週月曜9時
        products: ProductScope,             // All | Specific(Vec<String>)
    },

    /// GitHubイベントベース
    Webhook {
        event: GitHubEvent,                 // Push | PullRequest | Release
        filters: WebhookFilters,
    },

    /// 閾値超過ベース
    Threshold {
        metric: MetricType,
        condition: ThresholdCondition,       // Above(f64) | Below(f64) | Delta(f64)
        check_interval_minutes: u32,
    },

    /// 手動実行
    Manual {
        triggered_by: String,
    },

    /// 他のタスク完了をトリガーに
    TaskCompletion {
        parent_task_id: String,
        on_status: TaskStatus,              // Success | Failure | Any
    },
}

pub enum MetricType {
    DependencyVulnerabilities,
    CoveragePercentage,
    TechDebtScore,
    DocStalenessMax,
    OutdatedDependencies,
}
```

### 6.2 トリガー設定例

```yaml
# .devnest/triggers.yaml（グローバル or プロダクト別）
triggers:
  # 毎週月曜に全プロダクトの保守スキャン
  - name: weekly-maintenance-scan
    type: schedule
    cron: "0 9 * * 1"
    products: all
    task: full_maintenance_scan
    enabled: true

  # PR作成時に自動チェック
  - name: pr-check
    type: webhook
    event: pull_request
    actions: [opened, synchronize]
    products: all
    task: pr_quality_check
    enabled: true

  # 脆弱性が検出されたら即座にタスク発行
  - name: vulnerability-alert
    type: threshold
    metric: dependency_vulnerabilities
    condition: above 0
    check_interval_minutes: 360  # 6時間ごと
    products: all
    task: vulnerability_response
    enabled: true

  # カバレッジが閾値を下回ったら警告
  - name: coverage-drop
    type: threshold
    metric: coverage_percentage
    condition: below 60.0
    products: all
    task: coverage_alert
    enabled: true

  # 設計書の鮮度が一定以下になったらAI更新
  - name: doc-staleness
    type: threshold
    metric: doc_staleness_max
    condition: above 0.7
    check_interval_minutes: 1440  # 24時間ごと
    products: all
    task: doc_auto_update
    enabled: true
```

---

## 7. タスク定義

### 7.1 タスクの種類

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub name: String,
    pub task_type: TaskType,
    pub product_id: String,
    pub priority: TaskPriority,           // Critical | High | Medium | Low
    pub status: TaskStatus,               // Queued | Running | AwaitingApproval
                                          // | Approved | Executing | Completed
                                          // | Failed | Cancelled
    pub triggered_by: Trigger,
    pub created_at: DateTime<Utc>,
    pub requires_approval: bool,
    pub execution_plan: ExecutionPlan,
    pub result: Option<TaskResult>,
}

pub enum TaskType {
    // ── スキャン系（読み取りのみ） ──
    FullMaintenanceScan,                  // 全保守指標を一括スキャン
    DependencyScan,                       // 依存スキャンのみ
    CoverageScan,                         // カバレッジ計測のみ
    DebtScan,                             // 技術的負債スキャンのみ
    DocFreshnessCheck,                    // ドキュメント鮮度チェック

    // ── PR品質チェック ──
    PrQualityCheck {
        pr_number: u32,
    },

    // ── 修正系（書き込みあり → 承認必要） ──
    DependencyPatch {                     // パッチバージョンの自動適用
        deps: Vec<String>,
    },
    DocAutoUpdate {                       // 古くなった設計書のAI更新
        doc_path: String,
    },
    TestSuggestion {                      // テスト追加提案の生成
        file_path: String,
    },
    RefactorProposal {                    // リファクタリング提案
        file_path: String,
    },

    // ── アラート系 ──
    VulnerabilityResponse {
        vuln_ids: Vec<String>,
    },
    CoverageAlert {
        current: f64,
        threshold: f64,
    },

    // ── 複合タスク ──
    CustomWorkflow {
        steps: Vec<WorkflowStep>,
    },
}
```

### 7.2 実行計画

```rust
/// タスクの実行計画（承認画面に表示される）
pub struct ExecutionPlan {
    pub summary: String,                  // 人間が読める概要
    pub steps: Vec<PlannedStep>,
    pub estimated_duration: Duration,
    pub risk_level: RiskLevel,            // Safe | Low | Medium | High
    pub affected_files: Vec<String>,
    pub affected_docs: Vec<String>,       // doc-map連携
    pub rollback_strategy: String,
}

pub struct PlannedStep {
    pub order: u32,
    pub description: String,
    pub action: PlannedAction,
    pub requires_approval: bool,          // ステップ単位の承認
}

pub enum PlannedAction {
    RunCommand(String),                   // シェルコマンド実行
    ClaudeCodeTask(String),               // Claude Codeへの指示
    GitOperation(GitOp),                  // commit, branch, push
    CreatePullRequest(PrTemplate),
    UpdateFile(FileUpdate),
    Notify(Notification),
}
```

---

## 8. 承認ゲート

### 8.1 承認ポリシー

タスクのリスクレベルと `.devnest.yaml` の設定に基づいて
自動承認/手動承認を判断する。

```
┌──────────────────────────────────────────────┐
│           Approval Policy Matrix             │
│                                              │
│  Risk Level    require_approval=true  false   │
│  ──────────    ────────────────────  ──────  │
│  Safe          Auto-approve          Auto    │
│  Low           Auto-approve          Auto    │
│  Medium        Manual approval       Auto    │
│  High          Manual approval       Manual  │
│                                              │
│  ※ High リスクは設定に関わらず常に手動承認    │
│  ※ 脆弱性対応のパッチは Medium 以下なら自動   │
└──────────────────────────────────────────────┘
```

### 8.2 承認UI

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 Agent Task: Approval Required                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Task: DocAutoUpdate                                        │
│  Product: scrum-agents                                      │
│  Trigger: doc_staleness_max exceeded (0.78)                 │
│  Risk: Medium                                               │
│                                                             │
│  ── Execution Plan ──────────────────────────────────────   │
│  1. Read docs/agent-protocol.md (current)                   │
│  2. Analyze diff since last_synced_commit (a1b2c3d..HEAD)   │
│  3. Claude Code: Update design doc to reflect changes       │
│  4. Update frontmatter (version, last_synced_commit)        │
│  5. Commit to branch: agent/doc-update-20260312             │
│  6. Create PR for review                                    │
│                                                             │
│  ── Affected Files ──────────────────────────────────────   │
│  📄 docs/agent-protocol.md                                  │
│                                                             │
│  ── Estimated Duration ──────────────────────────────────   │
│  ~5 minutes                                                 │
│                                                             │
│  [✅ Approve]  [✏️ Modify Plan]  [❌ Reject]  [⏸️ Defer]   │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Claude Code ブリッジ

### 9.1 概要

Agentic FlowからClaude Codeを呼び出すためのブリッジ層。
DevNestがコンテキスト（影響範囲、設計書、保守データ）を組み立て、
Claude Codeに構造化された指示を渡す。

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│ DevNest      │     │ Claude Code     │     │ Git          │
│ Agent Engine │────▶│ Bridge          │────▶│ Repository   │
│              │     │                 │     │              │
│ - context    │     │ - prompt生成    │     │ - commit     │
│ - task def   │     │ - 実行監視      │     │ - branch     │
│ - approval   │     │ - 結果パース    │     │ - push       │
└──────────────┘     └─────────────────┘     └──────────────┘
```

### 9.2 コンテキスト組み立て

```rust
/// Claude Codeに渡すコンテキストを自動生成
pub struct ClaudeCodeContext {
    pub task_instruction: String,         // 何をすべきか
    pub project_context: ProjectContext,   // プロジェクト情報
    pub relevant_docs: Vec<DocContext>,    // 関連設計書の内容
    pub maintenance_data: MaintenanceContext,  // 保守データ
    pub constraints: Vec<String>,         // 守るべきルール
}

pub struct ProjectContext {
    pub product_name: String,
    pub tech_stack: TechStack,
    pub repo_structure: String,           // ディレクトリ構成の要約
    pub branch_strategy: String,
    pub coding_conventions: Option<String>,
}

pub struct DocContext {
    pub path: String,
    pub content: String,
    pub staleness_score: f64,
    pub mapping: DocMapping,              // どのソースに対応するか
    pub diff_summary: String,             // last_synced以降の変更概要
}

impl ClaudeCodeContext {
    /// タスク種別に応じてプロンプトを生成
    pub fn to_prompt(&self) -> String {
        // doc_auto_update の場合:
        // 「以下の設計書を、ソースコードの変更に合わせて更新してください。
        //   変更差分の概要: ...
        //   現在の設計書内容: ...
        //   対応ソースコード: ...
        //   更新ルール: frontmatter更新、バージョニング、マッピング維持」

        // test_suggestion の場合:
        // 「以下のファイルにテストを追加してください。
        //   カバレッジデータ: ...
        //   未カバーの行: ...
        //   関連設計書（期待動作の参照用）: ...」

        // dependency_patch の場合:
        // 「以下の依存をパッチ更新してください。
        //   対象: ...
        //   影響範囲: ...
        //   テスト実行して確認してください」
    }
}
```

### 9.3 実行と監視

```rust
pub struct ClaudeCodeBridge {
    // Claude Code CLIをサブプロセスとして実行
    pub async fn execute(
        &self,
        context: ClaudeCodeContext,
        working_dir: &Path,
    ) -> Result<ClaudeCodeResult, BridgeError> {
        // 1. コンテキストからプロンプトファイルを生成
        // 2. claude-code CLI を起動
        //    claude --task "$(cat prompt.md)" --workdir /path/to/repo
        // 3. 実行状況をストリーム監視
        // 4. 結果をパースして返却
    }

    pub async fn stream_progress(
        &self,
        task_id: &str,
    ) -> impl Stream<Item = ProgressEvent> {
        // DevNest UIにリアルタイム進捗を配信
    }
}

pub struct ClaudeCodeResult {
    pub success: bool,
    pub files_changed: Vec<FileChange>,
    pub commits_made: Vec<String>,
    pub summary: String,
    pub errors: Vec<String>,
}
```

---

## 10. ワークフロー定義（複合タスク）

### 10.1 YAML定義

複数のステップを組み合わせたカスタムワークフローを定義できる。

```yaml
# .devnest/workflows/weekly-maintenance.yaml
name: weekly-maintenance
description: "週次保守ワークフロー"
trigger:
  type: schedule
  cron: "0 9 * * 1"

steps:
  - name: scan
    action: full_maintenance_scan
    on_failure: notify

  - name: check-vulnerabilities
    action: evaluate
    condition: "scan.result.vulnerabilities > 0"
    on_true: vulnerability-fix
    on_false: check-docs

  - name: vulnerability-fix
    action: dependency_patch
    params:
      scope: security_only
    requires_approval: true
    next: check-docs

  - name: check-docs
    action: evaluate
    condition: "scan.result.stale_docs > 0"
    on_true: update-docs
    on_false: check-coverage

  - name: update-docs
    action: doc_auto_update
    params:
      max_docs: 3              # 一度に最大3件
    requires_approval: true
    next: check-coverage

  - name: check-coverage
    action: evaluate
    condition: "scan.result.coverage_drop > 2.0"
    on_true: suggest-tests
    on_false: report

  - name: suggest-tests
    action: test_suggestion
    params:
      target: hot_paths        # カバレッジ低 × churn高
      max_files: 5
    requires_approval: true
    next: report

  - name: report
    action: generate_report
    params:
      format: markdown
      include: [summary, changes, next_actions]
    notify: true
```

### 10.2 ワークフロー実行フロー

```
weekly-maintenance triggered (Mon 09:00)
    │
    ▼
[scan] ── full_maintenance_scan ──────────────────────▶ 完了
    │
    ▼
[check-vulnerabilities] ── 脆弱性あり？
    │Yes                    │No
    ▼                       ▼
[vulnerability-fix]    [check-docs]
    │                       │
    │ ⏸️ 承認待ち            │
    │ ✅ 承認                │
    │ 🤖 Claude Code実行    │
    │                       │
    └───────┬───────────────┘
            ▼
    [check-docs] ── 古い設計書あり？
            │Yes              │No
            ▼                 ▼
    [update-docs]        [check-coverage]
            │                 │
            │ ⏸️ 承認待ち     │
            │ ✅              │
            │ 🤖 Claude Code  │
            │                 │
            └─────┬───────────┘
                  ▼
    [check-coverage] ── カバレッジ低下？
                  │Yes         │No
                  ▼             ▼
    [suggest-tests]        [report]
                  │             │
                  │ ⏸️          │
                  │ ✅          │
                  └──────┬──────┘
                         ▼
                    [report] ── レポート生成 & 通知
                         │
                         ▼
                       完了
```

---

## 11. Rust モジュール構造

```
src-tauri/src/
├── product/
│   ├── mod.rs
│   ├── registry.rs          # ProductRegistry管理
│   ├── github_sync.rs       # GitHub API連携、リポジトリ取得
│   ├── profile.rs           # .devnest.yaml パース、推定
│   ├── switcher.rs          # コンテキストスイッチ制御
│   └── portfolio.rs         # ポートフォリオ横断集計
│
├── agent/
│   ├── mod.rs
│   ├── engine.rs            # Agentic Flowメインエンジン
│   ├── trigger.rs           # トリガー管理（スケジュール、webhook等）
│   ├── task.rs              # タスク定義、キュー管理
│   ├── approval.rs          # 承認ゲートロジック
│   ├── policy.rs            # ポリシーエンジン
│   ├── workflow.rs          # ワークフロー定義、実行制御
│   ├── claude_bridge.rs     # Claude Code連携ブリッジ
│   └── result_store.rs      # 実行結果永続化
│
├── doc_mapping/             # （既存: doc-mapping-design.md）
│   ├── mod.rs
│   ├── parser.rs
│   ├── index.rs
│   ├── diff_analyzer.rs
│   └── staleness.rs
│
├── maintenance/             # （既存: maintenance-strategy.md）
│   ├── mod.rs
│   ├── dependency.rs
│   ├── coverage.rs
│   ├── tech_debt.rs
│   └── refactor.rs
│
└── commands/
    ├── product_commands.rs  # プロダクト管理Tauriコマンド
    └── agent_commands.rs    # エージェントTauriコマンド
```

---

## 12. 全体統合: 3つの設計書の関係

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   doc-mapping-design.md                                      │
│   ┌──────────────────┐                                       │
│   │ Source ↔ Doc     │──── 「何と何が対応するか」の定義       │
│   │ Mapping          │                                       │
│   └────────┬─────────┘                                       │
│            │ 参照                                             │
│            ▼                                                 │
│   maintenance-strategy.md                                    │
│   ┌──────────────────┐                                       │
│   │ 4軸の保守指標     │──── 「今の健康状態はどうか」の計測     │
│   │ Deps/Debt/       │                                       │
│   │ Coverage/Refactor│                                       │
│   └────────┬─────────┘                                       │
│            │ データ供給                                       │
│            ▼                                                 │
│   multi-product-agentic.md  (この文書)                        │
│   ┌──────────────────┐                                       │
│   │ Multi-Product    │──── 「全プロダクトを横断管理」          │
│   │ + Agentic Flow   │──── 「問題を自動で検知・修正」          │
│   └──────────────────┘                                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 13. 実装ロードマップ

### Phase 1: マルチプロダクト基盤
1. ProductRegistry + GitHubSync（リポジトリ動的取得）
2. `.devnest.yaml` パーサー + プロファイル推定
3. プロダクトスイッチャーUI
4. コンテキストスイッチ機構

### Phase 2: ポートフォリオダッシュボード
5. 全プロダクト横断のヘルスサマリー
6. Attention Required パネル
7. プロダクト比較ビュー

### Phase 3: Agentic Flow基盤
8. トリガーシステム（Schedule + Manual）
9. タスクキュー + 状態管理
10. 承認ゲートUI
11. 基本タスク実装（スキャン系）

### Phase 4: Claude Code連携
12. ClaudeCodeBridge実装
13. コンテキスト自動組み立て
14. doc_auto_update タスク
15. test_suggestion タスク

### Phase 5: ワークフロー & 高度な自動化
16. ワークフローYAML定義 + エンジン
17. Webhook連携（PR自動チェック）
18. 閾値トリガー
19. 複合ワークフロー（weekly-maintenance等）

### Phase 6: 成熟
20. 実行結果のトレンド分析
21. ワークフローテンプレートライブラリ
22. プロダクト間の依存分析
23. 自動化効果のメトリクス（節約時間等）
