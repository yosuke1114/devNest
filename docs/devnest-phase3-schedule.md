# DevNest — Phase 3 実装スケジュール

**バージョン**: 1.0
**作成日**: 2026-03-09
**対象フェーズ**: Phase 3（セマンティック検索・インデックス・AI Issue Wizard 強化）
**前提資料**: コマンド定義書 v4.0 / ストア設計書 v4.0 / DB スキーマ設計書 v2.0 / コンポーネント設計書 v2.0 / SearchScreen 詳細設計書 v1.0 / IssuesScreen 詳細設計書 v1.0
**前提条件**: Phase 2 完了（S-09 動作確認済み）

---

## 1. Phase 3 スコープ

### 実現するユーザーシナリオ

| シナリオ | 概要 |
|---------|------|
| S-03（強化） | AI Issue Wizard の Step 2 でセマンティック検索が実際に動く（Phase 1 はスタブ）|
| S-06 | 設計書からキーワード・セマンティックで情報を探す（SearchScreen） |

> Phase 1 の S-03 では `search_context_for_issue` をスタブ（全件返却）で実装していた前提。
> Phase 3 でインデックスを本実装し、Wizard Step 2 の精度が向上する。

### 対象コマンド（4 件）

| コマンド | 概要 |
|---------|------|
| `index_build` | 設計書を chunk 分割 → Anthropic API で embedding 生成 → sqlite-vec に格納 |
| `index_reset` | インデックスをリセットして全件再構築 |
| `search_documents` | keyword / semantic / both の 3 モード検索 |
| `search_context_for_issue` | Issue Wizard Step 2 用のコンテキスト候補取得（本実装） |

> ~~`ai_edit_branch_*`~~ コマンド群は v4.0 で廃止済み。実装しない。

### 対象イベント（4 件）

| イベント | ペイロード | 用途 |
|---------|-----------|------|
| `index_progress` | `{ done: number, total: number, current_path?: string }` | インデックス構築進捗 |
| `index_done` | `{ project_id: number, indexed: number }` | 構築完了 |
| `issue_draft_chunk` | `{ draft_id: number, delta: string }` | AI Issue 生成ストリーミング |
| `issue_draft_done` | `{ draft_id: number }` | AI Issue 生成完了 |

> `issue_draft_chunk` / `issue_draft_done` は Phase 1 で Rust コマンドのみ実装済み想定。Phase 3 でフロント側リスナーを追加。

### 対象 DB テーブル（1 件）

`document_chunks`（+ `chunk_embeddings` virtual table for sqlite-vec）

### 対象画面

`SearchScreen` / `IssuesScreen`（AI Wizard Step 2 を本実装）/ `SetupScreen`（Index タブを本実装）/ `SettingsScreen`（インデックスリセット）

---

## 2. タスク分解

### D — DB / マイグレーション（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| D-06 | `migrations/0003_document_chunks.sql` 作成（`document_chunks` テーブル + sqlite-vec の `chunk_embeddings` virtual table + インデックス） | Phase 2 完了 | 1.0d |

**マイグレーション内容（抜粋）**

```sql
CREATE TABLE document_chunks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chunk_index      INTEGER NOT NULL,
  content          TEXT    NOT NULL,
  start_line       INTEGER NOT NULL,
  end_line         INTEGER NOT NULL,
  embedding_status TEXT    NOT NULL DEFAULT 'pending'
                     CHECK(embedding_status IN ('pending','indexed','stale','error')),
  UNIQUE(document_id, chunk_index)
);

-- sqlite-vec 仮想テーブル（embedding 検索用）
CREATE VIRTUAL TABLE chunk_embeddings USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[1536]  -- text-embedding-3-small の次元数
);
```

---

### R — Rust バックエンド（3 タスク）

#### R-H: インデックス・検索（3 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| R-H01 | `services/embedding.rs` 作成（Anthropic Embeddings API `text-embedding-3-small` 呼び出し・チャンク分割ロジック・レート制限対応） | D-06 | 2.0d |
| R-H02 | `index_build` 実装（`embedding_status = 'pending' \| 'stale'` の chunk を対象・`index_progress` / `index_done` イベント発火）/ `index_reset` 実装（全 chunk DELETE → `document_scan` 相当の再スキャン → `index_build`） | R-H01 | 1.5d |
| R-H03 | `search_documents` 実装（keyword: SQLite FTS5 / semantic: sqlite-vec ANN 検索 / both: スコア統合）/ `search_context_for_issue` 実装（semantic のみ・上位 5 件） | R-H02 | 1.5d |

---

### F — フロントエンド（7 タスク）

#### F-H: searchStore（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-H01 | `search.store.ts` 実装（`SearchState` 型・`search` / `setQuery` debounce / `setSearchType` / `setActiveResult` / `loadHistory` / `openInEditor` / `reset`） | R-H03 | 1.0d |

