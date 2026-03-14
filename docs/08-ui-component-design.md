# DevNest UI コンポーネント設計書

> **文書ID**: DESIGN-UI-V2
> **対象**: 再編後の画面構成、サイドバー、ヘッダー、全コンポーネントツリー
> **確定版**: サイドバー4項目 + ヘッダー3要素

---

## 1. レイアウト全体構成

```
┌─────────────────────────────────────────────────────────────┐
│ ヘッダー (44px)                                              │
│ [DevNest]  [🔍 検索... ⌘K]                         [🔔 3]  │
│  ↑ロゴ=ホーム   ↑コマンドパレット               ↑通知ベル   │
├────────┬────────────────────────────────────────────────────┤
│サイド  │                                                    │
│バー    │  メインコンテンツエリア                              │
│(200px) │                                                    │
│        │  ※ 選択中のメニューに応じて画面が切り替わる         │
│ PROJECT│                                                    │
│[devNest▾]                                                   │
│        │                                                    │
│📋 プロジェクト                                               │
│── 開発 ──│                                                  │
│🔀 GitHub │                                                  │
│  Issues  │                                                  │
│  PR      │                                                  │
│  コンフリクト                                                │
│📝 設計書 │                                                  │
│  一覧    │                                                  │
│  鮮度マップ                                                  │
│── 管理 ──│                                                  │
│🤖 エージェント                                               │
│📊 スプリント                                                 │
│──────────│                                                  │
│⚙️ 設定   │                                                  │
└────────┴────────────────────────────────────────────────────┘
```

---

## 2. ヘッダー

### 構成要素（3つのみ）

| 位置 | 要素 | 動作 |
|------|------|------|
| 左 | **DevNest** ロゴ | クリックでホーム画面（ポートフォリオダッシュボード）に遷移 |
| 中央寄せ | **検索バー** `🔍 検索... ⌘K` | クリック or ⌘K でコマンドパレットを開く |
| 右 | **通知ベル** 🔔 + 未読バッジ | クリックで通知ドロップダウンパネルを開閉 |

※ ユーザーアイコンは不要（Tauriデスクトップアプリのため認証・ユーザー切替なし）

### コンポーネント: `Header.tsx`

```typescript
interface HeaderProps {
  onNavigateHome: () => void;
  unreadNotificationCount: number;
}

// 子コンポーネント:
//   LogoButton         — DevNestロゴ。クリックで / に遷移
//   SearchPill          — 検索バーUI。クリックで CommandPalette を開く
//   NotificationBell    — ベルアイコン + バッジ + ドロップダウン
```

---

## 3. 通知ドロップダウンパネル

### 構成

```
┌─────────────────────────────────────┐
│ 通知              すべて既読にする   │
├─────────────────────────────────────┤
│ ● ⚠ internal-portal に脆弱性が     │
│     8件検出されました                │
│     保守スキャン · 5分前             │
├─────────────────────────────────────┤
│ ● 🤖 scrum-agents の設計書更新      │
│     タスクが承認待ちです             │
│     エージェント · 12分前            │
├─────────────────────────────────────┤
│ ● 📝 DevNest の editor-screen.md   │
│     が古くなっています               │
│     鮮度チェック · 1時間前           │
├─────────────────────────────────────┤
│   ✓ GoLingo の依存パッチPRが        │
│     マージされました                 │
│     エージェント · 3時間前           │
├─────────────────────────────────────┤
│     設定 > 通知 で配信ルールを管理 → │
└─────────────────────────────────────┘
```

### 通知カテゴリ

| カテゴリ | アイコン色 | トリガー元 |
|---------|----------|-----------|
| 脆弱性/保守アラート | 赤 `#FCEBEB` | maintenance/ 保守スキャン |
| エージェントタスク | 紫 `#EEEDFE` | agent/ タスク完了・承認待ち |
| 設計書鮮度 | 黄 `#FAEEDA` | doc_mapping/ 鮮度チェック |
| GitHub/MCP イベント | 緑 `#E1F5EE` | mcp/ PR マージ、Issue更新等 |

### 通知の状態

- **未読**: 左端に紫ドット（●）+ 背景色を少し明るく
- **既読**: ドットなし + 通常背景
- 「すべて既読にする」で一括クリア

### コンポーネント: `NotificationPanel.tsx`

