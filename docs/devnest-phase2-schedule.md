# DevNest — Phase 2 実装スケジュール

**バージョン**: 1.0
**作成日**: 2026-03-09
**対象フェーズ**: Phase 2（PR 管理・GitHub 同期強化）
**前提資料**: コマンド定義書 v4.0 / ストア設計書 v4.0 / DB スキーマ設計書 v2.0 / コンポーネント設計書 v2.0 / PRScreen 詳細設計書 v2.0
**前提条件**: Phase 1 完了（S-01〜S-03 動作確認済み）

---

## 1. Phase 2 スコープ

### 実現するユーザーシナリオ

| シナリオ | 概要 |
|---------|------|
| S-09 | PR にコメントを書いてレビューを完了させる（Approve / Merge） |

> S-04（Terminal → PR 作成）・S-05（Design Docs タブ）は Phase 4 スコープ。
> Phase 2 では PR 一覧・Overview・Code Diff・Approve/Merge の基本フローを完成させる。

### 対象コマンド（8 件）

| コマンド | 概要 |
|---------|------|
| `pr_list` | PR 一覧をキャッシュから取得 |
| `pr_sync` | GitHub API から PR 一覧を取得・DB 更新 |
| `pr_get_detail` | PR 詳細（コメント・レビュー・linked Issue）取得 |
| `pr_diff_get` | PR の diff（Files changed）取得 |
| `pr_create_from_branch` | ブランチから PR を起票（`branch_name: String`） |
| `pr_merge` | PR をマージ（merge/squash/rebase） |
| `pr_comment_add` | PR にコメント追加（inline / review / issue_comment） |
| `pr_review_submit` | レビュー送信（approved / changes_requested） |
| `git_pull` | git pull 実行（コンフリクト時は ConflictScreen へ誘導） |

### 対象イベント（2 件）

| イベント | ペイロード | 用途 |
|---------|-----------|------|
| `pr_sync_done` | `{ added: number, updated: number }` | PR 同期完了 |
| `git_pull_done` | `{ status: 'success'\|'conflict', conflict_files?: [{path, block_count}] }` | git pull 完了・コンフリクト通知 |

### 対象 DB テーブル（3 件）

`pull_requests` / `pr_reviews` / `pr_comments`

### 対象画面

`PRScreen`（Overview タブ・Code Diff タブ・Design Docs タブは disabled）

> Design Docs タブは Phase 4。Phase 2 では `disabled` スタイルで表示のみ。

---

## 2. タスク分解

タスクは **T-{カテゴリ}{連番}** で識別する（Phase 1 の連番から継続）。

### カテゴリ定義

| カテゴリ | 対象レイヤー |
|---------|------------|
| **D** | DB / マイグレーション |
| **R** | Rust バックエンド（コマンド実装） |
| **F** | フロントエンド（ストア・コンポーネント） |
| **E** | 結合・E2E 動作確認 |

---

### D — DB / マイグレーション（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| D-05 | `migrations/0002_pull_requests.sql` 作成・`sqlx migrate run` 確認（`pull_requests` / `pr_reviews` / `pr_comments` + インデックス） | Phase 1 完了 | 1.0d |

**マイグレーション内容**

```sql
-- pull_requests
CREATE TABLE pull_requests (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  github_number       INTEGER NOT NULL,
  github_id           INTEGER NOT NULL UNIQUE,
  title               TEXT    NOT NULL,
  body                TEXT    NULLABLE,
  status              TEXT    NOT NULL CHECK(status IN ('open','draft','merged','closed')),
  head_branch         TEXT    NOT NULL,
  base_branch         TEXT    NOT NULL DEFAULT 'main',
  linked_issue_number INTEGER NULLABLE,
  checks_status       TEXT    NULLABLE CHECK(checks_status IN ('pending','passing','failing') OR checks_status IS NULL),
  created_by          TEXT    NOT NULL DEFAULT 'user' CHECK(created_by IN ('user','claude_code')),
  merged_at           TEXT    NULLABLE,
  github_created_at   TEXT    NOT NULL,
  github_updated_at   TEXT    NOT NULL,
  synced_at           TEXT    NOT NULL,
  UNIQUE(project_id, github_number)
);
-- pr_reviews / pr_comments は db-schema.md の 2.9 / 2.10 節を参照
```

---

### R — Rust バックエンド（6 タスク）

