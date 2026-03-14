# DevNest テスト計画 — Phase 6〜10

> **目的**: Phase 6-10の全機能に対するテスト戦略・テストケース・自動化方針を定義する。
> **テスト方針**: Classical School TDD（状態検証ベース）を基本とし、外部依存はフェイク/スタブで分離する。
> **テストランナー**: Rust: `cargo test` + `cargo tarpaulin` / TypeScript: `vitest` + `@testing-library/react`
> **カバレッジ目標**: 新規コード 80%以上、クリティカルパス 90%以上
> **重要**: テスト作成後、対応する設計書の `mapping.sources` にテストファイルを追加すること。

---

## テスト戦略の全体像

### レイヤー別テスト比率

```
                    ┌───────────┐
                    │   E2E     │  10%
                    │  (Tauri)  │  主要ユーザーフロー
                ┌───┴───────────┴───┐
                │   Integration     │  30%
                │  (モジュール間)    │  Hub↔Adapter, Engine↔Registry
            ┌───┴───────────────────┴───┐
            │       Unit Tests          │  60%
            │  (関数・構造体単位)         │  パーサー、スコア算出、ポリシー判定
            └───────────────────────────┘
```

### 外部依存の分離戦略

| 外部依存 | テスト戦略 | 方法 |
|----------|-----------|------|
| MCP Server (GitHub/Slack/Redmine) | フェイクMCPサーバー | `MockMcpServer` をstdioで起動 |
| Claude Code CLI | モックプロセス | stdout/stderrをシミュレート |
| Git リポジトリ | テンポラリリポジトリ | `tempdir` + `git2` でテスト用repo生成 |
| ファイルシステム | テンポラリディレクトリ | `tempfile` クレート |
| GitHub API (非MCP) | HTTPモック | `wiremock` クレート |
| 時刻 | 注入可能クロック | `trait Clock` で差し替え |

---

## 共通テストユーティリティ

### テストファイル作成先: `src-tauri/tests/common/`

```rust
// tests/common/mod.rs

/// テスト用の一時Gitリポジトリを生成
pub struct TestRepo {
    pub dir: TempDir,
    pub repo: git2::Repository,
}

impl TestRepo {
    /// 基本的な構造を持つリポジトリを生成
    pub fn new_with_structure() -> Self {
        // docs/ ディレクトリ + サンプル設計書（frontmatter付き）
        // src/ ディレクトリ + サンプルソースコード
        // .devnest.yaml
        // Cargo.toml + package.json
    }

    /// コミットを追加
    pub fn add_commit(&self, files: &[(&str, &str)], message: &str) -> Oid

    /// ブランチを作成
    pub fn create_branch(&self, name: &str) -> Branch
}

/// フェイクMCPサーバー（stdio）
pub struct MockMcpServer {
    pub tools: Vec<MockTool>,
    pub call_log: Arc<Mutex<Vec<ToolCallRecord>>>,
}

impl MockMcpServer {
    pub fn new() -> Self
    pub fn with_tools(tools: Vec<MockTool>) -> Self

    /// stdioサブプロセスとして起動可能なコマンドを返す
    pub fn as_command(&self) -> Command

    /// 呼び出し履歴を取得
    pub fn get_call_log(&self) -> Vec<ToolCallRecord>

    /// 次のツール呼び出しに対するレスポンスを設定
    pub fn set_response(&self, tool_name: &str, response: serde_json::Value)
}

pub struct MockTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub default_response: serde_json::Value,
}

pub struct ToolCallRecord {
    pub tool_name: String,
    pub arguments: serde_json::Value,
    pub timestamp: DateTime<Utc>,
}

/// テスト用の注入可能クロック
pub trait Clock: Send + Sync {
    fn now(&self) -> DateTime<Utc>;
}

pub struct FixedClock(pub DateTime<Utc>);
impl Clock for FixedClock {
    fn now(&self) -> DateTime<Utc> { self.0 }
}

/// テスト用のサンプル設計書を生成
pub fn sample_frontmatter_doc(doc_type: &str, sources: &[&str]) -> String {
    // frontmatter付きMarkdownを生成
}

/// テスト用の.devnest.yamlを生成
pub fn sample_devnest_yaml(category: &str, mcp_servers: &[&str]) -> String
```

