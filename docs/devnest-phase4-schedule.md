# DevNest — Phase 4 実装スケジュール

**バージョン**: 1.0
**作成日**: 2026-03-09
**対象フェーズ**: Phase 4（Claude Code Terminal・Conflict 解消・PR Design Docs タブ）
**前提資料**: コマンド定義書 v4.0 / ストア設計書 v4.0 / DB スキーマ設計書 v2.0 / TerminalScreen 詳細設計書 v2.0 / PRScreen 詳細設計書 v2.0 / ConflictScreen 詳細設計書 v1.0
**前提条件**: Phase 3 完了（S-06 動作確認済み）

---

## 1. Phase 4 スコープ

### 実現するユーザーシナリオ

| シナリオ | 概要 |
|---------|------|
| S-04 | Claude Code で Issue を実装する（TerminalScreen + PTY） |
| S-05 | AI が書き換えたコードと設計書をレビューしてマージ（PRScreen Design Docs タブ） |
| S-07 | Pull したらコンフリクトが起きた（ConflictScreen） |

### 対象コマンド（8 件）

| コマンド | 概要 |
|---------|------|
| `terminal_session_start` | Claude Code CLI の PTY セッション開始 |
| `terminal_input_send` | PTY stdin への入力送信（xterm.js `onData` から呼ぶ） |
| `terminal_session_stop` | PTY セッションに SIGINT 送信・中断 |
| `terminal_output_append` | PTY 出力をリングバッファに追記（Rust 内部） |
| `conflict_list` | 未解消コンフリクトファイル一覧（ブロックパース済み）取得 |
| `conflict_resolve` | ブロック単位の解消選択を記録（ディスク書き込みは `conflict_resolve_all` で行う） |
| `conflict_resolve_all` | 全ブロック解消済みを確認して `git add` + `git commit --no-edit` 実行 |
| `pr_doc_diff_get` | PR の設計書 diff（.md のみ）取得（PRScreen Design Docs タブ） |

### 対象イベント（2 件）

| イベント | ペイロード | 用途 |
|---------|-----------|------|
| `terminal_output` | `{ session_id: number, data: string }` | PTY 出力チャンク（xterm.js へ書き込む） |
| `terminal_done` | `{ session_id: number, exit_code: number, branch_name: string \| null, has_doc_changes: boolean, changed_files: string[] }` | PTY セッション終了・PR READY バナー表示 |

### 対象 DB テーブル（2 件）

`terminal_sessions` / `conflict_files`

### 対象画面

`TerminalScreen` / `ConflictScreen` / `PRScreen`（Design Docs タブ・REQUEST CHANGES 追加）

---

## 2. タスク分解

### D — DB / マイグレーション（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| D-07 | `migrations/0004_ai_terminal_conflict.sql` 作成（`terminal_sessions` + `conflict_files` テーブル + インデックス）| Phase 3 完了 | 0.5d |

**マイグレーション内容（抜粋）**

```sql
CREATE TABLE terminal_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_number     INTEGER NULLABLE,
  status           TEXT    NOT NULL DEFAULT 'running'
                     CHECK(status IN ('running','completed','aborted')),
  branch_name      TEXT    NULLABLE,
  has_doc_changes  INTEGER NOT NULL DEFAULT 0,  -- ★ v4.0 追加（旧 branch_id 廃止）
  output_log       TEXT    NOT NULL DEFAULT '',
  started_at       TEXT    NOT NULL,
  ended_at         TEXT    NULLABLE
);

CREATE TABLE conflict_files (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id      INTEGER NULLABLE REFERENCES documents(id) ON DELETE SET NULL,
  file_path        TEXT    NOT NULL,
  is_managed       INTEGER NOT NULL DEFAULT 0,
  resolved_at      TEXT    NULLABLE,
  UNIQUE(project_id, file_path)
);
```

---

### R — Rust バックエンド（5 タスク）

