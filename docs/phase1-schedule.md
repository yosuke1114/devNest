# DevNest — Phase 1 実装スケジュール

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**対象フェーズ**: Phase 1（MVP — プロジェクト管理・設計書エディタ・Issue 管理）  
**前提資料**: コマンド定義書 v3.0 / ストア設計書 v3.0 / DB スキーマ設計書 v1.0 / コンポーネント設計書 v1.0

---

## 1. Phase 1 スコープ

### 実現するユーザーシナリオ

| シナリオ | 概要 |
|---------|------|
| S-01 | 新プロジェクトの登録（Setup ウィザード） |
| S-02 | 設計書を書いて自動コミット（Editor + auto-commit） |
| S-03 | AI に Issue を下書きさせる（AI Wizard） |

### 対象コマンド（35 件）

| カテゴリ | コマンド |
|---------|---------|
| プロジェクト管理 | `project_create`, `project_list`, `project_update`, `project_get_status`, `project_delete`, `project_set_last_opened_document` |
| 設計書 | `document_list`, `document_get`, `document_save`, `document_set_dirty`, `document_scan`, `document_linked_issues`, `document_push_retry` |
| GitHub 認証 | `github_auth_start`, `github_auth_complete`, `github_auth_status`, `github_auth_revoke` |
| GitHub ラベル | `github_labels_list` |
| Issue | `issue_list`, `issue_sync`, `issue_create`, `issue_doc_link_list`, `issue_doc_link_add`, `issue_doc_link_remove` |
| Issue ドラフト | `issue_draft_create`, `issue_draft_update`, `issue_draft_generate`, `issue_draft_cancel`, `issue_draft_list` |
| 設定 | `settings_get`, `settings_set` |
| ユーティリティ | `startup_cleanup`, `sync_log_list`, `search_history_list`, `notification_permission_request` |

### 対象イベント（3 件）

| イベント | 用途 |
|---------|------|
| `doc_save_progress` | 保存・commit・push の進捗通知 |
| `github_auth_done` | OAuth コールバック完了通知 |
| `issue_sync_done` | Issue 同期完了通知 |

### 対象 DB テーブル（7 件）

`projects` / `documents` / `issues` / `issue_doc_links` / `issue_drafts` / `sync_logs` / `app_settings`

### 対象画面

`SetupScreen` / `EditorScreen` / `IssuesScreen`（AI Wizard 含む）/ `SettingsScreen`（GitHub・Sync セクション）/ `GlobalNav`

---

## 2. タスク分解

タスクは **T-{カテゴリ}{連番}** で識別する。

### カテゴリ定義

| カテゴリ | 対象レイヤー |
|---------|------------|
| **I** | インフラ・プロジェクト初期化 |
| **D** | DB / マイグレーション |
| **R** | Rust バックエンド（コマンド実装） |
| **F** | フロントエンド（ストア・コンポーネント） |
| **E** | 結合・E2E 動作確認 |

---

### I — インフラ・プロジェクト初期化（5 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| I-01 | Tauri v2 プロジェクト作成（`cargo tauri init`）、Vite + React + TypeScript 設定 | — | 0.5d | 完了 |
| I-02 | `src-tauri/Cargo.toml` 依存追加（sqlx, git2, tokio, serde, keyring, tauri-plugin-notification） | I-01 | 0.5d | 完了 |
| I-03 | `package.json` 依存追加（zustand, @tauri-apps/api, codemirror, react-markdown, lucide-react） | I-01 | 0.5d | 完了 |
| I-04 | GitHub Actions CI 設定（`cargo test` + `npm run typecheck`） | I-01 | 0.5d | 完了 |
| I-05 | 開発環境確認（`cargo tauri dev` でウィンドウ表示まで） | I-01〜I-03 | 0.5d | 完了 |

---

### D — DB / マイグレーション（4 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| D-01 | sqlx セットアップ・DB 初期化コード（`db::init()`）、WAL モード・foreign_keys 設定 | I-02 | 0.5d | 完了 |
| D-02 | `migrations/0001_initial.sql` 作成・`sqlx migrate run` 確認 | D-01 | 1.0d | 完了 |
| D-03 | Rust 側の型定義（`models/` — `Project`, `Document`, `Issue`, `IssueDraft` 等） | D-02 | 1.0d | 完了 |
| D-04 | `startup_cleanup` コマンド実装（古いレコード削除・pending_submit 除去） | D-02 | 0.5d | 完了 |

---

### R — Rust バックエンド（22 タスク）

