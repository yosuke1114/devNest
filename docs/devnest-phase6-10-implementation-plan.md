# DevNest 次世代機能 実装計画 — Phase 6〜10

> **目的**: Phase 1-5（保守基盤・マルチプロダクト・Agentic Flow）完了後の次世代機能を段階的に実装する。
> **前提**: Phase 1-5が稼働しており、doc-mapping/保守ダッシュボード/MCP Hub基盤が利用可能であること。
> **作業ブランチ命名規則**: `feature/p<phase>-<task>` (例: `feature/p6-context-ai`)
> **重要**: 各タスク完了時に、関連する設計書（`docs/`配下）のfrontmatterとマッピング情報を必ず更新すること。

---

## 参照設計書

| 設計書 | 参照Phase |
|--------|-----------|
| `docs/doc-mapping-design.md` | Phase 6 (設計書駆動生成) |
| `docs/devnest-maintenance-strategy.md` | Phase 7 (分析データ源) |
| `docs/devnest-multiproduct-agentic.md` | Phase 6-10 全体 |
| `docs/devnest-mcp-integration-design.md` | Phase 9 |

---

# Phase 6: AI開発アシスタント

### 目標
DevNestのdoc-mapping構造を活かし、設計書とソースの文脈を理解したAIアシスタントを構築する。
「設計書を書いたらコードが生成される」「レビュー時に設計書の文脈を自動で持つ」というパイプラインを実現。

---

### Task 6.1: コンテキスト認識AIエンジン

**ファイル作成先**: `src-tauri/src/ai/context_engine.rs`

**やること**:
1. DevNest内のあらゆる操作に「関連コンテキスト」を自動付与するエンジン
2. コンテキスト収集源:
   - doc-mapping: 現在開いているファイルの関連設計書
   - 保守データ: カバレッジ、技術的負債、依存状態
   - Git履歴: 最近の変更、関連PR
   - プロダクト情報: tech_stack、コーディング規約

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct AiContext {
    pub file_context: Option<FileContext>,
    pub doc_context: Vec<DocContext>,
    pub maintenance_context: MaintenanceSnapshot,
    pub git_context: GitContext,
    pub product_context: ProductContext,
}

pub struct FileContext {
    pub path: String,
    pub language: String,
    pub content: String,
    pub symbols: Vec<Symbol>,           // 関数、型、トレイト等
    pub imports: Vec<String>,
    pub coverage: Option<FileCoverage>,
    pub debt_items: Vec<TechDebtItem>,
}

impl ContextEngine {
    /// 指定ファイルのフルコンテキストを構築
    pub async fn build_context_for_file(
        &self,
        file_path: &Path,
    ) -> Result<AiContext, ContextError>

    /// 指定設計書のフルコンテキストを構築
    pub async fn build_context_for_doc(
        &self,
        doc_path: &Path,
    ) -> Result<AiContext, ContextError>

    /// Agentic Flowタスク用のコンテキストを構築
    pub async fn build_context_for_task(
        &self,
        task: &AgentTask,
    ) -> Result<AiContext, ContextError>

    /// コンテキストをプロンプト文字列に変換
    pub fn to_prompt(&self, context: &AiContext, purpose: PromptPurpose) -> String
}

pub enum PromptPurpose {
    CodeGeneration,
    CodeReview,
    DocUpdate,
    TestGeneration,
    RefactorSuggestion,
    DebugAssist,
}
```

3. コンテキストのトークン制御: LLMのコンテキストウィンドウに収まるよう、重要度に応じて内容を取捨選択する仕組み

```rust
pub struct ContextBudget {
    pub max_tokens: usize,              // 全体の上限
    pub file_content_ratio: f32,        // ファイル内容に割り当てる比率
    pub doc_ratio: f32,                 // 設計書に割り当てる比率
    pub metadata_ratio: f32,            // メタデータ（保守、Git等）に割り当てる比率
}

impl ContextEngine {
    /// トークン予算内にコンテキストを圧縮
    pub fn compress_context(
        &self,
        context: &AiContext,
        budget: &ContextBudget,
    ) -> CompressedContext
}
```

**完了条件**:
- 任意のファイルパスからフルコンテキストが構築できる
- doc-mappingと連携して関連設計書が自動収集される
- トークン予算に応じた圧縮が動作する

**ドキュメント更新**:
- `docs/modules/rust-modules.md` に `ai` モジュールを追加
- `docs/ai/context-engine.md` を新規作成（設計書）

---

### Task 6.2: コードレビューエージェント

**ファイル作成先**: `src-tauri/src/ai/review_agent.rs`

**やること**:
1. PRやローカル変更に対して、設計書の文脈を持ったAIレビューを実行
2. レビュー観点:
   - 設計書との整合性（doc-mapping参照）
   - コーディング規約の遵守
   - テストカバレッジの影響
   - 技術的負債の増減
   - セキュリティパターン

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewRequest {
    pub diff: String,                    // git diff の内容
    pub changed_files: Vec<String>,
    pub pr_description: Option<String>,
    pub review_scope: ReviewScope,
}

pub enum ReviewScope {
    Full,                                // 全観点
    DesignConsistency,                   // 設計書整合性のみ
    SecurityFocus,                       // セキュリティのみ
    TestCoverage,                        // テスト観点のみ
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReviewResult {
    pub summary: String,
    pub findings: Vec<ReviewFinding>,
    pub design_consistency: DesignConsistencyReport,
    pub suggested_doc_updates: Vec<DocUpdateSuggestion>,
    pub overall_assessment: Assessment,  // Approve | RequestChanges | Comment
}

pub struct ReviewFinding {
    pub file: String,
    pub line_range: Option<(u32, u32)>,
    pub severity: FindingSeverity,       // Critical | Warning | Info | Suggestion
    pub category: FindingCategory,
    pub message: String,
    pub suggested_fix: Option<String>,
}

pub struct DesignConsistencyReport {
    pub checked_docs: Vec<String>,
    pub inconsistencies: Vec<DesignInconsistency>,
    pub missing_doc_updates: Vec<String>,
}
```

