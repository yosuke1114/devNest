# DevNest v2 次世代機能開発計画

> **前提**: Phase 1-5（ドキュメントマッピング、保守管理、マルチプロダクト、Agentic Flow）が完了済み
> **ビジョン**: DevNestを「AI×アジャイルで個人開発者の生産性を最大化する開発OS」に進化させる
> **差別化**: Scrum/アジャイルの実践知をAIと融合し、既存ツール（Cursor, Copilot等）にない価値を創る

---

## ビジョンマップ

```
                        DevNest v2 — The Developer OS
    ┌──────────────────────────────────────────────────────────┐
    │                                                          │
    │   ┌─────────────┐  ┌─────────────┐  ┌──────────────┐   │
    │   │  Phase 6    │  │  Phase 7    │  │  Phase 8     │   │
    │   │  AI Dev     │  │  Agile      │  │  Analytics   │   │
    │   │  Partner    │  │  Engine     │  │  & Insights  │   │
    │   └──────┬──────┘  └──────┬──────┘  └──────┬───────┘   │
    │          │                │                 │           │
    │          └────────────────┼─────────────────┘           │
    │                          │                              │
    │                  ┌───────┴────────┐                     │
    │                  │  Phase 9       │                     │
    │                  │  Integration   │                     │
    │                  │  Hub           │                     │
    │                  └───────┬────────┘                     │
    │                          │                              │
    │                  ┌───────┴────────┐                     │
    │                  │  Phase 10      │                     │
    │                  │  Collaboration │                     │
    │                  │  & Sharing     │                     │
    │                  └────────────────┘                     │
    │                                                          │
    │   ─── 基盤（Phase 1-5 完了済み）──────────────────────   │
    │   Doc Mapping │ Maintenance │ Multi-Product │ Agentic   │
    └──────────────────────────────────────────────────────────┘
```

---

## Phase 6: AI Dev Partner — AIを「相棒」にする

### コンセプト

Claude Codeとの連携をさらに深め、DevNest上でAIと対話しながら
設計→実装→レビュー→改善のサイクルを回せるようにする。
単なるコード生成ではなく、「設計書を理解したAI」が文脈を持って支援する点が差別化。

---

### 6.1 コンテキストアウェアなAIチャット

DevNest内にAIチャットパネルを組み込み、現在開いているプロダクト・ファイル・
設計書のコンテキストを自動的にAIに渡す。

**なぜ差別化になるか**:
- Cursorは「今開いているファイル」がコンテキスト
- DevNestは「設計書 + 保守データ + プロダクト全体構造」がコンテキスト
- AIが「この変更は設計書のこのセクションに影響する」と言える

**機能詳細**:

```
┌──────────────────────────────────────────────────────┐
│  DevNest AI Partner                [Context: auto]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  🧑 EditorScreenの保存フローにundo機能を追加したい     │
│                                                      │
│  🤖 EditorScreen設計書を確認しました。現在の保存フロー │
│     は save.rs と editor_commands.rs に実装されて      │
│     います。undo機能を追加する場合、以下を検討する      │
│     必要があります:                                    │
│                                                      │
│     1. state.rs にundo stackを追加（設計書「状態管理」 │
│        セクションの更新が必要）                        │
│     2. editor_commands.rs に undo/redo コマンド追加    │
│        （API定義設計書への追記が必要）                  │
│     3. テストカバレッジ: save.rs は現在 68% なので      │
│        追加前にテスト強化を推奨                        │
│                                                      │
│     実装計画を作成しますか？                           │
│     [実装計画を作成] [Claude Codeに依頼] [設計書を更新]│
│                                                      │
│  ── Attached Context ──────────────────────────────  │
│  📄 docs/screens/editor-screen.md (current)          │
│  📄 docs/api/tauri-commands.md (current)             │
│  📊 Coverage: save.rs 68% | state.rs 74%            │
│  🏗️ Debt: state.rs has 2 TODOs                       │
└──────────────────────────────────────────────────────┘
```