---

# Phase 6: AI開発アシスタント テスト

## T-6.1: ContextEngine テスト

**テストファイル**: `src-tauri/src/ai/context_engine_test.rs`

### ユニットテスト

```
T-6.1.1 ファイルコンテキスト構築
├── ✅ Rustファイルからシンボル（fn, struct, enum, trait）が抽出される
├── ✅ TypeScriptファイルからシンボル（function, interface, type）が抽出される
├── ✅ import/use文が正しく解析される
├── ✅ 存在しないファイルでエラーが返る
└── ✅ バイナリファイルが安全にスキップされる

T-6.1.2 ドキュメントコンテキスト収集
├── ✅ doc-mappingから関連設計書が正しく収集される
├── ✅ ディレクトリスコープのマッピングで子ファイルにもヒットする
├── ✅ depends_onで依存設計書も再帰的に収集される（深さ制限あり）
├── ✅ マッピングが存在しないファイルでは空の設計書リストが返る
└── ✅ 循環依存がある場合にスタックオーバーフローしない

T-6.1.3 メンテナンスコンテキスト
├── ✅ カバレッジデータが含まれる
├── ✅ 技術的負債アイテムが含まれる
├── ✅ 依存ステータスが含まれる
└── ✅ データが未取得の場合にデフォルト値が使われる

T-6.1.4 コンテキスト圧縮
├── ✅ トークン予算内に収まるように圧縮される
├── ✅ 優先度の低いコンテキストから削除される
├── ✅ ファイル内容 > 設計書 > メタデータ の優先順位
├── ✅ 予算が十分な場合は圧縮されない
└── ✅ 予算が0の場合でもクラッシュしない

T-6.1.5 プロンプト生成
├── ✅ CodeGeneration用のプロンプトに設計書内容が含まれる
├── ✅ CodeReview用のプロンプトにdiff情報が含まれる
├── ✅ TestGeneration用のプロンプトに未カバー行が含まれる
└── ✅ PurposeごとにPrompt構造が異なる
```

### 統合テスト

```
T-6.1.6 doc-mapping連携
├── ✅ TestRepoにフル構造を作成し、build_context_for_file()で
│      関連設計書が正しく取得できること
└── ✅ コミット追加後にGitコンテキストが更新されること
```

---

## T-6.2: ReviewAgent テスト

**テストファイル**: `src-tauri/src/ai/review_agent_test.rs`

### ユニットテスト

```
T-6.2.1 レビューリクエスト検証
├── ✅ 空のdiffでは「変更なし」のレビュー結果が返る
├── ✅ 変更ファイル一覧から影響設計書が正しく特定される
├── ✅ ReviewScope::DesignConsistencyでは設計書チェックのみ実行される
└── ✅ ReviewScope::Fullでは全観点が実行される

T-6.2.2 設計整合性チェック
├── ✅ ソース変更に対応する設計書が outdated の場合 Warning が出る
├── ✅ 新規ファイルに対応する設計書が無い場合 Info が出る
├── ✅ 設計書のAPI定義とソースのシグネチャが不一致の場合 Finding が出る
└── ✅ 全設計書が current の場合は inconsistencies が空

T-6.2.3 レビュー結果構造
├── ✅ FindingにはファイルパスとUI表示用の行番号が含まれる
├── ✅ Findingの severity が正しく設定される
├── ✅ suggested_doc_updates が影響設計書のパスを含む
└── ✅ overall_assessment が Findings の severity に基づいて判定される
```

### 統合テスト

```
T-6.2.4 PR レビューフロー（MockMcpServer使用）
├── ✅ GitHub MCP経由でPR diffを取得し、レビューを実行できること
├── ✅ レビュー結果がPRコメントとして投稿されること（MockMcpServerで検証）
└── ✅ MCP接続失敗時にエラーが適切にハンドリングされること
```

---

## T-6.3: CodeGen テスト

**テストファイル**: `src-tauri/src/ai/codegen_test.rs`

### ユニットテスト

