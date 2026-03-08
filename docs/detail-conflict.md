# ConflictScreen 詳細設計書

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**対象画面**: ConflictScreen（git コンフリクト解消）  
**対応シナリオ**: S-07  
**対応タスク**: F-H01

---

## 1. 画面概要

`git pull` 後にコンフリクトが発生した際、設計書ファイル（`docs/` 配下）のブロック単位解消 UI を提供する。全ブロック解消後に `SAVE & MERGE` でコミット・プッシュまで一括実行する。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'conflict'`（uiStore） |
| Props | なし |
| 遷移元 | `git_pull_done` イベント（コンフリクト発生時）/ GlobalNav の ⚠ バッジ |
| レイアウト | GlobalNav 表示・ヘッダー + 左ファイルリスト + 右ブロックエディタ |

---

## 2. レイアウト仕様

```
┌──────┬──────────────────────────────────────────────────────┐
│      │  ConflictHeader（件数 / 進捗バー / SAVE & MERGE）      │
│ Nav  ├────────────────┬─────────────────────────────────────┤
│      │ConflictFileList│  ConflictBlockEditor                 │
│      │  (200px)       │  ├ ConflictToolbar                  │
│      │ ファイル × N   │  └ ConflictBlock × N               │
│      │ + 進捗         │    ├ OursSide (赤)                  │
│      │                │    ├ TheirsSide (青)                │
│      │                │    └ ResolutionButtons              │
│      │                ├─────────────────────────────────────┤
│      │                │  ResolvedOverlay（全解消完了後）      │
└──────┴────────────────┴─────────────────────────────────────┘
```

---

## 3. コンポーネントツリー

```
ConflictScreen
  ├── ConflictHeader
  │     ├── ConflictProgressBar        # {resolvedBlocks}/{totalBlocks} ブロック解消済み
  │     ├── UnmanagedFileNote          # docs/ 外ファイルの件数注記
  │     └── SaveAndMergeButton         # allResolved=true 時に活性化
  ├── ConflictFileList
  │     └── ConflictFileItem × N
  └── ConflictBlockEditor
        ├── ConflictToolbar            # USE ALL MINE / USE ALL THEIRS
        ├── ConflictBlock × N
        │     ├── BlockHeader          # "Conflict {N+1}/{total}"
        │     ├── OursSide            # HEAD 側（赤背景）
        │     ├── TheirsSide          # THEIRS 側（青背景）
        │     └── ResolutionButtons   # USE MINE / USE THEIRS / MANUAL
        └── ResolvedOverlay            # allResolved=true 時に全面表示
```

---

## 4. 状態設計

### 4.1 ストア参照

```typescript
const managedFiles = useConflictStore(s => s.managedFiles)
const unmanagedCount = useConflictStore(s => s.unmanagedCount)
const listStatus = useConflictStore(s => s.listStatus)
const activeFileId = useConflictStore(s => s.activeFileId)
const totalBlocks = useConflictStore(s => s.totalBlocks())
const resolvedBlocks = useConflictStore(s => s.resolvedBlocks())
const allResolved = useConflictStore(s => s.allResolved())
const resolveAllStatus = useConflictStore(s => s.resolveAllStatus)
const resolveAllError = useConflictStore(s => s.resolveAllError)
const activeFile = useConflictStore(s => s.activeFile())

const activeProjectId = useProjectStore(s => s.activeProjectId)
```

### 4.2 ローカル state

```typescript
// MANUAL 編集モード（ConflictBlock ごと）
const [manualContents, setManualContents] = useState<Record<number, string>>({})
// blockIndex → 編集中テキスト
```

---

## 5. 各コンポーネントの詳細仕様

### 5.1 ConflictHeader

```typescript
interface ConflictHeaderProps {
  totalBlocks: number
  resolvedBlocks: number
  allResolved: boolean
  resolveAllStatus: AsyncStatus
  resolveAllError: string | null
  unmanagedCount: number
  onSaveAndMerge: () => void
}
```

**表示内容**

```
⚠ CONFLICT RESOLUTION    [2 / 4 ブロック解消済み]  [████░░░░]
  docs/ 外に 1 ファイルのコンフリクトがあります（手動で解消してください）
                                              [SAVE & MERGE]（allResolved 時に活性化）
