---
title: DevNest ドキュメントインベントリ
doc_type: reference
version: "1.0"
created: "2026-03-22"
last_updated: "2026-03-22"
status: current
---

# DevNest ドキュメントインベントリ

プロジェクト内の全ドキュメントを調査・整理したリファレンス。

---

## 1. ルートディレクトリ

| ファイルパス | 種類 | 更新日 | 内容概要 |
|------------|------|--------|---------|
| `CLAUDE.md` | 設計・AI指示書 | Mar 21 | Tauri v2 初期化ガイド・設計方針・実装ルール。AI向け作業指示書として機能 |

---

## 2. 基盤設計書（docs/）

| ファイル | 種類 | バージョン | 更新日 | 内容概要 |
|---------|------|-----------|--------|---------|
| `user-scenarios.md` | ユーザーシナリオ | v1.0 | Mar 8 | S-01〜S-25。ペルソナ「田中陽介」（個人開発者） |
| `rust-modules.md` | Rust構成設計 | v2.0 | Mar 9 | src-tauri/src/ 全ファイルの責務定義。ai_edit.rs 廃止をマーク |
| `db-schema.md` | DB設計 | v2.0 | Mar 15 | SQLite 17テーブル全定義（うち2テーブル廃止済み） |
| `store-design-v4.md` | 状態管理設計 | v4.0 | Mar 8 | Zustand ストア設計。aiEditStore 廃止・prStore 拡張 |
| `error-handling.md` | エラー設計 | v1.0 | Mar 8 | AppError 単一型・11エラーコード定義 |
| `github-api.md` | GitHub API設計 | v1.0 | Mar 8 | OAuth App 認証フロー・トークン管理・Phase 1 エンドポイント |
| `doc-mapping-design.md` | マッピング設計 | - | Mar 12 | ドキュメント↔ソースマッピング・Frontmatterメタデータ構造 |

---

## 3. コマンド定義（docx）

| ファイル | 種類 | 更新日 | 内容概要 |
|---------|------|--------|---------|
| `commands-v4.docx` | コマンド定義 | Mar 8 | Rust/Tauri コマンドハンドラ全定義（v4）。入出力型・エラー処理 |
| `devnest-codeviewer-requirements.docx` | 要件定義 | Mar 9 | CodeViewer 機能。ドキュメント内コード引用・可視化・相互参照 |
| `devnest-user-journey.docx` | UX設計 | Mar 9 | ユーザージャーニー図 |

---

## 4. 画面仕様書（detail-*.md）

| ファイル | 対象画面 | バージョン | Phase | 更新日 |
|---------|---------|-----------|-------|--------|
| `detail-setup.md` | SetupScreen | v1.0 | 1 | Mar 8 |
| `detail-editor.md` | EditorScreen | v2.0 | 1 | Mar 15 |
| `detail-issues.md` | IssuesScreen + AI Wizard | v1.0 | 1 | Mar 15 |
| `detail-settings.md` | SettingsScreen | v1.0 | 1 | Mar 8 |
| `detail-pr.md` | PRScreen | v2.0 | 2/4 | Mar 15 |
| `detail-terminal.md` | TerminalScreen | v1.0 | 4 | Mar 8 |
| `detail-conflict.md` | ConflictScreen | v1.0 | 4 | Mar 15 |
| `detail-search.md` | SearchScreen | v1.0 | 3 | Mar 8 |
| `detail-notifications.md` | NotificationsScreen | v1.0 | 5 | Mar 8 |

---

## 5. UIコンポーネント設計

| ファイル | 種類 | バージョン | 更新日 | 備考 |
|---------|------|-----------|--------|------|
| `08-ui-component-design.md` | UI設計（最新） | v1.0 | Mar 14 | GlobalNav・全コンポーネント設計。component-design.md を置き換え |
| `component-design.md` | UI設計（廃止） | v2.0 | Mar 15 | **⚠️ deprecated**。08-ui-component-design.md に置き換え済み |

---

## 6. Phase スケジュール・実装計画

