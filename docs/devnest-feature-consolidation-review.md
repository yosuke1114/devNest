# DevNest 機能統合レビュー & 再編提案

> **目的**: 全10Phase・41タスクを俯瞰し、モジュール境界の曖昧さ、重複機能、
> 依存関係の最適化、優先度の再評価を行い、統合・再編案を提示する。
> **方針**: 将来のチーム利用を前提としつつ、無駄な複雑さは排除する。

---

## 1. 現状の問題マップ

### 1.1 モジュール境界の曖昧さ

以下の箇所で「どこに属するか」が不明確になっている。

```
問題①: Claude Code連携が3箇所に分散
┌───────────────────────────────────────────────────┐
│  Phase 4: agent/claude_bridge.rs                  │
│     └ ClaudeCodeBridge（サブプロセス直接呼び出し）  │
│                                                   │
│  Phase 6: ai/context_engine.rs                    │
│     └ ContextEngine.to_prompt()（プロンプト生成）   │
│                                                   │
│  Phase 9: mcp/adapters/claude_code.rs             │
│     └ ClaudeCodeMcpAdapter（MCP経由呼び出し）      │
│                                                   │
│  → 同じ「Claude Codeを呼ぶ」処理が3つの設計に     │
│    分かれている。どれが正なのか不明確。              │
└───────────────────────────────────────────────────┘

問題②: GitHub連携が3箇所に分散
┌───────────────────────────────────────────────────┐
│  Phase 3: product/github_sync.rs                  │
│     └ リポジトリ一覧取得（octocrab直接）            │
│                                                   │
│  Phase 4: agent/* → GitOperation                  │
│     └ git2クレートでのローカルGit操作              │
│                                                   │
│  Phase 9: mcp/adapters/github.rs                  │
│     └ GitHub MCP Server経由のAPI操作              │
│                                                   │
│  → GitHub操作の入口が3つ。呼び出し元によって      │
│    使い分けるルールが不明確。                       │
└───────────────────────────────────────────────────┘

問題③: 「レビュー」機能の境界
┌───────────────────────────────────────────────────┐
│  Phase 4: PrQualityCheck タスク                   │
│     └ PR diffに対するdoc-mapping影響チェック       │
│                                                   │
│  Phase 6: ai/review_agent.rs                      │
│     └ AIによるコードレビュー（設計書整合性含む）    │
│                                                   │
│  → PrQualityCheck と ReviewAgent の違いは？        │
│    統合すべきでは？                                │
└───────────────────────────────────────────────────┘

問題④: 分析データの生成元が分散
┌───────────────────────────────────────────────────┐
│  Phase 2: maintenance/refactor.rs                 │
│     └ churn分析（git logベース）                   │
│                                                   │
│  Phase 7: analytics/velocity.rs                   │
│     └ コミットメトリクス（git logベース）           │
│                                                   │
│  Phase 8: agile/flow.rs                           │
│     └ サイクルタイム分析（カンバンデータ）          │
│                                                   │
│  → git log解析を複数モジュールが独立実行。          │
│    共通のGit分析層がない。                          │
└───────────────────────────────────────────────────┘
```

### 1.2 重複機能

| 重複箇所 | モジュールA | モジュールB | 重複内容 |
|----------|-----------|-----------|---------|
| Git log解析 | maintenance/refactor.rs | analytics/velocity.rs | ファイル別変更頻度の集計 |
| コンテキスト生成 | agent/claude_bridge.rs | ai/context_engine.rs | Claude向けプロンプト組み立て |
| PR操作 | product/github_sync.rs | mcp/adapters/github.rs | PR情報の取得・操作 |
| カバレッジ収集 | maintenance/coverage.rs | analytics/velocity.rs | テストカバレッジのデータ取得 |
| 設計書鮮度 | doc_mapping/staleness.rs | maintenance/tech_debt.rs (DocDrift) | 設計書の古さ検出 |
| スプリントデータ | analytics/sprint.rs | agile/kanban.rs | スプリント期間・カード完了の集計 |

### 1.3 依存関係の問題