**実装要素**:
- AIチャットUI（ストリーミングレスポンス対応）
- コンテキストエンジン: 現在のプロダクト + 開いているファイル + 関連設計書 + 保守データを自動収集
- アクションボタン: チャットから直接Claude Codeタスクを発行、設計書更新を起動
- チャット履歴のプロダクト別永続化

---

### 6.2 AIコードレビュー

PRやコミットに対して、設計書との整合性を含めたAIレビューを実行。

**レビュー観点**:

| 観点 | 内容 | データソース |
|------|------|-------------|
| 設計整合性 | 実装が設計書の記述と一致しているか | doc-mapping |
| 保守品質 | 技術的負債を増やしていないか | tech_debt スキャン |
| テスト充足 | 新規コードにテストがあるか | coverage データ |
| ネーミング | 設計書の用語と実装の命名が一致するか | frontmatter tags |
| 影響範囲 | 見落としている影響設計書がないか | doc-map 逆引き |

**出力例**:
```markdown
## AI Review: feature/add-undo (PR #42)

### 🟢 設計整合性
- editor-screen.md の「状態管理」セクションと実装が一致

### 🟡 保守品質
- state.rs の循環的複雑度が 12 → 18 に上昇（閾値: 15）
- TODO追加あり（L.45: "// TODO: undo stack size limit"）

### 🔴 テスト充足
- 新規関数 `undo()` `redo()` にテストなし
- save.rs のカバレッジが 68% → 62% に低下

### 📄 ドキュメント影響
- docs/screens/editor-screen.md の「状態管理」セクション要更新
- docs/api/tauri-commands.md に undo/redo コマンド追記が必要
```

**実装要素**:
- PR diff → doc-map照合 → AI分析パイプライン
- レビュー結果のUI表示（PR詳細画面内）
- GitHub PRコメントへの自動投稿（オプション）
- レビューポリシー設定（どの観点を有効にするか、`.devnest.yaml` で制御）

---

### 6.3 AI設計書ドラフター

新機能の構想段階で、AIが設計書の初稿を自動生成する。

**フロー**:
```
開発者: 「undo/redo機能を追加したい」（自然言語で概要を入力）
    │
    ▼
AI: 既存設計書・ソース構造を分析
    │
    ▼
AI: 設計書ドラフトを生成
    - frontmatter（mapping含む）自動設定
    - 影響する既存設計書の更新案
    - 推定工数・リスク
    │
    ▼
開発者: レビュー・修正
    │
    ▼
DevNest: 設計書をdocs/に配置、doc-mapを更新
    │
    ▼
DevNest: 実装タスクをAgentic Flowに投入
```

**差別化ポイント**:
- 既存設計書との一貫性を自動確保（用語、構造、粒度を合わせる）
- frontmatterのマッピングが最初から設定されている
- 「設計 → 実装 → ドキュメント更新」が途切れないフローを実現

---

## Phase 7: Agile Engine — Scrum知見をエンジンに変える

### コンセプト

Yosukeさんのスクラムマスター経験とアジャイル知見をDevNestに組み込み、
個人開発でもチーム開発でも「アジャイルのリズム」で回せるようにする。
scrum-agentsプロジェクトで培った知見をDevNestネイティブ機能に昇華。

---

### 7.1 パーソナルスプリント管理

個人開発者向けの軽量スプリント管理。1人スクラムを仕組みで支援。