```
T-6.3.1 コード生成リクエスト検証
├── ✅ API定義設計書からRust関数シグネチャの骨格が生成される
├── ✅ 画面設計書からReactコンポーネントの骨格が生成される
├── ✅ Scaffold モードでは実装なしの骨格のみ生成される
├── ✅ TestOnly モードではテストコードのみ生成される
├── ✅ 存在しない設計書パスでエラーが返る
└── ✅ frontmatterが無い設計書でエラーが返る

T-6.3.2 マッピング自動更新
├── ✅ 生成されたファイルのパスが mapping_updates に含まれる
├── ✅ 生成先ディレクトリが設計書の mapping.sources と整合する
└── ✅ 既存マッピングとの重複が検出される

T-6.3.3 生成パターン別テスト
├── ✅ doc_type: api_definition → Tauriコマンドの#[tauri::command]アトリビュートが含まれる
├── ✅ doc_type: screen_design → React functional componentの形式で生成される
├── ✅ doc_type: module_structure → mod.rsとサブモジュールが生成される
└── ✅ doc_type: error_handling → Result型とエラーenum型が生成される
```

---

## T-6.4: AIアシスタントUI テスト

**テストファイル**: `src/components/__tests__/AiAssistant.test.tsx`

```
T-6.4.1 コンポーネント表示
├── ✅ AIアシスタントパネルが表示される
├── ✅ レビュー結果のFindingがファイル別にグルーピングされる
├── ✅ severity別にアイコン・色が正しく表示される
└── ✅ 設計書整合性レポートが表示される

T-6.4.2 インタラクション
├── ✅ 「AIに質問」ボタンでコンテキスト付きリクエストが送信される
├── ✅ 「設計書からコード生成」ボタンでcodegen APIが呼ばれる
├── ✅ 「Fix suggestion を適用」でファイル変更が反映される
├── ✅ ローディング状態が正しく表示される
└── ✅ APIエラー時にエラーメッセージが表示される
```

---

# Phase 7: 分析 & インサイト テスト

## T-7.1: VelocityMetrics テスト

**テストファイル**: `src-tauri/src/analytics/velocity_test.rs`

### ユニットテスト

```
T-7.1.1 コミットメトリクス
├── ✅ 指定期間内のコミット数が正しくカウントされる
├── ✅ author別の集計が正しい
├── ✅ 1日あたりの平均コミット数が正しく算出される
├── ✅ 連続コミット日数（ストリーク）が正しく計算される
├── ✅ コミットが0件の期間で安全にデフォルト値が返る
└── ✅ マージコミットがカウントから除外される（設定による）

T-7.1.2 コード変更メトリクス
├── ✅ 追加行数・削除行数が正しくカウントされる
├── ✅ 言語別の集計が正しい（拡張子ベース判定）
├── ✅ net_growth = lines_added - lines_deleted
└── ✅ バイナリファイルの変更はカウントされない

T-7.1.3 設計書更新率（doc-mapping連携）
├── ✅ ソース変更に伴って設計書も更新された場合 sync_rate が高くなる
├── ✅ ソース変更のみで設計書未更新の場合 sync_rate が低くなる
└── ✅ ドキュメントのみの変更はカウントに含まれない

T-7.1.4 トレンドデータ
├── ✅ 週次粒度で直近N週分のデータが返る
├── ✅ 月次粒度で直近N月分のデータが返る
├── ✅ 各期間の区切りが正しい（月曜始まり等）
└── ✅ データがない期間はゼロ値で埋められる
```

### 統合テスト

```
T-7.1.5 TestRepoでのメトリクス検証
├── ✅ 複数コミットを持つTestRepoでVelocityMetricsが正しく算出される
└── ✅ 期間フィルタが正しく動作する
```

---

## T-7.2: AI Impact テスト

**テストファイル**: `src-tauri/src/analytics/ai_impact_test.rs`

```
T-7.2.1 タスクメトリクス
├── ✅ 実行タスク数がタイプ別に正しく集計される
├── ✅ 成功率 = 成功タスク / 全タスク
├── ✅ 承認率 = 承認タスク / 承認要求タスク
└── ✅ タスクログが空の場合はゼロ値が返る

T-7.2.2 コード貢献メトリクス
├── ✅ AIコミット（prefix識別）の行数が正しく集計される
├── ✅ acceptance_rate = 最終的に残った行数 / 生成された行数
└── ✅ テスト生成数が正しくカウントされる

T-7.2.3 時間節約推定
├── ✅ タスクタイプ別の推定手動時間が設定値に基づいて算出される
├── ✅ savings_ratio = (estimated_manual - actual_ai) / estimated_manual
└── ✅ 推定値が負にならない（AIの方が時間がかかった場合は0）

T-7.2.4 ドキュメント保守メトリクス
├── ✅ AI更新前後の鮮度スコア平均が正しく算出される
└── ✅ doc_coverage_improvement が正の値で算出される
```