```typescript
interface Notification {
  id: string;
  category: 'vulnerability' | 'agent' | 'doc_staleness' | 'github_event';
  title: string;
  body: string;
  source: string;          // "保守スキャン", "エージェント" 等
  timestamp: DateTime;
  read: boolean;
  product_id: string;
  action_url?: string;     // クリック時の遷移先
}

// Tauriコマンド:
//   get_notifications() -> Vec<Notification>
//   mark_all_read() -> ()
//   mark_read(id: String) -> ()
```

---

## 4. コマンドパレット（⌘K 検索）

### 検索対象

| 対象 | アイコン | 検索フィールド |
|------|---------|-------------|
| 設計書 | 📝 | タイトル, frontmatter tags |
| Issues | 🔀 | タイトル, ラベル |
| Pull Requests | 🔀 | タイトル, ブランチ名 |
| カンバンカード | 📋 | タイトル, ラベル |
| ナレッジ | 💡 | タイトル, タグ, 本文 |
| 画面遷移 | → | メニュー名（「スプリント」→ スプリント画面へ） |

### UI構成

```
┌─────────────────────────────────────────┐
│ 🔍 検索...                              │
├─────────────────────────────────────────┤
│ 最近のアクセス                           │
│   📝 editor-screen.md                   │
│   🔀 Issue #42: カバレッジ改善           │
│   📋 カード: Claude Gateway実装          │
├─────────────────────────────────────────┤
│ → プロジェクト  → エージェント           │
│ → スプリント    → 設定                   │
└─────────────────────────────────────────┘
```

- 入力なし: 最近のアクセス + 画面遷移ショートカット
- 入力あり: リアルタイムで全対象を横断検索
- Enter: 選択項目に遷移
- Esc: パレットを閉じる

### コンポーネント: `CommandPalette.tsx`

```typescript
interface SearchResult {
  type: 'doc' | 'issue' | 'pr' | 'card' | 'knowledge' | 'navigation';
  title: string;
  subtitle?: string;
  icon: string;
  action: () => void;      // 遷移アクション
}

// キーボードショートカット:
//   ⌘K (Mac) / Ctrl+K (Win/Linux): パレット開閉
//   ↑↓: 結果選択
//   Enter: 遷移
//   Esc: 閉じる
```

---

## 5. サイドバー

### 構成（トップレベル4項目 + セクション内サブメニュー）

```
PROJECT
[devNest ▾]                    ← プロダクトスイッチャー

📋 プロジェクト                  ← プロダクト詳細画面

── 開発 ────────────────────
🔀 GitHub            [3]  ›    ← 統合メニュー（バッジ=Open数合計）
    ├ Issues
    ├ Pull Requests
    └ コンフリクト
📝 設計書                  ›    ← 設計書メニュー
    ├ 一覧
    └ 鮮度マップ

── 管理 ────────────────────
🤖 エージェント                  ← タスクキュー + 承認 + ログ
📊 スプリント                    ← プランニング + レトロ + 年輪 + フロー

────────────────────────────
⚙️ 設定                         ← 接続 + 通知 + ポリシー + 環境設定
```

### サイドバーの動作ルール

| ルール | 説明 |
|--------|------|
| サブメニュー展開 | 親メニュー（GitHub/設計書）クリックでトグル展開 |
| アクティブ状態 | 現在表示中の画面に対応するメニューがハイライト |
| バッジ | GitHub: Issues(Open)+PR(Open)+コンフリクト(Active)の合計 |
| プロダクト切替 | ドロップダウンで変更。全画面のコンテキストが連動 |
| レスポンシブ | ウィンドウ幅が狭い場合: アイコンのみ表示（ツールチップ付き） |

### コンポーネント: `Sidebar.tsx`

```typescript
interface SidebarProps {
  currentProduct: Product;
  products: Product[];
  activeRoute: string;
  githubBadgeCount: number;
  onProductSwitch: (productId: string) => void;
  onNavigate: (route: string) => void;
}

// 子コンポーネント:
//   ProductSwitcher     — ドロップダウン。カテゴリ別、ヘルスアイコン、ピン留め
//   SidebarSection      — セクションラベル（「開発」「管理」）
//   SidebarItem         — メニュー項目（アイコン、ラベル、バッジ、展開矢印）
//   SidebarSubItem      — サブメニュー項目
```

### プロダクトスイッチャー展開時