**スプリントボード**:
```
┌─────────────────────────────────────────────────────────┐
│  Sprint 12: DevNest AI Partner   (Mar 10 - Mar 23)     │
│  Velocity: 21pts   Capacity: 24pts                      │
├───────────┬───────────┬───────────┬─────────────────────┤
│  Backlog  │ In Prog   │ Review    │ Done                │
│  (8pts)   │ (5pts)    │ (3pts)    │ (13pts)             │
├───────────┼───────────┼───────────┼─────────────────────┤
│           │           │           │                     │
│ ▫ 6.3    │ ▪ 6.1     │ ▪ 6.2    │ ✅ P5-Task1  3pts  │
│   AI     │   AIChat  │   Code   │ ✅ P5-Task2  5pts  │
│   Drafter│   Panel   │   Review │ ✅ P5-Task3  5pts  │
│   5pts   │   5pts    │   3pts   │                     │
│           │           │           │                     │
│ ▫ 7.2    │           │           │                     │
│   Retro  │           │           │                     │
│   3pts   │           │           │                     │
│           │           │           │                     │
├───────────┴───────────┴───────────┴─────────────────────┤
│  Burndown: ████████████░░░░░░░░░░░░  54% (Day 7/14)    │
│  Agent: 2 tasks completed, 1 running                    │
└─────────────────────────────────────────────────────────┘
```

**機能詳細**:
- スプリント作成（期間、目標、キャパシティ設定）
- バックログ管理（ストーリーポイント、優先度）
- タスクの自動リンク:
  - GitHub Issue との双方向同期
  - Agentic Flowタスクとの連携（自動タスクもボードに表示）
  - doc-map: タスクがどの設計書に影響するか自動表示
- バーンダウンチャート自動生成
- ベロシティ追跡（スプリント横断）

**データソース統合**:
```
Sprint Item
  ├── GitHub Issue/PR リンク
  ├── 影響する設計書（doc-map自動検出）
  ├── 保守タスク（Agentic Flowからの自動追加）
  ├── テストカバレッジ影響予測
  └── 技術的負債への影響
```

---

### 7.2 AIレトロスペクティブ

スプリント完了時にAIが振り返りを支援する。
開発データから客観的なインサイトを自動生成。

**AI生成レトロ**:
```markdown
## Sprint 12 Retrospective — AI Analysis

### 📊 スプリントサマリー
- 完了: 21pts / 計画: 24pts (87.5%)
- ベロシティトレンド: 18 → 20 → 21 (上昇傾向 🟢)
- スプリント目標「AI Partner基盤構築」: 達成

### 🟢 良かったこと（データから）
- doc-mapping連携のテストカバレッジが 68% → 78% に向上
- 技術的負債スコアが 34 → 29 に改善
- Agentic Flowが自動で3件のドキュメント更新を完了

### 🟡 改善できること（データから）
- Task 6.1 の見積もり 3pts に対し実際は 5pts かかった
  → AIチャットのストリーミング実装が予想より複雑だった
- state.rs の複雑度が閾値超過（Churn×Complexity 赤ゾーン）
  → 次スプリントでリファクタリングを推奨

### 💡 提案（パターン検出）
- 直近3スプリントでUI系タスクの見積もり精度が低い傾向
  → UI系は1.5倍バッファを推奨
- coverage が上がるスプリントとvelocityが相関
  → テスト先行で生産性も上がっている可能性

### 🎯 次スプリントへの推奨
1. state.rs リファクタリング（負債解消: -5pts相当）
2. AI Drafter実装（新機能: 5pts）
3. 見積もりバッファ調整（UI: ×1.5）
```

**verbs/年輪レトロスペクティブ連携**:
- 「始める・続ける・やめる・増やす・減らす」のフレームワークをUI化
- AIが過去のレトロデータから「前回 "始める" にしたことが実行されたか」を追跡
- 年輪的に過去のスプリントの蓄積を可視化

---

### 7.3 バックログリファインメント支援

AIがバックログアイテムの分析・分割・見積もり支援を行う。

**機能**:
- ストーリーの自動分割提案（大きすぎるストーリーを検出）
- 受け入れ基準の自動生成（設計書から推定）
- 見積もり支援:
  - 過去の類似タスクの実績から見積もり精度を提案
  - 「このタスクはsrc/github/を触るので、過去の実績からは3-5ptsの範囲」