---

## T-7.3: SprintAnalysis テスト

**テストファイル**: `src-tauri/src/analytics/sprint_test.rs`

```
T-7.3.1 スプリント情報
├── ✅ .devnest.yamlの設定から正しいスプリント期間が計算される
├── ✅ 2週間スプリント: 月曜始まりで正しい開始/終了日
├── ✅ 現在のスプリントが正しく判定される
└── ✅ スプリント名が自動連番で生成される

T-7.3.2 保守デルタ
├── ✅ スプリント開始時と終了時の負債スコア差分が正しい
├── ✅ カバレッジの変化が正しく計算される
├── ✅ 開始時のスナップショットが無い場合は最も近い過去データを使用
└── ✅ デルタがゼロの場合も正常に処理される

T-7.3.3 ハイライト/懸念自動検出
├── ✅ 速度が前スプリント比20%以上増加 → VelocityIncrease
├── ✅ カバレッジが改善 → CoverageImproved
├── ✅ 負債が減少 → DebtReduced
├── ✅ 全設計書がcurrent → AllDocsCurrent
├── ✅ 速度が前スプリント比20%以上低下 → VelocityDrop
├── ✅ カバレッジが低下 → CoverageDrop
├── ✅ 負債が増加 → DebtIncreased
└── ✅ 特定タスクの失敗率が50%超 → HighFailureRate

T-7.3.4 スプリント履歴
├── ✅ 直近Nスプリントの分析が配列で返る
├── ✅ 時系列順（古い→新しい）でソートされている
└── ✅ 存在するスプリント数 < N の場合、存在する分だけ返る
```

---

## T-7.4: AnalyticsDashboard UIテスト

**テストファイル**: `src/components/__tests__/AnalyticsDashboard.test.tsx`

```
T-7.4.1 パネル表示
├── ✅ 開発速度トレンドパネルが表示される
├── ✅ AI効果サマリーパネルが表示される
├── ✅ スプリント比較パネルが表示される
├── ✅ 保守健全性トレンドパネルが表示される
└── ✅ データ取得中のローディング表示

T-7.4.2 フィルタ操作
├── ✅ 期間フィルタ切替（日/週/月/スプリント）でデータが更新される
├── ✅ プロダクト切替で分析データが切り替わる
└── ✅ 日付範囲のカスタム指定が動作する

T-7.4.3 グラフ表示
├── ✅ rechartsのLineChartがコミット数トレンドを表示する
├── ✅ データが0件の場合に空グラフが表示される（クラッシュしない）
└── ✅ ホバーでツールチップに詳細値が表示される
```

---

# Phase 8: アジャイルエンジン テスト

## T-8.1: Kanban テスト

**テストファイル**: `src-tauri/src/agile/kanban_test.rs`

### ユニットテスト

```
T-8.1.1 ボード操作
├── ✅ ボードを作成するとデフォルト列（Backlog/InProgress/Review/Done）が生成される
├── ✅ カスタム列を追加できる
├── ✅ 列の順序を変更できる
└── ✅ 空のボードが正しく初期化される

T-8.1.2 カード操作
├── ✅ カードを作成してBacklogに追加できる
├── ✅ カードを別の列に移動できる
├── ✅ moved_to_column_at が移動時に更新される
├── ✅ カードの優先度を変更できる
├── ✅ カードにラベルを追加/削除できる
└── ✅ カードを削除できる

T-8.1.3 WIP制限
├── ✅ WIP制限内であればカード移動が成功する
├── ✅ WIP制限を超える移動は WipLimitExceeded エラーが返る
├── ✅ WIP制限が未設定の列では制限なく移動できる
├── ✅ WIP制限を0に設定するとその列には一切移動できない
└── ✅ カードを列から移出するとWIPカウントが減る

T-8.1.4 リンク機能
├── ✅ カードにGitHub Issue URLをリンクできる
├── ✅ カードに設計書パスをリンクできる
├── ✅ カードに技術的負債アイテムをリンクできる
└── ✅ リンク先が存在しない場合でもカードは作成できる

T-8.1.5 自動ルール
├── ✅ PR Merged → Done列に自動移動
├── ✅ AgentTask完了 → 次の列に自動移動
├── ✅ トリガー条件にマッチしないイベントではルール発火しない
└── ✅ 複数ルールが同時に発火した場合、最初のマッチのみ適用
```

