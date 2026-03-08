# TerminalScreen 詳細設計書

**バージョン**: 2.0
**作成日**: 2026-03-08
**改訂日**: 2026-03-08（要件変更対応）
**対象画面**: TerminalScreen（Claude Code PTY セッション）
**対応シナリオ**: S-03（LAUNCH TERMINAL）, S-04（REQUEST CHANGES）
**対応タスク**: Phase 4

---

## 変更履歴

| バージョン | 変更内容 |
|-----------|---------|
| 1.0 | 初版 |
| 2.0 | **SyncDiffScreen 廃止にともなう遷移先変更**。`PRReadyBanner` の「VIEW DIFF / REVIEW AI EDITS」ボタン遷移先を `sync-diff` から `pr`（Design Docs タブ）に変更。`PRCreateModal` の呼び出しストアを `aiEditStore` から `prStore` に変更。`terminal_done` payload に `has_doc_changes` フラグ追加。 |

---

## 1. 画面概要

Claude Code CLI を PTY セッションとして起動し、xterm.js で出力を表示する。セッション完了後に PR READY バナーを表示し、PR 作成・PRScreen へのレビュー遷移へ誘導する。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'terminal'`（uiStore） |
| Props | なし |
| レイアウト | GlobalNav 表示・上部バナーエリア + 中央エディタプレビュー + 下部ターミナルペイン |

---

## 2. レイアウト仕様

```
┌──────┬──────────────────────────────────────────────────┐
│      │  TerminalHeader（Issue 番号 + セッション状態）     │
│ Nav  ├──────────────────────────────────────────────────┤
│      │  PRReadyBanner（showPrReadyBanner=true 時）       │
│      │  PRCreatedBanner（PR 作成完了時）                  │
│      ├──────────────────────────────────────────────────┤
│      │  EditorPreviewArea（Context Doc 表示・読み取り専用）│
│      │  （flex: 1）                                      │
│      ├──── ResizeHandle（ドラッグでターミナル高さ変更）───┤
│      │  TerminalPane（xterm.js・高さ可変 120〜420px）    │
└──────┴──────────────────────────────────────────────────┘
```

---

## 3. コンポーネントツリー

```
TerminalScreen
  ├── TerminalHeader
  ├── PRReadyBanner           # showPrReadyBanner=true 時
  ├── PRCreatedBanner         # PR 作成完了後
  ├── EditorPreviewArea       # Context Doc の読み取り専用プレビュー
  ├── ResizeHandle            # ドラッグでターミナル高さ変更
  ├── TerminalPane            # xterm.js レンダリング領域
  └── PRCreateModal           # PR 作成フォーム（uiStore.showModal 経由）
```

---

## 4. 状態設計

### 4.1 ストア参照

```typescript
const session = useTerminalStore(s => s.session)
const outputLog = useTerminalStore(s => s.outputLog)
const startStatus = useTerminalStore(s => s.startStatus)
const readyBranch = useTerminalStore(s => s.readyBranch)
const readyBranchId = useTerminalStore(s => s.readyBranchId)
const showPrReadyBanner = useTerminalStore(s => s.showPrReadyBanner)
const hasDocChanges = useTerminalStore(s => s.hasDocChanges)   // ★ v2.0 追加

const activeIssueId = useIssueStore(s => s.activeIssueId)
const issueById = useIssueStore(s => s.issueById)
const activeIssue = activeIssueId ? issueById(activeIssueId) : undefined

const activeProjectId = useProjectStore(s => s.activeProjectId)
```

### 4.2 ローカル state

```typescript
const [terminalHeight, setTerminalHeight] = useState(230)  // px
const [prCreated, setPrCreated] = useState<{ prNumber: number; title: string } | null>(null)
const xtermRef = useRef<Terminal | null>(null)
const fitAddonRef = useRef<FitAddon | null>(null)
```

---

## 5. 各コンポーネントの詳細仕様

### 5.1 TerminalHeader

```typescript
interface TerminalHeaderProps {
  issue: Issue | undefined
  sessionStatus: 'idle' | 'running' | 'completed' | 'aborted' | null
  onStart: () => void
  onStop: () => void
}
```

**セッション状態別の表示**

| sessionStatus | 表示 | ボタン |
|---------------|------|--------|
| `null`（未開始） | `Issue #N · {title}` + `● ready to start` | `▶ START CLAUDE CODE` |
| `running` | `Issue #N · {title}` + `◌ running…` | `■ STOP` |
| `completed` | （PRReadyBanner に置き換え） | — |
| `aborted` | `Issue #N · {title}` + `■ stopped` | `▶ RESTART` |