```
┌─────────────────────────────┐
│ 🔍 プロダクト検索...         │
│                             │
│ ── Personal ──────────────  │
│ ★ DevNest       🟢 Rust/TS │
│   scrum-agents   🟡 TS     │
│   GoLingo        🟢 Go     │
│                             │
│ ── Work ──────────────────  │
│   mobile-banking 🟡 Java   │
│   internal-portal🔴 Java   │
│                             │
│ [+ プロダクト追加]           │
└─────────────────────────────┘
```

---

## 6. 画面一覧

### 🏠 ホーム (`/`) — DevNestロゴクリックで遷移

ポートフォリオ横断のダッシュボード。

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│ ┌─ ヘルスオーバービュー ───────────────────────────────┐ │
│ │ Total: 4 products  🟢 2  🟡 1  🔴 1               │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ プロダクト一覧テーブル ─────────────────────────────┐ │
│ │ Product │ Health │ Deps │ Debt │ Cov │ Docs │ Agent │ │
│ │ DevNest │  🟢   │ 0 ⚠ │  34  │ 72% │ 3 🟡 │ idle  │ │
│ │ scrum   │  🟡   │ 2 ⚠ │  45  │ 58% │ 1 🔴 │ run   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ ┌─ 要対応 ─────────────┐ ┌─ Agent Activity ──────────┐ │
│ │ 🔴 8 vulnerable deps │ │ 🤖 updating docs...      │ │
│ │ 🟡 doc stale 14 days │ │ ✅ patch applied (12m)    │ │
│ └──────────────────────┘ └───────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**コンポーネント**:
- `HealthOverview` — 全プロダクトの集計バー
- `ProductTable` — 一覧テーブル（行クリック → プロジェクト画面へ）
- `AttentionPanel` — 優先度高の問題リスト
- `AgentActivityPanel` — 実行中/完了タスク

---

### 📋 プロジェクト (`/project/:id`)

選択中プロダクトの詳細。タブで切り替え。

```
┌─────────────────────────────────────────────────────────┐
│  devNest                                                │
│  [概要] [保守] [分析] [カンバン] [AI レビュー]            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  （選択中のタブの内容を表示）                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

| タブ | 内容 | 対応Phase |
|------|------|----------|
| 概要 | プロダクト基本情報、tech_stack、最近のアクティビティ | 3 |
| 保守 | 依存/負債/カバレッジ/リファクタ候補の4パネル | 2 |
| 分析 | 開発速度/AI効果/スプリント比較（Phase 9で追加） | 9 |
| カンバン | カンバンボード（Phase 8で追加） | 8 |
| AI レビュー | レビュー実行/Finding表示/コード生成（Phase 6で追加） | 6 |

**コンポーネント**:
- `ProjectView` — タブコンテナ
- `OverviewTab` — 基本情報
- `MaintenanceTab` — 保守4パネル
- `AnalyticsTab` — 分析グラフ（recharts）
- `KanbanTab` — ドラッグ&ドロップカンバン
- `AiReviewTab` — レビュー/コード生成

---

### 🔀 GitHub > Issues (`/github/issues`)

```
┌─────────────────────────────────────────────────────────┐
│  [Open] [Closed] [All]                       [🔄 Sync] │
├──────────────────────────┬──────────────────────────────┤
│ Issue一覧                 │ Issue詳細                    │
│                          │                              │
│ #42 カバレッジ改善  🟢   │ #42 カバレッジ改善            │
│ #38 認証エラー      🔴   │                              │
│ #35 CI修正          🟡   │ 本文...                      │
│                          │ ラベル: [bug] [priority:high] │
│                          │ リンク: カンバンカード #12     │
│                          │                              │
│                          │ [カンバンに追加] [ブラウザで開く]│
└──────────────────────────┴──────────────────────────────┘
```

### 🔀 GitHub > Pull Requests (`/github/pulls`)

Issues画面と同じ2カラムレイアウト。PR詳細にdoc-impact分析表示。

### 🔀 GitHub > コンフリクト (`/github/conflicts`)

コンフリクト検出一覧。ファイル別の差分表示。

---

### 📝 設計書 > 一覧 (`/docs/list`)

```
┌─────────────────────────────────────────────────────────┐
│  設計書一覧                          [+ 新規作成]        │
│  [🔍 フィルタ: 種別 / ステータス / タグ]                 │
├──────────────────────────┬──────────────────────────────┤
│ 設計書リスト              │ プレビュー / 編集             │
│                          │                              │
│ 🟢 system-overview.md    │ # システム概要設計書           │
│ 🟡 editor-screen.md      │                              │
│ 🟢 tauri-commands.md     │ doc_type: architecture       │
│ 🔴 error-strategy.md     │ version: 1.2.0               │
│                          │ status: current               │
│                          │ mapping:                      │
│                          │   sources:                    │
│                          │     - src/editor/ ...         │
└──────────────────────────┴──────────────────────────────┘
```

### 📝 設計書 > 鮮度マップ (`/docs/freshness`)

```
┌─────────────────────────────────────────────────────────┐
│  設計書 鮮度マップ                       [🔄 再スキャン] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🟢 Current (12)  🟡 Outdated (3)  🔴 Stale (1)       │
│                                                         │
│  ┌─ architecture/ ─────────────────────────────────┐   │
│  │ 🟢 system-overview.md        score: 0.12        │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─ screens/ ──────────────────────────────────────┐   │
│  │ 🟡 editor-screen.md          score: 0.54        │   │
│  │ 🟢 sync-diff-screen.md       score: 0.08        │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─ error-handling/ ──────────────────────────────┐    │
│  │ 🔴 error-strategy.md         score: 0.82        │   │
│  │    → last_synced: 28 days ago, 14 commits behind│   │
│  │    [AI更新を実行]                                │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

