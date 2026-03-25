# DevNest 実装状況マッピング表

> **調査日**: 2026-03-22
> **調査ブランチ**: `swarm/worker-c1f3e329-8`
> **最新コミット**: `590fe19 feat(mobile): UX 改善9項目 + デスクトップ Shell/Worker ボタン修正`

---

## 凡例

| 記号 | 意味 |
|------|------|
| ✅ | 完全実装（テスト含む） |
| 🟡 | 部分実装（動作するが未完全） |
| ⬜ | 未実装・スタブのみ |
| 📋 | 仕様書に記載あり |
| 🚫 | 廃止済み（実装しない） |

---

## Phase 1：MVP（プロジェクト管理・設計書・Issue 管理・設定）

### インフラ・DB

| タスク | 実装状態 | 備考 |
|--------|----------|------|
| Tauri v2 初期化 | ✅ | `src-tauri/src/main.rs` |
| SQLite + sqlx + WAL モード | ✅ | `src-tauri/src/db/mod.rs` |
| マイグレーション 0001〜0010 | ✅ | `src-tauri/migrations/` 10ファイル |
| AppState（SharedWorkerManager 含む） | ✅ | `src-tauri/src/state.rs` |
| AppError 統一型 | ✅ | `src-tauri/src/error.rs` |
| all_commands! マクロ（205+ コマンド登録） | ✅ | `src-tauri/src/commands/mod.rs` |

---

### A. プロジェクト管理（`commands/project.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `project_create` | ✅ | ✅ | ✅ | git リポジトリ検証、リモートURL解析、ドキュメントスキャン |
| `project_list` | ✅ | ✅ | ✅ | repo_owner 未設定時の自動補完あり |
| `project_update` | ✅ | ✅ | ✅ | Option-of-Option パターンで部分更新対応 |
| `project_get_status` | ✅ | ✅ | ✅ | pending_push_count 等の集計クエリ |
| `project_delete` | ✅ | ✅ | ✅ | ポーリング停止機能付き |
| `project_set_last_opened_document` | ✅ | ✅ | ✅ | ドキュメント記憶機能 |

**Unit テスト数**: 7 個

---

### B. 設計書（ドキュメント）管理（`commands/document.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `document_list` | ✅ | ✅ | ✅ | プロジェクト内ドキュメント一覧 |
| `document_get` | ✅ | ✅ | ✅ | spawn_blocking でファイル読み込み |
| `document_scan` | ✅ | ✅ | ✅ | git tree 走査→DB upsert、SHA 比較、削除検出 |
| `document_save` | ✅ | ✅ | ✅ | commit＆push、イベント emit、検索インデックス自動構築 |
| `document_set_dirty` | ✅ | ✅ | ✅ | is_dirty フラグ更新 |
| `document_push_retry` | ✅ | ✅ | ✅ | push 失敗時のリトライ機構 |
| `document_linked_issues` | ✅ | ✅ | ✅ | ドキュメントに紐づく Issue 取得 |
| `document_create` | ✅ | ✅ | ✅ | 新規 Markdown ファイル作成 |
| `document_rename` | ✅ | ✅ | ✅ | ファイルリネーム＋DB 更新 |

**Unit テスト数**: 9 個
**プッシュ戦略**: `doc_save_progress` イベントで `committing → pushing → synced/push_failed` を通知

---

### C. GitHub 認証（`commands/github_auth.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `github_auth_start` | ✅ | ✅ | ✅ | OAuth ブラウザ起動、ローカルコールバックサーバー（ポート 4649） |
| `github_auth_complete` | ✅ | ✅ | ✅ | code→token 交換、Keychain 保存、`github_auth_done` emit |
| `github_auth_status` | ✅ | ✅ | ✅ | 認証状態確認 |
| `github_auth_revoke` | ✅ | ✅ | ✅ | トークン削除 |
| `github_labels_list` | ✅ | ✅ | 🟡 | GitHub API・メモリキャッシュ対応 |

---