```
現状の依存グラフ（問題箇所に ⚠️）

Phase 1 (doc-mapping) ← 基盤、問題なし
  ↓
Phase 2 (maintenance) ← Phase 1依存、問題なし
  ↓
Phase 3 (multi-product) ← Phase 1,2依存、問題なし
  ↓
Phase 4 (agentic flow) ← Phase 1,2,3依存
  ↓
Phase 5 (workflow)     ← Phase 4依存
  ↓
Phase 6 (AI assistant) ← Phase 1,2,4 依存
  │                       ⚠️ ContextEngineがPhase 4のBridgeと重複
  ↓
Phase 7 (analytics)    ← Phase 2,8 依存
  │                       ⚠️ Phase 8（カンバン）が先に必要だが、
  │                          Phase 7の方が番号が若い
  ↓
Phase 8 (agile)        ← Phase 7,9 依存
  │                       ⚠️ Phase 9（MCP）のGitHub同期が必要だが、
  │                          Phase 9の方が番号が大きい
  ↓
Phase 9 (MCP)          ← Phase 4 依存
  │                       ⚠️ Phase 3のgithub_sync.rsをMCPに移行すべきか？
  ↓
Phase 10 (collaboration) ← Phase 7,8,9 依存、問題少ない
```

### 1.4 優先度の再評価が必要な機能

| 機能 | 現在のPhase | 懸念 |
|------|-----------|------|
| カスタムMCPサーバー開発基盤 (9.5) | Phase 9e | 自分でMCPサーバーを開発するのはかなり先。後回しでよいのでは |
| ストーリーマッピング (8.4) | Phase 8 | 個人開発ではカンバンで十分。チーム利用まで不要では |
| マルチエージェントScrum (10.3) | Phase 10 | scrum-agentsとの統合は大がかり。独立進化させた方がよいのでは |
| チームダッシュボード (10.1) | Phase 10 | 個人開発フォーカスならチーム機能は最後でよい |
| Redmineアダプター (9.4) | Phase 9 | 職場で本当にMCP経由でRedmineを使うか要検討 |

---

## 2. 再編提案

### 2.1 共通基盤層の新設

**問題①②④の解決**: 分散している共通処理を `core` 層にまとめる。

```
【新設】 src-tauri/src/core/
├── git_analysis.rs       ← Git log解析の統一層
│   ├── get_file_churn()       maintenance + analytics で共用
│   ├── get_commit_metrics()   analytics + sprint で共用
│   ├── get_diff()             doc_mapping + review で共用
│   └── get_contributors()     analytics + collaboration で共用
│
├── claude_gateway.rs     ← Claude Code呼び出しの統一層
│   ├── execute()              Phase 4のBridgeを吸収
│   ├── build_context()        Phase 6のContextEngineを統合
│   └── stream_progress()      UI配信の統一
│
└── github_gateway.rs     ← GitHub操作の統一層
    ├── GitHubGateway::via_mcp()    MCP経由（Phase 9以降のメイン）
    ├── GitHubGateway::via_api()    octocrab直接（MCP未接続時のフォールバック）
    └── GitHubGateway::local_git()  git2（ローカル操作）
```

**メリット**:
- 「Git log解析」を2回書かなくてよい
- Claude Code連携の入口が1つに統一
- GitHub操作がMCP経由かAPI直接かを呼び出し元が意識しなくてよい

### 2.2 モジュール統合

#### 統合A: PrQualityCheck + ReviewAgent → `review` モジュール

```
【現状】
  Phase 4: agent/task.rs の PrQualityCheck
  Phase 6: ai/review_agent.rs

【統合後】
  src-tauri/src/review/
  ├── mod.rs
  ├── engine.rs            ← ReviewEngine（統合レビューエンジン）
  │   ├── review_diff()         ローカルdiffレビュー
  │   ├── review_pr()           PRレビュー
  │   └── check_design_consistency()  設計書整合性
  ├── findings.rs          ← Finding/Severity/Category 定義
  └── reporter.rs          ← 結果のPRコメント化、UI表示用変換

  Agentic Flowから呼ぶ場合:
    TaskType::PrQualityCheck → review::engine::review_pr() を呼ぶだけ
```