| ファイル | 対象Phase | 更新日 | 内容概要 |
|---------|----------|--------|---------|
| `phase1-schedule.md` | Phase 1（MVP） | Mar 22 | 詳細タスク一覧 T-I01〜E-02。35コマンド・7テーブル |
| `devnest-phase2-schedule.md` | Phase 2（PR管理） | Mar 22 | 8コマンド・3テーブル。PR一覧・diff・approve/merge |
| `devnest-phase3-schedule.md` | Phase 3（ベクトル検索） | Mar 22 | sqlite-vec 統合・document_chunks テーブル |
| `devnest-phase4-schedule.md` | Phase 4（Terminal/Conflict） | Mar 22 | Claude Code Terminal・terminal_sessions/conflict_files テーブル |
| `devnest-phase5-schedule.md` | Phase 5（通知） | Mar 22 | notifications・search_history テーブル |
| `devnest-phase6-10-implementation-plan.md` | Phase 6〜10 | Mar 13 | AI Dev Partner・Agile Engine・Analytics・Integration・Collaboration |

---

## 7. Swarm Orchestrator（Phase 11〜14）

| ファイル | 対象Phase | バージョン | ステータス | 更新日 | 内容概要 |
|---------|----------|-----------|----------|--------|---------|
| `devnest-phase11-design.md` | Phase 11 | v0.3 | 実装完了 | Mar 22 | DevNest Swarm MVP。複数AIエージェント並列実行・統合管理 |
| `devnest-phase11-step-a-impl.md` | Phase 11 | v0.3 | 実装完了 | Mar 22 | Worker管理・UIレイアウト・イベントスキーマ詳細 |
| `devnest-phase12-design.md` | Phase 12 | v0.1 | 要件定義完了 | Mar 21 | Advanced Swarm。動的タスク分割・依存グラフ・AI自動調整 |
| `devnest-phase13-design.md` | Phase 13 | v0.2 | 要件定義完了 | Mar 21 | Advanced Orchestration。ロールベース Worker・Tool Guard・Watchdog |
| `devnest-phase13-steps-impl.md` | Phase 13 | v0.1 | 実装計画 | Mar 21 | Phase 13 実装8ステップ詳細 |
| `devnest-phase13-test-plan.md` | Phase 13 | v0.1 | テスト計画 | Mar 21 | ユニット・統合・E2E テスト計画 |
| `12-swarm-completion-guide.md` | Phase 11〜12 | - | - | Mar 21 | Worker 完了検出・統合ロジック・UI表現 |
| `13-swarm-completion-detection.md` | Phase 12〜13 | - | - | Mar 21 | 並列実行・依存グラフ・中断再開時の完了検出 |
| `14-wave-orchestrator-guide.md` | Phase 14 | - | - | Mar 21 | Wave Orchestrator。テスト・レビュー・自動マージの波状実行 |

---

## 8. cmux（タイル型Terminal）

| ファイル | 更新日 | 内容概要 |
|---------|--------|---------|
| `09-cmux-inspired-features.md` | Mar 14 | cmux インスパイア機能。タイル型 Terminal・グリッド分割・キーバインディング |
| `10-implementation-addendum-cmux.md` | Mar 14 | cmux 実装補遺。KeyBindingRegistry・GridLayout・Pane 管理 |
| `11-test-addendum-cmux.md` | Mar 14 | cmux テスト補遺 |

---

## 9. ロードマップ・レビュー・戦略

| ファイル | 種類 | 更新日 | 内容概要 |
|---------|------|--------|---------|
| `devnest-v2-roadmap.md` | ロードマップ | Mar 13 | v2 次世代ビジョン。Phase 6〜10（AI Chat・アジャイルエンジン・ダッシュボード等） |
| `devnest-e2e-scenario-coverage.md` | テスト計画 | Mar 13 | E2E シナリオ網羅表。ペルソナ4類型・S-01〜S-25 全シナリオ |
| `devnest-phase6-10-test-plan.md` | テスト計画 | Mar 13 | Phase 6〜10 統合テスト計画 |
| `devnest-feature-consolidation-review.md` | レビュー | Mar 14 | 機能統合・再編提案。全 Phase 俯瞰・重複機能の指摘 |
| `devnest-maintenance-strategy.md` | 戦略書 | Mar 12 | 保守戦略（コード品質・技術負債・ドキュメント同期・ツール連携 4軸） |
| `devnest-implementation-guide.md` | 実装ガイド | Mar 12 | Phase 1〜6 実装指示書。ドキュメントマッピング基盤・Agentic Flow |
| `devnest-multiproduct-agentic.md` | 設計書 | Mar 13 | マルチプロダクト管理 & Agentic Flow。プロダクトレジストリ・.devnest.yaml |