- 依存関係の自動検出（doc-mapとsource依存から）
- INVEST基準チェック（Independent, Negotiable, Valuable, Estimable, Small, Testable）

---

### 7.4 Definition of Done オートチェッカー

スプリントアイテムが「完了」の定義を満たしているかを自動チェック。

**チェック項目（カスタマイズ可能）**:
```yaml
# .devnest.yaml
definition_of_done:
  - code_committed: true
  - tests_passing: true
  - coverage_not_decreased: true
  - docs_updated: true              # doc-map鮮度チェック連携
  - no_new_debt: true               # 技術的負債スコアが悪化していない
  - pr_reviewed: true               # AI or 人間のレビュー済み
  - design_doc_synced: true         # 関連設計書のstatus=current
```

**UI表示**:
```
Task: AIチャットパネル実装
  ✅ コードコミット済み
  ✅ テスト通過
  ✅ カバレッジ維持 (74% → 76%)
  🔴 設計書未更新 (editor-screen.md: outdated)
  ✅ PRレビュー済み
  ✅ 技術的負債変化なし

  DoD: 5/6 (83%) — 設計書更新で完了
  [Claude Codeで設計書を更新]
```

---

## Phase 8: Analytics & Insights — 開発を数値で見る

### コンセプト

開発プロセスのあらゆるデータを収集・分析し、
個人開発者が自分の生産性パターンを理解して改善できるようにする。

---

### 8.1 開発生産性ダッシュボード

**メトリクス**:

| カテゴリ | メトリクス | データソース |
|----------|-----------|-------------|
| アウトプット | コミット数, 変更行数, 完了ストーリーポイント | Git, Sprint |
| 品質 | テストカバレッジ推移, 負債スコア推移, バグ率 | Maintenance |
| プロセス | ベロシティ, リードタイム, サイクルタイム | Sprint, Git |
| AI活用 | AI生成コード率, AIレビュー採用率, 自動化タスク数 | Agentic Flow |
| 保守 | 依存更新頻度, ドキュメント鮮度平均, リファクタ率 | Maintenance |