3. Tauriコマンド:

```rust
#[tauri::command]
pub async fn review_changes(
    project_path: String,
    review_request: ReviewRequest,
) -> Result<ReviewResult, AppError>

#[tauri::command]
pub async fn review_pr(
    product_id: String,
    pr_number: u32,
    review_scope: ReviewScope,
) -> Result<ReviewResult, AppError>
```

4. MCP連携: レビュー結果をGitHub PRコメントとして投稿（GitHubAdapter経由）

**完了条件**:
- ローカルdiffに対してAIレビューが実行できる
- 設計書との整合性チェックが含まれる
- レビュー結果がPRコメントとして投稿できる

**ドキュメント更新**:
- `docs/ai/review-agent.md` を新規作成
- `docs/api/tauri-commands.md` にAI関連コマンド追加

---

### Task 6.3: 設計書駆動コード生成

**ファイル作成先**: `src-tauri/src/ai/codegen.rs`

**やること**:
1. 設計書の内容からコードの骨格を自動生成する機能
2. 生成フロー:

```
設計書 (Markdown + frontmatter)
    │
    ▼
ContextEngine でコンテキスト構築
    │ - 関連する既存コード
    │ - 依存する設計書
    │ - tech_stack情報
    │ - コーディング規約
    ▼
プロンプト生成 (PromptPurpose::CodeGeneration)
    │
    ▼
Claude Code Bridge / MCP経由で実行
    │
    ▼
生成結果の検証
    │ - コンパイル/lint チェック
    │ - 既存コードとの整合性
    │ - テスト骨格の同時生成
    ▼
レビュー画面で確認 → コミット
```

3. 生成対象のパターン:

| 設計書の種類 | 生成するもの |
|---|---|
| API定義設計書 | Rustの関数シグネチャ + Tauriコマンド骨格 |
| 画面詳細設計書 | Reactコンポーネントの骨格 + 型定義 |
| モジュール構造設計 | ディレクトリ構造 + mod.rs + 型定義 |
| エラーハンドリング設計 | エラー型定義 + Result型 + エラーハンドラ |

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct CodegenRequest {
    pub doc_path: String,
    pub target_sections: Option<Vec<String>>,  // 特定セクションのみ
    pub generation_mode: GenerationMode,
}