### 統合テスト（MockMcpServer使用）

```
T-8.1.6 GitHub Issue同期
├── ✅ GitHub Issueを取得してカンバンカードに変換できる
├── ✅ カードの列移動がGitHub Issueのラベル更新に反映される
├── ✅ 新しいIssueがGitHubに作成されるとBacklogにカードが追加される
├── ✅ MCP接続断時にエラーが返り、ローカル操作は継続できる
└── ✅ 同期コンフリクト（両方で変更）時にローカル優先で警告表示

T-8.1.7 技術的負債インポート
├── ✅ 保守スキャンの負債アイテムがカンバンカードに変換される
├── ✅ 既にカード化済みの負債はスキップされる
└── ✅ 負債のseverityがカードのpriorityに変換される
```

### UIテスト

**テストファイル**: `src/components/__tests__/KanbanBoard.test.tsx`

```
T-8.1.8 ボードUI
├── ✅ 全列が表示される
├── ✅ 各列のカードが正しく表示される
├── ✅ WIP制限超過の列が赤枠で表示される
├── ✅ カードクリックで詳細モーダルが開く
├── ✅ フィルタ（ラベル、優先度）が動作する
└── ✅ 空のボードで「カードを追加」プロンプトが表示される
```

---

## T-8.2: SprintPlanner テスト

**テストファイル**: `src-tauri/src/agile/sprint_planner_test.rs`

```
T-8.2.1 プラン生成
├── ✅ バックログのカードから推奨セットが選択される
├── ✅ 過去のベロシティに基づいて適切な量が提案される
├── ✅ 保守タスクが自動的に含まれる（カバレッジ低下時にテスト追加等）
├── ✅ バックログが空の場合、保守タスクのみのプランが返る
├── ✅ estimated_velocityが過去3スプリントの平均に近い値になる
└── ✅ 依存関係のあるカードは順序が保証される

T-8.2.2 プラン承認
├── ✅ 承認するとカードがInProgress列に移動する
├── ✅ 保守タスクがAgentic Flowのキューに追加される
└── ✅ SprintInfoが保存され、Phase 7の分析で利用可能になる

T-8.2.3 エッジケース
├── ✅ ベロシティデータが無い場合（初回スプリント）はデフォルト値を使用
├── ✅ バックログのカードすべてがestimated_effort未設定でも動作する
└── ✅ 依存関係が循環している場合に検出・警告される
```

---

## T-8.3: Retrospective テスト

**テストファイル**: `src-tauri/src/agile/retrospective_test.rs`

```
T-8.3.1 自動生成
├── ✅ SprintAnalysisのデータからwent_wellが生成される
├── ✅ could_improveが問題検出に基づいて生成される
├── ✅ action_itemsが改善提案として生成される
├── ✅ カテゴリが正しく分類される（Velocity/Quality/Maintenance/AI/Process）
└── ✅ evidence フィールドに具体的な数値が含まれる

T-8.3.2 年輪レトロスペクティブ
├── ✅ スプリントごとにYearRingEntryが作成される
├── ✅ growth_areasにメトリクスの改善領域が含まれる
├── ✅ ring_widthが成長度合いに比例する
├── ✅ 履歴が時系列で蓄積される
└── ✅ メトリクスが悪化した場合もring_widthは0以上（成長ゼロ、負にはならない）

T-8.3.3 アクションアイテム連携
├── ✅ auto_card=trueのアクションが次スプリントのBacklogにカード追加される
├── ✅ 前スプリントの未達アクションが引き継がれる
└── ✅ 完了済みアクションはカード追加されない
```

---

## T-8.4: StoryMap テスト

**テストファイル**: `src-tauri/src/agile/story_map_test.rs`