**ダッシュボード**:
```
┌─────────────────────────────────────────────────────────────┐
│  📊 Development Insights         [Period: Last 3 months ▼] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ── Productivity Trend ──────────────────────────────────   │
│  Velocity    │  ▁ ▂ ▃ ▅ ▅ ▆ ▇ ▇ █ █ █ █  (↑ 45%)        │
│  Quality     │  ▃ ▃ ▄ ▅ ▅ ▅ ▆ ▆ ▇ ▇ █ █  (↑ 32%)        │
│  AI Leverage │  ▁ ▁ ▂ ▃ ▄ ▅ ▅ ▆ ▇ ▇ █ █  (↑ 78%)        │
│                                                             │
│  ── Time Allocation ──────────────────────────────────────  │
│  Coding:     ████████████████░░░░  42%                      │
│  Design:     ██████░░░░░░░░░░░░░░  15%                      │
│  Review:     █████░░░░░░░░░░░░░░░  12%                      │
│  Maintenance:████░░░░░░░░░░░░░░░░  10%                      │
│  AI-Handled: ████████░░░░░░░░░░░░  21%  ← DevNest差別化     │
│                                                             │
│  ── AI Impact ────────────────────────────────────────────  │
│  Auto-generated tests:      23 files (saved ~8hrs)          │
│  Auto-updated docs:         14 docs  (saved ~6hrs)          │
│  Auto-patched dependencies: 8 deps   (saved ~3hrs)          │
│  Total estimated time saved: ~17hrs this month              │
│                                                             │
│  ── Cross-Product Comparison ─────────────────────────────  │
│  DevNest:      ████████  Quality: A   Velocity: ↑           │
│  scrum-agents: █████░░░  Quality: B+  Velocity: →           │
│  GoLingo:      ███████░  Quality: A-  Velocity: ↑           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 8.2 フロー状態分析

Git commitのタイムスタンプパターンから「集中できている時間帯」を分析。

**分析内容**:
- 時間帯別コミット密度ヒートマップ
- 「フロー状態」推定（連続コミット間隔が短い時間帯）
- 中断パターン検出（長い空白後に同じファイルに戻る）
- 曜日別・週別の生産性パターン

**活用**:
- 「あなたは火曜の午後にフロー状態に入りやすい傾向があります」
- 「大きな設計タスクは水曜午前に配置すると効果的かもしれません」
- スプリントプランニング時の参考データとして提示

---

### 8.3 技術スキルマップ

Git履歴からどの技術領域にどれだけの経験を積んでいるかを可視化。

**スキルマップ**:
```
┌─ Technical Skill Map ─────────────────────────────────────┐
│                                                           │
│  Rust        ████████████████████  Expert (2,400 commits) │
│  TypeScript  ███████████████░░░░░  Advanced (1,800)       │
│  Go          █████████░░░░░░░░░░░  Intermediate (900)     │
│  React       ██████████████░░░░░░  Advanced (1,500)       │
│  Tauri       ████████████░░░░░░░░  Advanced (1,200)       │
│  GitHub API  ██████░░░░░░░░░░░░░░  Intermediate (600)     │
│  Testing     ████████████████░░░░  Advanced (1,600)       │
│  DevOps      ████░░░░░░░░░░░░░░░░  Beginner (400)        │
│                                                           │
│  Recent Focus: Rust + AI Integration (last 3 months)      │
│  Growth Area: DevOps (↑ 120% this quarter)                │
└───────────────────────────────────────────────────────────┘
```

---

## Phase 9: Integration Hub — 外部ツールとの接続

### コンセプト

DevNestを開発情報のハブにして、分散したツールの情報を集約する。
特に職場環境で必須のツールとの連携を重視。

---

### 9.1 プラグインアーキテクチャ

外部ツール連携をプラグインとして追加できるアーキテクチャ。

**プラグインインターフェース**:
```rust
pub trait IntegrationPlugin: Send + Sync {
    /// プラグイン名
    fn name(&self) -> &str;

    /// タスク同期: 外部ツールからタスクを取得
    async fn fetch_tasks(&self, config: &PluginConfig) -> Result<Vec<ExternalTask>, PluginError>;

    /// タスク同期: DevNestのタスクを外部に反映
    async fn sync_task(&self, task: &SprintItem, config: &PluginConfig) -> Result<(), PluginError>;

    /// 通知送信
    async fn send_notification(&self, notification: &Notification, config: &PluginConfig) -> Result<(), PluginError>;

    /// Webhook受信（オプション）
    fn handle_webhook(&self, payload: &[u8]) -> Result<Vec<IntegrationEvent>, PluginError> {
        Ok(vec![])
    }
}
```

**プラグイン設定**:
```yaml
# .devnest.yaml
integrations:
  - type: redmine
    url: "https://redmine.example.com"
    api_key_ref: "keychain:redmine-api-key"
    sync_mode: bidirectional          # pull | push | bidirectional
    project_mapping:
      devnest: "dev-tools"
      mobile-banking: "mobile-app"

  - type: monday
    api_key_ref: "keychain:monday-api-key"
    board_mapping:
      devnest: "12345678"

  - type: slack
    webhook_url_ref: "keychain:slack-webhook"
    channels:
      alerts: "#devnest-alerts"
      reports: "#devnest-reports"

  - type: teams
    webhook_url_ref: "keychain:teams-webhook"
    channels:
      alerts: "DevNest Alerts"