### 🤖 エージェント (`/agent`)

```
┌─────────────────────────────────────────────────────────┐
│  エージェント                         [+ タスク追加]     │
│  [キュー] [承認待ち (2)] [実行ログ] [トリガー設定]       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  承認待ちタブ表示例:                                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🤖 DocAutoUpdate — scrum-agents                    │ │
│  │ Trigger: doc_staleness_max exceeded (0.78)         │ │
│  │ Risk: Medium                                       │ │
│  │                                                    │ │
│  │ 実行計画:                                           │ │
│  │ 1. Read docs/agent-protocol.md                     │ │
│  │ 2. Analyze diff since a1b2c3d..HEAD                │ │
│  │ 3. Claude Code: Update design doc                  │ │
│  │ 4. Commit to branch: agent/doc-update-20260314     │ │
│  │ 5. Create PR                                       │ │
│  │                                                    │ │
│  │ [✅ 承認] [✏️ 計画修正] [❌ 却下] [⏸️ 保留]         │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**タブ構成**:
- **キュー**: タスク一覧（ステータス/プロダクト別フィルタ）
- **承認待ち**: ExecutionPlan表示 + 承認/却下ボタン
- **実行ログ**: 完了/失敗タスクの履歴（Claude Code出力含む）
- **トリガー設定**: スケジュール/閾値トリガーの設定UI

---

### 📊 スプリント (`/sprint`)

```
┌─────────────────────────────────────────────────────────┐
│  スプリント                                              │
│  [プランニング] [レトロスペクティブ] [年輪] [フロー分析]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  年輪タブ表示例:                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │         Sprint 1  Sprint 2  Sprint 3  Sprint 4    │ │
│  │            ┃        ┃        ┃        ┃           │ │
│  │ テスト     ░░       ██       ███      ████        │ │
│  │ 設計       ██       ██       ████     ████        │ │
│  │ 自動化     ░        ░░       ██       █████       │ │
│  │ AI活用     ░        ██       ████     ██████      │ │
│  │                                                    │ │
│  │ Sprint 4のテーマ: 「AI駆動の保守自動化」            │ │
│  │ 成長ポイント:                                       │ │
│  │  - AI活用: 節約時間 12h → 18h (+50%)               │ │
│  │  - 自動化: Agentic Flowタスク 15件成功              │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**タブ構成**:
- **プランニング**: AIプラン提案 + バックログ選択 + 承認
- **レトロスペクティブ**: went_well / could_improve / action_items
- **年輪**: スプリントごとの成長を帯グラフで可視化
- **フロー分析**: サイクルタイム/スループット/ボトルネック/WIP提案

---

### ⚙️ 設定 (`/settings`)