```

**ConflictProgressBar**

```typescript
// width: (resolvedBlocks / totalBlocks) * 100 + '%'
// allResolved=true → 緑・SAVE & MERGE ボタンが活性化
```

**UnmanagedFileNote**

`unmanagedCount > 0` の場合のみ表示。「docs/ 外の {N} ファイルは手動で解消してください。完了後に SAVE & MERGE を押してください。」

**SAVE & MERGE 押下時の処理**

```typescript
const handleSaveAndMerge = async () => {
  if (!activeProjectId) return

  // 全ファイルの resolutions を一括送信
  for (const file of managedFiles) {
    await conflictStore.saveResolutions(activeProjectId, file.id)
  }
  // conflict_resolve_all でコミット・プッシュ
  await conflictStore.resolveAll(activeProjectId)
  // 成功 → ResolvedOverlay を表示（ストアの resolveAllStatus='success' で制御）
}
```

---

### 5.2 ConflictFileList

#### ConflictFileItem

```typescript
interface ConflictFileItemProps {
  file: ConflictFile
  isActive: boolean
  resolvedCount: number    // Object.values(file.resolutions).length
  totalCount: number       // file.conflictBlocks.length
  onClick: (fileId: number) => void
}
```

**表示内容**

```
architecture.md
⚠ 2 conflicts                ← 未解消
    ready（緑）               ← 全解消時
```

| 状態 | 左ボーダー色 | バッジ |
|------|-------------|--------|
| アクティブ | 黄色 | — |
| 全解消済み | 緑 | `ready` |
| 未解消あり | 黄色 | `{N} conflicts` |

**ファイルリスト下部：進捗サマリー**

```
解消済み: {resolvedBlocks} / {totalBlocks} ブロック
```

---

### 5.3 ConflictBlockEditor

#### ConflictToolbar

```typescript
interface ConflictToolbarProps {
  fileId: number
  onUseAllMine: () => void
  onUseAllTheirs: () => void
}
```

```
[USE ALL MINE]  [USE ALL THEIRS]       ← アクティブファイルの全ブロックを一括選択
```

**USE ALL MINE 押下時**

```typescript
const handleUseAllMine = () => {
  conflictStore.resolveAllBlocks(activeFileId!, 'ours')
  // → 全 blockIndex に { resolution: 'ours' } をセット（ローカル state のみ）
}
```

#### ConflictBlock

```typescript
interface ConflictBlockProps {
  block: ConflictBlock
  resolution: BlockResolution | undefined
  fileId: number
  onResolve: (blockIndex: number, resolution: BlockResolution) => void
}
```

**表示レイアウト**

```
Conflict 1/2                           [USE MINE] [USE THEIRS] [MANUAL]

  ┌── HEAD ─────────────────────────────────────────────────────┐  ← 赤背景
  │  debounce: 1 second after last keystroke.                   │
  │  Retry: up to 3 times with exponential backoff.             │
  └─────────────────────────────────────────────────────────────┘

  ┌── THEIRS ───────────────────────────────────────────────────┐  ← 青背景
  │  debounce: 500ms after last keystroke.                      │
  │  Retry: not implemented.                                    │
  └─────────────────────────────────────────────────────────────┘
```

**選択後の表示変化**

| resolution | OursSide | TheirsSide | 表示 |
|-----------|----------|-----------|------|
| `ours` | 緑ボーダー・✓ | 薄い | `✓ MINE を選択` |
| `theirs` | 薄い | 緑ボーダー・✓ | `✓ THEIRS を選択` |
| `manual` | — | — | MANUAL エディタを展開 |
| 未選択 | 通常 | 通常 | — |

**MANUAL ボタン押下時**

OursSide / TheirsSide の下に手動編集テキストエリアを展開する。

```typescript
// MANUAL 選択時
const handleManual = (blockIndex: number) => {
  // 初期値: OursSide の内容
  setManualContents(prev => ({
    ...prev,
    [blockIndex]: block.ours,
  }))
  conflictStore.setBlockResolution(fileId, blockIndex, {
    blockIndex,
    resolution: 'manual',
    manualContent: block.ours,
  })
}