```
T-8.4.1 ストーリーマップ操作
├── ✅ マップを作成して Activity と Release を追加できる
├── ✅ UserStoryを Activity + Release に配置できる
├── ✅ ストーリーをカンバンカードにリンクできる
├── ✅ ストーリーを設計書にリンクできる
├── ✅ Activityの並び替えができる
└── ✅ Releaseの追加/削除ができる

T-8.4.2 UIテスト
├── ✅ 横軸にActivity、縦軸にReleaseのグリッドが表示される
├── ✅ ストーリーカードをドラッグで移動できる
└── ✅ リリース区切り線が正しく表示される
```

---

## T-8.5: FlowOptimization テスト

**テストファイル**: `src-tauri/src/agile/flow_test.rs`

```
T-8.5.1 サイクルタイム
├── ✅ InProgress → Done のサイクルタイムが正しく計算される
├── ✅ 平均/中央値/P85が算出される
├── ✅ 列移動が無いカードは計算から除外される
└── ✅ 現在進行中のカードは含まれない

T-8.5.2 スループット
├── ✅ 週あたりの完了カード数が正しく算出される
├── ✅ 日別のスループット分布が取得できる
└── ✅ ゼロスループットの週も含まれる

T-8.5.3 ボトルネック検出
├── ✅ 平均滞在時間が最長の列がボトルネックとして検出される
├── ✅ WIP制限を常に上限まで使っている列が検出される
└── ✅ ボトルネックが無い場合（均等な流れ）は空リスト

T-8.5.4 WIP制限最適化提案
├── ✅ ボトルネック列のWIP制限引き下げが提案される
├── ✅ 遊んでいる列のWIP制限引き上げが提案される
├── ✅ リトルの法則に基づくリードタイム予測が算出される
└── ✅ 十分なデータがない場合（カード10件未満）は提案を保留
```

---

# Phase 9: 外部ツール統合 テスト

## T-9.1: McpHub テスト

**テストファイル**: `src-tauri/src/mcp/hub_test.rs`

### ユニットテスト

```
T-9.1.1 設定パース
├── ✅ 正常なmcp-config.yamlがパースできる
├── ✅ 環境変数プレースホルダ（${GITHUB_TOKEN}）が解決される
├── ✅ 無効なYAMLでエラーが返る
├── ✅ 未知のtransport typeでエラーが返る
└── ✅ servers配列が空でも正常に動作する

T-9.1.2 接続管理
├── ✅ 有効なサーバーに接続してConnectedステータスになる（MockMcpServer）
├── ✅ 接続失敗時にError ステータスになる
├── ✅ 切断後にDisconnectedステータスになる
├── ✅ 再接続が設定回数まで試行される
├── ✅ ヘルスチェックが定期的に実行される
└── ✅ 最大同時接続数を超えるとエラーが返る

T-9.1.3 プロダクト切替時の再構成
├── ✅ プロダクト別設定で不要な接続が切断される
├── ✅ プロダクト別設定で必要な接続が追加される
├── ✅ additional_serversが正しく追加される
└── ✅ .devnest.yamlが無いプロダクトではグローバル設定が使われる
```

### 統合テスト

```
T-9.1.4 ツール呼び出しE2E（MockMcpServer使用）
├── ✅ MockMcpServerに接続してツール一覧が取得できる
├── ✅ ツールを呼び出して結果が返る
├── ✅ 呼び出し履歴がMockに記録される
├── ✅ 接続中にサーバーが停止した場合に再接続が試行される
└── ✅ タイムアウト時にエラーが返る
```

---

## T-9.2: ToolRegistry テスト

**テストファイル**: `src-tauri/src/mcp/tool_registry_test.rs`

```
T-9.2.1 ツール解決
├── ✅ 完全修飾名 "github.create_issue" で一意に解決される
├── ✅ 短縮名 "create_issue" が1サーバーにしかない場合は解決される
├── ✅ 短縮名が複数サーバーに存在する場合は Ambiguous が返る
├── ✅ 存在しないツール名で NotFound が返る
├── ✅ ワイルドカード "github.*" で全GitHubツールが列挙される
└── ✅ サーバー登録/削除時にインデックスが更新される

T-9.2.2 カテゴリ分類
├── ✅ サーバー別にツールがグルーピングされる
└── ✅ searchToolsで部分一致検索ができる
```