---

## 10. モバイル・外部

| ファイル | 種類 | 更新日 | 内容概要 |
|---------|------|--------|---------|
| `devnest-mobile-claude-code-instructions.md` | 指示書 | Mar 21 | DevNest Mobile Swarm Controller。Axum WebSocket・PTY・PWA |
| `packages/mobile/README.md` | README | Mar 22 | React + Vite PWA プロジェクト説明 |

---

## 11. 重複・類似ドキュメントの整理

### 11.1 置き換え関係

| 旧版（廃止） | 新版（現役） | 状態 |
|-----------|-----------|------|
| `component-design.md` (v2.0) | `08-ui-component-design.md` | component-design.md に deprecated マーカーあり。削除可能 |

### 11.2 同一バージョン体系内の進化

| 系統 | 旧版 | 現行版 |
|-----|------|-------|
| UI設計 | component-design v1.0→v2.0 | 08-ui-component-design (最新) |
| Rust構成 | rust-modules v1.0 | rust-modules v2.0 |
| DB設計 | db-schema v1.0 | db-schema v2.0 |
| 状態管理 | store-design v1〜v3 | store-design-v4 |
| コマンド | commands-v1〜v3 (未掲載) | commands-v4.docx |

### 11.3 内容重複の指摘（feature-consolidation-review より）

- **Claude Code 連携**: detail-terminal / devnest-mobile / devnest-phase4-schedule に分散
- **GitHub API 操作**: github-api / detail-pr / devnest-phase2-schedule に分散
- **廃止事項（ai_edit 系）**: CLAUDE.md / rust-modules / db-schema / store-design-v4 / detail-editor / component-design に重複記載

---

## 12. 廃止済み仕様の記載状況

全ファイルに以下の廃止情報が重複記載されている（統合・参照化を推奨）：

| 廃止項目 | 記載ファイル数 |
|---------|-------------|
| `ai_edit_branches` テーブル廃止 | 5ファイル |
| `aiEditStore` 廃止 | 4ファイル |
| `AiEditBanner` / `AiEditBannerRight` 削除 | 3ファイル |
| `SyncDiffScreen` 廃止 | 3ファイル |
| `branch_id → branch_name` 変更 | 3ファイル |

---

## 13. ドキュメント統計

| 項目 | 数 |
|------|-----|
| 合計ファイル数 | 50 |
| Markdown (.md) | 45 |
| Word (.docx) | 3 |
| その他 | 2 |
| 合計推定サイズ | ~1 MB |
| バージョン管理済みファイル | 11 |
| deprecated ファイル | 1 |
| Phase 別ドキュメント | 14（Phase 1〜14） |
| 画面仕様書（detail-*） | 9 |

---

## 14. 参照優先順位ガイド

実装タスクに応じて読むべきファイルの優先順位：

```
【全体把握】
  1. CLAUDE.md
  2. docs/user-scenarios.md
  3. docs/phase1-schedule.md（Phase 1 作業時）

【Rust バックエンド】
  1. docs/rust-modules.md
  2. docs/db-schema.md
  3. docs/commands-v4.docx（pandoc で読む）
  4. docs/error-handling.md
  5. docs/github-api.md

【フロントエンド】
  1. docs/08-ui-component-design.md（component-design.md は参照しない）
  2. docs/store-design-v4.md
  3. docs/detail-{対象画面}.md

【Swarm 機能】
  1. docs/devnest-phase11-design.md
  2. docs/devnest-phase11-step-a-impl.md
  3. docs/12-swarm-completion-guide.md
```
