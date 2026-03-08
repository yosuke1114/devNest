# PRScreen 詳細設計書

**バージョン**: 2.0
**作成日**: 2026-03-08
**改訂日**: 2026-03-08（要件変更対応）
**対象画面**: PRScreen（PR 一覧・詳細・コードレビュー・設計書 diff・マージ）
**対応シナリオ**: S-04, S-05（統合）, S-09
**対応タスク**: Phase 2（基本機能）/ Phase 4（設計書 diff・REQUEST CHANGES 追加）

---

## 変更履歴

| バージョン | 変更内容 |
|-----------|---------|
| 1.0 | 初版（PR 一覧・コード diff・Approve/Merge） |
| 2.0 | **設計書 diff タブ追加・REQUEST CHANGES フロー追加**（SyncDiffScreen 廃止にともなう統合。Claude Code が同一ブランチに設計書とコードを両方コミットする運用に変更） |

---

## 1. 画面概要

GitHub Pull Request の一覧・詳細・コード diff・**設計書 diff**・インラインコメント・レビュー提出・マージを一画面で管理する。

Claude Code が `feat/{issue-id}-xxx` ブランチにソースコードと設計書（.md）の両方をコミットする運用を前提とし、**コードと設計書の変更を同一 PR でレビューしてマージできる**ことを目的とする。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'pr'`（uiStore） |
| Props | なし |
| レイアウト | GlobalNav 表示・左ペイン（PR 一覧）+ 右ペイン（PR 詳細） |
| Phase 2 実装範囲 | PR 一覧・Overview タブ・コード diff タブ・Approve/Merge |
| Phase 4 追加範囲 | 設計書 diff タブ・REQUEST CHANGES・Terminal 完了後の自動遷移 |

---

## 2. レイアウト仕様

```
┌──────┬────────────────┬──────────────────────────────────────────────────┐
│      │  PRFilterBar   │  PRDetailHeader                                  │
│ Nav  ├────────────────┤  PRDetailTabs                                    │
│      │  PRList        │  [Overview] [Code Diff] [Design Docs]           │
│      │  └ PRListItem  ├──────────────────────────────────────────────────┤
│      │    × N         │  TabOverview      TabCodeDiff    TabDesignDocs   │
│      │                │  ├ PRMeta         └ CodeDiff     └ DocDiffViewer │
│      │                │  ├ Description      Viewer         └ DocFileDiff │
│      │                │  ├ ReviewList         └ FileDiff     + RequestCh │
│      │                │  └ MergePanel           + Inline     angesPanel  │
└──────┴────────────────┴──────────────────────────────────────────────────┘
  左ペイン: 260px          右ペイン: flex:1
```

---

## 3. コンポーネントツリー

```
PRScreen
  ├── PRFilterBar
  ├── PRList
  │     └── PRListItem × N
  └── PRDetail                           # activePrId が null の場合は EmptyState
        ├── PRDetailHeader               # PR タイトル・ブランチ・checks・linked Issue
        ├── PRDetailTabs                 # タブ切替コントロール
        ├── TabOverview                  # activeTab='overview'（Phase 2）
        │     ├── PRMetaGrid
        │     ├── PRDescriptionPanel
        │     ├── PRChecklist
        │     ├── ReviewList
        │     │     └── ReviewItem × N
        │     ├── ReviewPanel
        │     └── MergePanel
        ├── TabCodeDiff                  # activeTab='code-diff'（Phase 2）
        │     └── CodeDiffViewer
        │           └── FileDiff × N    # .ts / .rs / .tsx 等のソースファイル
        │                 ├── FileDiffHeader
        │                 └── DiffHunkWithComments
        │                       ├── DiffLine × N
        │                       └── InlineComment × N
        └── TabDesignDocs                # activeTab='design-docs'（Phase 4）
              └── DocDiffViewer
                    ├── DocDiffHeader    # ファイル名・diff stat・REQUEST CHANGES ボタン
                    ├── DocFileDiff × N  # .md ファイルのみ
                    │     ├── FileDiffHeader
                    │     └── DiffHunkWithComments（読み取り専用 or コメント可）
                    └── RequestChangesPanel  # REQUEST CHANGES 選択時に展開
```

---

## 4. 状態設計

### 4.1 ストア参照

```typescript
// prStore
const prs = usePrStore(s => s.prs)
const listStatus = usePrStore(s => s.listStatus)
const activePrId = usePrStore(s => s.activePrId)
const activeTab = usePrStore(s => s.activeTab)
const prDetail = usePrStore(s => s.prDetail)
const codeDiffs = usePrStore(s => s.codeDiffs)        // .ts/.rs 等
const docDiffs = usePrStore(s => s.docDiffs)          // .md のみ（Phase 4）
const codeDiffStatus = usePrStore(s => s.codeDiffStatus)
const docDiffStatus = usePrStore(s => s.docDiffStatus)  // Phase 4
const requestChangesStatus = usePrStore(s => s.requestChangesStatus) // Phase 4
const commentStatus = usePrStore(s => s.commentStatus)
const reviewStatus = usePrStore(s => s.reviewStatus)
const canMerge = usePrStore(s => s.canMerge())
const commentsForLine = usePrStore(s => s.commentsForLine)