```

---

### 9.2 Redmine連携

職場環境（MUFG等）で広く使われるRedmineとの双方向同期。

**機能**:
- Redmineチケット → DevNestスプリントアイテムの同期
- ステータス双方向反映（進行中/完了等）
- カスタムフィールド対応
- Redmineの工数データをDevNestの生産性分析に統合
- VBA管理していたRedmine操作をDevNestに移行

**データフロー**:
```
Redmine                    DevNest
┌──────────┐              ┌────────────────┐
│ Ticket   │─── pull ────▶│ Sprint Item    │
│ #1234    │              │ (linked)       │
│          │◀── push ────│                │
│ Status   │              │ Status         │
│ 工数     │◀── push ────│ Time tracking  │
└──────────┘              └────────────────┘
```

---

### 9.3 Monday.com連携

**機能**:
- Mondayボード → DevNestスプリントの同期
- ステータスカラムの双方向反映
- サブアイテムのタスク分解連携

---

### 9.4 Slack / Teams通知

**通知トリガー**:
- Agentic Flowタスク完了/失敗
- 保守アラート（脆弱性検出、カバレッジ低下）
- スプリント完了レポート
- AI レトロスペクティブ結果

**通知フォーマット**:
```
🤖 DevNest Agent Report
Product: scrum-agents
Task: Weekly Maintenance Scan

Results:
- 📦 Dependencies: 1 vulnerability patched
- 📄 Docs: 2 documents updated
- 🧪 Coverage: 58% → 62% (↑4%)
- 🏗️ Tech Debt: 45 → 42 (↓3)

Details: [Open in DevNest]
```

---

## Phase 10: Collaboration & Sharing — 知見を共有する

### コンセプト

個人の開発知見を蓄積し、チームや将来の自分に共有できるようにする。
DevNest自体がナレッジベースになる。

---

### 10.1 開発ジャーナル

日々の開発での学び・決定・失敗を自動/手動で記録。

**自動記録**:
- 「今日の変更サマリー」をGitログから自動生成
- リファクタリング判断の記録（なぜこの設計にしたか）
- デバッグで発見した知見の記録

**手動記録**:
- 設計判断のADR（Architecture Decision Record）を簡単に作成
- TIL（Today I Learned）メモ
- トラブルシューティングログ

**AI活用**:
- 「以前似たようなバグを修正したことがあります」と過去ジャーナルから提案
- 設計判断時に「過去のADRでは○○の理由で△△を選択しました」と参照

---

### 10.2 プロダクトテンプレート

DevNestで構築した設定・ワークフロー・設計書構造をテンプレート化して再利用。

**テンプレートに含まれるもの**:
- `.devnest.yaml` の雛形
- `docs/` の設計書テンプレート群（frontmatter付き）
- `.devnest/workflows/` のワークフロー定義
- `.devnest/triggers.yaml` のトリガー設定
- Definition of Done設定
- カバレッジ目標設定

**利用シーン**:
- 新しいTauriプロジェクトを始めるとき → "Tauri v2 Template" を適用
- 職場プロジェクトのセットアップ → "Enterprise Java Template" を適用
- テンプレートをGit管理して進化させる

---

### 10.3 ナレッジグラフ

プロダクト横断の知識を構造化して可視化。

**ノードの種類**:
- プロダクト
- 設計書
- 技術（言語、フレームワーク、ライブラリ）
- パターン（設計パターン、アーキテクチャパターン）
- 学び（ジャーナルから抽出）

**活用例**:
- 「Rustのエラーハンドリングパターン」で検索すると、
  DevNestとGoLingoのerror handling設計書 + 関連ジャーナルが見つかる
- 新しいプロジェクトで技術選定するとき、過去の実績から判断材料を提供

---

## 全体ロードマップ & 優先順位

### 推奨実装順序

```
Phase 6 (AI Dev Partner)
│
├── 6.1 AIチャット ──────────── 最優先（日常的に使う機能）
├── 6.2 AIコードレビュー ────── Agentic Flow拡張として自然
└── 6.3 AI設計書ドラフター ──── 設計→実装フローの完成

