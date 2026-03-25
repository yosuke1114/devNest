# DevNest プロジェクト構造調査レポート

> Scout Worker 調査結果 — 2026-03-25

## 技術スタック

| 層 | 技術 |
|----|------|
| フロントエンド | React 19 + TypeScript + Zustand + Tailwind CSS |
| デスクトップ | Tauri v2（Rust） |
| エディタ | CodeMirror 6 |
| ターミナル | xterm.js |
| DB | SQLite（sqlx 0.8） |
| Git | git2-rs |
| AI | Anthropic API（claude-sonnet） + Claude Code CLI |
| GitHub | REST/GraphQL API + OAuth App |
| テスト | Vitest + Playwright |
| モバイル | React Native (packages/mobile/) |

## ディレクトリ構造

```
devNest/
├── src/                          # フロントエンド (React + TypeScript)
│   ├── components/               # UI コンポーネント (150+ ファイル, 13カテゴリ)
│   │   ├── editor/               # MarkdownEditor, MarkdownPreview, CodeViewer など
│   │   ├── issues/               # AIWizard, IssueDetail, IssueList
│   │   ├── pr/                   # FileDiff, MergePanel, ReviewPanel
│   │   ├── conflict/             # ConflictBlockItem など
│   │   ├── swarm/                # マルチエージェント UI
│   │   └── ui/                   # Radix UI ベース UI プリミティブ
│   ├── screens/                  # 21画面（EditorScreen, IssuesScreen など）
│   ├── stores/                   # Zustand ストア 18個
│   ├── hooks/                    # カスタム React Hook
│   ├── lib/                      # ユーティリティ
│   └── types/                    # TypeScript 型定義
├── src-tauri/                    # Rust バックエンド
│   └── src/
│       ├── commands/             # Tauri コマンドハンドラ 26個
│       ├── db/                   # データベース層 13ファイル
│       ├── models/               # データモデル
│       ├── services/             # ビジネスロジック（git, github, anthropic 等）
│       ├── doc_mapping/          # Markdown frontmatter パース・インデックス
│       ├── swarm/                # AI マルチエージェント機構 25ファイル
│       ├── agile/                # Sprint / Kanban 管理
│       ├── api/                  # WebSocket サーバー
│       ├── mobile/               # モバイル WS ブリッジ
│       ├── core/                 # Git 分析・GitHub/Claude ゲートウェイ
│       ├── mcp/                  # Model Context Protocol 実装
│       └── maintenance/          # テクニカルデット分析
├── packages/mobile/              # React Native モバイルアプリ
├── docs/                         # 設計書 178 ファイル
├── e2e/                          # Playwright E2E テスト
└── CLAUDE.md                     # プロジェクト指示書
```

## Markdown 処理関連ライブラリ

### フロントエンド

| ライブラリ | バージョン | 用途 | 使用箇所 |
|-----------|-----------|------|---------|
| `react-markdown` | ^10.1.0 | Markdown → React コンポーネント変換 | `src/components/editor/MarkdownPreview.tsx` |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown（テーブル・チェックボックス等） | `src/components/editor/MarkdownPreview.tsx` |
| `@codemirror/lang-markdown` | ^6.5.0 | Markdown シンタックスハイライト（エディタ） | `src/components/editor/MarkdownEditor.tsx` |

**未使用ライブラリ:** `unified`, `marked`, `rehype-*`（現状は react-markdown 経由で remark を間接利用）

### バックエンド（Rust）

| クレート | 用途 | 使用箇所 |
|---------|------|---------|
| `serde_yaml` (v0.9) | YAML frontmatter パース | `src-tauri/src/doc_mapping/parser.rs` |

Rust 側では Markdown 本文のパースは行わず、`---` ブロックの YAML frontmatter 抽出のみ。

## Markdown 処理フロー

```
Markdown ファイル (.md)
    ↓
[Frontend] EditorScreen.tsx
    ├─→ MarkdownEditor.tsx
    │   └─ CodeMirror 6 + @codemirror/lang-markdown
    │       シンタックスハイライト付きリアルタイム編集
    ├─→ MarkdownPreview.tsx
    │   └─ react-markdown + remark-gfm
    │       GFM 対応 HTML レンダリング
    └─→ 保存操作 → Tauri IPC
            ↓
[Backend] Rust (Tauri)
    ├─ document_save コマンド
    │   ファイル保存 → Git commit → GitHub push
    └─ doc_mapping_scan コマンド
        └─ doc_mapping/parser.rs
            serde_yaml で frontmatter パース
            → DocIndex 更新・SQLite DB 保存
```

## 主要ファイルの依存関係（Markdown 処理）

```
MarkdownPreview.tsx
  └── react-markdown (^10.1.0)
      └── remark-gfm (^4.0.1)

MarkdownEditor.tsx
  └── codemirror (^6.0.2)
      ├── @codemirror/state (^6.5.4)
      ├── @codemirror/view (^6.39.16)
      └── @codemirror/lang-markdown (^6.5.0)

doc_mapping/parser.rs
  └── serde_yaml (0.9)
      └── serde (1.x)

doc_mapping/types.rs
  ├── DocFrontmatter: ドキュメントメタデータ構造体
  ├── DocType: screen_design | api_definition | architecture | ...
  ├── DocStatus: current | outdated | draft | archived
  └── DocMapping: ソースコード↔ドキュメント マッピング定義
```

## 現在の実装状況

### 完了済み機能
- Tauri v2 プロジェクト基盤
- SQLite DB + マイグレーション
- Markdown エディタ（CodeMirror 6）+ プレビュー（react-markdown）
- Git 操作（git2-rs）
- GitHub API 連携（OAuth, REST/GraphQL）
- Issue 管理（AI Wizard 含む）
- PR 管理・Diff 表示
- ターミナルエミュレータ（xterm.js + PTY）
- AI マルチエージェント機構（swarm/）
- モバイル PWA 対応（packages/mobile/）
- Kanban / Sprint 管理（agile/）
- セマンティック検索基盤（services/embedding.rs）
- doc_mapping（Markdown frontmatter インデックス化）
- MCP（Model Context Protocol）実装

### 実装フェーズ
```
Phase 1（完了）: プロジェクト管理・設計書エディタ・Issue 管理
Phase 2（完了）: PR 管理・GitHub 同期強化
Phase 3（完了）: セマンティック検索・ベクトル検索
Phase 4（完了）: Claude Code Terminal・PR Design Docs タブ
Phase 5（進行中）: 通知・ポーリング・高度なマルチエージェント
```

## 注目すべき特徴的実装

1. **Wave Orchestrator** (`swarm/wave_orchestrator.rs`) — AI タスクを波状に並列実行
2. **doc_mapping** — Markdown 設計書の YAML frontmatter を自動インデックス化し、ソースコードとの対応を管理
3. **MCP** (`mcp/`) — Model Context Protocol によりツール実行を外部 AI に提供
4. **mobile/** — WebSocket ブリッジでモバイルアプリとデスクトップバックエンドを接続
5. **agile/** — Sprint 計画・Kanban ボード・ベロシティ分析の内蔵

## Markdown 処理で検討可能な改善点

- `rehype-highlight` または `rehype-prism` によるコードブロックのシンタックスハイライト追加
- `remark-toc` による目次自動生成
- `remark-math` + `rehype-katex` による数式対応
- `unified` エコシステムへの統一（現状 react-markdown が内部で unified を使用しているため移行コストは低い）