---

## T-9.3: PolicyEngine テスト

**テストファイル**: `src-tauri/src/mcp/policy_test.rs`

```
T-9.3.1 ポリシー評価
├── ✅ allowedリストに含まれるツール → Allow
├── ✅ blockedリストに含まれるツール → Deny
├── ✅ require_approvalリストに含まれるツール → RequireApproval
├── ✅ blocked が allowed より優先される
├── ✅ ワイルドカード "admin_*" が admin_delete_user にマッチする
├── ✅ ワイルドカード "*" が全ツールにマッチする
└── ✅ どのリストにも含まれないツール → Deny（安全側にデフォルト）

T-9.3.2 呼び出し元による制御
├── ✅ UI経由: require_approval のツールも Allow（ユーザーが意図的に操作）
├── ✅ AgenticFlow経由: require_approval のツールは RequireApproval
├── ✅ ClaudeCodeBridge経由: High リスクツールは常に RequireApproval
└── ✅ Caller情報がContextに含まれていない場合はDeny

T-9.3.3 プロダクト別オーバーライド
├── ✅ プロダクト設定でrequire_approvalを空にすると全ツールがAutoApprove
├── ✅ プロダクト設定でenabledをfalseにするとサーバー全体が無効化
└── ✅ グローバルのblockedはプロダクト設定で上書きできない（安全側）
```

---

## T-9.4: GitHub/Slack/Redmine アダプターテスト

**テストファイル**: `src-tauri/src/mcp/adapters/github_test.rs` 等

### GitHubアダプター（MockMcpServer使用）

```
T-9.4.1 Issue操作
├── ✅ create_maintenance_issue が正しいtitle/body/labelsでcreate_issueを呼ぶ
├── ✅ 保守スキャン結果の脆弱性情報がIssue bodyに含まれる
└── ✅ create_debt_issue が負債のseverityに応じたラベルを設定する

T-9.4.2 PR操作
├── ✅ create_agent_pr がタスク情報を含むPR bodyを生成する
├── ✅ add_doc_impact_comment が影響設計書一覧をコメントに含める
└── ✅ PR body にテスト結果サマリーが含まれる

T-9.4.3 リリース操作
├── ✅ create_release がタグとリリースノートを正しく設定する
└── ✅ changelogの内容がrelease bodyに含まれる
```

### Slackアダプター

```
T-9.4.4 通知
├── ✅ notify_task_completion がチャンネルとメッセージ内容を正しく設定する
├── ✅ send_maintenance_alert がアラートレベルに応じた書式で送信する
└── ✅ send_report がMarkdownフォーマットのレポートを送信する
```

### Redmineアダプター

```
T-9.4.5 チケット同期
├── ✅ sync_ticket_status がカンバン列に応じたRedmineステータスを設定する
├── ✅ create_debt_ticket が正しいプロジェクトIDとトラッカーで作成する
└── ✅ fetch_time_entries が期間フィルタで工数データを取得する
```

---

## T-9.5-9.7: MCP管理UI テスト

**テストファイル**: `src/components/__tests__/McpManager.test.tsx`

```
T-9.5.1 接続管理画面
├── ✅ 全サーバーの接続状態が表示される
├── ✅ 接続/切断ボタンが正しく動作する
├── ✅ エラー状態のサーバーにRetryボタンが表示される
├── ✅ サーバー追加フォームが動作する
└── ✅ 設定変更が保存される

T-9.5.2 ツールエクスプローラー
├── ✅ サーバー別にツール一覧が表示される
├── ✅ ポリシー（Allow/Approval/Block）がアイコンで表示される
├── ✅ Testボタンでテスト実行モーダルが開く
├── ✅ 検索フィルタが動作する
└── ✅ ツールのinput_schemaがJSON形式で表示される
```

---

# Phase 10: コラボレーション テスト

## T-10.1: TeamDashboard テスト

**テストファイル**: `src-tauri/src/collaboration/team_test.rs`