// テキストエリア onChange
const handleManualChange = (blockIndex: number, content: string) => {
  setManualContents(prev => ({ ...prev, [blockIndex]: content }))
  conflictStore.setBlockResolution(fileId, blockIndex, {
    blockIndex,
    resolution: 'manual',
    manualContent: content,
  })
}
```

**MANUAL エディタの表示**

```
MANUAL EDIT:
┌──────────────────────────────────────┐
│ debounce: 1 second after last…       │
│ Retry: up to 3 times with…           │
└──────────────────────────────────────┘
```

---

### 5.4 ResolvedOverlay

`resolveAllStatus === 'success'` になった時に右ペイン全面をオーバーレイで覆う。

```
（背景を薄い緑で覆う）

✓

Conflicts resolved
architecture.md — 2 conflicts merged

✓ Merge commit created
✓ Pushed to origin/main
✓ Branch conflict resolved · synced

[VIEW IN EDITOR]  [▶ OPEN TERMINAL]  [CLOSE]
```

**ボタン処理**

| ボタン | 処理 |
|--------|------|
| VIEW IN EDITOR | `navigate('editor')` |
| OPEN TERMINAL | `navigate('terminal')` |
| CLOSE | オーバーレイ非表示（`resolveAllStatus` をリセット） |

---

## 6. mount 処理

```typescript
useEffect(() => {
  if (!activeProjectId) return
  conflictStore.loadConflicts(activeProjectId)
  // → conflict_list を invoke → managedFiles・unmanagedCount をセット
  // → 先頭ファイルを activeFile に自動選択
}, [])
```

---

## 7. イベントリスナー

```typescript
// initListeners 内（AppShell で一度だけ登録）
listen('git_pull_done', ({ payload }) => {
  conflictStore.onGitPullDone(payload)
  if (payload.status === 'conflict') {
    // GlobalNav に ⚠ バッジを表示
    uiStore.showConflictBadge(true)
    // ユーザーが ConflictScreen にいない場合は通知
    if (uiStore.currentScreen !== 'conflict') {
      notificationStore.add({
        type: 'conflict',
        message: `コンフリクトが検出されました（${payload.conflictFiles?.length ?? 0} ファイル）`,
      })
    }
  }
})
```

---

## 8. saveResolutions / resolveAll のフロー

```
ユーザーが全ブロックを選択
      ↓
SAVE & MERGE ボタン押下
      ↓
saveResolutions(projectId, file1.id)  ← conflict_resolve（block_resolutions 付き）
saveResolutions(projectId, file2.id)  ← 並列実行
      ↓
resolveAll(projectId)                 ← conflict_resolve_all
      ↓（Rust 内部）
ディスクへの書き込み → git add → merge commit → git push
      ↓
resolveAllStatus='success'
→ ResolvedOverlay 表示
→ uiStore.showConflictBadge(false)
```

---

## 9. エラーハンドリング

| エラー | 表示場所 | 対応 |
|--------|---------|------|
| `loadConflicts` 失敗 | ConflictBlockEditor のエラーメッセージ | RELOAD ボタン |
| `saveResolutions` 失敗 | ConflictHeader 下の赤バナー | RETRY ボタン |
| `resolveAll` 失敗（`GitPushFailed`） | 同上 | RETRY ボタン（3 回自動リトライ後） |
| `resolveAll` 失敗（`InvalidResolution`） | 対象 ConflictBlock に赤ハイライト | 再選択を促す |

---

## 10. ファイル一覧

```
src/screens/ConflictScreen.tsx
src/components/conflict/ConflictHeader.tsx
src/components/conflict/ConflictProgressBar.tsx
src/components/conflict/UnmanagedFileNote.tsx
src/components/conflict/SaveAndMergeButton.tsx
src/components/conflict/ConflictFileList.tsx
src/components/conflict/ConflictFileItem.tsx
src/components/conflict/ConflictBlockEditor.tsx
src/components/conflict/ConflictToolbar.tsx
src/components/conflict/ConflictBlock.tsx
src/components/conflict/OursSide.tsx
src/components/conflict/TheirsSide.tsx
src/components/conflict/ResolutionButtons.tsx
src/components/conflict/ResolvedOverlay.tsx
```

---

## 11. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | MANUAL 編集の構文チェック | Phase 1 では自由テキスト。Markdown lint は Phase 3 |
| U-02 | ファイルが 10 件以上のコンフリクトを持つ場合の ConflictFileList のスクロール | `overflow-y: auto` で対応。件数上限なし |
| U-03 | unmanagedCount のファイルを ConflictScreen で表示すべきか | 読み取り専用で一覧表示するセクションを ConflictFileList 下部に追加（Phase 2） |