---

### 5.2 PRReadyBanner（v2.0 変更）

```typescript
interface PRReadyBannerProps {
  branchName: string
  hasDocChanges: boolean     // ★ v2.0 追加：設計書変更が含まれるか
  onCreatePR: () => void
  onReviewChanges: () => void  // ★ v2.0：旧 onViewDiff。PRScreen の Design Docs タブへ遷移
  onDismiss: () => void
}
```

**表示内容（v2.0）**

```
PR READY:  feat/43-auto-git-commit  ·  3 files changed（うち設計書 2 件）
                 [CREATE PR →]  [REVIEW CHANGES ↩]
```

`hasDocChanges=false` の場合：「うち設計書 N 件」の補足テキストは非表示。

**REVIEW CHANGES ボタン（v2.0 変更）**

旧実装の遷移先 `sync-diff` を廃止し、PRScreen の Design Docs タブへ直接遷移する。

```typescript
// ★ v2.0：SyncDiffScreen への遷移を廃止。PRScreen へ遷移し Design Docs タブを開く
const handleReviewChanges = async () => {
  if (!readyBranchId || !activeProjectId) return

  // PR が既に作成済みの場合は該当 PR の Design Docs タブを開く
  const pr = prStore.prByBranchName(readyBranch ?? '')
  if (pr) {
    await prStore.setActivePr(activeProjectId, pr.id)
    if (hasDocChanges) {
      prStore.setActiveTab('design-docs')
    } else {
      prStore.setActiveTab('code-diff')
    }
    uiStore.navigate('pr')
    return
  }

  // PR 未作成の場合：先に PRCreateModal を開くよう案内
  // （Design Docs diff は PR 作成後に GitHub API 経由で取得するため）
  uiStore.showToast({ type: 'info', message: 'まず PR を作成してから設計書の変更を確認できます' })
}
```

> **廃止したストア呼び出し**
> ```typescript
> // ★ 削除（v2.0）
> // await aiEditStore.openBranch(activeProjectId, readyBranchId)
> // uiStore.navigate('sync-diff')
> ```

---

### 5.3 PRCreatedBanner

変更なし。PR 作成後に PRReadyBanner と入れ替わる。

```typescript
interface PRCreatedBannerProps {
  prNumber: number
  title: string
  hasDocChanges: boolean    // ★ v2.0 追加
  onOpenPR: () => void      // PRScreen へ遷移して該当 PR を開く
  onDismiss: () => void
}
```

**表示内容（v2.0）**

```
✓ PR #44 を作成しました  feat/43-auto-git-commit → main
  設計書の変更が含まれています。Design Docs タブで確認できます。
                                         [PR を開く →]  [✕]
```

`hasDocChanges=false` の場合：設計書の補足テキストは非表示。

**PR を開く ボタン**

```typescript
const handleOpenPR = async () => {
  await prStore.openPrByGithubNumber(activeProjectId!, prNumber)
  // ★ v2.0：設計書変更がある場合は Design Docs タブを先に開く
  if (hasDocChanges) {
    prStore.setActiveTab('design-docs')
  } else {
    prStore.setActiveTab('overview')
  }
  uiStore.navigate('pr')
}
```

---

### 5.4 EditorPreviewArea

変更なし（v1.0 と同じ）。

```typescript
interface EditorPreviewAreaProps {
  documentPath: string | null
  content: string | null
  isLoading: boolean
}
```

---

### 5.5 ResizeHandle / TerminalPane

変更なし（v1.0 と同じ）。

---

### 5.6 PRCreateModal（v2.0 変更）

`aiEditStore.createPrFromBranch` を `prStore.createPrFromBranch` に変更する。

```typescript
interface PRCreateModalProps {
  branchName: string
  defaultTitle: string
  defaultIssueNumber: number | null
  isLoading: boolean
  onSubmit: (params: PRCreateParams) => void
  onClose: () => void
}
```