#### R-F: PR 管理（5 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| R-F01 | `models/pr.rs` 追加（`PullRequest`, `PrReview`, `PrComment`, `FileDiff`, `DiffHunk`, `DiffLine`, `PrDetail`, `SyncStats`, `MergeResult` 型定義） | D-05 | 1.0d |
| R-F02 | `pr_list` / `pr_sync` 実装（GitHub API `GET /repos/{owner}/{repo}/pulls` → DB upsert）+ `pr_sync_done` イベント | R-F01, Phase 1 R-C02 | 1.5d |
| R-F03 | `pr_get_detail` 実装（PR 詳細・`pr_reviews`・`pr_comments`・linked Issue）/ `pr_diff_get` 実装（GitHub API `GET /pulls/{n}/files` → unified diff パース） | R-F02 | 1.5d |
| R-F04 | `pr_comment_add` 実装（inline / review / issue_comment・`is_pending` フォールバック）/ `pr_review_submit` 実装（approved / changes_requested） | R-F03 | 1.0d |
| R-F05 | `pr_merge` 実装（merge/squash/rebase・マージ後 git pull・Issue クローズ更新・`startup_cleanup` 連携）/ `pr_create_from_branch` 実装（`branch_name: String`・PR 本文に `closes #N` を追記） | R-F03 | 1.5d |

#### R-G: git pull（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| R-G01 | `git_pull` 実装（git2-rs pull・コンフリクト検知 → `conflict_files` DB 登録 → `ConflictDetected` エラー返却）+ `git_pull_done` イベント | Phase 1 R-B01（git2-rs 基盤）| 1.5d |

> `UnresolvedConflictExists` の先行チェック（`conflict_files` テーブル参照）も含む。
> ConflictScreen の実装は Phase 4 スコープだが、エラー返却とイベント発火はここで完結させる。

---

### F — フロントエンド（8 タスク）

#### F-E: prStore（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-E01 | `pr.store.ts` 実装（`PrState` 型・`loadPrs` / `syncPrs` / `openPr` / `setActiveTab` / `loadCodeDiff` / `canMerge` / `commentsForLine` / `openPrByGithubNumber` / `createPrFromBranch` / `_optimisticAddPr`）| R-F02 | 1.5d |
| F-E02 | `pr.store.ts` に `addComment` / `submitReview` / `mergePr` 追加（`issueStore._updateIssueStatus` 連携）+ `pr_sync_done` イベントリスナー登録（`initListeners` に追記） | R-F04, R-F05 | 1.0d |

#### F-F: PRScreen 基盤・一覧（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-F01 | `PRScreen.tsx` / `PRFilterBar.tsx` / `PRList.tsx` / `PRListItem.tsx` 実装（ステータスフィルタ・一覧表示・選択時 `openPr` 呼び出し）| F-E01 | 1.5d |
| F-F02 | `PRDetail.tsx` / `PRDetailHeader.tsx` / `PRDetailTabs.tsx` 実装（タブ切替・Design Docs タブは `disabled` 表示）| F-F01 | 1.0d |

#### F-G: PRScreen 詳細タブ（4 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-G01 | `TabOverview.tsx` 実装（`PRMetaGrid` / `PRDescriptionPanel` / `PRChecklist` / `ReviewList` / `ReviewItem`） | F-F02 | 1.0d |
| F-G02 | `ReviewPanel.tsx` / `MergePanel.tsx` 実装（Approve ボタン・merge method 選択・`canMerge()` によるアクティブ制御・マージ完了後メッセージ） | F-G01, F-E02 | 1.0d |
| F-G03 | `TabCodeDiff.tsx` / `CodeDiffViewer.tsx` / `FileDiff.tsx` / `FileDiffHeader.tsx` 実装（`.md` ファイルを除外して表示）| F-F02, R-F03 | 2.0d |
| F-G04 | `DiffHunkWithComments.tsx` / `DiffLine.tsx` / `InlineComment.tsx` 実装（行クリック → コメント入力欄・`addComment` 呼び出し）+ `src/lib/diffParser.ts`（unified diff パーサー）| F-G03, F-E02 | 1.5d |

---

### E — 結合・動作確認（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| E-04 | PR 一覧・詳細・diff 表示の動作確認（`pr_sync` → 一覧 → PR 選択 → Code Diff タブ → インラインコメント） | F-G04 |0.5d |
| E-05 | S-09 シナリオ通し確認（インラインコメント → APPROVE → MERGE PR → Issue が closed に変わる） | E-04 | 0.5d |

---

## 3. 依存グラフ（実装順序）