Phase 7 (Agile Engine)
│
├── 7.1 パーソナルスプリント ── コア機能（DevNestの骨格）
├── 7.4 DoD オートチェッカー ── Phase 1-5データとの直接連携
├── 7.2 AIレトロスペクティブ ── データ蓄積後に威力を発揮
└── 7.3 バックログリファインメント ── スプリント管理の成熟

Phase 8 (Analytics)
│
├── 8.1 生産性ダッシュボード ── 他Phaseのデータを集約表示
├── 8.2 フロー状態分析 ─────── Git履歴だけで独立実装可能
└── 8.3 スキルマップ ──────── Git履歴だけで独立実装可能

Phase 9 (Integration Hub)
│
├── 9.1 プラグインアーキテクチャ ── 先に基盤を整備
├── 9.4 Slack/Teams通知 ──────────── 最も手軽で効果大
├── 9.2 Redmine連携 ──────────────── 職場実用性
└── 9.3 Monday.com連携 ───────────── 職場実用性

Phase 10 (Collaboration)
│
├── 10.1 開発ジャーナル ────── 個人利用で即効果
├── 10.2 プロダクトテンプレート ── 複数プロジェクト運用後に有効
└── 10.3 ナレッジグラフ ────── データ蓄積の集大成
```

### 並行実施可能なもの

Phase 6-10は一部並行開発が可能:

| 並行可能な組み合わせ | 理由 |
|---|---|
| 6.1 AIチャット + 7.1 スプリント管理 | UI層は独立、バックエンドも別モジュール |
| 8.2 フロー分析 + 8.3 スキルマップ | Git履歴のみで独立実装可能 |
| 9.1 プラグイン基盤 + 9.4 Slack通知 | 通知はプラグインの最初の実装例 |
| 10.1 ジャーナル + 他Phase | 独立したデータストア |

### 見積もり目安（Phase単位）

| Phase | 規模感 | 推定期間 |
|-------|--------|----------|
| Phase 6 | AIチャット + レビュー + ドラフター | 4-6スプリント |
| Phase 7 | スプリント管理 + レトロ + DoD | 4-6スプリント |
| Phase 8 | 分析ダッシュボード群 | 3-4スプリント |
| Phase 9 | プラグイン基盤 + 主要連携 | 4-6スプリント |
| Phase 10 | ジャーナル + テンプレート + グラフ | 3-5スプリント |

---

## DevNest差別化サマリー

### 既存ツールとの比較

```
                  Cursor/   GitHub    Jira/     DevNest
                  Copilot   Copilot   Monday    v2
                  ───────   ───────   ──────    ─────────
AI Code Gen       ◎         ◎         ✗         ○
AI Code Review    ○         ◎         ✗         ◎ ※1
設計書連動AI      ✗         ✗         ✗         ◎ ※2
保守自動化        ✗         △         ✗         ◎
スプリント管理    ✗         ✗         ◎         ○ ※3
開発分析          ✗         △         △         ◎ ※4
ドキュメント管理  ✗         ✗         ✗         ◎
マルチプロダクト  ✗         ✗         ○         ◎
外部ツール統合    ✗         ✗         ○         ○

※1 設計書整合性チェック付きレビューは唯一
※2 doc-mapping × AIは完全にユニーク
※3 個人開発者向け軽量スクラムは独自
※4 AI活用度メトリクスを含む分析は独自
```

### DevNestが唯一提供する価値
1. **設計書とコードの生きたリンク** — doc-mappingによる自動追跡
2. **保守の自動化** — Agentic Flowによる自律的な品質維持
3. **AI × アジャイル** — スクラムの実践知をAIが支援する仕組み
4. **開発者ポートフォリオ管理** — 全プロジェクトの健康状態を一画面で
5. **「設計→実装→レビュー→保守」の途切れないループ** — 他ツールは一部のみ