**CREATE PR 押下時の処理（v2.0 変更）**

```typescript
const handleSubmit = async (params: PRCreateParams) => {
  if (!readyBranch || !activeProjectId) return
  try {
    // ★ v2.0：aiEditStore → prStore に変更
    const pr = await prStore.createPrFromBranch(
      activeProjectId,
      readyBranch,             // ブランチ名（aiEditStore.readyBranchId から変更）
      params.issueNumber ?? undefined
    )
    setPrCreated({ prNumber: pr.githubNumber, title: pr.title })
    uiStore.closeModal()
  } catch (e) {
    // エラーはモーダル内のインラインバナーで表示
  }
}
```

> **廃止した呼び出し**
> ```typescript
> // ★ 削除（v2.0）
> // await aiEditStore.createPrFromBranch(activeProjectId, readyBranchId, ...)
> ```

---

## 6. mount / unmount 処理

変更なし（v1.0 と同じ）。

---

## 7. イベントリスナー（v2.0 変更）

```typescript
// initListeners 内（AppShell で一度だけ登録）

listen('terminal_output', ({ payload }) => {
  terminalStore.onTerminalOutput(payload)
})

// ★ v2.0：terminal_done の payload に has_doc_changes を追加
listen('terminal_done', ({ payload }: { payload: TerminalDonePayload }) => {
  terminalStore.onTerminalDone(payload)
  // → readyBranch をセット
  // → has_doc_changes を terminalStore.hasDocChanges に格納
  // → showPrReadyBanner=true → PRReadyBanner が表示される
})
```

**terminal_done payload の型（v2.0 拡張）**

```typescript
interface TerminalDonePayload {
  branch_name: string
  commit_sha: string
  has_doc_changes: boolean   // ★ v2.0 追加：.md ファイルの変更が含まれるか
  changed_files: string[]
}
```

**terminalStore の onTerminalDone（v2.0 変更）**

```typescript
onTerminalDone: (payload: TerminalDonePayload) => {
  set({
    readyBranch: payload.branch_name,
    hasDocChanges: payload.has_doc_changes,  // ★ v2.0 追加
    showPrReadyBanner: true,
    session: { ...get().session!, status: 'completed' },
  })
  // ★ v2.0 削除：aiEditStore.loadBranches / readyBranchId 解決ロジックを削除
  // aiEditStore が廃止されたため、ブランチ情報は readyBranch（文字列）のみ保持
}
```

---

## 8. エラーハンドリング

| エラー | 表示場所 | 対応 |
|--------|---------|------|
| `ClaudeCodeNotFound` | TerminalHeader 下部の赤バナー | Settings 画面への誘導 |
| `PtyError` | 同上 | RETRY ボタン |
| `terminal_input_send` 失敗 | サイレント | 再入力を促す |
| `createPrFromBranch` 失敗 | PRCreateModal のインラインバナー | RETRY ボタン |

---

## 9. ファイル一覧

```
src/screens/TerminalScreen.tsx
src/components/terminal/TerminalHeader.tsx
src/components/terminal/PRReadyBanner.tsx    ← v2.0 変更（遷移先変更）
src/components/terminal/PRCreatedBanner.tsx  ← v2.0 変更（hasDocChanges 対応）
src/components/terminal/EditorPreviewArea.tsx
src/components/terminal/ResizeHandle.tsx
src/components/terminal/TerminalPane.tsx
src/components/terminal/PRCreateModal.tsx    ← v2.0 変更（aiEditStore → prStore）
```

**削除（v2.0）**

aiEditStore（`src/stores/ai-edit.store.ts`）への依存をすべて削除。

---

## 10. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | Claude Code 未インストール時の検知 | `terminal_session_start` が `ClaudeCodeNotFound` を返すことで検知 |
| U-02 | outputLog 100KB 超の表示 | Rust 側で末尾 100KB を保持。差分追記方式で問題なし |
| U-03 | SPLIT（ターミナル分割）機能 | Phase 4 ではボタンのみ配置（disabled）。Phase 5 以降で実装 |
| U-04 | PR 未作成状態で REVIEW CHANGES を押した場合の UX | toast 案内のみ（v2.0 暫定）。Phase 4 実装時に CREATE PR フローと統合を再検討 |
