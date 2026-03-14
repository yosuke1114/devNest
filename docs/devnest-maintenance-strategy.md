# DevNest プロダクト保守戦略 設計書

## 1. 概要

DevNestにおける保守を2つのレイヤーで捉え、統合的に管理する。

| レイヤー | 対象 | 目的 |
|---|---|---|
| **Self（内部保守）** | DevNest自体のコードベース | DevNest自身の健全性を維持する |
| **Managed（外部保守支援）** | DevNestで管理するプロダクト群 | 管理対象プロダクトの保守を支援する |

両レイヤーで共通の仕組みを使いつつ、DevNest固有の課題にも対応する。

### 前提ドキュメント
- [ドキュメント↔ソース マッピング構造 設計書](./doc-mapping-design.md)

---

## 2. 保守ダッシュボード（Maintenance Dashboard）

DevNest UIに「保守ダッシュボード」画面を追加し、
4つの保守軸を一画面で俯瞰できるようにする。

```
┌─────────────────────────────────────────────────────────────┐
│  DevNest Maintenance Dashboard              [Project ▼]    │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│  📦 Dependencies     │  🧪 Test Coverage                    │
│  ┌────────────────┐  │  ┌────────────────────────────────┐  │
│  │ Outdated:  3   │  │  │  Overall: 72.4%  ▲ +1.2%      │  │
│  │ Vuln:      1   │  │  │  ┌──────────────────────────┐  │  │
│  │ Major:     1   │  │  │  │ ████████████░░░░░░░ 72%  │  │  │
│  │ Up-to-date: 24 │  │  │  └──────────────────────────┘  │  │
│  └────────────────┘  │  │  Uncovered hot paths: 5        │  │
│                      │  └────────────────────────────────┘  │
├──────────────────────┼──────────────────────────────────────┤
│                      │                                      │
│  🏗️ Tech Debt        │  🔄 Refactor Candidates             │
│  ┌────────────────┐  │  ┌────────────────────────────────┐  │
│  │ Score: 34/100  │  │  │  1. github/api.rs    (0.82)   │  │
│  │ Trend: ▼ -2    │  │  │  2. editor/state.rs  (0.71)   │  │
│  │ Items: 12      │  │  │  3. commands/mod.rs   (0.65)   │  │
│  │ Critical: 2    │  │  │  ────────────────────────────  │  │
│  └────────────────┘  │  │  [AI分析を実行] [詳細]         │  │
│                      │  └────────────────────────────────┘  │
├──────────────────────┴──────────────────────────────────────┤
│  📄 Doc Health  🟢 12  🟡 3  🔴 1  (from doc-mapping)      │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 依存ライブラリ更新管理

### 3.1 対象

DevNestはTauri v2アプリのため、2つのエコシステムを管理する必要がある。

| エコシステム | マニフェスト | ロックファイル | ツール |
|---|---|---|---|
| Rust (Backend) | `Cargo.toml` | `Cargo.lock` | `cargo outdated`, `cargo audit` |
| Node.js (Frontend) | `package.json` | `package-lock.json` / `pnpm-lock.yaml` | `npm outdated`, `npm audit` |

### 3.2 データモデル

```rust
/// 依存ライブラリの状態
#[derive(Debug, Serialize, Deserialize)]
pub struct DependencyStatus {
    pub name: String,
    pub ecosystem: Ecosystem,          // Rust | Node
    pub current_version: String,
    pub latest_version: String,
    pub update_type: UpdateType,       // Patch | Minor | Major
    pub has_vulnerability: bool,
    pub vulnerability_severity: Option<Severity>,  // Low | Medium | High | Critical
    pub changelog_url: Option<String>,
    pub last_checked: DateTime<Utc>,
    // マッピング構造と連携: この依存が影響するソースファイル群
    pub affected_sources: Vec<String>,
    // affected_sources → doc-map → 影響設計書
    pub affected_docs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DependencyReport {
    pub checked_at: DateTime<Utc>,
    pub rust_deps: Vec<DependencyStatus>,
    pub node_deps: Vec<DependencyStatus>,
    pub total_outdated: usize,
    pub total_vulnerable: usize,
    pub update_plan: Option<UpdatePlan>,  // AI生成の更新計画
}
```

### 3.3 更新フロー

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ 定期スキャン │────▶│ cargo outdated   │────▶│ DependencyReport│
│ or 手動実行  │     │ cargo audit      │     │ を生成          │
│              │     │ npm outdated     │     │                 │
│              │     │ npm audit        │     │                 │
└──────────────┘     └──────────────────┘     └───────┬─────────┘
                                                      │
                                                      ▼
                                           ┌─────────────────────┐
                                           │ 影響分析             │
                                           │                     │
                                           │ 1. affected_sources │
                                           │    を特定           │
                                           │ 2. doc-map で       │
                                           │    影響設計書を特定 │
                                           │ 3. breaking changes │
                                           │    を検出           │
                                           └───────┬─────────────┘
                                                   │
                                        ┌──────────┼──────────┐
                                        ▼          ▼          ▼
                                   ┌────────┐ ┌────────┐ ┌──────────┐
                                   │ Patch  │ │ Minor  │ │ Major    │
                                   │ 自動   │ │ 提案   │ │ 計画策定 │
                                   │ 適用可 │ │ +テスト│ │ +AI分析  │
                                   └────────┘ └────────┘ └──────────┘
```

### 3.4 Tauriコマンド

```rust
/// 依存ライブラリの状態をスキャン
#[tauri::command]
async fn scan_dependencies(project_path: String) -> Result<DependencyReport, AppError>

/// 特定の依存更新の影響範囲を分析
#[tauri::command]
async fn analyze_update_impact(
    project_path: String,
    dep_name: String,
    target_version: String,
) -> Result<UpdateImpact, AppError>

/// 更新計画を生成（Claude連携）
#[tauri::command]
async fn generate_update_plan(
    project_path: String,
    report: DependencyReport,
) -> Result<UpdatePlan, AppError>
```

---

## 4. 技術的負債の可視化

### 4.1 負債メトリクス

複数の指標を組み合わせて「負債スコア」を算出する。

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct TechDebtItem {
    pub id: String,
    pub category: DebtCategory,
    pub location: SourceLocation,       // ファイル + 行範囲
    pub severity: DebtSeverity,         // Low | Medium | High | Critical
    pub description: String,
    pub detected_at: DateTime<Utc>,
    pub estimated_effort: Duration,     // 修正にかかる見積もり時間
    pub related_docs: Vec<String>,      // doc-mapから逆引き
    pub auto_detected: bool,            // 自動検出 or 手動登録
}

pub enum DebtCategory {
    TodoFixme,          // TODO/FIXME コメント
    CodeComplexity,     // 循環的複雑度が高い関数
    Duplication,        // コード重複
    DeadCode,           // 未使用コード
    DeprecatedApi,      // 非推奨API使用
    MissingTests,       // テストがないpublicインターフェース
    DocDrift,           // ドキュメントとソースの乖離（doc-map連携）
    LargeFile,          // ファイルが大きすぎる（分割候補）
    DeepNesting,        // ネストが深い
    ManualEntry,        // 開発者が手動登録した負債
}
```

### 4.2 自動検出ソース

| 検出方法 | 対象 | ツール/手法 |
|---|---|---|
| 静的解析 | 複雑度, ネスト深度, ファイルサイズ | `clippy`, カスタムlint, AST解析 |
| パターン検索 | TODO/FIXME, deprecated | `grep`, `ripgrep` |
| Git履歴分析 | ホットスポット（頻繁変更箇所） | `git log --stat` |
| テスト解析 | カバレッジ不足箇所 | `cargo tarpaulin`, `jest --coverage` |
| Doc-map連携 | ドキュメント乖離 | 鮮度スコア（前回設計書参照） |
| 依存分析 | 非推奨API, EOLライブラリ | `cargo audit`, advisory DB |

### 4.3 負債トレンド追跡

```yaml
# .devnest/debt-history.yaml （自動更新）
snapshots:
  - date: "2026-03-01"
    total_score: 36
    items_count: 14
    by_category:
      TodoFixme: 5
      CodeComplexity: 3
      MissingTests: 4
      DocDrift: 2