#### R-A: プロジェクト管理（4 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| R-A01 | `project_create` / `project_list` / `project_delete` 実装 | D-03 | 1.0d | 完了 |
| R-A02 | `project_update` 実装（Option-of-Option パターン）| R-A01 | 0.5d | 完了 |
| R-A03 | `project_get_status` 実装（pending_push_count 等の集計クエリ） | R-A01, D-02 | 0.5d | 完了 |
| R-A04 | `project_set_last_opened_document` 実装 | R-A01 | 0.25d | 完了 |

#### R-B: 設計書 / git2-rs（6 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| R-B01 | `document_scan` 実装（git ツリー走査・SHA 比較・DB upsert） | R-A01 | 1.5d | 完了 |
| R-B02 | `document_list` / `document_get` 実装 | R-B01 | 0.5d | 完了 |
| R-B03 | `document_save` 実装（ファイル書込み・auto-commit・push）+ `doc_save_progress` イベント | R-B01 | 1.5d | 完了 |
| R-B04 | `document_set_dirty` 実装 | R-B02 | 0.25d | 完了 |
| R-B05 | `document_push_retry` 実装（push_failed レコードの再 push） | R-B03 | 0.5d | 完了 |
| R-B06 | `sync_log_list` 実装 | R-B03 | 0.25d | 完了 |

#### R-C: GitHub 認証（3 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| R-C01 | `github_auth_start` 実装（OAuth ブラウザ起動・ローカルコールバックサーバー起動） | R-A01 | 1.0d | 完了 |
| R-C02 | `github_auth_complete` 実装（code → token 交換・Keychain 保存）+ `github_auth_done` イベント | R-C01 | 1.0d | 完了 |
| R-C03 | `github_auth_status` / `github_auth_revoke` 実装 | R-C02 | 0.5d | 完了 |

#### R-D: Issue / ドラフト（6 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| R-D01 | `issue_sync` 実装（GitHub Issues API 取得・DB upsert）+ `issue_sync_done` イベント | R-C02 | 1.0d | 完了 |
| R-D02 | `issue_list` 実装 | R-D01 | 0.25d | 完了 |
| R-D03 | `issue_doc_link_list` / `issue_doc_link_add` / `issue_doc_link_remove` 実装 | R-D01, R-B02 | 0.5d | 完了 |
| R-D04 | `document_linked_issues` 実装 | R-D03 | 0.25d | 完了 |
| R-D05 | `issue_draft_create` / `issue_draft_update` / `issue_draft_list` 実装 | D-03 | 0.5d | 完了 |
| R-D06 | `issue_draft_generate` 実装（Anthropic API streaming・`issue_draft_chunk` / `issue_draft_done` イベント） | R-D05 | 1.5d | 完了 |

#### R-E: 設定・その他（3 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| R-E01 | `settings_get` / `settings_set` 実装 | D-02 | 0.5d | 完了 |
| R-E02 | `github_labels_list` 実装（GitHub API・メモリキャッシュ） | R-C02 | 0.5d | 完了 |
| R-E03 | `notification_permission_request` 実装（tauri-plugin-notification） | I-02 | 0.25d | 完了 |

---

### F — フロントエンド（12 タスク）

#### F-A: 基盤（3 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| F-A01 | `src/lib/ipc.ts`（型安全 invoke ラッパー）+ Tauri イベントリスナー初期化（`initListeners`） | I-03 | 0.5d | 完了 |
| F-A02 | 全ストア雛形作成（11 ストア・型定義・空実装）+ `AppShell` / `GlobalNav` 実装 | F-A01 | 1.0d | 完了 |
| F-A03 | 共有 UI コンポーネント実装（`StatusPill`, `AsyncButton`, `IndexProgressBar`, `FilePicker`） | I-03 | 1.0d | 完了 |

#### F-B: SetupScreen（2 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| F-B01 | `SetupScreen` + `SetupStep1〜3` 実装（projectStore・githubAuthStore・uiStore 接続） | F-A02, R-A01, R-C03 | 1.5d | 完了 |
| F-B02 | `SetupStep4〜6` 実装（IndexProgressBar・通知許可）| F-B01, R-E03 | 1.0d | 完了 |

#### F-C: EditorScreen（3 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| F-C01 | `DocumentTree` + `MarkdownEditor`（CodeMirror 6）実装 | F-A02, R-B02 | 2.0d | 完了 |
| F-C02 | `SaveStatusBar` + `documentStore` 全アクション接続（save / dirty / syncLogs） | F-C01, R-B03〜R-B06 | 1.5d | 完了 |
| F-C03 | `LinkedIssuesPanel` + `UnsavedWarningModal`（showModal Promise 対応） | F-C02, R-D04 | 1.0d | 完了 |