```
T-10.1.1 メンバー集計
├── ✅ GitHubのcontributorsからメンバー一覧が生成される
├── ✅ 各メンバーのcommit/PR/レビューリクエスト数が正しい
├── ✅ active_cardsがカンバンのInProgress列からカウントされる
└── ✅ チーム未設定時（個人モード）でも安全に動作する

T-10.1.2 レビュー待ち集約
├── ✅ 全プロダクトのレビュー待ちPRが集約される
├── ✅ 待ち時間の長い順にソートされる
└── ✅ MCP接続が無い場合はローカルデータのみ返す
```

---

## T-10.2: Knowledge テスト

**テストファイル**: `src-tauri/src/collaboration/knowledge_test.rs`

```
T-10.2.1 ナレッジ操作
├── ✅ エントリの作成/読取/更新/削除が可能
├── ✅ タグでフィルタリングできる
├── ✅ プロダクト別にフィルタリングできる
├── ✅ linked_docsから設計書への参照が解決できる
├── ✅ 全文検索でタイトルと内容から検索できる
└── ✅ KnowledgeType別にフィルタリングできる

T-10.2.2 コメント
├── ✅ エントリにコメントを追加できる
├── ✅ コメントが時系列で取得できる
└── ✅ コメントを削除できる
```

---

## T-10.3: MultiAgent テスト

**テストファイル**: `src-tauri/src/collaboration/multi_agent_test.rs`

```
T-10.3.1 エージェント管理
├── ✅ ScrumRoleごとにエージェントが設定できる
├── ✅ MCP経由でエージェントに接続できる（MockMcpServer）
├── ✅ エージェントの実行結果がカンバンに反映される
└── ✅ エージェントが無効化されている場合は安全にスキップされる

T-10.3.2 セレモニー管理
├── ✅ CeremonyScheduleに基づいてセレモニーがトリガーされる
├── ✅ スプリントプランニングがSprintPlannerと連携する
├── ✅ レトロスペクティブがRetrospectiveと連携する
└── ✅ セレモニーの実行ログが保存される

T-10.3.3 オプショナル動作
├── ✅ scrum-agents未インストール時にエラーではなく機能無効化される
├── ✅ 一部のエージェントのみ有効でも動作する
└── ✅ エージェント実行中にタイムアウトした場合に安全にキャンセルされる
```

---

# E2Eテスト

## 主要ユーザーフロー

**テストファイル**: `src-tauri/tests/e2e/`

```
E2E-1: 設計書 → コード生成 → レビュー → マージ
├── TestRepoに設計書を作成
├── CodeGenで骨格生成
├── ReviewAgentでレビュー実行
├── 結果がPRコメントに投稿される（MockMcpServer）
└── doc-mappingが更新されている

E2E-2: 保守スキャン → Issue作成 → Slack通知
├── TestRepoに脆弱性のある依存を設定
├── 保守スキャン実行
├── GitHubAdapterでIssue作成（MockMcpServer）
├── SlackAdapterで通知送信（MockMcpServer）
└── カンバンにカードが追加されている

E2E-3: スプリントライフサイクル
├── バックログにカードを作成
├── SprintPlannerでプラン生成
├── プラン承認
├── カードをDoneに移動
├── スプリント分析が生成される
├── レトロスペクティブが自動生成される
├── 年輪エントリが追加される
└── 次スプリントのBacklogにアクションアイテムが追加される

E2E-4: マルチプロダクト横断操作
├── 2つのTestRepoをプロダクトとして登録
├── プロダクト切替でMCP接続が再構成される
├── 各プロダクトの保守データが独立している
├── ポートフォリオダッシュボードで両方が表示される
└── 分析データがプロダクト別に集計されている
```

---

## テスト実行コマンド

```bash
# 全ユニットテスト（Rust）
cargo test

# 特定Phase のテスト
cargo test ai::           # Phase 6
cargo test analytics::    # Phase 7
cargo test agile::        # Phase 8
cargo test mcp::          # Phase 9
cargo test collaboration:: # Phase 10

# カバレッジ計測
cargo tarpaulin --out json --output-dir .devnest/coverage/

# フロントエンドテスト
pnpm test                 # 全テスト
pnpm test -- --grep "Kanban"  # 特定コンポーネント

# E2Eテスト
cargo test --test e2e

# CI用（全テスト + カバレッジ + lint）
cargo clippy -- -D warnings && cargo test && cargo tarpaulin
pnpm lint && pnpm test
```