#### 統合B: maintenance/coverage + analytics/velocity のカバレッジ部分

```
【現状】
  maintenance/coverage.rs  → カバレッジ収集・ホットパス検出
  analytics/velocity.rs    → カバレッジ変化量の追跡

【統合後】
  maintenance/coverage.rs は「収集・分析」の責任を維持
  analytics/velocity.rs は coverage.rs の結果を参照するだけ（自前で収集しない）
  
  共通: core/git_analysis.rs の churn データを両方が参照
```

#### 統合C: doc_mapping/staleness + maintenance/tech_debt の DocDrift

```
【現状】
  doc_mapping/staleness.rs → 設計書の鮮度スコア算出
  maintenance/tech_debt.rs → DebtCategory::DocDrift

【統合後】
  DocDrift は staleness.rs の結果を参照するだけ。
  tech_debt.rs は staleness_score > 0.7 のドキュメントを
  自動的に DocDrift アイテムとして登録。重複実装を排除。
```

### 2.3 Phase順序の再編

依存関係の問題を解決するためにPhaseを再編成する。

```
【現状の問題】
Phase 7 (analytics) → Phase 8 (agile) のデータが必要
Phase 8 (agile) → Phase 9 (MCP) のGitHub同期が必要
→ 番号通りに実装すると前提が揃わない

【再編後】
Phase 1: ドキュメントマッピング基盤          ← 変更なし
Phase 2: 保守管理基盤                        ← 変更なし
Phase 3: マルチプロダクト基盤                ← 変更なし
Phase 4: Agentic Flow エンジン              ← 変更なし
Phase 5: ワークフロー & PR連携              ← 変更なし

--- ここから再編 ---

Phase 6: 共通基盤 & AI開発アシスタント       ← 新: core層をここで構築
  6.1 core/git_analysis.rs                      共通Git分析層
  6.2 core/claude_gateway.rs                    Claude統一ゲートウェイ
  6.3 core/github_gateway.rs                    GitHub統一ゲートウェイ
  6.4 ai/context_engine.rs                      コンテキストエンジン
  6.5 review/ モジュール（統合版）              レビューエンジン
  6.6 ai/codegen.rs                             設計書駆動コード生成
  6.7 AI アシスタント UI

Phase 7: MCP統合基盤                         ← 旧Phase 9を前倒し
  7.1 mcp/hub.rs + connection.rs                MCP Client Hub
  7.2 mcp/tool_registry.rs                      ツール管理
  7.3 mcp/policy.rs                             ポリシーエンジン
  7.4 mcp/adapters/github.rs                    GitHub MCPアダプター
  7.5 mcp/adapters/slack.rs                     Slackアダプター
  7.6 github_gateway MCP移行                    Phase 3のgithub_syncを統合
  7.7 MCP管理UI

Phase 8: アジャイルエンジン                   ← 旧Phase 8（MCP基盤が先に必要）
  8.1 agile/kanban.rs + UI                      パーソナルカンバン
  8.2 GitHub Issue同期（MCP経由）               Phase 7のGitHub MCPを利用
  8.3 agile/sprint_planner.rs                   AIスプリントプランナー
  8.4 agile/retrospective.rs + 年輪             自動レトロスペクティブ
  8.5 agile/flow.rs                             フロー最適化

Phase 9: 分析 & インサイト                    ← 旧Phase 7を後ろに
  9.1 analytics/velocity.rs                     開発速度（core/git_analysis利用）
  9.2 analytics/ai_impact.rs                    AI効果測定
  9.3 analytics/sprint.rs                       スプリント分析（Phase 8データ利用）
  9.4 分析ダッシュボードUI

Phase 10: 拡張 & コラボレーション             ← 統合・縮小
  10.1 mcp/adapters/redmine.rs                  Redmineアダプター
  10.2 collaboration/team.rs + UI               チームダッシュボード
  10.3 collaboration/knowledge.rs               ナレッジ共有
```

### 2.4 やらない判断（削除・延期）