  - date: "2026-03-08"
    total_score: 34
    items_count: 12
    by_category:
      TodoFixme: 4
      CodeComplexity: 3
      MissingTests: 3
      DocDrift: 2
```

これにより「負債が増えているか減っているか」のトレンドをダッシュボードに表示可能。

---

## 5. リファクタリング判断の支援

### 5.1 リファクタリング候補スコア

複数の指標を重み付けして「リファクタリング優先度スコア」を算出する。

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct RefactorCandidate {
    pub file_path: String,
    pub score: f64,                     // 0.0 - 1.0
    pub factors: RefactorFactors,
    pub suggested_actions: Vec<String>, // AI生成の改善提案
    pub related_docs: Vec<String>,
    pub estimated_impact: ImpactLevel,  // Low | Medium | High
}

pub struct RefactorFactors {
    pub change_frequency: f64,     // git logから算出（高い = よく変更される）
    pub complexity: f64,           // 循環的複雑度
    pub coupling: f64,             // 他モジュールとの結合度
    pub test_coverage: f64,        // テストカバレッジ（低い = リスク高）
    pub file_size: f64,            // LOC
    pub debt_density: f64,         // 負債アイテム数 / LOC
    pub doc_staleness: f64,        // 対応設計書の鮮度（doc-map連携）
}
```

### 5.2 スコア算出ロジック

```
refactor_score =
    change_frequency  * 0.25    // よく変更される箇所を優先
  + complexity        * 0.20    // 複雑なコードを優先
  + (1 - test_coverage) * 0.20  // テストが薄い箇所を優先
  + coupling          * 0.15    // 結合度が高い箇所を優先
  + debt_density      * 0.10    // 負債が集中している箇所を優先
  + doc_staleness     * 0.10    // ドキュメントが古い箇所を優先
```

### 5.3 Churn × Complexity マトリクス

Git履歴の変更頻度（churn）と複雑度を2軸にしたマトリクスで可視化。

```
            高複雑度
               │
    ┌──────────┼──────────┐
    │ 安定だが │ 🔴最優先  │
    │ 複雑     │ リファクタ│
    │          │ 対象      │
    │          │           │
────┼──────────┼──────────┼──── 高変更頻度
    │          │           │
    │ 🟢健全   │ 🟡要注意  │
    │          │ テスト強化│
    │          │           │
    └──────────┼──────────┘
               │
            低複雑度
```

右上象限（高頻度変更 × 高複雑度）がリファクタリングの最優先対象。

### 5.4 AI支援リファクタリング提案

```rust
/// リファクタリング候補を分析・ランキング
#[tauri::command]
async fn analyze_refactor_candidates(
    project_path: String,
    top_n: usize,
) -> Result<Vec<RefactorCandidate>, AppError>

/// 特定ファイルのリファクタリング計画をAIで生成
#[tauri::command]
async fn suggest_refactoring(
    project_path: String,
    file_path: String,
    candidate: RefactorCandidate,
) -> Result<RefactorPlan, AppError>
```

`RefactorPlan` には以下を含む:
- 具体的なリファクタリング手順
- 影響を受けるテストケース
- 更新が必要な設計書（doc-map参照）
- 推定工数
- リスク評価

---

## 6. テストカバレッジ管理

### 6.1 デュアルエコシステム対応

| エコシステム | ツール | 出力形式 |
|---|---|---|
| Rust | `cargo tarpaulin` | LCOV, JSON |
| TypeScript/React | `jest --coverage` / `vitest --coverage` | LCOV, JSON |

### 6.2 データモデル

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct CoverageReport {
    pub generated_at: DateTime<Utc>,
    pub commit: String,
    pub overall: CoverageMetrics,
    pub by_file: Vec<FileCoverage>,
    pub uncovered_hot_paths: Vec<HotPath>,  // 変更頻度が高いのにカバレッジが低い
    pub trend: CoverageTrend,
}

pub struct FileCoverage {
    pub path: String,
    pub line_coverage: f64,
    pub branch_coverage: Option<f64>,
    pub uncovered_lines: Vec<u32>,
    // doc-map連携: このファイルに対応する設計書
    pub related_docs: Vec<String>,
    // リファクタリング連携: change_frequency
    pub change_frequency: f64,
}

/// カバレッジが低い × 変更頻度が高い = 危険な箇所
pub struct HotPath {
    pub file_path: String,
    pub coverage: f64,
    pub change_frequency: f64,
    pub risk_score: f64,            // (1 - coverage) * change_frequency
    pub suggested_test_types: Vec<TestType>,  // Unit | Integration | E2E
}
```

### 6.3 カバレッジ目標とゲート

```yaml
# .devnest/coverage-config.yaml
targets:
  overall_minimum: 70.0
  new_code_minimum: 80.0     # 新規コードは高めの基準
  critical_paths_minimum: 90.0

critical_paths:
  - "src/github/"            # 外部API連携は高カバレッジ必須
  - "src/commands/"          # Tauriコマンドはインターフェース
  - "src/doc_mapping/"       # マッピングロジックは正確性が命

gate_rules:
  pr_block: false            # カバレッジ低下でPRをブロックするか
  pr_warn: true              # カバレッジ低下でPRに警告を出すか
  threshold_drop: 2.0        # これ以上の低下で警告（%）
```

### 6.4 テスト推奨エンジン

```rust
/// カバレッジが不足している箇所にテスト追加を推奨
#[tauri::command]
async fn suggest_tests(
    project_path: String,
    file_path: String,
) -> Result<TestSuggestions, AppError>
```

Claude連携で以下を自動生成:
- 未テストのpublic関数に対するユニットテストの骨格
- エッジケースの提案（エラーパス、境界値）
- 既存テストの改善提案

---

## 7. 4軸の統合 ─ クロスカッティング分析

4つの保守軸は独立ではなく、相互に関連する。
doc-mapping構造を「ハブ」として各軸をつなぐ。

```
                    ┌─────────────────────┐
                    │   Doc Mapping       │
                    │   (.doc-map.yaml)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ Dependencies │  │  Tech Debt   │  │   Coverage   │
   │              │  │              │  │              │
   │ "tokioを更新 │  │ "editor/     │  │ "github/     │
   │  すると      │  │  state.rsに  │  │  api.rsの    │
   │  github/に   │  │  TODO 3件"   │  │  coverage    │
   │  影響"       │  │              │  │  = 45%"      │
   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
          │                 │                 │
          └────────────────┐│┌────────────────┘
                           ▼▼▼
                  ┌──────────────────┐
                  │  Refactor Score  │
                  │                  │
                  │  全指標を統合し   │
                  │  優先度を算出     │
                  └──────────────────┘
```

### 統合クエリの例

「このファイルについて全部教えて」と聞くと:

```json
{
  "file": "src/github/api.rs",
  "dependencies_using": ["octocrab 0.38", "tokio 1.36"],
  "pending_updates": ["octocrab 0.38 → 0.41 (minor)"],
  "tech_debt": [
    { "type": "TodoFixme", "count": 2 },
    { "type": "CodeComplexity", "cyclomatic": 14 }
  ],
  "test_coverage": {
    "line": 0.45,
    "branch": 0.32,
    "risk": "high (low coverage × high churn)"
  },
  "related_docs": [
    {
      "path": "docs/api/github-integration.md",
      "status": "outdated",
      "staleness_score": 0.6
    }
  ],
  "refactor_score": 0.82,
  "refactor_rank": 1
}
```

---

## 8. Self保守（DevNest自体）固有の考慮事項

### 8.1 Tauri v2 特有の課題

| 課題 | 対応策 |
|---|---|
| Rust + Node 両方の依存管理 | 統合スキャンで一元化（セクション3） |
| Tauri本体のメジャーアップデート | breaking changes検出 + 移行計画生成 |
| WebView互換性 | プラットフォーム別テストマトリクス |
| IPC（invoke）のインターフェース変更 | API定義設計書との整合性チェック |

### 8.2 DevNest固有のCI/CD保守タスク

```yaml
# .github/workflows/maintenance.yml（イメージ）
name: DevNest Maintenance Check
on:
  schedule:
    - cron: '0 9 * * 1'  # 毎週月曜 9:00
  workflow_dispatch:

jobs:
  dependency-check:
    # cargo outdated + npm outdated + audit
  coverage-report:
    # cargo tarpaulin + jest coverage → summary
  debt-scan:
    # clippy + TODO/FIXME count + complexity check
  doc-freshness:
    # doc-map staleness check
```

---

## 9. 実装ロードマップ

### Phase 1: 基盤（doc-mapping連携前提あり）
1. 依存スキャン（`cargo outdated` + `npm outdated` パース）
2. 基本的なテストカバレッジ収集（`tarpaulin` + `jest` パース）
3. TODO/FIXMEスキャン
4. ダッシュボードUI（4パネル基本版）

### Phase 2: 分析
5. 技術的負債スコア算出
6. Git churn分析
7. Churn × Complexity マトリクス
8. リファクタリング候補ランキング

### Phase 3: AI統合
9. Claude連携の更新計画生成
10. リファクタリング提案生成
11. テスト自動生成提案
12. 統合クエリ（ファイル単位の全情報集約）

### Phase 4: 自動化（Agentic Flow）
13. 定期スキャンの自動実行
14. 閾値超過時のアラート自動発行
15. Claude Codeへの自動タスク発行
16. PRへの保守情報自動付与