```
┌─────────────────────────────────────────────────────────┐
│  設定                                                   │
│  [接続] [通知] [ポリシー] [環境設定]                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  接続タブ:                                               │
│  - MCP Server管理（追加/削除/テスト）                    │
│  - GitHubアカウント管理（PAT設定、複数アカウント）       │
│                                                         │
│  通知タブ:                                               │
│  - カテゴリ別の通知ON/OFF                                │
│  - 閾値設定（脆弱性検出時のみ等）                        │
│  - Slack連携通知の設定                                   │
│                                                         │
│  ポリシータブ:                                           │
│  - ツール別アクセス制御（Allow/Approval/Block）          │
│  - Agentic Flowリスクレベル設定                         │
│  - 監査ログ表示                                         │
│                                                         │
│  環境設定タブ:                                           │
│  - テーマ（ダーク/ライト）                               │
│  - スプリント期間設定                                    │
│  - カバレッジ目標値                                      │
│  - Claude Code CLIパス                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 7. ルーティング構造

```
/                          → ホーム（ポートフォリオダッシュボード）
/project/:id               → プロジェクト詳細
/project/:id/maintenance   → プロジェクト > 保守タブ
/project/:id/analytics     → プロジェクト > 分析タブ
/project/:id/kanban        → プロジェクト > カンバンタブ
/project/:id/review        → プロジェクト > AIレビュータブ
/github/issues             → GitHub > Issues
/github/pulls              → GitHub > Pull Requests
/github/conflicts          → GitHub > コンフリクト
/docs/list                 → 設計書 > 一覧
/docs/freshness            → 設計書 > 鮮度マップ
/agent                     → エージェント
/sprint                    → スプリント
/settings                  → 設定
/settings/connections      → 設定 > 接続
/settings/notifications    → 設定 > 通知
/settings/policies         → 設定 > ポリシー
/settings/preferences      → 設定 > 環境設定
```

---

## 8. コンポーネントツリー

```
App
├── Header
│   ├── LogoButton                    → navigate('/')
│   ├── SearchPill                    → open CommandPalette
│   └── NotificationBell
│       └── NotificationPanel         → ドロップダウン
│           ├── NotificationItem[]
│           └── MarkAllReadButton
│
├── CommandPalette (モーダル)          → ⌘K で開閉
│   ├── SearchInput
│   ├── RecentAccess[]
│   ├── SearchResults[]
│   └── NavigationShortcuts[]
│
├── Sidebar
│   ├── ProductSwitcher
│   │   └── ProductDropdown
│   │       ├── SearchFilter
│   │       ├── CategoryGroup[]
│   │       │   └── ProductItem[]     → ヘルスアイコン、ピン留め
│   │       └── AddProductButton
│   ├── SidebarItem (プロジェクト)
│   ├── SidebarSection (開発)
│   │   ├── SidebarItem (GitHub)      → バッジ、展開/折り畳み
│   │   │   ├── SidebarSubItem (Issues)
│   │   │   ├── SidebarSubItem (Pull Requests)
│   │   │   └── SidebarSubItem (コンフリクト)
│   │   └── SidebarItem (設計書)      → 展開/折り畳み
│   │       ├── SidebarSubItem (一覧)
│   │       └── SidebarSubItem (鮮度マップ)
│   ├── SidebarSection (管理)
│   │   ├── SidebarItem (エージェント)
│   │   └── SidebarItem (スプリント)
│   └── SidebarItem (設定)
│
└── MainContent (ルーティング)
    ├── HomePage
    │   ├── HealthOverview
    │   ├── ProductTable
    │   ├── AttentionPanel
    │   └── AgentActivityPanel
    ├── ProjectView
    │   ├── ProjectTabs
    │   ├── OverviewTab
    │   ├── MaintenanceTab
    │   ├── AnalyticsTab
    │   ├── KanbanTab
    │   └── AiReviewTab
    ├── GitHubIssuesPage
    ├── GitHubPullsPage
    ├── GitHubConflictsPage
    ├── DocsListPage
    ├── DocsFreshnessPage
    ├── AgentPage
    │   ├── TaskQueue
    │   ├── ApprovalPanel
    │   ├── ExecutionLog
    │   └── TriggerSettings
    ├── SprintPage
    │   ├── PlanningTab
    │   ├── RetrospectiveTab
    │   ├── YearRingTab
    │   └── FlowAnalysisTab
    └── SettingsPage
        ├── ConnectionsTab
        ├── NotificationsTab
        ├── PoliciesTab
        └── PreferencesTab
```

---

## 9. 将来の拡張ルール

| 新機能 | 配置先 | サイドバーへの影響 |
|--------|--------|------------------|
| Phase 10 チーム | ホーム画面にチームパネル追加 | なし |
| Phase 10 ナレッジ | 設定内 or プロジェクト内タブ | なし |
| Redmine連携 | 設定 > 接続 に追加 | なし |
| カスタムMCP（将来） | 設定 > 接続 に追加 | なし |

**原則: サイドバーのトップレベル項目は4つから増やさない。新機能は既存画面のタブ/パネル/設定に格納する。**