| 機能 | 判断 | 理由 |
|------|------|------|
| **カスタムMCPサーバー開発基盤** (旧9e) | **延期** | 既存のMCPサーバーで当面十分。必要になったらClaude Codeで個別に作ればよい |
| **ストーリーマッピング** (旧8.4) | **延期** | カンバンで個人開発は十分回る。チーム利用が現実化した段階で再検討 |
| **マルチエージェントScrum** (旧10.3) | **分離** | scrum-agentsは独立プロジェクトとして進化させる。DevNestとの統合はAPIレベルで十分。DevNest内に組み込む必要はない |
| **Claude Code MCP移行** (旧9.5) | **延期** | Phase 6でclaude_gatewayを統一層にすれば、MCP移行は将来トランスポートを差し替えるだけ。今やる意味が薄い |
| **Redmine MCP** (旧9.4) | **延期→Phase 10** | 職場での実需が確認できてから。Phase 10の拡張枠で対応 |

**削減効果**: 41タスク → **32タスク**（9タスク削減）

---

## 3. 再編後のモジュール構造

```
src-tauri/src/
│
├── core/                          【新設】共通基盤
│   ├── git_analysis.rs               Git log/diff/churn 統一分析
│   ├── claude_gateway.rs             Claude Code 統一ゲートウェイ
│   └── github_gateway.rs             GitHub 統一ゲートウェイ（MCP/API/local自動切替）
│
├── doc_mapping/                   Phase 1: 変更なし
│   ├── parser.rs
│   ├── index.rs
│   ├── diff_analyzer.rs              → core/git_analysis を利用
│   └── staleness.rs
│
├── maintenance/                   Phase 2: 軽微な変更
│   ├── dependency.rs
│   ├── coverage.rs
│   ├── tech_debt.rs                  → DocDrift は staleness.rs を参照
│   └── refactor.rs                   → core/git_analysis を利用
│
├── product/                       Phase 3: github_sync を簡素化
│   ├── registry.rs
│   ├── profile.rs
│   ├── switcher.rs
│   └── portfolio.rs
│   （github_sync.rs は core/github_gateway.rs に統合）
│
├── agent/                         Phase 4-5: claude_bridge を簡素化
│   ├── engine.rs
│   ├── trigger.rs
│   ├── task.rs
│   ├── approval.rs
│   ├── policy.rs
│   ├── workflow.rs
│   └── result_store.rs
│   （claude_bridge.rs は core/claude_gateway.rs に統合）
│
├── ai/                            Phase 6: AIアシスタント
│   ├── context_engine.rs             → core/* を組み合わせてコンテキスト構築
│   └── codegen.rs
│
├── review/                        Phase 6: 【新設】統合レビュー
│   ├── engine.rs                     PrQualityCheck + ReviewAgent 統合
│   ├── findings.rs
│   └── reporter.rs
│
├── mcp/                           Phase 7: MCP統合
│   ├── hub.rs
│   ├── connection.rs
│   ├── config.rs
│   ├── tool_registry.rs
│   ├── policy.rs                     → agent/policy.rs と統合検討
│   ├── transport_factory.rs
│   └── adapters/
│       ├── github.rs                 → core/github_gateway と連携
│       └── slack.rs
│
├── agile/                         Phase 8: アジャイルエンジン
│   ├── kanban.rs
│   ├── sprint_planner.rs
│   ├── retrospective.rs
│   └── flow.rs                       → core/git_analysis を利用
│
├── analytics/                     Phase 9: 分析
│   ├── velocity.rs                   → core/git_analysis を利用
│   ├── ai_impact.rs
│   └── sprint.rs                     → agile/kanban のデータを参照
│
├── collaboration/                 Phase 10: コラボレーション
│   ├── team.rs
│   └── knowledge.rs
│
└── commands/                      Tauriコマンド（Phase別に整理）
    ├── doc_mapping_commands.rs
    ├── maintenance_commands.rs
    ├── product_commands.rs
    ├── agent_commands.rs
    ├── ai_commands.rs
    ├── review_commands.rs
    ├── mcp_commands.rs
    ├── agile_commands.rs
    ├── analytics_commands.rs
    └── collaboration_commands.rs
```