#### F-D: IssuesScreen + AIWizard（4 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| F-D01 | `IssueList` / `IssueListItem` / `IssueFilterBar` 実装 | F-A02, R-D02 | 1.0d | 完了 |
| F-D02 | `IssueDetail` / `DocLinkPanel` 実装（issueStore.setActiveIssue・loadDocLinks） | F-D01, R-D03 | 1.0d | 完了 |
| F-D03 | `AIWizard` Step 1〜2 実装（wizardInputText → searchContext） | F-D01, R-D05 | 1.0d | 完了 |
| F-D04 | `AIWizard` Step 3〜5 実装（streaming → submit → LAUNCH TERMINAL ボタン）| F-D03, R-D06 | 1.5d | 完了 |

---

### E — 結合・動作確認（3 タスク）

| ID | タスク | 依存 | 見積 | 状態 |
|----|--------|------|------|-----|
| E-01 | S-01 シナリオ通し確認（Setup → Editor 起動まで） | F-B02, R-A04 | 0.5d | 完了 |
| E-02 | S-02 シナリオ通し確認（編集 → auto-commit → push → StatusBar 更新） | F-C02, R-B03 | 0.5d | 完了 |
| E-03 | S-03 シナリオ通し確認（Wizard → Issue 作成 → Doc リンク） | F-D04, R-D06 | 0.5d | 完了 |

---

## 3. 依存グラフ（実装順序）

```
I-01
  ├── I-02 ──→ D-01 ──→ D-02 ──→ D-03 ──→ R-A01 ──→ R-A02
  │                              │          │          R-A03
  │                              │          │          R-A04
  │                              │          ├──→ R-B01 ──→ R-B02 ──→ R-B03 ──→ R-B05
  │                              │          │                        R-B04     R-B06
  │                              │          ├──→ R-C01 ──→ R-C02 ──→ R-C03
  │                              │          │              │          R-E02
  │                              │          └──→ R-D01 ←──┘
  │                              │                │ ──→ R-D02
  │                              │                └──→ R-D03 ──→ R-D04
  │                              ├──→ R-D05 ──→ R-D06
  │                              ├──→ R-E01
  │                              └──→ D-04
  ├── I-03 ──→ F-A01 ──→ F-A02 ──→ F-A03
  │                        │  ──→ F-B01 ──→ F-B02
  │                        │  ──→ F-C01 ──→ F-C02 ──→ F-C03
  │                        └──→ F-D01 ──→ F-D02
  │                             F-D03 ──→ F-D04
  ├── I-04
  └── I-05

E-01 ← F-B02 + R-A04
E-02 ← F-C02 + R-B03
E-03 ← F-D04 + R-D06
```

---

## 4. スケジュール

**前提**: 平日 1 人・実稼働 1.5〜2h/日（副業想定）  
**1 日 = 実稼働時間として換算**

| 週 | 期間 | タスク | 累計消化 |
|----|------|--------|---------|
| W1 | 1〜5日目 | I-01〜I-05, D-01〜D-02 | 4.5d |
| W2 | 6〜10日目 | D-03〜D-04, R-A01〜R-A04 | 7.5d |
| W3 | 11〜15日目 | R-B01〜R-B04, F-A01〜F-A02 | 13.0d |
| W4 | 16〜20日目 | R-B05〜R-B06, R-C01〜R-C02, F-A03 | 17.0d |
| W5 | 21〜25日目 | R-C03, R-D01〜R-D02, R-E01〜R-E03, F-B01 | 21.0d |
| W6 | 26〜30日目 | R-D03〜R-D06, F-B02 | 25.5d |
| W7 | 31〜35日目 | F-C01〜F-C02 | 29.0d |
| W8 | 36〜40日目 | F-C03, F-D01〜F-D02 | 32.0d |
| W9 | 41〜45日目 | F-D03〜F-D04 | 34.5d |
| W10 | 46〜50日目 | E-01〜E-03, バッファ | 36.0d |

**合計見積もり: 約 36 日（実稼働）≒ 10 週間**

---

## 5. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| git2-rs の操作が想定より複雑（コンフリクト処理・SSH 認証等） | R-B01〜R-B03 が +2〜3d | Phase 1 では HTTPS のみサポート・SSH は Phase 2 以降に先送り |
| Anthropic API のストリーミング実装（SSE → Tauri イベント変換） | R-D06 が +1〜2d | `eventsource_stream` crate の採用・早期プロトタイプ優先 |
| CodeMirror 6 の Markdown ライブプレビュー同期 | F-C01 が +1d | `react-markdown` での簡易プレビューで MVP とし、同期スクロールは Phase 2 |
| OAuth コールバックのローカルサーバー実装 | R-C01 が +1d | `tiny_http` で固定ポート（4649）に立ち上げる方式を採用 |
| Tauri の OS 通知 API が環境によって動作差異 | E-01 が詰まる | Phase 1 では permission_request のみ実装し OS 通知発火は Phase 5 に先送り |