### D. Issue・ドラフト管理（`commands/issue.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `issue_sync` | ✅ | ✅ | ✅ | GitHub Issues API→DB upsert、`issue_sync_done` emit |
| `issue_list` | ✅ | ✅ | ✅ | ローカル DB 一覧、status フィルタ対応 |
| `issue_doc_link_list` | ✅ | ✅ | ✅ | Issue 紐づくドキュメント取得 |
| `issue_doc_link_add` | ✅ | ✅ | ✅ | Issue-Document リンク作成、link_type/creator 記録 |
| `issue_doc_link_remove` | ✅ | ✅ | ✅ | リンク削除 |
| `issue_draft_create` | ✅ | ✅ | ✅ | ドラフト新規作成 |
| `issue_draft_update` | ✅ | ✅ | ✅ | パッチ型更新（title/body/labels 等） |
| `issue_draft_list` | ✅ | ✅ | ✅ | ドラフト一覧 |
| `issue_draft_cancel` | ✅ | ✅ | ✅ | ドラフト削除 |
| `issue_draft_generate` | ✅ | ✅ | ✅ | **Anthropic API SSE ストリーミング実装**（claude-sonnet-4-6） |
| `issue_create` | ✅ | ✅ | ✅ | ドラフト→GitHub Issue 作成、DB upsert |

**Unit テスト数**: 12 個
**AI Wizard**: `issue_draft_chunk` イベントでデルタを逐次 emit、`DEVNEST_TEST_MODE` 対応あり

---

### E. 設定・ユーティリティ（`commands/settings.rs`, `commands/util.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `settings_get` | ✅ | ✅ | 🟡 | app_settings テーブル読み取り |
| `settings_set` | ✅ | ✅ | 🟡 | Anthropic API key 等の保存 |
| `startup_cleanup` | ✅ | ✅ | 🟡 | 古いレコード削除・pending_submit 除去 |
| `sync_log_list` | ✅ | ✅ | 🟡 | 同期ログ一覧 |

---

### F. フロントエンド Phase 1（4 画面）

| 画面 | 仕様 📋 | 実装 | テスト | 備考 |
|------|---------|------|--------|------|
| `SetupScreen` | ✅ | ✅ | ✅ | 6 ステップウィザード（Project/GitHub/Sync/Index/Notify/Done） |
| `EditorScreen` | ✅ | ✅ | ✅ | DocumentTree + MarkdownEditor + LinkedIssuesPanel |
| `IssuesScreen` | ✅ | ✅ | ✅ | list タブ + wizard タブ（AI Wizard 5 ステップ） |
| `SettingsScreen` | ✅ | ✅ | ✅ | GitHub 認証、API key、同期設定 |

---

### G. Zustand ストア（Phase 1 相当）

| ストア | 実装 | テスト | 備考 |
|--------|------|--------|------|
| `projectStore` | ✅ | ✅ | fetchProjects/selectProject/createProject/deleteProject 等 |
| `documentStore` | ✅ | ✅ | saveDocument/scanDocuments/setDirty 等 |
| `issueStore` | ✅ | ✅ | syncIssues/generateDraft（ストリーミング）/createIssue 等 |
| `settingsStore` | ✅ | ✅ | settings_get/settings_set |
| `uiStore` | ✅ | ✅ | navigate/currentScreen/サイドバー状態管理 |

---

## Phase 2：PR 管理・GitHub 同期強化

### PR 管理（`commands/pr.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `pr_sync` | ✅ | ✅ | ✅ | GitHub PR 取得→DB upsert、`pr_sync_done` emit |
| `pr_list` | ✅ | ✅ | ✅ | ローカル DB 一覧、state フィルタ対応 |
| `pr_get_detail` | ✅ | ✅ | ✅ | PR + レビュー + コメント取得 |
| `pr_get_files` | ✅ | ✅ | ✅ | GitHub API から PR ファイル差分取得 |
| `pr_get_diff` | ✅ | ✅ | ✅ | unified diff 文字列取得 |
| `pr_add_comment` | ✅ | ✅ | ✅ | ローカル保存→非同期 GitHub 投稿、pending 状態管理 |
| `pr_review_submit` | ✅ | ✅ | ✅ | approve/changes_requested を GitHub に投稿、DB 保存 |
| `pr_merge` | ✅ | ✅ | ✅ | GitHub merge API、DB state 更新 |
| `pr_create_from_branch` | ✅ | ✅ | ✅ | GitHub PR 作成→DB 保存 |
| `pr_doc_diff_get` | ✅ | ✅ | ✅ | .md ファイルのみ unified diff 構築 |
| `git_pull` | ✅ | ✅ | ✅ | fetch + pull、コンフリクト検出→DB 登録 |