#### R-I: Terminal PTY（3 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| R-I01 | `services/pty.rs` 作成（`portable-pty` クレートを使った PTY 管理・spawn・stdin/stdout ブリッジ・SIGINT 送信） | D-07 | 2.0d |
| R-I02 | `terminal_session_start` 実装（`issue_doc_link_list` で関連設計書取得 → `--context` 引数展開 → PTY spawn → `terminal_output` イベント発火ループ）/ `terminal_input_send` 実装（stdin 書き込み）/ `terminal_session_stop` 実装（SIGINT 送信・status='aborted'）| R-I01 | 1.5d |
| R-I03 | PTY 終了検知（`terminal_done` イベント発火）: `exit_code` 取得・`has_doc_changes`（changed_files の .md 判定）・`branch_name` 取得・DB 更新 | R-I02 | 1.0d |

#### R-J: Conflict 解消（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| R-J01 | `conflict_list` 実装（`conflict_files` テーブルから取得・コンフリクトマーカーパース → `ConflictBlock` 生成）/ `conflict_resolve` 実装（解消選択を DB に記録）/ `conflict_resolve_all` 実装（全ファイル `git add` + `git commit --no-edit` + `conflict_files` レコードの `resolved_at` 更新） | D-07, Phase 2 R-G01（git2-rs 基盤） | 1.5d |

#### R-K: PR Design Docs（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| R-K01 | `pr_doc_diff_get` 実装（GitHub API GET /pulls/{n}/files → .md のみフィルタ → unified diff パース → `DocFileDiff` 返却） | Phase 2 R-F03（GitHub API 基盤） | 0.5d |

---

### F — フロントエンド（9 タスク）

#### F-K: terminalStore（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-K01 | `terminal.store.ts` 実装（`TerminalState` 型・`startSession` / `sendInput` / `stopSession` / `onTerminalOutput` / `onTerminalDone`・`terminal_output` / `terminal_done` イベントリスナー追加） | R-I02, R-I03 | 1.5d |
| F-K02 | `terminalStore.startSession` 内で `issueStore.getContextDocIds()` を呼ぶ実装（Phase 1 の issueStore に `getContextDocIds` を追加）| F-K01, Phase 1 F-D02 | 0.5d |

#### F-L: TerminalScreen（3 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-L01 | `TerminalScreen.tsx` 基盤実装（xterm.js パネル・`startSession` 呼び出し・`onData` → `sendInput` ブリッジ・`terminal_output` → xterm.js 書き込み） | F-K01 | 2.0d |
| F-L02 | `TerminalHeader.tsx` 実装（`● running` / `● completed` / `● aborted` ステータス・`■ STOP` ボタン → `stopSession`）| F-L01 | 0.5d |
| F-L03 | `PRReadyBanner.tsx` 実装（`showPrReadyBanner=true` 時に表示・`CREATE PR →` → `prStore.createPrFromBranch` → `prStore.setActiveTab('design-docs' \| 'code-diff')` → `navigate('pr')`）/ `PRCreateModal.tsx`（PR タイトル・merge method 入力） | F-L01, Phase 2 F-E01 | 1.0d |

#### F-M: conflictStore（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-M01 | `conflict.store.ts` 実装（`ConflictState` 型・`loadConflicts` / `setActiveFile` / `setBlockResolution` / `resolveAllBlocks` / `saveResolutions` / `resolveAll`・`git_pull_done` イベントでコンフリクト検知時に自動 `loadConflicts`） | R-J01 | 1.5d |

#### F-N: ConflictScreen（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-N01 | `ConflictScreen.tsx` / `ConflictFileList.tsx` / `ConflictFileItem.tsx` 実装（ファイル一覧・`setActiveFile`・進捗バー `{resolved}/{total}`） | F-M01 | 1.0d |
| F-N02 | `ConflictEditor.tsx` 実装（ブロック単位の `USE MINE` / `USE THEIRS` ボタン・`USE ALL` ボタン・`SAVE & MERGE →` ボタン → `resolveAll`） | F-N01 | 1.5d |

#### F-O: PRScreen Design Docs タブ（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-O01 | `TabDesignDocs.tsx` / `DocDiffViewer.tsx` / `DocDiffHeader.tsx` / `DocFileDiff.tsx` / `RequestChangesPanel.tsx` 実装（`pr_doc_diff_get` 呼び出し・`prStore.loadDocDiff` / `requestChanges` アクション追加・Design Docs タブを enabled に変更） | R-K01, Phase 2 F-E01 | 2.0d |

---