```
Phase 1 完了
  │
  ├── D-05 ──→ R-F01 ──→ R-F02 ──→ R-F03 ──→ R-F04
  │                                 │          R-F05
  │                                 │
  │            R-G01（Phase 1 R-B01 を前提）
  │
  └── F-E01（R-F02 完了後）──→ F-E02（R-F04, R-F05 完了後）
        │
        └── F-F01 ──→ F-F02 ──→ F-G01 ──→ F-G02 ──→ E-04 ──→ E-05
                                 F-G03 ──→ F-G04 ──┘
```

---

## 4. スケジュール

**前提**: Phase 1 と同様に平日 1 人・実稼働 1.5〜2h/日

| 週 | 期間 | タスク | 累計消化 |
|----|------|--------|---------|
| W1 | 1〜5日目 | D-05, R-F01, R-F02 | 3.5d |
| W2 | 6〜10日目 | R-F03, R-G01 | 6.5d |
| W3 | 11〜15日目 | R-F04, R-F05 | 9.0d |
| W4 | 16〜20日目 | F-E01, F-E02 | 11.5d |
| W5 | 21〜25日目 | F-F01, F-F02 | 14.0d |
| W6 | 26〜30日目 | F-G01, F-G02 | 16.0d |
| W7 | 31〜35日目 | F-G03 | 18.0d |
| W8 | 36〜40日目 | F-G04 | 19.5d |
| W9 | 41〜45日目 | E-04, E-05, バッファ | 20.5d |

**合計見積もり: 約 20.5 日（実稼働）≒ 9 週間**

---

## 5. 新規追加ファイル一覧

### Rust

```
src-tauri/src/models/pr.rs                  ← PullRequest / PrReview / PrComment / FileDiff 等
src-tauri/src/commands/pr.rs                ← pr_list / pr_sync / pr_get_detail / pr_diff_get / pr_create_from_branch / pr_merge / pr_comment_add / pr_review_submit
src-tauri/src/commands/git.rs               ← git_pull（Phase 1 の git2-rs 基盤を拡張）
src-tauri/migrations/0002_pull_requests.sql ← pull_requests / pr_reviews / pr_comments
```

### フロントエンド

```
src/stores/pr.store.ts
src/screens/PRScreen.tsx
src/components/pr/PRFilterBar.tsx
src/components/pr/PRList.tsx
src/components/pr/PRListItem.tsx
src/components/pr/PRDetail.tsx
src/components/pr/PRDetailHeader.tsx
src/components/pr/PRDetailTabs.tsx
src/components/pr/TabOverview.tsx
src/components/pr/PRMetaGrid.tsx
src/components/pr/PRDescriptionPanel.tsx
src/components/pr/ReviewList.tsx
src/components/pr/ReviewItem.tsx
src/components/pr/ReviewPanel.tsx
src/components/pr/MergePanel.tsx
src/components/pr/TabCodeDiff.tsx
src/components/pr/CodeDiffViewer.tsx
src/components/pr/FileDiff.tsx
src/components/pr/FileDiffHeader.tsx
src/components/pr/DiffHunkWithComments.tsx
src/components/pr/DiffLine.tsx
src/components/pr/InlineComment.tsx
src/lib/diffParser.ts
```

---

## 6. GlobalNav 更新（Phase 2 で追加）

Phase 1 の `GlobalNav` に PR アイコンを追加する。

```typescript
// Phase 1 完了時点の GlobalNav に追記
{ id: 'pr', icon: <IconGitPullRequest />, label: 'PR', phase: 2 }
```

`navigate('pr')` 時に `prStore.loadPrs(activeProjectId)` を呼び出す。

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| GitHub API の diff 取得（大規模 PR で 1000 行超） | F-G03 が重い・パフォーマンス劣化 | `react-virtual` で仮想スクロール実装。段階的ロード（100 行ごとのページング） |
| `pr_diff_get` の unified diff パース精度（GitHub の diff 形式は標準と微差あり） | `diffParser.ts` が +2d | GitHub API の `diff` レスポンス形式を事前検証。`parse-diff` npm パッケージの採用も検討 |
| `pr_create_from_branch` で PR タイトルの自動生成精度 | Issue タイトルと乖離する | Phase 2 ではブランチ名から機械的に生成。Phase 4（Terminal 連携）で Claude が生成に変更 |
| `git_pull` 後のコンフリクト処理（ConflictScreen は Phase 4） | コンフリクト時のユーザー案内が不十分 | Phase 2 では「コンフリクトが発生しました。Phase 4 で対応予定」のエラーメッセージを表示 |
| `pr_merge` 後の `git pull` が再びコンフリクトする | `mergePr` フローが途中で止まる | マージ後の `git_pull` コンフリクトは `merge_result.pull_conflict: true` として返却し、エラーメッセージで通知 |