**Unit テスト数**: 14 個
**仕様との差異**: 仕様書には `branch_id: i64` があるが実装は `branch_name: String`（廃止済み仕様に準拠）

---

### PR 関連フロントエンド

| 画面 / コンポーネント | 実装 | テスト | 備考 |
|----------------------|------|--------|------|
| `PRScreen` | ✅ | ✅ | PRList / FileDiff / ReviewPanel / MergePanel |
| `prStore` | ✅ | ✅ | syncPRs/selectPR/submitReview/mergePR 等 |

---

## Phase 3：セマンティック検索・ベクトル検索（`commands/search.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `index_build` | ✅ | ✅ | ✅ | ドキュメント→チャンク化→FTS5、API 有時は埋め込みベクトルも構築 |
| `document_index_build` | ✅ | ✅ | ✅ | 単一ドキュメント再インデックス |
| `document_search_keyword` | ✅ | ✅ | ✅ | FTS5 全文検索、履歴記録 |
| `document_search_semantic` | ✅ | ✅ | ✅ | ベクトル検索→フォールバック FTS5、履歴記録 |
| `search_history_list` | ✅ | ✅ | ✅ | 検索履歴取得 |
| `index_reset` | ✅ | ✅ | ✅ | プロジェクト全インデックス削除 |
| `search_context_for_issue` | ✅ | ✅ | ✅ | Issue タイトル→設計書検索→関連チャンク 5 件 |

**Unit テスト数**: 14 個
**注意**: 埋め込みモデルは `services/embedding.rs` に実装済みだが、OpenAI API key 設定が必要

---

### 検索フロントエンド

| 画面 / コンポーネント | 実装 | テスト | 備考 |
|----------------------|------|--------|------|
| `SearchScreen` | ✅ | ✅ | SearchBar / SearchResultList / DocumentPreview |
| `searchStore` | ✅ | ✅ | searchKeyword/searchSemantic/buildIndex 等 |

---

## Phase 4：Claude Code Terminal・コンフリクト解消

### Terminal（`commands/terminal.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `terminal_session_start` | ✅ | 🟡 | 🟡 | Claude Code CLI の PTY 起動、ブランチ checkout 対応 |
| `terminal_input_send` | ✅ | 🟡 | ⬜ | PTY への入力送信（実装確認済み） |
| `terminal_resize` | ✅ | 🟡 | ⬜ | PTY リサイズ |
| `terminal_session_stop` | ✅ | 🟡 | ⬜ | セッション終了 |

**注意**: 実装の後半部分（セッション読み取りループ等）は未確認
**フロントエンド**: `TerminalScreen` コンポーネントは実装済み

---

### コンフリクト解消（`commands/conflict.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `conflict_scan` | ✅ | ✅ | 🟡 | git コンフリクトファイル→managed/unmanaged 分類、ブロックパース |
| `conflict_list` | ✅ | 🟡 | ⬜ | DB から未解消ファイル取得（後半未確認） |
| `conflict_resolve` | ✅ | 🟡 | ⬜ | 解消方法適用（実装詳細未確認） |
| `conflict_apply_all` | ✅ | 🟡 | ⬜ | 一括解消（実装詳細未確認） |

---

### Phase 4 フロントエンド

| 画面 / コンポーネント | 実装 | テスト | 備考 |
|----------------------|------|--------|------|
| `TerminalScreen` | ✅ | 🟡 | xterm.js + PTY 接続 |
| `ConflictScreen` | ✅ | 🟡 | ConflictBlockItem / ConflictFileListItem |
| `terminalStore` | ✅ | 🟡 | startSession/sendInput/stopSession |
| `conflictStore` | ✅ | 🟡 | scanConflicts/resolveConflict 等 |

---

## Phase 5：通知・ポーリング