pub enum GenerationMode {
    Scaffold,          // 型定義 + 関数シグネチャのみ
    Implementation,    // 実装含む（Claude Code連携必須）
    TestOnly,          // テストコードのみ
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CodegenResult {
    pub generated_files: Vec<GeneratedFile>,
    pub mapping_updates: Vec<MappingUpdate>,    // frontmatterに追加すべきマッピング
    pub warnings: Vec<String>,
}

#[tauri::command]
pub async fn generate_code_from_doc(
    project_path: String,
    request: CodegenRequest,
) -> Result<CodegenResult, AppError>
```

**完了条件**:
- API定義設計書からRust関数シグネチャが生成できる
- 画面設計書からReactコンポーネント骨格が生成できる
- 生成後にdoc-mappingが自動更新される

**ドキュメント更新**:
- `docs/ai/codegen.md` を新規作成
- 生成されたファイルのマッピング情報を設計書に追加

---

### Task 6.4: インラインAIアシスタントUI

**ファイル作成先**: `src/components/AiAssistant.tsx`, `src/components/ReviewPanel.tsx`

**やること**:
1. DevNestのコードビューワー内にインラインAIアシスタントを組み込む
2. 機能:
   - コード選択 → 右クリック →「AIに質問」「リファクタ提案」「テスト生成」
   - 設計書ビュー →「この設計書からコード生成」ボタン
   - diffビュー → AIレビュー結果をインライン表示
3. レビューパネル:
   - Findingをファイル・行番号でグルーピング
   - 設計書整合性レポートの視覚的表示
   - 「Fix suggestion を適用」ワンクリック

**完了条件**:
- コードビューワーからAI機能を呼び出せる
- レビュー結果がインライン表示される
- 設計書からのコード生成がUIから実行できる

**ドキュメント更新**:
- `docs/screens/ai-assistant.md` を新規作成

---

# Phase 7: 分析 & インサイト

### 目標
開発生産性の可視化、AI活用効果の測定、スプリント単位の分析を実装する。

---

### Task 7.1: 開発速度メトリクス

**ファイル作成先**: `src-tauri/src/analytics/velocity.rs`

**やること**:
1. Git履歴とAgentic Flowのログから開発速度を計測

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct VelocityMetrics {
    pub period: DateRange,
    pub commits: CommitMetrics,
    pub pull_requests: PrMetrics,
    pub code_changes: CodeChangeMetrics,
    pub doc_changes: DocChangeMetrics,
    pub daily_breakdown: Vec<DailyMetrics>,
}

pub struct CommitMetrics {
    pub total: u32,
    pub by_author: HashMap<String, u32>,
    pub average_per_day: f64,
    pub streak_days: u32,               // 連続コミット日数
}

pub struct PrMetrics {
    pub opened: u32,
    pub merged: u32,
    pub avg_time_to_merge_hours: f64,
    pub avg_review_cycles: f64,
}

pub struct CodeChangeMetrics {
    pub lines_added: u32,
    pub lines_deleted: u32,
    pub files_changed: u32,
    pub net_growth: i32,
    pub by_language: HashMap<String, LanguageMetrics>,
}

pub struct DocChangeMetrics {
    pub docs_updated: u32,
    pub docs_created: u32,
    pub sync_rate: f64,                  // 設計書更新率（doc-mapping連携）
}
```

2. 計測期間: 日次/週次/月次/スプリント単位
3. MCP連携: GitHub APIからPR/Issue情報を取得（GitHubAdapter経由）

```rust
#[tauri::command]
pub async fn get_velocity_metrics(
    product_id: String,
    period: DateRange,
) -> Result<VelocityMetrics, AppError>

#[tauri::command]
pub async fn get_velocity_trend(
    product_id: String,
    periods: u32,        // 直近N週間
    granularity: Granularity,  // Daily | Weekly | Monthly
) -> Result<Vec<VelocityMetrics>, AppError>
```

**完了条件**:
- 任意の期間のコミット/PR/コード変更メトリクスが取得できる
- トレンドデータが取得できる
- doc-mapping連携で設計書更新率が計算される

**ドキュメント更新**:
- `docs/modules/rust-modules.md` に `analytics` モジュール追加
- `docs/analytics/velocity.md` を新規作成

---

### Task 7.2: AI効果測定

**ファイル作成先**: `src-tauri/src/analytics/ai_impact.rs`

**やること**:
1. AI（Claude Code/Agentic Flow）が開発にどれだけ貢献したかを定量化

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct AiImpactMetrics {
    pub period: DateRange,
    pub agent_tasks: AgentTaskMetrics,
    pub code_contribution: AiCodeContribution,
    pub time_savings: TimeSavings,
    pub doc_maintenance: AiDocMaintenance,
}

pub struct AgentTaskMetrics {
    pub total_executed: u32,
    pub by_type: HashMap<String, u32>,    // doc_update: 5, test_suggestion: 3, ...
    pub success_rate: f64,
    pub avg_execution_time: Duration,
    pub approval_rate: f64,               // 承認された割合
}

pub struct AiCodeContribution {
    pub lines_generated: u32,             // AIが生成したコード行数
    pub lines_accepted: u32,              // 人間がそのまま採用した行数
    pub acceptance_rate: f64,
    pub files_touched: u32,
    pub tests_generated: u32,
}

pub struct TimeSavings {
    pub estimated_manual_hours: f64,      // 手動でやった場合の推定時間
    pub actual_ai_minutes: f64,           // AIが実際にかかった時間
    pub savings_ratio: f64,
    pub by_task_type: HashMap<String, TaskTimeSaving>,
}

pub struct AiDocMaintenance {
    pub docs_auto_updated: u32,
    pub avg_staleness_before: f64,        // AI更新前の平均鮮度スコア
    pub avg_staleness_after: f64,         // AI更新後の平均鮮度スコア
    pub doc_coverage_improvement: f64,
}
```

2. データ源: Agentic Flowの実行ログ、Claude Code Bridgeの結果ログ、Gitのコミット（AIコミットのprefixで識別）

```rust
#[tauri::command]
pub async fn get_ai_impact(
    product_id: String,
    period: DateRange,
) -> Result<AiImpactMetrics, AppError>
```

**完了条件**:
- Agentic Flow経由のタスク実行統計が取得できる
- AIが生成したコードの採用率が計算できる
- 推定時間節約が算出できる

**ドキュメント更新**:
- `docs/analytics/ai-impact.md` を新規作成

---

### Task 7.3: スプリント分析

**ファイル作成先**: `src-tauri/src/analytics/sprint.rs`

**やること**:
1. スプリント（任意の固定期間）単位での分析
2. Phase 8（Agile Engine）のスプリントデータと連携する前提だが、
   Phase 7段階ではGit履歴ベースの疑似スプリント分析として実装

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct SprintAnalysis {
    pub sprint: SprintInfo,
    pub velocity: VelocityMetrics,
    pub ai_impact: AiImpactMetrics,
    pub maintenance_delta: MaintenanceDelta,
    pub highlights: Vec<SprintHighlight>,
    pub concerns: Vec<SprintConcern>,
}

pub struct SprintInfo {
    pub name: String,                    // "Sprint 12" or "Week 2026-W11"
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
    pub duration_days: u32,
}

pub struct MaintenanceDelta {
    pub debt_score_start: f64,
    pub debt_score_end: f64,
    pub coverage_start: f64,
    pub coverage_end: f64,
    pub outdated_deps_start: u32,
    pub outdated_deps_end: u32,
    pub stale_docs_start: u32,
    pub stale_docs_end: u32,
}

pub enum SprintHighlight {
    VelocityIncrease { percent: f64 },
    CoverageImproved { from: f64, to: f64 },
    DebtReduced { items: u32 },
    AllDocsCurrent,
    AiTasksEfficient { savings_hours: f64 },
}

pub enum SprintConcern {
    VelocityDrop { percent: f64 },
    CoverageDrop { from: f64, to: f64 },
    DebtIncreased { items: u32 },
    StaleDocsIncreased { count: u32 },
    HighFailureRate { task_type: String, rate: f64 },
}
```

3. スプリント定義は設定ベース:

```yaml
# .devnest.yaml の sprint セクション
sprint:
  duration_weeks: 2
  start_day: monday
  naming: "Sprint {n}"    # 自動連番
```

```rust
#[tauri::command]
pub async fn get_sprint_analysis(
    product_id: String,
    sprint_name: Option<String>,   // None = 現在のスプリント
) -> Result<SprintAnalysis, AppError>

#[tauri::command]
pub async fn get_sprint_history(
    product_id: String,
    count: u32,                    // 直近N スプリント
) -> Result<Vec<SprintAnalysis>, AppError>
```

**完了条件**:
- スプリント単位の全メトリクスが集計できる
- ハイライトと懸念事項が自動検出される
- 複数スプリントのトレンド比較ができる

**ドキュメント更新**:
- `docs/analytics/sprint-analysis.md` を新規作成

---

### Task 7.4: 分析ダッシュボードUI

**ファイル作成先**: `src/components/AnalyticsDashboard.tsx`

**やること**:
1. 3つの分析軸を統合したダッシュボード画面
2. パネル構成:
   - 開発速度トレンド（折れ線グラフ: コミット数、LOC、PR数）
   - AI効果サマリー（節約時間、タスク成功率、コード採用率）
   - スプリント比較（現スプリント vs 前スプリント）
   - 保守健全性トレンド（負債スコア、カバレッジ、設計書鮮度の推移）
3. グラフライブラリ: `recharts`（React用、既にDevNestで利用可能な前提）
4. ポートフォリオ横断ビュー: 全プロダクトの分析サマリーを一画面で比較

**完了条件**:
- 4つのパネルが表示される
- 期間フィルタ（日/週/月/スプリント）が動作する
- プロダクト切替で分析データが切り替わる

**ドキュメント更新**:
- `docs/screens/analytics-dashboard.md` を新規作成

---

# Phase 8: ビルトインアジャイルエンジン

### 目標
Scrum/アジャイルのプラクティスをDevNestにネイティブ組み込みし、
個人開発でもチーム開発でもアジャイルの恩恵を受けられるようにする。

---

### Task 8.1: パーソナルカンバン

**ファイル作成先**: `src-tauri/src/agile/kanban.rs`, `src/components/KanbanBoard.tsx`

**やること**:

Rustバックエンド:
1. カンバンボードのデータモデル

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct KanbanBoard {
    pub id: String,
    pub product_id: String,
    pub columns: Vec<KanbanColumn>,
    pub wip_limits: HashMap<String, u32>,   // column_id → 制限数
    pub cards: Vec<KanbanCard>,
}

pub struct KanbanColumn {
    pub id: String,
    pub name: String,                       // "Backlog", "In Progress", "Review", "Done"
    pub order: u32,
    pub wip_limit: Option<u32>,
    pub auto_rules: Vec<AutoRule>,          // 自動カード移動ルール
}

pub struct KanbanCard {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub column_id: String,
    pub priority: Priority,
    pub labels: Vec<String>,
    pub linked_issue: Option<LinkedIssue>,   // GitHub Issue連携
    pub linked_doc: Option<String>,          // 設計書リンク
    pub linked_debt: Option<String>,         // 技術的負債アイテムリンク
    pub created_at: DateTime<Utc>,
    pub moved_to_column_at: DateTime<Utc>,   // フロー時間計測用
    pub estimated_effort: Option<Duration>,
    pub actual_effort: Option<Duration>,
}

pub struct AutoRule {
    pub trigger: AutoTrigger,
    pub action: AutoAction,
}

pub enum AutoTrigger {
    PrMerged { branch_pattern: String },
    AgentTaskCompleted { task_type: TaskType },
    CoverageReached { threshold: f64 },
    DocUpdated { doc_path: String },
}

pub enum AutoAction {
    MoveToColumn(String),
    AddLabel(String),
    NotifySlack(String),
}
```

2. WIP制限エンジン: 列のWIP制限を超える場合は警告/ブロック
3. GitHub Issue同期: GitHub Issueとカンバンカードの双方向同期（MCP経由）
4. 技術的負債カード: 保守スキャンで検出した負債を自動でBacklogに追加

Reactフロントエンド:
5. ドラッグ＆ドロップ対応のカンバンボード
6. WIP制限の視覚的表示（制限超過で赤枠）
7. カード詳細モーダル（リンク先の設計書/Issue/負債アイテムへのジャンプ）
8. フィルタ（ラベル、優先度、リンク種別）

```rust
#[tauri::command]
pub async fn get_kanban_board(product_id: String) -> Result<KanbanBoard, AppError>

#[tauri::command]
pub async fn move_card(card_id: String, to_column: String) -> Result<KanbanBoard, AppError>

#[tauri::command]
pub async fn create_card(board_id: String, card: NewCard) -> Result<KanbanCard, AppError>

#[tauri::command]
pub async fn sync_github_issues(product_id: String) -> Result<SyncResult, AppError>

#[tauri::command]
pub async fn import_debt_items(product_id: String) -> Result<Vec<KanbanCard>, AppError>
```

**完了条件**:
- カンバンボードのCRUD操作が可能
- ドラッグ＆ドロップで列移動ができる
- WIP制限が機能する
- GitHub Issueと同期できる

**ドキュメント更新**:
- `docs/modules/rust-modules.md` に `agile` モジュール追加
- `docs/agile/kanban.md` を新規作成
- `docs/screens/kanban-board.md` を新規作成

---

### Task 8.2: AIスプリントプランナー

**ファイル作成先**: `src-tauri/src/agile/sprint_planner.rs`

**やること**:
1. スプリント計画をAIが支援する機能
2. 入力:
   - バックログ（カンバンのBacklog列）
   - 過去のベロシティ（Phase 7のデータ）
   - 保守タスクの優先度（保守ダッシュボードのデータ）
   - スプリント期間
3. AIが提案する内容:
   - スプリントに含めるカードのセット
   - 推奨する作業順序
   - リスク評価（「このカードは依存関係があるので先に着手」等）
   - 保守タスクの組み込み提案（「カバレッジが低下傾向なのでテスト追加を含めましょう」）

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct SprintPlan {
    pub sprint_info: SprintInfo,
    pub selected_cards: Vec<PlannedCard>,
    pub maintenance_tasks: Vec<PlannedMaintenanceTask>,
    pub estimated_velocity: f64,
    pub risk_assessment: Vec<RiskItem>,
    pub rationale: String,                // AIの提案理由
}

pub struct PlannedCard {
    pub card: KanbanCard,
    pub suggested_order: u32,
    pub estimated_effort: Duration,
    pub dependencies: Vec<String>,         // 依存する他カードのID
    pub ai_notes: String,                  // AIのコメント
}

pub struct PlannedMaintenanceTask {
    pub task_type: TaskType,
    pub reason: String,                    // なぜこのスプリントで必要か
    pub priority: Priority,
    pub estimated_effort: Duration,
}

#[tauri::command]
pub async fn suggest_sprint_plan(
    product_id: String,
    sprint_info: SprintInfo,
) -> Result<SprintPlan, AppError>

#[tauri::command]
pub async fn accept_sprint_plan(
    product_id: String,
    plan: SprintPlan,
) -> Result<(), AppError>
```

**完了条件**:
- バックログからAIがスプリント計画を提案できる
- 保守タスクが自動的に組み込まれる
- 提案を承認するとカンバンボードに反映される

**ドキュメント更新**:
- `docs/agile/sprint-planner.md` を新規作成

---

### Task 8.3: 自動レトロスペクティブ

**ファイル作成先**: `src-tauri/src/agile/retrospective.rs`

**やること**:
1. スプリント完了時に自動でレトロスペクティブデータを生成
2. データ源:
   - Phase 7のスプリント分析データ
   - Agentic Flowの実行ログ
   - カンバンのフロー時間
   - GitHub PR/Issueのデータ（MCP経由）
3. 自動生成する項目:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct Retrospective {
    pub sprint: SprintInfo,
    pub analysis: SprintAnalysis,         // Phase 7のデータ

    // 自動生成セクション
    pub went_well: Vec<RetroItem>,        // うまくいったこと
    pub could_improve: Vec<RetroItem>,    // 改善できること
    pub action_items: Vec<ActionItem>,    // 次スプリントのアクション
    pub learnings: Vec<Learning>,         // 学び

    // 年輪レトロスペクティブ（Project ①から）
    pub year_ring: Option<YearRingEntry>,
}

pub struct RetroItem {
    pub category: RetroCategory,
    pub description: String,
    pub evidence: String,                  // データに基づく根拠
    pub ai_generated: bool,
}

pub enum RetroCategory {
    Velocity,
    Quality,
    Maintenance,
    AiEffectiveness,
    Process,
}

pub struct ActionItem {
    pub description: String,
    pub priority: Priority,
    pub assignee: Option<String>,
    pub auto_card: bool,                   // 次スプリントのカンバンカードに自動追加
}

/// Project ①の年輪レトロスペクティブ
/// スプリントごとの「成長の輪」を可視化
pub struct YearRingEntry {
    pub sprint_name: String,
    pub theme: String,                     // このスプリントのテーマ
    pub growth_areas: Vec<GrowthArea>,     // 成長した領域
    pub ring_width: f64,                   // 成長度合い（太い=大きな成長）
}

pub struct GrowthArea {
    pub area: String,                      // "テスト", "設計", "自動化" 等
    pub description: String,
    pub metric_change: Option<MetricDelta>,
}
```

4. 年輪レトロスペクティブ: スプリントごとの成長を「年輪」のメタファーで蓄積・可視化

```rust
#[tauri::command]
pub async fn generate_retrospective(
    product_id: String,
    sprint_name: Option<String>,
) -> Result<Retrospective, AppError>

#[tauri::command]
pub async fn get_year_ring_history(
    product_id: String,
) -> Result<Vec<YearRingEntry>, AppError>

#[tauri::command]
pub async fn save_retrospective(
    product_id: String,
    retro: Retrospective,
) -> Result<(), AppError>
```

**完了条件**:
- スプリント完了時にレトロスペクティブが自動生成される
- went_well / could_improve が定量データに基づいて提案される
- action_itemsが次スプリントのカンバンに自動追加できる
- 年輪の履歴が蓄積・表示できる

**ドキュメント更新**:
- `docs/agile/retrospective.md` を新規作成
- `docs/agile/year-ring.md` を新規作成

---

### Task 8.4: ストーリーマッピング

**ファイル作成先**: `src-tauri/src/agile/story_map.rs`, `src/components/StoryMap.tsx`

**やること**:
1. ユーザーストーリーマッピングのビジュアルツール
2. DevNestの既存ユーザージャーニーシナリオ（J-00〜J-07）と連携
3. データモデル:

```rust
pub struct StoryMap {
    pub id: String,
    pub product_id: String,
    pub activities: Vec<Activity>,        // 横軸: ユーザー活動
    pub releases: Vec<Release>,           // 縦軸: リリース区切り
}

pub struct Activity {
    pub id: String,
    pub name: String,
    pub order: u32,
    pub stories: Vec<UserStory>,
}

pub struct UserStory {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub release_id: String,               // どのリリースに含めるか
    pub linked_kanban_card: Option<String>,
    pub linked_docs: Vec<String>,         // 関連設計書
    pub acceptance_criteria: Vec<String>,
    pub estimated_points: Option<u32>,
}
```

4. AI支援: ユーザージャーニーからストーリーの自動提案

**完了条件**:
- ストーリーマップの作成・編集ができる
- カンバンカード・設計書とリンクできる
- リリース計画の視覚化ができる

**ドキュメント更新**:
- `docs/agile/story-mapping.md` を新規作成
- `docs/screens/story-map.md` を新規作成

---

### Task 8.5: フロー最適化エンジン

**ファイル作成先**: `src-tauri/src/agile/flow.rs`

**やること**:
1. カンバンのフローデータ（カードの列滞在時間）を分析
2. ボトルネック検出: 特定の列に長時間滞在するカードを検出
3. WIP制限の最適化提案: フローデータに基づいてWIP制限値を提案
4. サイクルタイム分析: カードが「In Progress」→「Done」にかかる時間を計測・トレンド表示
5. リトルの法則: `平均リードタイム = 平均WIP / 平均スループット` で予測

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct FlowAnalysis {
    pub cycle_time: CycleTimeMetrics,
    pub throughput: ThroughputMetrics,
    pub bottlenecks: Vec<Bottleneck>,
    pub wip_suggestions: Vec<WipSuggestion>,
    pub lead_time_forecast: LeadTimeForecast,
}

#[tauri::command]
pub async fn analyze_flow(
    product_id: String,
    period: DateRange,
) -> Result<FlowAnalysis, AppError>
```

**完了条件**:
- サイクルタイム/スループットが計測・表示できる
- ボトルネックが検出される
- WIP制限の最適化提案がされる

**ドキュメント更新**:
- `docs/agile/flow-optimization.md` を新規作成

---

# Phase 9: 外部ツール統合

### 目標
MCP Client Hub を通じてGitHub/Slack/Redmineと本格連携する。

> 詳細設計は `docs/devnest-mcp-integration-design.md` を参照。
> ここでは実装タスクの分解のみ記載する。

---

### Task 9.1: MCP Client基盤

**やること**:
1. `rmcp` クレート（v0.16+）を `Cargo.toml` に追加
2. `McpHub` 実装（`src-tauri/src/mcp/hub.rs`）
3. `ConnectionManager` 実装（lifecycle、reconnect、health check）
4. `mcp-config.yaml` パーサー実装
5. stdio/SSEトランスポート対応
6. `ToolRegistry` 実装（名前空間管理、曖昧解決）
7. Tauriコマンド: `initialize_mcp_hub`, `get_mcp_status`, `connect_mcp_server`, `disconnect_mcp_server`

**完了条件**:
- 任意のMCP Serverにstdio/SSEで接続できる
- ツール一覧が取得できる
- 基本的なツール呼び出しが動作する

**ドキュメント更新**:
- `docs/modules/rust-modules.md` に `mcp` モジュール追加
- `docs/mcp/hub.md` を新規作成

---

### Task 9.2: GitHub MCPアダプター

**やること**:
1. GitHub MCP Server接続（`@modelcontextprotocol/server-github`）
2. `GitHubAdapter` 高レベルAPI実装（設計書の全メソッド）
3. Agentic Flow統合: `PlannedAction::McpToolCall` の追加
4. 保守スキャン → Issue自動作成フロー
5. PR影響分析コメント自動投稿
6. リリースノート自動生成

**完了条件**:
- DevNestからGitHub Issue/PRの操作ができる
- Agentic FlowからMCPツールが呼び出せる
- 保守結果がIssueに変換される

**ドキュメント更新**:
- `docs/api/github-integration.md` のMCPセクション更新

---

### Task 9.3: Slackアダプター

**やること**:
1. Slack MCP Server接続
2. `SlackAdapter` 実装（通知送信、レポート送信）
3. Agentic Flow完了通知
4. 保守アラート送信
5. 週次レポート自動送信

**完了条件**:
- DevNestからSlackメッセージが送信できる
- Agentic Flowの完了がSlackに通知される

**ドキュメント更新**:
- `docs/mcp/slack-adapter.md` を新規作成

---

### Task 9.4: Redmineアダプター

**やること**:
1. Redmine MCP Server接続（カスタムMCP Serverが必要な場合はテンプレートから生成）
2. `RedmineAdapter` 実装（チケット同期、工数取得）
3. DevNestカンバン ↔ Redmineチケットの同期
4. 技術的負債のRedmineチケット化

**完了条件**:
- Redmineチケットの読み書きができる
- カンバンカードとチケットが同期される

**ドキュメント更新**:
- `docs/mcp/redmine-adapter.md` を新規作成

---

### Task 9.5: Claude Code MCP移行

**やること**:
1. 既存のClaude Code Bridge（Phase 4）をMCP経由に移行
2. `ClaudeCodeMcpAdapter` 実装
3. MCP Tasks APIによる非同期実行追跡
4. 他MCPツールとのオーケストレーション（McpWorkflow）

**完了条件**:
- 既存のClaude Code連携がMCP経由で動作する
- 非同期タスクの追跡ができる

**ドキュメント更新**:
- `docs/mcp/claude-code-adapter.md` を新規作成

---

### Task 9.6: PolicyEngine & 承認統合

**やること**:
1. `PolicyEngine` 実装（ツール別アクセス制御）
2. Agentic Flow承認ゲートとの統合
3. プロダクト別ポリシーオーバーライド
4. 監査ログ（誰が何のツールをいつ呼んだか）

**完了条件**:
- ツールごとにAllow/RequireApproval/Denyが制御できる
- Agentic Flow経由の呼び出しは承認ゲートを通過する
- 監査ログが記録される

**ドキュメント更新**:
- `docs/mcp/policy.md` を新規作成

---

### Task 9.7: MCP管理UI

**やること**:
1. MCP接続管理画面（設計書のUI設計参照）
2. ツールエクスプローラー
3. ポリシー設定画面
4. カスタムMCPサーバーテンプレート生成UI
5. テスト実行画面

**完了条件**:
- UIから接続の追加・削除・設定変更ができる
- ツール一覧とポリシーが視覚的に確認できる

**ドキュメント更新**:
- `docs/screens/mcp-manager.md` を新規作成

---

# Phase 10: コラボレーション

### 目標
DevNestを個人ツールからチーム利用に拡張する。

---

### Task 10.1: チームダッシュボード

**ファイル作成先**: `src-tauri/src/collaboration/team.rs`, `src/components/TeamDashboard.tsx`

**やること**:
1. 複数メンバーの活動を集約表示するダッシュボード
2. データ源: GitHub API（contributors、PRレビュー状況）、Slack（チャンネル活動）
3. 表示項目:
   - メンバー別の活動サマリー
   - PR レビュー待ち一覧
   - チーム全体のベロシティトレンド
   - 担当カンバンカードの進捗

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct TeamDashboard {
    pub members: Vec<TeamMember>,
    pub pending_reviews: Vec<PendingReview>,
    pub team_velocity: VelocityMetrics,
    pub active_sprints: Vec<SprintSummary>,
}

pub struct TeamMember {
    pub github_username: String,
    pub display_name: String,
    pub recent_commits: u32,
    pub open_prs: u32,
    pub review_requests: u32,
    pub active_cards: u32,
}
```

**完了条件**:
- チームメンバーの活動が一覧表示される
- レビュー待ちPRが集約される

**ドキュメント更新**:
- `docs/collaboration/team-dashboard.md` を新規作成

---

### Task 10.2: ナレッジ共有

**ファイル作成先**: `src-tauri/src/collaboration/knowledge.rs`

**やること**:
1. 設計書とレトロスペクティブの知見をチーム内で共有する仕組み
2. 機能:
   - 設計書にコメント/ディスカッションスレッドを追加
   - レトロスペクティブのaction_itemsを共有
   - 年輪レトロスペクティブのチーム統合ビュー
3. 実装方式: GitHub Discussions or Issue comments をバックエンドとして活用（MCP経由）

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct KnowledgeEntry {
    pub id: String,
    pub entry_type: KnowledgeType,
    pub title: String,
    pub content: String,
    pub author: String,
    pub product_id: String,
    pub linked_docs: Vec<String>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub comments: Vec<Comment>,
}

pub enum KnowledgeType {
    DesignDecision,        // 設計判断の記録
    RetroLearning,         // レトロスペクティブからの学び
    TechNote,              // 技術的なメモ
    Postmortem,            // 障害/問題の振り返り
}
```

**完了条件**:
- ナレッジエントリのCRUD操作が可能
- 設計書にコメントが追加できる
- チーム内で検索・閲覧できる

**ドキュメント更新**:
- `docs/collaboration/knowledge-share.md` を新規作成

---

### Task 10.3: マルチエージェントScrum統合

**ファイル作成先**: `src-tauri/src/collaboration/multi_agent.rs`

**やること**:
1. scrum-agentsプロジェクトとDevNestの統合
2. scrum-agentsの各エージェント（PO、SM、Dev等）をDevNestのAgentic Flowとして組み込む
3. DevNestのカンバン/スプリントデータをscrum-agentsに提供
4. エージェントの実行結果をDevNestのUIに表示

```rust
pub struct ScrumAgentIntegration {
    pub agents: Vec<ScrumAgent>,
    pub ceremony_schedule: CeremonySchedule,
}

pub struct ScrumAgent {
    pub role: ScrumRole,                  // ProductOwner | ScrumMaster | Developer
    pub mcp_server: Option<String>,       // MCPサーバーとして接続
    pub claude_code_config: Option<ClaudeCodeConfig>,
}

pub enum ScrumRole {
    ProductOwner,      // バックログ優先順位付け
    ScrumMaster,       // プロセス改善提案、ブロッカー検出
    Developer,         // コード生成、テスト、レビュー
    QualityAssurance,  // テスト戦略、品質メトリクス
}

pub struct CeremonySchedule {
    pub sprint_planning: CeremonyConfig,
    pub daily_standup: CeremonyConfig,
    pub sprint_review: CeremonyConfig,
    pub retrospective: CeremonyConfig,
}
```

**完了条件**:
- scrum-agentsのエージェントがDevNestから起動・監視できる
- セレモニーのスケジュール管理ができる
- エージェントの結果がカンバン/レトロスペクティブに反映される

**ドキュメント更新**:
- `docs/collaboration/multi-agent-scrum.md` を新規作成
- scrum-agentsプロジェクトのドキュメントとの相互参照を追加

---

## 全体ドキュメント更新チェックリスト

### 各Phase完了時の必須チェック
- [ ] 新規Rustモジュールが `docs/modules/rust-modules.md` に記載
- [ ] 新規Tauriコマンドが `docs/api/tauri-commands.md` に記載
- [ ] 新規画面の設計書が作成されている
- [ ] 変更した設計書の `last_synced_commit` が更新されている
- [ ] 変更した設計書の `version` がセマンティックに更新されている
- [ ] 変更した設計書の `status` が `current` になっている
- [ ] 新規ファイルが既存設計書の `mapping.sources` に追加されている
- [ ] `.doc-map.yaml` を再生成して整合性確認

### Phase 6完了時の追加チェック
- [ ] AI関連の全設計書が整備されている
- [ ] ContextEngineがdoc-mappingと正しく連携している
- [ ] コード生成結果のマッピング自動更新が動作する

### Phase 7完了時の追加チェック
- [ ] 全メトリクスのトレンドデータが蓄積されている
- [ ] スプリント分析がPhase 8のデータ構造と互換性がある

### Phase 8完了時の追加チェック
- [ ] カンバンデータがPhase 7の分析に供給されている
- [ ] レトロスペクティブの年輪データが蓄積されている
- [ ] GitHub Issue同期がMCP経由で動作している

### Phase 9完了時の追加チェック
- [ ] 全MCPアダプターが接続・動作テスト済み
- [ ] PolicyEngineが全アダプターに適用されている
- [ ] Agentic FlowからMCPツールが呼び出せる

### Phase 10完了時の追加チェック
- [ ] チーム機能が個人モードでも安全に動作する（チーム未設定時）
- [ ] scrum-agents統合がオプショナルに動作する

### 最終チェック
- [ ] `build_index()` で全設計書が正しくインデックスされる
- [ ] `check_all_staleness()` で全設計書が `current` になっている
- [ ] 全テスト通過
- [ ] `cargo clippy` 警告なし
- [ ] フロントエンドlintエラーなし
- [ ] ポートフォリオダッシュボードで全プロダクトが健全表示