const activeProjectId = useProjectStore(s => s.activeProjectId)
```

### 4.2 ローカル state

```typescript
// PRFilterBar
const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'merged' | 'closed'>('all')

// ReviewPanel
const [reviewBody, setReviewBody] = useState('')
const [reviewState, setReviewState] = useState<'approved' | 'changes_requested'>('approved')

// InlineComment（コード diff・設計書 diff 共通）
const [commentTarget, setCommentTarget] = useState<{ path: string; line: number } | null>(null)
const [pendingComment, setPendingComment] = useState('')

// RequestChangesPanel（Phase 4）
const [requestChangesOpen, setRequestChangesOpen] = useState(false)
const [requestChangesText, setRequestChangesText] = useState('')
```

### 4.3 prStore の型拡張（v2.0）

```typescript
// v1.0 からの変更点
interface PrState {
  // ... 既存フィールド ...

  // Phase 4 追加
  docDiffs: DocFileDiff[]              // .md ファイルのみ
  docDiffStatus: AsyncStatus
  requestChangesStatus: AsyncStatus
  requestChangesError: string | null
}

interface DocFileDiff {
  path: string                         // 例: "docs/architecture.md"
  diffContent: string                  // unified diff 文字列
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

// loadDocDiff（Phase 4）
loadDocDiff: (projectId: number, prId: number) => Promise<void>

// requestChanges（Phase 4）: Claude Code に再実装を依頼
requestChanges: (projectId: number, prId: number, comment: string) => Promise<void>
```

---

## 5. PRDetailTabs の仕様

### タブ定義

| タブ ID | ラベル | バッジ | Phase |
|--------|-------|-------|-------|
| `overview` | Overview | — | 2 |
| `code-diff` | Code Changes | `{codeFileCount} files` | 2 |
| `design-docs` | Design Docs | `{docFileCount} files`（変更あり時のみ） | 4 |

### Phase 4 前の design-docs タブ表示

Phase 2〜3 では `design-docs` タブを **disabled** スタイルで表示し、ホバー時に「Phase 4 から利用可能」ツールチップを表示する。

```typescript
// PRDetailTabs.tsx
const TABS = [
  { id: 'overview', label: 'Overview', phase: 2 },
  { id: 'code-diff', label: 'Code Changes', phase: 2 },
  { id: 'design-docs', label: 'Design Docs', phase: 4 },
]

// Phase 判定（IS_PHASE_GTE_4 フラグで制御）
const isTabEnabled = (tab: typeof TABS[0]) =>
  IS_PHASE_GTE_4 || tab.phase <= 2
```

### タブ切替時の diff ロード

```typescript
useEffect(() => {
  if (!activePrId || !activeProjectId) return

  if (activeTab === 'code-diff' && codeDiffs.length === 0) {
    prStore.loadCodeDiff(activeProjectId, activePrId)
  }
  if (activeTab === 'design-docs' && docDiffs.length === 0) {
    prStore.loadDocDiff(activeProjectId, activePrId)   // Phase 4
  }
}, [activeTab])
```

---

## 6. TabCodeDiff の詳細仕様（Phase 2）

### CodeDiffViewer

```typescript
interface CodeDiffViewerProps {
  fileDiffs: FileDiff[]
  isLoading: boolean
  comments: PrComment[]
  onAddComment: (params: CommentParams) => void
}
```

FileDiff・DiffHunkWithComments・InlineComment は v1.0 の実装をそのまま使用。

**ファイル絞り込み**

```typescript
// .md を除いたファイルのみ表示（設計書は Design Docs タブへ）
const codeFiles = fileDiffs.filter(f => !f.path.endsWith('.md'))
```

---

## 7. TabDesignDocs の詳細仕様（Phase 4）

### 7.1 DocDiffViewer レイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│ DocDiffHeader                                                   │
│   docs/architecture.md  +12 -1    [REQUEST CHANGES] [OPEN DOC] │
├─────────────────────────────────────────────────────────────────┤
│ DocFileDiff（unified diff・カラー表示）                          │
│   + added line (緑)                                             │
│   - deleted line (赤)                                           │
│   context line                                                  │
├─────────────────────────────────────────────────────────────────┤
│ RequestChangesPanel（requestChangesOpen=true 時に展開）          │
│   修正指示を入力…                                                │
│   [CANCEL]  [SEND TO CLAUDE CODE →]                            │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 DocDiffHeader

```typescript
interface DocDiffHeaderProps {
  docFileDiffs: DocFileDiff[]
  totalAdditions: number
  totalDeletions: number
  onRequestChanges: () => void
  onOpenDoc: (path: string) => void
}
```

**表示内容**

```
Design Docs Changes  +{totalAdditions}  -{totalDeletions}
docs/architecture.md  (+12 -1)  [OPEN DOC]
docs/sync-flow.md     (+4 -0)   [OPEN DOC]
                                [REQUEST CHANGES ↩]
```

- **[OPEN DOC]** : `navigate('editor', { documentPath: path })` でエディタに遷移してそのファイルを開く
- **[REQUEST CHANGES]** : `RequestChangesPanel` を展開する

### 7.3 DocFileDiff

v1.0 の FileDiff・DiffHunkWithComments をそのまま流用。`.md` ファイル専用にスタイルを調整する（Markdown 構文ハイライトを適用）。

```typescript
interface DocFileDiffProps {
  fileDiff: DocFileDiff
  comments: PrComment[]
  onAddComment: (params: CommentParams) => void
}
```

### 7.4 RequestChangesPanel

Claude Code に設計書の再修正を依頼するパネル。

```typescript
interface RequestChangesPanelProps {
  isOpen: boolean
  requestChangesStatus: AsyncStatus
  onSubmit: (comment: string) => void
  onCancel: () => void
}
```

**UI 表示**

```
┌────────────────────────────────────────────────────────┐
│ ↩ Claude Code に修正を依頼                              │
│                                                        │
│ ┌──────────────────────────────────────────────────┐  │
│ │ 修正指示を入力…                                   │  │
│ │ 例: retry 回数を 5 回に変更してください           │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ [CANCEL]          [SEND TO CLAUDE CODE →]             │
└────────────────────────────────────────────────────────┘
```

**SEND TO CLAUDE CODE 押下時の処理**

```typescript
const handleRequestChanges = async () => {
  if (!requestChangesText.trim()) return
  await prStore.requestChanges(
    activeProjectId!,
    activePrId!,
    requestChangesText.trim()
  )
  // 成功後
  setRequestChangesText('')
  setRequestChangesOpen(false)
}
```

**requestChanges の内部フロー（prStore）**

```typescript
requestChanges: async (projectId, prId, comment) => {
  set({ requestChangesStatus: 'loading' })
  try {
    // 1. PR に changes_requested レビューを提出（GitHub API）
    await invoke('pr_review_submit', {
      project_id: projectId,
      pr_id: prId,
      state: 'changes_requested',
      body: comment,
    })

    // 2. Terminal を再起動して Claude Code に再実装を依頼
    //    既存の terminal_session_start を issue + comment で呼び出す
    const pr = get().prById(prId)
    if (pr?.linkedIssueNumber) {
      await invoke('terminal_session_start', {
        project_id: projectId,
        issue_id: pr.linkedIssueId,
        branch_name: pr.headBranch,    // 同一ブランチで再実装
        context_doc_ids: [],            // Terminal 側で再取得
        request_changes_comment: comment,
      })
      useUiStore.getState().navigate('terminal')
    }

    set({ requestChangesStatus: 'success' })
  } catch (e) {
    const err = handleError(e, 'requestChanges')
    set({ requestChangesStatus: 'error', requestChangesError: err.message })
  }
}
```

**Terminal 遷移後の動作**

`request_changes_comment` を受け取った Terminal が Claude Code を起動し、コメント内容を元に同一ブランチで修正を行う。修正完了後は `terminal_done` → PR 更新 → PRScreen の diff が自動更新される。

---

## 8. Terminal 完了後の PRScreen 自動遷移（Phase 4）

`terminal_done` イベントを受け取った後、TerminalScreen の `PRReadyBanner` から PRScreen に遷移する際、**PR の Design Docs タブを自動的に開く**。

```typescript
// TerminalScreen.tsx の onCreatePr 完了後
const handlePrCreated = (prNumber: number) => {
  prStore.openPrByGithubNumber(projectId, prNumber)
  // Design Docs タブを先に開く（設計書変更がある場合）
  if (readyBranch?.hasDocChanges) {
    prStore.setActiveTab('design-docs')
  } else {
    prStore.setActiveTab('code-diff')
  }
  uiStore.navigate('pr')
}
```

`readyBranch.hasDocChanges` は `terminal_done` イベントの payload に追加する。

```typescript
// terminal_done イベント payload（拡張）
interface TerminalDonePayload {
  branch_name: string
  commit_sha: string
  has_doc_changes: boolean   // .md ファイルの変更が含まれるか（Phase 4 追加）
  changed_files: string[]
}
```

---

## 9. TabOverview の詳細仕様（Phase 2・v1.0 から変更なし）

### PRMetaGrid

```
Branch        Author       Checks           Files changed
feat/43-…     @yosuke      ✓ passing        3 changed
```

### ReviewPanel

```typescript
interface ReviewPanelProps {
  reviewStatus: AsyncStatus
  onSubmitReview: (state: 'approved' | 'changes_requested', body?: string) => void
}
```

**UI 要素**

```
SUBMIT REVIEW
┌────────────────────────────────────────┐
│ Optional comment…                      │
└────────────────────────────────────────┘
( ) Approve   ( ) Request Changes
[SUBMIT REVIEW]
```

### MergePanel

```typescript
canMerge: () => {
  const { prDetail } = get()
  if (!prDetail) return false
  const checksPassing = prDetail.pr.checksStatus === 'passing'
  const hasApproval = prDetail.reviews.some(r =>
    r.state === 'approved' && r.submitStatus === 'submitted'
  )
  return checksPassing && hasApproval
}
```

**マージ完了後**

```
✓ マージ完了  feat/43-auto-git-commit → main
  → Issue #43 がクローズされました（linkedIssue がある場合）
  → 設計書 {N} ファイルがマージされました（Design Docs 変更がある場合）
```

---

## 10. mount 処理

```typescript
useEffect(() => {
  if (!activeProjectId) return
  if (listStatus === 'idle') {
    prStore.loadPrs(activeProjectId)
  }
}, [])
```

`activePrId` が既にセットされている場合（TerminalScreen からの遷移）は自動で `PRDetail` が表示される。

---

## 11. エラーハンドリング

| エラー | 表示場所 | 対応 |
|-------|---------|------|
| `loadPrs` 失敗 | PRList のエラーメッセージ | RELOAD ボタン |
| `loadCodeDiff` 失敗 | CodeDiffViewer のエラーメッセージ | RETRY ボタン |
| `loadDocDiff` 失敗 | DocDiffViewer のエラーメッセージ | RETRY ボタン |
| `mergePr` 失敗 | MergePanel 下の赤バナー | RETRY ボタン |
| `addComment` 失敗 | コメントフォーム下の赤テキスト | RETRY / 再入力 |
| `submitReview` 失敗 | ReviewPanel 下の赤バナー | RETRY ボタン |
| `requestChanges` 失敗（Phase 4） | RequestChangesPanel 下の赤バナー | RETRY ボタン |
| `terminal_session_start` 失敗（Phase 4） | RequestChangesPanel 下の赤バナー（「Terminal を起動できませんでした。Settings で Claude Code パスを確認してください」） | Settings へのリンク |

---

## 12. ファイル一覧

### Phase 2（新規）

```
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
src/components/pr/DiffHunkWithComments.tsx   ← TabDesignDocs でも流用
src/components/pr/InlineComment.tsx
src/lib/diffParser.ts                         ← unified diff パーサー（SyncDiffScreen から移設）
```

### Phase 4（追加）

```
src/components/pr/TabDesignDocs.tsx           ← 新規
src/components/pr/DocDiffViewer.tsx           ← 新規
src/components/pr/DocDiffHeader.tsx           ← 新規
src/components/pr/DocFileDiff.tsx             ← 新規（FileDiff の .md 特化版）
src/components/pr/RequestChangesPanel.tsx     ← 新規
```

### 削除（SyncDiffScreen 廃止）

```
src/screens/SyncDiffScreen.tsx                ← 削除
src/components/sync-diff/（ディレクトリ全体） ← 削除
src/stores/ai-edit.store.ts                   ← 削除（prStore に統合）
```

---

## 13. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | `checksStatus` の更新タイミング | polling で定期取得。`pr_sync` イベントで prDetail を更新 |
| U-02 | PR body 内チェックリスト（`- [x]`）の GitHub 更新 | Phase 2 では読み取り専用。Phase 3 で対応 |
| U-03 | DiffViewer の大量行（1000 行超）のパフォーマンス | `react-virtual` で仮想スクロール実装 |
| U-04 | インラインコメントの GitHub 同期（`isPending` 解消） | `pr_comment_sync` コマンドで非同期投稿 |
| U-05 | `requestChanges` で Terminal に遷移した後、ユーザーが PRScreen に戻った場合の diff 自動更新タイミング | `terminal_done` イベントで `prStore.syncPr(prId)` を呼ぶ |
| U-06 | `has_doc_changes` フラグの判定方法（`.md` 拡張子のみか、`docs/` パス以下か） | `.md` 拡張子を条件とする。`terminal_done` の Rust 側で `changed_files` をフィルタして判定 |