### 通知（`commands/notifications.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `notification_list` | ✅ | ✅ | ✅ | DB 層への委譲 |
| `notification_unread_count` | ✅ | ✅ | ✅ | 未読数取得 |
| `notification_mark_read` | ✅ | ✅ | ✅ | 単一通知既読化 |
| `notification_mark_all_read` | ✅ | ✅ | ✅ | プロジェクト全通知既読化 |
| `notification_navigate` | ✅ | ✅ | ✅ | ウィンドウフォアグラウンド浮上 + 遷移先情報取得 |
| `notification_push` | ✅ | ✅ | 🟡 | 通知手動作成 |

### ポーリング（`commands/polling.rs`）

| コマンド | 仕様 📋 | 実装 | テスト | 備考 |
|---------|---------|------|--------|------|
| `polling_start` | ✅ | 🟡 | ⬜ | バックグラウンドポーリング開始 |
| `polling_stop` | ✅ | 🟡 | ⬜ | ポーリング停止 |

---

### Phase 5 フロントエンド

| 画面 / コンポーネント | 実装 | テスト | 備考 |
|----------------------|------|--------|------|
| `NotificationsScreen` | ✅ | ✅ | NotificationItem / PermissionBanner 等 |
| `notificationsStore` | ✅ | ✅ | fetchNotifications/markRead/unreadCount |
| `useRingNotification` | ✅ | 🟡 | 通知ベルアニメーション hook |

---

## Phase 6 以降：Swarm・MCP・Analytics・Agile

### Swarm（`commands/swarm.rs`, `swarm/` モジュール）

| 機能 | 実装 | 備考 |
|------|------|------|
| `spawn_worker` | ✅ | SharedWorkerManager への委譲 |
| `kill_worker` | ✅ | SharedWorkerManager への委譲 |
| `write_to_worker` | ✅ | SharedWorkerManager への委譲 |
| `resize_worker` | ✅ | SharedWorkerManager への委譲 |
| `list_workers` | ✅ | SharedWorkerManager への委譲 |
| `split_task` | 🟡 | TaskSplitter 実装済み、doc-mapping 統合済み |
| `swarm_wave_start` | 🟡 | wave_orchestrator 実装済み（詳細未確認） |
| Worker 管理ループ | 🟡 | PTY + ANSI ストリップ + sentinel 検出 実装済み |
| 承認ゲート（approval_gate） | 🟡 | approval_queue テーブル実装済み |

**フロントエンド**: `swarm/` コンポーネント群（SwarmPage / TerminalGrid / OrchestratorPanel 等）✅

---

### Analytics（`commands/analytics.rs`, `analytics/` モジュール）

| 機能 | 実装 | 備考 |
|------|------|------|
| velocity / sprint / ai_impact | 🟡 | モジュール実装済み（詳細未確認） |
| `AnalyticsScreen` | ✅ | フロントエンド実装済み |
| `analyticsStore` | ✅ | フロントエンド実装済み |

---

### Agile/Kanban（`agile/` モジュール）

| 機能 | 実装 | 備考 |
|------|------|------|
| kanban_get_board / sprint_planner 等 | 🟡 | モジュール実装済み（詳細未確認） |
| `KanbanScreen` | ✅ | フロントエンド実装済み |
| `kanbanStore` | ✅ | フロントエンド実装済み |

---

### MCP（`mcp/` モジュール, `commands/mcp.rs`）

| 機能 | 実装 | 備考 |
|------|------|------|
| mcp_add_server / mcp_list 等 | 🟡 | hub.rs / policy.rs 実装済み（詳細未確認） |
| `McpScreen` | ✅ | フロントエンド実装済み |

---

### Doc Mapping（`doc_mapping/` モジュール）

| 機能 | 実装 | 備考 |
|------|------|------|
| parser / diff_analyzer / staleness / index | 🟡 | 全ファイル実装済み（詳細未確認） |
| FreshnessMapScreen | ✅ | フロントエンド実装済み |

---

### Collaboration・Review・Policy・Browser

| 機能 | 実装 | 備考 |
|------|------|------|
| `collaboration/` | 🟡 | team.rs / knowledge.rs |
| `review/` | 🟡 | engine.rs / findings.rs / reporter.rs |
| `policy/` | 🟡 | engine.rs / rules.rs |
| `browser/` | 🟡 | BrowserPanel フロントエンド実装済み |
| `CollaborationScreen` | ✅ | フロントエンド実装済み |

---