### E — 結合・動作確認（3 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| E-08 | S-04 シナリオ通し確認（LAUNCH TERMINAL → PTY 起動 → 入力 → PR READY バナー → CREATE PR） | F-L03 | 0.5d |
| E-09 | S-05 シナリオ通し確認（Design Docs タブ → diff 確認 → APPROVE → MERGE）| F-O01 | 0.5d |
| E-10 | S-07 シナリオ通し確認（git pull → コンフリクト → ConflictScreen → USE THEIRS/MINE → SAVE & MERGE）| F-N02 | 0.5d |

---

## 3. 依存グラフ

```
Phase 3 完了
  │
  ├── D-07 ──→ R-I01 ──→ R-I02 ──→ R-I03
  │                                   │
  │              F-K01 ←──────────────┘
  │                │
  │                ├── F-K02
  │                └── F-L01 ──→ F-L02
  │                              F-L03 ──→ E-08
  │
  ├── D-07 ──→ R-J01 ──→ F-M01 ──→ F-N01 ──→ F-N02 ──→ E-10
  │
  └── R-K01 ──→ F-O01 ──→ E-09
```

---

## 4. スケジュール

| 週 | 期間 | タスク | 累計消化 |
|----|------|--------|---------|
| W1 | 1〜5日目 | D-07, R-I01 | 2.5d |
| W2 | 6〜10日目 | R-I02 | 4.0d |
| W3 | 11〜15日目 | R-I03, R-J01 | 6.5d |
| W4 | 16〜20日目 | R-K01, F-K01, F-K02 | 9.0d |
| W5 | 21〜25日目 | F-L01 | 11.0d |
| W6 | 26〜30日目 | F-L02, F-L03, F-M01 | 14.0d |
| W7 | 31〜35日目 | F-N01, F-N02 | 16.5d |
| W8 | 36〜40日目 | F-O01 | 18.5d |
| W9 | 41〜45日目 | E-08, E-09, E-10, バッファ | 20.0d |

**合計見積もり: 約 20 日（実稼働）≒ 9 週間**

---

## 5. 新規追加ファイル一覧

### Rust

```
src-tauri/src/services/pty.rs
src-tauri/src/commands/terminal.rs
src-tauri/src/commands/conflict.rs
src-tauri/src/commands/pr.rs         ← pr_doc_diff_get を追記
src-tauri/migrations/0004_ai_terminal_conflict.sql
```

### フロントエンド

```
src/stores/terminal.store.ts
src/stores/conflict.store.ts
src/screens/TerminalScreen.tsx
src/components/terminal/TerminalHeader.tsx
src/components/terminal/PRReadyBanner.tsx
src/components/terminal/PRCreateModal.tsx
src/screens/ConflictScreen.tsx
src/components/conflict/ConflictFileList.tsx
src/components/conflict/ConflictFileItem.tsx
src/components/conflict/ConflictEditor.tsx
src/components/pr/TabDesignDocs.tsx      ← 新規（Phase 2 で disabled だったタブを本実装）
src/components/pr/DocDiffViewer.tsx
src/components/pr/DocDiffHeader.tsx
src/components/pr/DocFileDiff.tsx
src/components/pr/RequestChangesPanel.tsx
```

---

## 6. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| PTY の macOS 動作確認（`portable-pty` + Tauri のプロセス権限） | R-I01 が +2d | `portable-pty` の `CommandBuilder` を使用。`tauri.conf.json` の `allowlist.shell` を確認。早期プロトタイプで動作検証 |
| xterm.js と PTY 出力のエンコーディング（ANSI エスケープシーケンス） | F-L01 が複雑化 | xterm.js は ANSI を標準サポート。`@xterm/addon-fit` で自動リサイズを実装 |
| `conflict_resolve_all` の `git commit --no-edit` が失敗するケース（ステージング漏れ等） | E-10 が詰まる | `conflict_resolve_all` の前に全 conflict_files が `resolved_at IS NOT NULL` であることをチェック。不足時は `InvalidResolution` エラー |
| `terminal_done` の `has_doc_changes` 判定（.md 以外の設計書ファイル） | S-05 の Design Docs タブが空になる | v4.0 の確定方針として `.md` 拡張子のみで判定。`changed_files` を Rust 側でフィルタ |
| REQUEST CHANGES 後の再 Terminal 遷移でセッション二重起動 | F-L01 が不安定 | `terminalStore.session !== null && session.status === 'running'` の場合は起動をブロックし警告表示 |
