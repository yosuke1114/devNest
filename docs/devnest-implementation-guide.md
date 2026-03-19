# DevNest 実装指示書 — Claude Code 向け

> **目的**: この指示書に従い、DevNestの新機能（ドキュメントマッピング、保守管理、マルチプロダクト、Agentic Flow）を段階的に実装する。
> **対象リポジトリ**: DevNest (Tauri v2 / Rust + TypeScript/React)
> **作業ブランチ命名規則**: `feature/<phase>-<task>` (例: `feature/p1-doc-mapping`)
> **重要**: 各タスク完了時に、関連する設計書（`docs/` 配下）のfrontmatterとマッピング情報を必ず更新すること。

---

## 参照設計書

実装時に必ず参照すること:

| 設計書 | 内容 | 参照タイミング |
|--------|------|----------------|
| `docs/doc-mapping-design.md` | ソース↔設計書マッピング構造 | Phase 1全体 |
| `docs/devnest-maintenance-strategy.md` | 保守戦略（4軸） | Phase 2-3 |
| `docs/devnest-multiproduct-agentic.md` | マルチプロダクト & Agentic Flow | Phase 4-6 |

---

## Phase 1: ドキュメントマッピング基盤

### 目標
設計書とソースコードの対応関係を構造的に管理できるようにする。

---

### Task 1.1: Frontmatter パーサー実装

**ファイル作成先**: `src-tauri/src/doc_mapping/parser.rs`

**やること**:
1. `docs/` 配下のMarkdownファイルからYAML frontmatterを抽出するパーサーを実装
2. 以下のfrontmatterスキーマに対応するRust構造体を定義:

```rust
// src-tauri/src/doc_mapping/types.rs に定義

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocFrontmatter {
    pub title: String,
    pub doc_type: DocType,
    pub version: String,
    pub last_synced_commit: Option<String>,
    pub status: DocStatus,
    pub mapping: Option<DocMapping>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum DocType {
    #[serde(rename = "architecture")]
    Architecture,
    #[serde(rename = "module_structure")]
    ModuleStructure,
    #[serde(rename = "screen_design")]
    ScreenDesign,
    #[serde(rename = "api_definition")]
    ApiDefinition,
    #[serde(rename = "error_handling")]
    ErrorHandling,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum DocStatus {
    #[serde(rename = "current")]
    Current,
    #[serde(rename = "outdated")]
    Outdated,
    #[serde(rename = "draft")]
    Draft,
    #[serde(rename = "archived")]
    Archived,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocMapping {
    pub sources: Vec<SourceMapping>,
    pub sections: Option<Vec<SectionMapping>>,
    pub depends_on: Option<Vec<DocDependency>>,
    pub defines: Option<Vec<InterfaceDefinition>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SourceMapping {
    pub path: String,
    pub scope: SourceScope,
    pub description: Option<String>,
    pub functions: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SourceScope {
    #[serde(rename = "directory")]
    Directory,
    #[serde(rename = "file")]
    File,
    #[serde(rename = "function")]
    Function,
    #[serde(rename = "module")]
    Module,
    #[serde(rename = "type")]
    Type,
}
```

3. YAMLパース用のクレート: `serde_yaml` を `Cargo.toml` に追加
4. Markdownからfrontmatter部分（`---` で囲まれた部分）を抽出する関数:

```rust
pub fn parse_frontmatter(content: &str) -> Result<DocFrontmatter, ParseError>
pub fn parse_doc_file(path: &Path) -> Result<DocFrontmatter, ParseError>
pub fn scan_all_docs(docs_dir: &Path) -> Result<Vec<(PathBuf, DocFrontmatter)>, ParseError>
```

5. テストを `parser.rs` のモジュール内にインラインで記述:
   - 正常なfrontmatterのパース
   - frontmatterが無いMarkdownの処理
   - 不完全なfrontmatterのエラーハンドリング

**完了条件**:
- `scan_all_docs("docs/")` で全設計書のfrontmatterが取得できる
- テスト全通過

**ドキュメント更新**:
- `docs/modules/rust-modules.md` に `doc_mapping` モジュールのエントリを追加
- 作成したファイルのfrontmatter マッピング情報を `docs/doc-mapping-design.md` に反映

---

### Task 1.2: マッピングインデックス生成

**ファイル作成先**: `src-tauri/src/doc_mapping/index.rs`