---

## 4. 再編後の依存グラフ

```
                    core/
            ┌──────────────────┐
            │ git_analysis     │
            │ claude_gateway   │
            │ github_gateway   │
            └────────┬─────────┘
                     │ 全モジュールが参照可能
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
 doc_mapping    maintenance      product
 (Phase 1)      (Phase 2)       (Phase 3)
     │               │               │
     └───────┬───────┘               │
             ▼                       │
          agent ◄────────────────────┘
         (Phase 4-5)
             │
             ▼
     ┌───────┴────────┐
     ▼                ▼
    ai            review
  (Phase 6)      (Phase 6)
     │
     ▼
    mcp
  (Phase 7)
     │
     ▼
   agile
  (Phase 8)
     │
     ▼
  analytics
  (Phase 9)
     │
     ▼
 collaboration
  (Phase 10)

※ 矢印は「依存する」方向
※ core は全モジュールが参照可能（utility層）
※ 循環依存なし
```

**改善点**:
- **循環依存が解消**: Phase 7(analytics)→Phase 8(agile)→Phase 9(MCP)の逆依存がなくなった
- **Phase番号順に実装可能**: 依存が常に小さい番号→大きい番号の方向
- **core層が共通処理を吸収**: 重複実装が排除

---

## 5. ポリシーエンジンの統合

現状、ポリシー判定が2箇所にある。

```
【現状】
  agent/policy.rs     → Agentic Flowタスクのリスクレベル判定
  mcp/policy.rs       → MCPツール呼び出しのアクセス制御

【問題】
  Agentic FlowからMCPツールを呼ぶ場合、
  両方のポリシーを通る必要がある。判定ロジックが分散。

【統合案】
  policy/ モジュールとして独立させる

  src-tauri/src/policy/
  ├── mod.rs
  ├── engine.rs           ← 統合ポリシーエンジン
  ├── rules.rs            ← ルール定義（Risk Level, Tool Access）
  └── audit.rs            ← 監査ログ

  PolicyEngine::evaluate()が以下を一括判定:
  1. タスクのリスクレベル（旧agent/policy.rs）
  2. ツールのアクセス制御（旧mcp/policy.rs）
  3. プロダクト別オーバーライド
  4. 呼び出し元（UI/Agent/Bridge）の権限
  → 1つのPolicyDecisionを返す
```

---

## 6. UI画面の統合

画面が多すぎると開発者が迷う。統合して画面数を削減する。

```
【現状: 9画面】
  1. Maintenance Dashboard        保守4軸
  2. Portfolio Dashboard           全プロダクト横断
  3. Product Switcher              プロダクト切替
  4. Agent Dashboard               エージェント管理
  5. Approval Gate                 承認画面
  6. AI Assistant                  AIアシスタント
  7. Analytics Dashboard           分析
  8. Kanban Board                  カンバン
  9. MCP Manager                   MCP接続管理

【統合後: 5画面 + 1設定】
  1. 🏠 Home Dashboard
     └ Portfolio Summary + Attention Required + Agent Activity
       （旧 Portfolio Dashboard + Agent Dashboard の主要パネルを統合）

  2. 📋 Project View（プロダクト選択後のメイン画面）
     └ タブ切替:
       [Kanban] [Maintenance] [Analytics] [AI Review]
       （旧 Kanban Board + Maintenance Dashboard + Analytics Dashboard
         + AI Assistant を1画面のタブで切替）

  3. 🤖 Agent Control
     └ タスクキュー + 承認待ち + 実行ログ
       （旧 Agent Dashboard + Approval Gate を統合）

  4. 🔌 Connections（設定画面内）
     └ MCP Server管理 + GitHub アカウント管理
       （旧 MCP Manager を設定画面に格納）

  5. 📊 Sprint（スプリント管理画面）
     └ プランニング + レトロスペクティブ + 年輪
       （旧 Sprint Planner + Retrospective を統合）

  ※ Product Switcher はヘッダー常駐（画面ではなくコンポーネント）
```