## 廃止済み機能（実装しない）

| 項目 | 理由 |
|------|------|
| `aiEditStore` | ai_edit_branches テーブル廃止により不要 |
| `SyncDiffScreen` | PRScreen の Design Docs タブに統合済み |
| `AiEditBanner` / `AiEditBannerRight` | EditorScreen から削除済み |
| `branch_id: i64`（pr_create_from_branch の引数） | `branch_name: String` に変更済み |
| `ai_edit_branch_*` コマンド群 | v4.0 で廃止 |

---

## サービス層実装状況

| サービス | ファイル | 実装 | 備考 |
|---------|---------|------|------|
| Git 操作 | `services/git.rs` | ✅ | open/scan_docs/write_and_commit/push |
| GitHub API | `services/github.rs` | ✅ | Issues/PRs/Labels/Reviews/Comments |
| Anthropic API | `services/anthropic.rs` | ✅ | SSE ストリーミング、claude-sonnet-4-6 |
| OAuth | `services/oauth.rs` | ✅ | ローカルコールバックサーバー（ポート 4649） |
| Keychain | `services/keychain.rs` | ✅ | macOS Keychain 統合 |
| Background Poller | `services/poller.rs` | 🟡 | バックグラウンドタスク |
| 埋め込みベクトル | `services/embedding.rs` | 🟡 | OpenAI API key 要 |
| テキストチャンク | `services/chunker.rs` | ✅ | ドキュメント→チャンク分割 |

---

## 統計サマリー

### フェーズ別完成度

| フェーズ | 仕様書 | Rust バックエンド | フロントエンド | テスト | 全体完成度 |
|---------|--------|-----------------|--------------|--------|-----------|
| Phase 1（MVP） | 📋 完備 | ✅ 100% | ✅ 100% | ✅ 80% | **95%** |
| Phase 2（PR 管理） | 📋 完備 | ✅ 100% | ✅ 100% | ✅ 80% | **95%** |
| Phase 3（検索） | 📋 完備 | ✅ 100% | ✅ 100% | ✅ 80% | **95%** |
| Phase 4（Terminal/Conflict） | 📋 完備 | 🟡 70% | ✅ 90% | 🟡 40% | **70%** |
| Phase 5（通知） | 📋 完備 | ✅ 90% | ✅ 100% | 🟡 60% | **85%** |
| Phase 6〜11（Swarm 等） | 📋 一部 | 🟡 50% | ✅ 90% | ⬜ 20% | **55%** |

### コードベース統計

| カテゴリ | 数 |
|---------|-----|
| TypeScript ファイル | 244 |
| Rust ファイル | 140 |
| Rust コード行数 | 27,933 行 |
| DB マイグレーション | 10 ファイル |
| 登録済み Tauri コマンド | 205+ |
| Zustand ストア | 16 |
| E2E テストシナリオ | 20 |
| Unit テスト（Rust） | 50+ |

---

## 主な仕様変更・乖離点

| 仕様書の記載 | 実装の実態 | 状態 |
|------------|-----------|------|
| `branch_id: i64`（pr_create_from_branch） | `branch_name: String` に変更 | 🚫 廃止 |
| Anthropic `claude-sonnet` | `claude-sonnet-4-6` / `claude-sonnet-4-20250514` を使用 | ✅ 更新済み |
| Phase 3 は sqlite-vec | FTS5 + カスタムベクトル検索（コサイン類似度）を実装 | 🟡 代替実装 |
| Phase 6〜11 計画 | `devnest-phase6-10-implementation-plan.md` 等に詳細あり | 📋 仕様書が先行 |

---

## 備考

- **`DEVNEST_TEST_MODE` 環境変数**: Anthropic API をモックする統合テスト対応あり
- **Mobile コンパニオンアプリ**: `packages/mobile/` に WebSocket 接続の iOS/Android アプリあり
- **WebSocket サーバー**: `api/socket_server.rs`（Axum）でモバイルとのリアルタイム通信
- **Claude Code CLI 統合**: Swarm の Worker は `claude` コマンドを PTY 経由でサブプロセス起動

---

*このファイルは Scout ロールの Worker による自動調査結果です。*
*詳細確認が必要な箇所は 🟡 マークを参照してください。*