**やること**:
1. 全設計書のfrontmatterから逆引きインデックス `.doc-map.yaml` を自動生成する機能を実装
2. データ構造:

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct DocIndex {
    pub generated_at: DateTime<Utc>,
    pub generated_from_commit: String,
    pub source_index: HashMap<String, Vec<SourceIndexEntry>>,
    pub doc_index: HashMap<String, DocIndexEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SourceIndexEntry {
    pub doc: String,
    pub sections: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocIndexEntry {
    pub sources: Vec<String>,
    pub depends_on: Vec<String>,
}
```

3. 実装する関数:

```rust
/// 全設計書をスキャンしてインデックスを生成
pub fn build_index(docs_dir: &Path, repo_root: &Path) -> Result<DocIndex, IndexError>

/// インデックスをYAMLファイルに書き出し
pub fn write_index(index: &DocIndex, output_path: &Path) -> Result<(), IndexError>

/// インデックスファイルを読み込み
pub fn load_index(index_path: &Path) -> Result<DocIndex, IndexError>

/// ソースパスから関連設計書を検索（ディレクトリマッチングも対応）
pub fn find_docs_for_source(index: &DocIndex, source_path: &str) -> Vec<SourceIndexEntry>
```

4. ディレクトリスコープの場合、パスの前方一致で子ファイルもマッチさせる
   - 例: mapping `src/editor/` → `src/editor/state.rs` の変更でもヒット
5. テスト: インデックス生成→逆引き検索のラウンドトリップ

**完了条件**:
- `build_index()` で `.doc-map.yaml` が生成される
- `find_docs_for_source("src/editor/state.rs")` で関連設計書が返る

**ドキュメント更新**:
- `docs/doc-mapping-design.md` のfrontmatter `last_synced_commit` を更新
- `docs/doc-mapping-design.md` の `mapping.sources` にこのファイルを追加

---

### Task 1.3: Git Diff分析

**ファイル作成先**: `src-tauri/src/doc_mapping/diff_analyzer.rs`

**やること**:
1. `git diff` の出力を解析し、変更されたファイルを特定する機能を実装
2. 変更ファイル一覧をインデックスと照合し、影響を受ける設計書を返す
3. 依存クレート: `git2` (libgit2バインディング) を `Cargo.toml` に追加

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct AffectedDoc {
    pub doc_path: String,
    pub affected_sections: Vec<String>,
    pub changed_sources: Vec<ChangedSource>,
    pub change_severity: ChangeSeverity,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChangedSource {
    pub path: String,
    pub change_type: ChangeType,  // Added | Modified | Deleted | Renamed
    pub lines_added: u32,
    pub lines_deleted: u32,
}

pub enum ChangeSeverity {
    Low,      // ドキュメント変更や設定変更のみ
    Medium,   // 既存ファイルの変更
    High,     // ファイルの追加/削除/リネーム
}
```

4. 実装する関数:

```rust
/// 指定コミット範囲の変更で影響を受ける設計書を返す
pub fn find_affected_docs(
    repo_path: &Path,
    index: &DocIndex,
    from_commit: &str,
    to_commit: Option<&str>,  // None = HEAD
) -> Result<Vec<AffectedDoc>, DiffError>

/// ワーキングディレクトリの未コミット変更で影響を受ける設計書を返す
pub fn find_affected_docs_unstaged(
    repo_path: &Path,
    index: &DocIndex,
) -> Result<Vec<AffectedDoc>, DiffError>
```

**完了条件**:
- 任意のコミット範囲を指定して影響設計書が返る
- ファイル追加/削除/変更の各パターンで正しく動作

**ドキュメント更新**:
- `docs/doc-mapping-design.md` の `mapping.sources` にこのファイルを追加
- `docs/modules/rust-modules.md` の `doc_mapping` セクションにエントリ追加

---

### Task 1.4: 鮮度チェック

**ファイル作成先**: `src-tauri/src/doc_mapping/staleness.rs`

**やること**:
1. 各設計書の `last_synced_commit` と現在のHEADを比較して鮮度スコアを算出

```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct DocStaleness {
    pub doc_path: String,
    pub current_status: DocStatus,
    pub staleness_score: f64,        // 0.0 - 1.0
    pub recommended_status: DocStatus,
    pub days_since_sync: u32,
    pub commits_since_sync: u32,
    pub lines_changed_in_sources: u32,
    pub total_source_lines: u32,
}
```

2. スコア算出ロジック（設計書参照）:

```rust
pub fn calculate_staleness(
    repo_path: &Path,
    doc: &DocFrontmatter,
    doc_path: &Path,
    index: &DocIndex,
) -> Result<DocStaleness, StalenessError>

/// 全設計書の鮮度を一括チェック
pub fn check_all_staleness(
    repo_path: &Path,
    docs_dir: &Path,
    index: &DocIndex,
) -> Result<Vec<DocStaleness>, StalenessError>
```

3. スコア判定:
   - `< 0.3` → Current (🟢)
   - `< 0.7` → Outdated (🟡)
   - `>= 0.7` → Stale (🔴)

**完了条件**:
- 全設計書の鮮度スコアが算出できる
- `last_synced_commit` が無い設計書も安全に処理

**ドキュメント更新**:
- `docs/doc-mapping-design.md` の `mapping.sources` にこのファイルを追加

---

### Task 1.5: Tauriコマンド登録

**ファイル作成先**: `src-tauri/src/commands/doc_mapping_commands.rs`

**やること**:
1. Task 1.1〜1.4の機能をTauriコマンドとして公開:

```rust
#[tauri::command]
pub async fn rebuild_doc_index(project_path: String) -> Result<DocIndex, AppError>

#[tauri::command]
pub async fn find_affected_docs(
    project_path: String,
    from_commit: String,
    to_commit: Option<String>,
) -> Result<Vec<AffectedDoc>, AppError>

#[tauri::command]
pub async fn check_doc_staleness(
    project_path: String,
) -> Result<Vec<DocStaleness>, AppError>

#[tauri::command]
pub async fn generate_update_context(
    project_path: String,
    doc_path: String,
) -> Result<UpdateContext, AppError>
```

2. `generate_update_context` は以下を含むコンテキストを生成:
   - 対象設計書の現在の内容
   - `last_synced_commit` 以降の変更差分サマリー
   - 関連ソースの現在の内容
   - 更新ルール（frontmatter更新手順）

3. `src-tauri/src/main.rs` にコマンドを登録

**完了条件**:
- フロントエンドから全コマンドが呼び出し可能
- エラーハンドリングが適切

**ドキュメント更新**:
- `docs/api/tauri-commands.md` にdoc_mapping関連コマンドを追加
- `docs/doc-mapping-design.md` の `status` を `current`、 `last_synced_commit` を更新

---

### Task 1.6: 既存設計書へのfrontmatter追加

**やること**:
1. `docs/` 配下の全設計書にfrontmatterを追加/更新する
2. 各設計書に `mapping.sources` を設定:
   - 対応するソースコードのパスとスコープを記述
   - `depends_on` で設計書間の依存関係を記述
3. 新規作成した `doc_mapping` モジュールの設計書にも自己参照マッピングを設定
4. `.doc-map.yaml` を生成して `docs/` 配下に配置
5. `.gitignore` に `.doc-map.yaml` を追加するかどうかは判断が必要:
   - コミットする場合: CIで検証可能だが、コンフリクトが起きやすい
   - コミットしない場合: 毎回生成が必要
   - **推奨: コミットしない。DevNest起動時に自動生成する**

**完了条件**:
- 全設計書にfrontmatterが設定されている
- `build_index()` で全設計書が正しくインデックスに含まれる
- `find_docs_for_source()` で主要なソースファイルに対して関連設計書が返る

**ドキュメント更新**:
- 全設計書のfrontmatterが適切に設定されていることが成果物そのもの

---

## Phase 2: 保守管理基盤

### 目標
依存管理、技術的負債、テストカバレッジ、リファクタリング判断の4軸を実装する。

---

### Task 2.1: 依存スキャン

**ファイル作成先**: `src-tauri/src/maintenance/dependency.rs`

**やること**:
1. Rust (Cargo) と Node (npm/pnpm) の依存状態をスキャンする機能
2. 外部コマンド呼び出し:
   - `cargo outdated --format json` (要 `cargo-outdated` インストール)
   - `cargo audit --json` (要 `cargo-audit` インストール)
   - `npm outdated --json` or `pnpm outdated --format json`
   - `npm audit --json`
3. 結果を統一的な `DependencyReport` 構造体にパース
4. doc-map連携: 各依存の `affected_sources` を推定
   - `Cargo.toml` の `[dependencies]` を解析し、`use <crate>` が含まれるソースを特定
   - Node依存は `import` / `require` 文を検索

```rust
#[tauri::command]
pub async fn scan_dependencies(project_path: String) -> Result<DependencyReport, AppError>

#[tauri::command]
pub async fn analyze_update_impact(
    project_path: String,
    dep_name: String,
    target_version: String,
) -> Result<UpdateImpact, AppError>
```

**完了条件**:
- Cargo + npm の依存状態が一括取得できる
- 脆弱性情報が含まれる
- `cargo outdated` / `cargo audit` がインストールされていない場合のエラーハンドリング

**ドキュメント更新**:
- `docs/devnest-maintenance-strategy.md` の `mapping.sources` にこのファイルを追加
- `docs/modules/rust-modules.md` に `maintenance` モジュールを追加

---

### Task 2.2: 技術的負債スキャン

**ファイル作成先**: `src-tauri/src/maintenance/tech_debt.rs`

**やること**:
1. 以下の自動検出を実装:

| 検出 | 方法 |
|------|------|
| TODO/FIXME | `ripgrep` or Rust内のファイルスキャン |
| ファイルサイズ | LOC計測、閾値超過検出 |
| コード重複 | 基本的なハッシュベース検出（将来拡張可能） |

2. 手動登録もサポート（`TechDebtItem` に `auto_detected: bool`）
3. 負債スコア算出:

```rust
pub fn scan_tech_debt(
    project_path: &Path,
    index: &DocIndex,
) -> Result<TechDebtReport, DebtError>
```

4. 結果を `.devnest/debt-history.yaml` にスナップショット保存しトレンド追跡

**完了条件**:
- TODO/FIXME が全検出される
- 大きなファイルが検出される
- スナップショットが保存・比較できる

**ドキュメント更新**:
- `docs/devnest-maintenance-strategy.md` の対応セクション更新

---

### Task 2.3: テストカバレッジ収集

**ファイル作成先**: `src-tauri/src/maintenance/coverage.rs`

**やること**:
1. `cargo tarpaulin --out json` の結果をパース
2. `vitest --coverage --reporter=json` (or `jest`) の結果をパース
3. 統一的な `CoverageReport` に変換
4. ホットパス検出: カバレッジ低 × churn高 の交差分析
   - Git logから変更頻度を取得
   - `risk_score = (1 - coverage) * change_frequency` で算出
5. `.devnest/coverage-config.yaml` でカバレッジ目標を定義

```rust
#[tauri::command]
pub async fn run_coverage_scan(project_path: String) -> Result<CoverageReport, AppError>

#[tauri::command]
pub async fn get_hot_paths(project_path: String, top_n: usize) -> Result<Vec<HotPath>, AppError>
```

**完了条件**:
- Rust/TSそれぞれのカバレッジが取得できる
- ホットパスがランキングで返る

**ドキュメント更新**:
- `docs/devnest-maintenance-strategy.md` のカバレッジ関連セクション更新

---

### Task 2.4: リファクタリング候補分析

**ファイル作成先**: `src-tauri/src/maintenance/refactor.rs`

**やること**:
1. Churn × Complexity マトリクス分析:
   - Churn: `git log --stat` からファイル別変更回数を集計
   - Complexity: LOC + ネスト深度（基本的な静的解析）
2. リファクタリング優先度スコア算出（設計書のスコア式参照）
3. doc-map連携: 対応設計書の鮮度も加味

```rust
#[tauri::command]
pub async fn analyze_refactor_candidates(
    project_path: String,
    top_n: usize,
) -> Result<Vec<RefactorCandidate>, AppError>
```

**完了条件**:
- ファイル別のリファクタリングスコアが算出される
- 上位N件がランキングで返る

**ドキュメント更新**:
- `docs/devnest-maintenance-strategy.md` 全体の `status` を `current` に更新
- `last_synced_commit` を更新

---

### Task 2.5: 保守ダッシュボードUI

**ファイル作成先**: `src/components/MaintenanceDashboard.tsx` (および関連コンポーネント)

**やること**:
1. 4パネル構成のダッシュボード画面を実装:
   - 📦 Dependencies パネル
   - 🧪 Test Coverage パネル
   - 🏗️ Tech Debt パネル
   - 🔄 Refactor Candidates パネル
2. 各パネルは対応するTauriコマンドからデータ取得
3. Doc Healthバー（doc-mapping連携）を下部に配置
4. リフレッシュボタンでスキャン再実行
5. 設計書 `devnest-maintenance-strategy.md` のダッシュボード図を参考にレイアウト

**完了条件**:
- 4パネルが表示される
- 実データを表示できる（スキャン実行後）
- ローディング/エラー状態の表示

**ドキュメント更新**:
- `docs/screens/maintenance-dashboard.md` を新規作成（画面詳細設計書）
- frontmatterにマッピング情報を記述

---

## Phase 3: マルチプロダクト基盤

### 目標
GitHub連携で複数プロダクトを動的に管理し、コンテキストを切り替えられるようにする。

---

### Task 3.1: プロダクトレジストリ

**ファイル作成先**: `src-tauri/src/product/registry.rs`, `src-tauri/src/product/profile.rs`

**やること**:
1. `ProductRegistry` 構造体を実装（設計書参照）
2. ローカルJSONファイル（`~/.devnest/registry.json`）に永続化
3. `.devnest.yaml` パーサー:
   - リポジトリルートから読み込み
   - 存在しない場合はプロファイル推定（`infer_product_profile`）
4. 推定ロジック:
   - `Cargo.toml` → Rust / `tauri.conf.json` → Tauri
   - `package.json` → Node/TS
   - `go.mod` → Go
   - `docs/` ディレクトリ検出
   - 最終コミット日時からアクティビティ判定

```rust
#[tauri::command]
pub async fn list_products() -> Result<Vec<Product>, AppError>

#[tauri::command]
pub async fn get_product(product_id: String) -> Result<Product, AppError>

#[tauri::command]
pub async fn add_product(github_url: String) -> Result<Product, AppError>

#[tauri::command]
pub async fn remove_product(product_id: String) -> Result<(), AppError>

#[tauri::command]
pub async fn refresh_product_profile(product_id: String) -> Result<Product, AppError>
```

**完了条件**:
- プロダクトのCRUD操作が可能
- `.devnest.yaml` があるリポジトリはその設定を使用
- 無いリポジトリは自動推定で基本プロファイルを生成

**ドキュメント更新**:
- `docs/modules/rust-modules.md` に `product` モジュールを追加
- `docs/devnest-multiproduct-agentic.md` の `mapping.sources` にファイルを追加

---

### Task 3.2: GitHub同期

**ファイル作成先**: `src-tauri/src/product/github_sync.rs`

**やること**:
1. GitHub API (`octocrab` クレート) でユーザーのリポジトリ一覧を取得
2. 複数GitHubアカウント対応:
   - Personal Access Token (PAT) 認証
   - アカウントごとのラベル管理（"Personal", "Work"等）
3. リポジトリフィルタリング:
   - パターンマッチ（include/exclude）
   - アーカイブ済み除外オプション
   - アクティビティ日数フィルタ
4. 差分同期（前回同期からの新規/削除リポジトリ検出）

```rust
#[tauri::command]
pub async fn sync_github_repos(account_id: Option<String>) -> Result<SyncResult, AppError>

#[tauri::command]
pub async fn add_github_account(
    label: String,
    token: String,
    filter: Option<RepoFilter>,
) -> Result<GitHubAccount, AppError>

#[tauri::command]
pub async fn list_github_accounts() -> Result<Vec<GitHubAccount>, AppError>
```

5. トークンは `keyring` クレートでOSのキーチェーンに安全に保存

**完了条件**:
- GitHubからリポジトリ一覧を取得・フィルタできる
- 複数アカウントの追加・切替ができる
- トークンがセキュアに保存される

**ドキュメント更新**:
- `docs/api/github-integration.md` を更新（GitHub Syncセクション追加）

---

### Task 3.3: プロダクトスイッチャー

**ファイル作成先**:
- `src-tauri/src/product/switcher.rs`
- `src/components/ProductSwitcher.tsx`

**やること**:

Rustバックエンド:
1. 現在アクティブなプロダクトの状態管理
2. スイッチ時にコンテキスト一式を切り替えるロジック:
   - doc-mapの読み込み
   - 保守データの読み込み
   - GitHubコンテキストの切替

```rust
#[tauri::command]
pub async fn switch_product(product_id: String) -> Result<ProductContext, AppError>

#[tauri::command]
pub async fn get_current_product() -> Result<Option<Product>, AppError>
```

Reactフロントエンド:
1. ヘッダーに常駐するドロップダウンスイッチャー
2. カテゴリ別グルーピング（Personal / Work / OSS）
3. 検索フィルタ
4. ヘルスステータスアイコン（🟢🟡🔴）
5. ピン留め機能（よく使うプロダクトを上部固定）
6. 設計書のスイッチャーUI図を参考にレイアウト

**完了条件**:
- UIからプロダクトを切り替えると、全画面のコンテキストが変わる
- 前回のアクティブプロダクトを記憶して起動時に復元

**ドキュメント更新**:
- `docs/screens/product-switcher.md` を新規作成（画面詳細設計書）

---

### Task 3.4: ポートフォリオダッシュボード

**ファイル作成先**: `src/components/PortfolioDashboard.tsx`

**やること**:
1. 全プロダクト横断のヘルスサマリー表示
2. プロダクト一覧テーブル（Health, Deps, Debt, Coverage, Docs, Agent状態）
3. "Attention Required" パネル（優先度の高い問題を集約）
4. "Agent Activity" パネル（実行中/完了タスク表示）— Phase 4でデータ接続
5. 設計書のポートフォリオダッシュボード図を参考に実装

```rust
#[tauri::command]
pub async fn get_portfolio_summary() -> Result<PortfolioSummary, AppError>
```

**完了条件**:
- 全プロダクトのヘルスが一覧表示される
- 問題のあるプロダクトが優先表示される

**ドキュメント更新**:
- `docs/screens/portfolio-dashboard.md` を新規作成

---

## Phase 4: Agentic Flow エンジン

### 目標
トリガー、タスクキュー、承認ゲート、Claude Code連携を実装する。

---

### Task 4.1: トリガーシステム

**ファイル作成先**: `src-tauri/src/agent/trigger.rs`

**やること**:
1. トリガー種別を実装（設計書の `Trigger` enum参照）:
   - `Schedule`: cron式によるスケジュール実行。`tokio-cron-scheduler` クレート使用
   - `Manual`: UIからの手動実行
   - `Threshold`: 保守メトリクスの閾値監視
   - `TaskCompletion`: 親タスク完了時の連鎖実行
2. `Webhook` は後続Phase（GitHub Apps連携が必要）
3. トリガー設定の読み込み: `.devnest/triggers.yaml` or `.devnest.yaml` 内定義

```rust
pub struct TriggerManager {
    scheduler: JobScheduler,
    threshold_monitors: Vec<ThresholdMonitor>,
}

impl TriggerManager {
    pub async fn start(&self) -> Result<(), TriggerError>
    pub async fn stop(&self) -> Result<(), TriggerError>
    pub fn register_trigger(&mut self, trigger: Trigger, task_template: TaskType) -> Result<(), TriggerError>
}
```

**完了条件**:
- スケジュールトリガーが時刻通りに発火する
- 閾値トリガーが条件を満たした時に発火する
- 手動トリガーがUIから実行できる

**ドキュメント更新**:
- `docs/modules/rust-modules.md` に `agent` モジュールを追加
- `docs/devnest-multiproduct-agentic.md` の `mapping.sources` にファイルを追加

---

### Task 4.2: タスクキュー & 状態管理

**ファイル作成先**: `src-tauri/src/agent/task.rs`, `src-tauri/src/agent/engine.rs`

**やること**:
1. `AgentTask` 構造体を実装（設計書参照）
2. タスクキュー:
   - プロダクト別に分離
   - 優先度による順序制御
   - 同時実行数制限（プロダクトあたり1タスク推奨）
3. 状態遷移:

```
Queued → Running → AwaitingApproval → Approved → Executing → Completed
                                                            → Failed
                    → Cancelled（どの状態からでも）
```

4. 永続化: `~/.devnest/tasks/` にJSONで保存。起動時に未完了タスクを復元

```rust
pub struct AgentEngine {
    task_queue: PriorityQueue<AgentTask>,
    running_tasks: HashMap<String, RunningTask>,
    trigger_manager: TriggerManager,
}

impl AgentEngine {
    pub async fn submit_task(&self, task: AgentTask) -> Result<String, EngineError>
    pub async fn get_task_status(&self, task_id: &str) -> Result<TaskStatus, EngineError>
    pub async fn cancel_task(&self, task_id: &str) -> Result<(), EngineError>
    pub async fn list_tasks(&self, product_id: Option<&str>) -> Result<Vec<AgentTask>, EngineError>
}
```

**完了条件**:
- タスクの投入→実行→完了のライフサイクルが動作する
- タスク一覧の取得とフィルタリングができる

**ドキュメント更新**:
- `docs/devnest-multiproduct-agentic.md` の対応セクション更新

---

### Task 4.3: 承認ゲート

**ファイル作成先**:
- `src-tauri/src/agent/approval.rs`
- `src-tauri/src/agent/policy.rs`
- `src/components/ApprovalGate.tsx`

**やること**:

ポリシーエンジン:
1. リスクレベル判定ロジック（設計書のApproval Policy Matrix参照）:
   - スキャン系 → Safe
   - パッチ更新 → Low
   - ドキュメント更新 → Medium
   - コード変更/リファクタリング → High
2. `.devnest.yaml` の `require_approval` 設定との掛け合わせ
3. High リスクは常に手動承認

承認UI:
1. タスク名、プロダクト、トリガー情報を表示
2. ExecutionPlan（実行ステップ一覧）を表示
3. 影響ファイル・影響設計書を表示
4. ボタン: Approve / Modify Plan / Reject / Defer
5. 設計書の承認UI図を参考にレイアウト

```rust
#[tauri::command]
pub async fn approve_task(task_id: String) -> Result<(), AppError>

#[tauri::command]
pub async fn reject_task(task_id: String, reason: Option<String>) -> Result<(), AppError>

#[tauri::command]
pub async fn defer_task(task_id: String) -> Result<(), AppError>

#[tauri::command]
pub async fn get_pending_approvals() -> Result<Vec<AgentTask>, AppError>
```

**完了条件**:
- 承認が必要なタスクはUIで止まる
- 承認後に実行が再開される
- 自動承認対象のタスクはUIを経由せず実行される

**ドキュメント更新**:
- `docs/screens/approval-gate.md` を新規作成

---

### Task 4.4: Claude Code ブリッジ

**ファイル作成先**: `src-tauri/src/agent/claude_bridge.rs`

**やること**:
1. Claude Code CLIをサブプロセスとして呼び出す機構を実装
2. コンテキスト自動組み立て（`ClaudeCodeContext` → プロンプト生成）:
   - タスク種別に応じたプロンプトテンプレート
   - 関連設計書の内容を自動付与
   - 保守データ（影響範囲、カバレッジ等）を付与
   - 更新ルール（frontmatter更新、バージョニング）を明記
3. 実行監視:
   - stdout/stderrのストリーミング
   - DevNest UIへの進捗イベント配信（Tauriイベント使用）
4. 結果パース:
   - 変更ファイル一覧の取得（`git diff`）
   - コミット情報の取得

```rust
pub struct ClaudeCodeBridge {
    claude_code_path: PathBuf,  // claude CLIのパス
}

impl ClaudeCodeBridge {
    pub async fn execute(
        &self,
        context: ClaudeCodeContext,
        working_dir: &Path,
    ) -> Result<ClaudeCodeResult, BridgeError>

    pub fn build_prompt(task: &AgentTask, context: &ClaudeCodeContext) -> String
}
```

5. プロンプトテンプレート（タスク別）:

**doc_auto_update の場合**:
```markdown
## タスク
以下の設計書を、ソースコードの変更に合わせて更新してください。

## 対象設計書
パス: {doc_path}
現在のバージョン: {version}
最終同期コミット: {last_synced_commit}

## 変更差分サマリー（{last_synced_commit}..HEAD）
{diff_summary}

## 関連ソースコード（現在の状態）
{source_contents}

## 更新ルール
1. 設計書の内容をソースコードの現状に合わせて更新
2. frontmatter の `last_synced_commit` を最新コミットハッシュに更新
3. frontmatter の `version` をセマンティックに更新
4. 新しいファイル/関数があれば `mapping.sources` に追加
5. `status` を `current` に設定
6. 変更をコミット（メッセージ: "docs: update {doc_name} to reflect source changes"）
```

**test_suggestion の場合**:
```markdown
## タスク
以下のファイルにユニットテストを追加してください。

## 対象ファイル
パス: {file_path}
カバレッジ: {coverage}%
未カバー行: {uncovered_lines}

## 関連設計書（期待動作の参照用）
{related_doc_contents}

## テスト追加ルール
1. 既存のテスト構造に合わせたスタイルで記述
2. 正常系 + エラーパス + 境界値のケースを含める
3. テストが通ることを確認してからコミット
4. コミットメッセージ: "test: add tests for {file_name}"
```

**dependency_patch の場合**:
```markdown
## タスク
以下の依存をパッチバージョンに更新してください。

## 対象依存
{dependency_list}

## 手順
1. Cargo.toml / package.json のバージョンを更新
2. `cargo build` / `npm install` で依存解決
3. `cargo test` / `npm test` でテスト実行
4. テストが通ることを確認してからコミット
5. コミットメッセージ: "deps: patch update {dep_names}"

## 注意
- テストが失敗した場合は更新を取り消して報告
- breaking changes がある場合は中断して報告
```

**完了条件**:
- Claude Code CLIの呼び出しと結果取得が動作する
- 各タスク種別のプロンプトが適切に生成される
- 進捗イベントがUIに配信される

**ドキュメント更新**:
- `docs/api/tauri-commands.md` にagent関連コマンドを追加
- `docs/devnest-multiproduct-agentic.md` のClaude Code連携セクション更新

---

### Task 4.5: 基本タスク実装

**やること**:
各タスク種別のハンドラーを実装する。

1. **FullMaintenanceScan**: Task 2.1〜2.4のスキャンを一括実行
2. **DependencyPatch**: `cargo update` / `npm update` + テスト実行
3. **DocAutoUpdate**: Claude Code Bridge経由で設計書更新
4. **TestSuggestion**: Claude Code Bridge経由でテスト生成
5. **PrQualityCheck**: PR diffに対してdoc-mapping影響チェック + カバレッジチェック

各ハンドラーは `ExecutionPlan` を生成し、承認ゲートを通過した後に実行する。

**完了条件**:
- 5つのタスク種別が実行可能
- 各タスクのExecutionPlanが適切に生成される

**ドキュメント更新**:
- `docs/devnest-multiproduct-agentic.md` の `status` を `current` に更新

---

### Task 4.6: エージェント管理UI

**ファイル作成先**: `src/components/AgentDashboard.tsx`

**やること**:
1. タスクキュー一覧表示（プロダクト別フィルタ可能）
2. 実行中タスクの進捗表示（Claude Code出力のストリーミング）
3. 承認待ちタスクの一覧（ApprovalGateコンポーネント使用）
4. タスク履歴（完了/失敗タスクのログ）
5. 手動タスク投入ボタン
6. トリガー設定画面（スケジュール/閾値の設定）

**完了条件**:
- エージェントの全状態がUIで確認できる
- 手動でタスクを投入・承認・キャンセルできる

**ドキュメント更新**:
- `docs/screens/agent-dashboard.md` を新規作成

---

## Phase 5: ワークフロー & 高度な自動化

### 目標
複合ワークフローの定義・実行、PRフック、成熟した自動化。

---

### Task 5.1: ワークフローエンジン

**ファイル作成先**: `src-tauri/src/agent/workflow.rs`

**やること**:
1. `.devnest/workflows/*.yaml` からワークフロー定義を読み込み
2. ステップの条件分岐（`evaluate` ステップ）:
   - 前ステップの結果を参照する条件式をパース
   - 簡単な式評価エンジン（`scan.result.vulnerabilities > 0` 等）
3. ステップ間のデータ受け渡し
4. ステップ単位の承認ゲート統合
5. ワークフローテンプレート:
   - `weekly-maintenance.yaml` を同梱（設計書参照）

```rust
pub struct WorkflowEngine {
    agent_engine: Arc<AgentEngine>,
}

impl WorkflowEngine {
    pub async fn execute_workflow(
        &self,
        workflow: WorkflowDefinition,
        product_id: &str,
    ) -> Result<WorkflowResult, WorkflowError>

    pub fn load_workflow(path: &Path) -> Result<WorkflowDefinition, WorkflowError>
}
```

**完了条件**:
- `weekly-maintenance` ワークフローが実行できる
- 条件分岐が正しく動作する
- 各ステップで承認が機能する

**ドキュメント更新**:
- `docs/devnest-multiproduct-agentic.md` のワークフローセクション更新

---

### Task 5.2: PRフック連携

**やること**:
1. GitHub Webhook受信（Tauri内でローカルHTTPサーバーを起動、またはポーリング）
2. PR作成/更新イベントでPrQualityCheckタスクを自動発行
3. チェック結果をPRコメントとして投稿（GitHub API経由）
4. 設計書影響チェックの結果をPRテンプレートに自動挿入

**完了条件**:
- PR作成時に自動でチェックが走る
- 結果がPRコメントに投稿される

**ドキュメント更新**:
- `docs/api/github-integration.md` のPRフックセクション更新

---

### Task 5.3: 保守レポート自動生成

**やること**:
1. 定期スキャン結果からMarkdownレポートを自動生成
2. プロダクト別 + ポートフォリオ全体のサマリー
3. トレンドグラフ（テキストベース or SVG）
4. "Next Actions" セクション（推奨タスクの一覧）

**完了条件**:
- `.devnest/reports/` にレポートが自動保存される
- ポートフォリオ全体のサマリーが生成される

**ドキュメント更新**:
- 各設計書の `last_synced_commit` を最終更新
- 全設計書の `status` が正しく設定されている

---

## 全体ドキュメント更新チェックリスト

各Phaseの完了時に以下を確認すること:

### Phase完了時の必須チェック
- [ ] 新規作成したRustモジュールが `docs/modules/rust-modules.md` に記載されている
- [ ] 新規作成したTauriコマンドが `docs/api/tauri-commands.md` に記載されている
- [ ] 新規作成した画面コンポーネントの画面詳細設計書が作成されている
- [ ] 変更した設計書の `last_synced_commit` が更新されている
- [ ] 変更した設計書の `version` がセマンティックに更新されている
- [ ] 変更した設計書の `status` が `current` になっている
- [ ] 新規ファイルが既存設計書の `mapping.sources` に追加されている
- [ ] `.doc-map.yaml` を再生成して整合性を確認

### 最終チェック
- [ ] `build_index()` で全設計書が正しくインデックスされる
- [ ] `check_all_staleness()` で全設計書が `current` になっている
- [ ] 全テストが通過する
- [ ] `cargo clippy` の警告がない
- [ ] フロントエンドのlintエラーがない