**削減効果**: 9画面 → 5画面 + 設定

---

## 7. 再編後のPhaseサマリー

| Phase | 名称 | タスク数 | 主要成果物 |
|-------|------|---------|-----------|
| 1 | ドキュメントマッピング | 6 | frontmatter, .doc-map.yaml, 鮮度チェック |
| 2 | 保守管理 | 5 | 依存スキャン, 負債, カバレッジ, リファクタ候補 |
| 3 | マルチプロダクト | 4 | Registry, スイッチャー, ポートフォリオ |
| 4 | Agentic Flow | 5 | トリガー, タスクキュー, 承認ゲート |
| 5 | ワークフロー | 3 | ワークフローYAML, PRフック, レポート |
| **6** | **共通基盤 & AI** | **7** | **core層, コンテキスト, レビュー統合, コード生成** |
| **7** | **MCP統合** | **7** | **Hub, GitHub/Slack, ポリシー統合** |
| **8** | **アジャイルエンジン** | **5** | **カンバン, Issue同期, プランナー, レトロ, フロー** |
| **9** | **分析 & インサイト** | **4** | **速度, AI効果, スプリント分析, ダッシュボード** |
| **10** | **拡張 & コラボ** | **3** | **Redmine, チーム, ナレッジ** |
| | **合計** | **49→32** | **17タスク削減** |

---

## 8. 既存設計書への影響

再編に伴い、以下の設計書の更新が必要。

| 設計書 | 変更内容 |
|--------|---------|
| `doc-mapping-design.md` | diff_analyzer が core/git_analysis を利用する旨を追記 |
| `devnest-maintenance-strategy.md` | tech_debt の DocDrift が staleness.rs 参照に変更 |
| `devnest-multiproduct-agentic.md` | claude_bridge → core/claude_gateway に変更、Phase順序更新 |
| `devnest-mcp-integration-design.md` | Phase番号変更（9→7）、Claude Code MCP移行を延期に |
| `devnest-implementation-guide.md` | Phase 4の claude_bridge を core 移行に変更 |
| `devnest-phase6-10-implementation-plan.md` | Phase順序・タスク内容を全面更新 |
| `devnest-phase6-10-test-plan.md` | モジュール名変更に合わせてテストファイルパス更新 |
| `devnest-e2e-scenario-coverage.md` | Phase番号の参照を更新 |

---

## 9. マイグレーション戦略

Phase 1-5が実装中の場合、以下の順序で再編を適用する。

```
Step 1: core/ 層を先に作成（Phase 1-5実装と並行可能）
  - git_analysis.rs を新規作成
  - 既存の maintenance/refactor.rs から churn 分析を移動
  - 既存の doc_mapping/diff_analyzer.rs から diff 解析を移動

Step 2: claude_gateway を構築
  - agent/claude_bridge.rs の機能を core/claude_gateway.rs に移動
  - agent モジュールからは core を呼ぶように変更

Step 3: github_gateway を構築
  - product/github_sync.rs の機能を core/github_gateway.rs に移動
  - MCP対応はPhase 7で追加（MCP/API自動切替）

Step 4: review/ モジュール統合
  - Phase 6実装時に PrQualityCheck + ReviewAgent を統合

Step 5: policy/ モジュール統合
  - Phase 7実装時に agent/policy + mcp/policy を統合
```

---

## 10. 判断を保留する項目

以下は現時点で判断せず、実装を進めながら再評価する。

| 項目 | 保留理由 | 再評価タイミング |
|------|---------|----------------|
| MCPのStreamable HTTP対応 | MCP仕様が2026年中に変わる可能性。SSE+stdioで当面十分 | MCP次期仕様リリース後 |
| Redmine MCP vs REST API直接 | 職場のRedmineがMCPサーバーを提供するか不明 | 職場環境を確認後 |
| scrum-agents統合の深さ | DevNest内組み込み vs API連携のみ | scrum-agents側の成熟度を見て |
| Analytics のリアルタイム性 | バッチ計算で十分か、イベント駆動が必要か | Phase 9実装後のUX評価 |