#### F-I: SearchScreen（3 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-I01 | `SearchScreen.tsx` / `SearchBar.tsx` / `SearchModeToggle.tsx` 実装（query 入力・keyword / semantic / both 切替・300ms debounce） | F-H01 | 1.0d |
| F-I02 | `SearchResultList.tsx` / `SearchResultItem.tsx` 実装（スコア表示・クリックで右ペイン表示） | F-I01 | 1.0d |
| F-I03 | `SearchResultDetail.tsx` 実装（マッチ行ハイライト・コンテキスト行表示・`OPEN IN EDITOR →` ボタン → `searchStore.openInEditor`）/ `SearchHistory.tsx`（履歴一覧・クリックで再検索） | F-I02 | 1.0d |

#### F-J: SetupScreen Index タブ・AI Wizard 強化（3 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-J01 | `SetupScreen` の Index タブを本実装（`index_build` 呼び出し → `IndexProgressBar` で進捗表示 → 完了後に `index_done` で完了表示）| R-H02 | 1.0d |
| F-J02 | AI Wizard Step 2（`IssuesScreen`）を本実装（`search_context_for_issue` の結果をスコア付きで表示・Phase 1 のスタブを置換）/ `issue_draft_chunk` / `issue_draft_done` イベントリスナーを `initListeners` に追加 | R-H03, Phase 1 R-D06 | 1.0d |
| F-J03 | `SettingsScreen` にインデックス管理セクション追加（`index_build` ボタン・`index_reset` ボタン・インデックス済み件数表示） | R-H02 | 0.5d |

---

### E — 結合・動作確認（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| E-06 | S-06 シナリオ通し確認（検索 → 結果クリック → OPEN IN EDITOR）| F-I03 | 0.5d |
| E-07 | S-03 強化確認（Wizard Step 2 でセマンティック候補が表示される） | F-J02 | 0.5d |

---

## 3. 依存グラフ

```
Phase 2 完了
  │
  ├── D-06 ──→ R-H01 ──→ R-H02 ──→ R-H03
  │                                   │
  │               F-H01 ←─────────────┘
  │                 │
  │                 └── F-I01 ──→ F-I02 ──→ F-I03 ──→ E-06
  │
  ├── R-H02 ──→ F-J01
  ├── R-H03 ──→ F-J02 ──→ E-07
  └── R-H02 ──→ F-J03
```

---

## 4. スケジュール

| 週 | 期間 | タスク | 累計消化 |
|----|------|--------|---------|
| W1 | 1〜5日目 | D-06, R-H01 | 3.0d |
| W2 | 6〜10日目 | R-H02 | 4.5d |
| W3 | 11〜15日目 | R-H03, F-H01 | 7.0d |
| W4 | 16〜20日目 | F-I01, F-I02, F-I03 | 10.0d |
| W5 | 21〜25日目 | F-J01, F-J02, F-J03 | 12.5d |
| W6 | 26〜30日目 | E-06, E-07, バッファ | 13.5d |

**合計見積もり: 約 13.5 日（実稼働）≒ 6 週間**

---

## 5. 新規追加ファイル一覧

### Rust

```
src-tauri/src/services/embedding.rs         ← Anthropic Embeddings API ラッパー・チャンク分割
src-tauri/src/commands/search.rs            ← index_build / index_reset / search_documents / search_context_for_issue
src-tauri/migrations/0003_document_chunks.sql
```

### フロントエンド

```
src/stores/search.store.ts
src/screens/SearchScreen.tsx
src/components/search/SearchBar.tsx
src/components/search/SearchModeToggle.tsx
src/components/search/SearchResultList.tsx
src/components/search/SearchResultItem.tsx
src/components/search/SearchResultDetail.tsx
src/components/search/SearchHistory.tsx
```

---

## 6. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| sqlite-vec の macOS ビルド（動的ライブラリリンク） | R-H01 が +2d | Tauri の `beforeBuildCommand` で `cargo build` 前に sqlite-vec をビルドする手順を整備。`bundleLibraries` で同梱 |
| Anthropic Embeddings API のレート制限（大量ファイル時） | `index_build` が途中停止 | 並列度 3・リクエスト間 200ms のスロットリング実装。中断再開できるよう `embedding_status='pending'` のレコードを再試行対象に |
| FTS5 と sqlite-vec のスコア統合（both モード） | R-H03 が +1d | Phase 3 では単純加算（fts_score * 0.4 + vec_score * 0.6）。精度改善は Phase 6 以降で対応 |
| `issue_draft_generate` のストリーミング実装精度（Phase 1 スタブからの差し替え） | F-J02 が +1d | Phase 1 で `invoke` 呼び出しと型は整備済みのため、リスナー追加と UI 差し替えのみ |
