---
title: "EditorScreen 詳細設計"
doc_type: screen_design
version: "1.0.0"
last_synced_commit: null
status: current
mapping:
  sources:
    - path: "src/screens/EditorScreen.tsx"
      scope: file
    - path: "src/components/editor/"
      scope: directory
    - path: "src-tauri/src/commands/document.rs"
      scope: file
tags: [screen, editor, markdown]
---

# EditorScreen 詳細設計書

**バージョン**: 2.0
**作成日**: 2026-03-08
**改訂日**: 2026-03-08（要件変更対応）
**対象画面**: EditorScreen（設計書エディタ）
**対応シナリオ**: S-02
**対応タスク**: F-C01・F-C02・F-C03
**変更履歴**: v1.0 → v2.0：AiEditBanner・AiEditBannerRight コンポーネント削除（aiEditStore 廃止にともない）

---

## 1. 画面概要

設計書（Markdown）を編集・保存する中心画面。左ペインでプロジェクト・ファイルを選択し、中央で編集、右ペインでプレビューと Linked Issues を確認する。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'editor'`（uiStore） |
| Props | なし |
| レイアウト | GlobalNav 表示・3 ペイン水平分割 |
| 主要ユースケース | 設計書の編集・保存・auto-commit / push・AI 編集レビュー遷移 |

---

## 2. レイアウト仕様

```
┌─────────────┬───────────────────────────────────┬──────────────────┐
│ GlobalNav   │                                   │                  │
│ （44px幅）  │        EditorPane                 │  RightSidebar    │
├──────┬──────┤   （flex: 1・min-width: 0）       │  （幅: 240px）   │
│Proj  │ Doc  │                                   │                  │
│Side  │ Tree │  SaveStatusBar                    │  MarkdownPreview │
│bar   │      │  MarkdownEditor                   │                  │
│(155  │(165  │  （CodeMirror 6）                 │  LinkedIssues    │
│ px)  │ px)  │                                   │  Panel           │
│      │      │                                   │                  │
└──────┴──────┴───────────────────────────────────┴──────────────────┘
```

> ★ v2.0: AiEditBanner を削除（aiEditStore 廃止）

| ペイン | 幅 | scroll |
|--------|-----|--------|
| ProjectSidebar | 155px 固定 | なし |
| DocumentTree | 165px 固定 | 縦スクロール |
| EditorPane | flex: 1（min-width: 0） | エディタ内部でスクロール |
| RightSidebar | 240px 固定 | 縦スクロール |

---

## 3. コンポーネントツリー

```
EditorScreen
  ├── ProjectSidebar                  # 左ペイン・プロジェクト一覧
  │     ├── ProjectList               # プロジェクト一覧（クリックで切替）
  │     │     └── ProjectListItem × N
  │     └── ProjectSyncStatus        # "● synced · main" / "● push failed" 等
  ├── DocumentTree                    # ファイルツリーペイン
  │     ├── TreeHeader               # "FILES · {projectName}"
  │     └── TreeNode × N             # ディレクトリ / ファイル
  ├── EditorPane                      # 中央ペイン
  │     ├── EditorToolbar            # ファイル名・Markdown ツールバーボタン
  │     ├── ~~AiEditBanner~~         # ★ v2.0 削除（aiEditStore 廃止）
  │     ├── LineNumbers              # 行番号カラム
  │     ├── MarkdownEditor           # CodeMirror 6 本体
  │     └── SaveStatusBar            # 下部ステータスバー
  ├── RightSidebar
  │     ├── PreviewHeader            # "PREVIEW" ラベル
  │     ├── MarkdownPreview          # react-markdown
  │     ├── LinkedIssuesPanel        # Linked Issues 一覧
  │     │     └── LinkedIssueItem × N
  │     └── ~~AiEditBannerRight~~    # ★ v2.0 削除（aiEditStore 廃止）
  └── UnsavedWarningModal            # uiStore.activeModal 経由で表示
```

---

## 4. 状態設計

### 4.1 ストア参照

```typescript
// EditorScreen.tsx 内

// projectStore
const projects = useProjectStore(s => s.projects)
const activeProject = useProjectStore(s => s.activeProject())
const activeStatus = useProjectStore(s => s.activeStatus())

// documentStore
const documents = useDocumentStore(s => s.documents)
const openedDocument = useDocumentStore(s => s.openedDocument)
const editorContent = useDocumentStore(s => s.editorContent)
const saveStatuses = useDocumentStore(s => s.saveStatuses)
const linkedIssues = useDocumentStore(s => s.linkedIssues)
const linkedIssuesStatus = useDocumentStore(s => s.linkedIssuesStatus)
const currentSaveStatus = useDocumentStore(s => s.currentSaveStatus())
const hasUnsavedChanges = useDocumentStore(s => s.hasUnsavedChanges())

// aiEditStore（★ v2.0 削除: aiEditStore 廃止・pendingBranches 不要）

// uiStore
const isProjectSwitching = useUiStore(s => s.isProjectSwitching)
```

### 4.2 ローカル state

EditorScreen はローカル state を持たない。全状態はストア経由。

ただし **デバウンスタイマー** のみ `useRef` で保持する。

```typescript
const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const DEBOUNCE_MS = 1000   // settings_get('editor.debounce_ms') から取得（デフォルト 1000）
const MAX_DEBOUNCE_MS = 5000
```

---

## 5. 各コンポーネントの詳細仕様

---

### 5.1 ProjectSidebar

**ProjectListItem の状態表示**

| 状態 | 表示 |
|------|------|
| アクティブ | 左ボーダー（2.5px ink）+ 背景色変化 |
| 未保存あり | 右端に黄色 `●` |
| 非アクティブ | テキスト色: `inkL` |

**プロジェクト切替の処理**

```typescript
const handleProjectClick = async (projectId: number) => {
  if (projectId === activeProject?.id) return

  // 未保存チェック
  if (hasUnsavedChanges) {
    const result = await uiStore.showModal({
      type: 'unsaved_warning',
      filename: openedDocument?.path.split('/').pop() ?? '',
    })
    if (result === 'cancel') return
    if (result === 'save') {
      await documentStore.saveDocument()
    }
    // 'discard' はそのまま切り替え
  }
  // projectStore.setActiveProject が isProjectSwitching=true/false を管理
  await projectStore.setActiveProject(projectId)
}
```

**ProjectSyncStatus**

ProjectSidebar 下部に常時表示。

```typescript
interface ProjectSyncStatusProps {
  status: 'synced' | 'pending_push' | 'push_failed' | 'conflict'
  branch: string
  lastSyncedAt: string | null  // "2 min ago" 等の相対表記
}
```

| status | 表示 | 色 |
|--------|------|-----|
| `synced` | `● synced · {branch}` | 緑 |
| `pending_push` | `◌ pushing…` | 黄 |
| `push_failed` | `✕ push failed` | 赤 |
| `conflict` | `⚠ conflict` | 赤 |

---

### 5.2 DocumentTree

**ツリーノードの種別**

```typescript
type TreeNodeType = 'dir' | 'file'

interface TreeNode {
  id: number | null    // dir は null・file は document.id
  path: string
  name: string
  type: TreeNodeType
  depth: number        // インデント計算用（0-based）
  isExpanded?: boolean // dir のみ
  pushStatus?: 'synced' | 'pending_push' | 'push_failed'  // file のみ
  isDirty?: boolean    // file のみ
}
```

**Documents → TreeNode 変換ロジック**

```typescript
// documents の path（例: "docs/overview.md"）をディレクトリ構造にパース
function buildTree(documents: Document[]): TreeNode[] {
  const tree: TreeNode[] = []
  const dirSet = new Set<string>()

  // パスをソートして処理
  const sorted = [...documents].sort((a, b) => a.path.localeCompare(b.path))

  for (const doc of sorted) {
    const parts = doc.path.split('/')
    // ディレクトリノード追加
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/')
      if (!dirSet.has(dirPath)) {
        dirSet.add(dirPath)
        tree.push({ id: null, path: dirPath, name: parts[i], type: 'dir', depth: i, isExpanded: true })
      }
    }
    // ファイルノード追加
    tree.push({
      id: doc.id,
      path: doc.path,
      name: parts[parts.length - 1],
      type: 'file',
      depth: parts.length - 1,
      pushStatus: doc.pushStatus,
      isDirty: doc.isDirty,
    })
  }
  return tree
}
```

**ファイルノードのインジケーター**

| 状態 | 表示 | 色 |
|------|------|-----|
| アクティブ | 背景色変化 + テキスト色 ink | — |
| `isDirty` | ファイル名右に `●` | 黄 |
| `pushStatus='push_failed'` | ファイル名右に `✕` | 赤 |

**ディレクトリの開閉**

- クリックで `isExpanded` トグル（ローカル state で管理）
- 初期状態: 全ディレクトリ展開

---

### 5.3 MarkdownEditor（CodeMirror 6）

**セットアップ**

```typescript
// src/components/editor/MarkdownEditor.tsx

import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'

const extensions = [
  markdown(),
  lineNumbers(),
  history(),
  syntaxHighlighting(defaultHighlightStyle),
  keymap.of([
    ...defaultKeymap,
    ...historyKeymap,
    { key: 'Mod-s', run: () => { onSave(); return true } },
  ]),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      onChange(update.state.doc.toString())
    }
  }),
  EditorView.theme({
    '&': { height: '100%', fontSize: '13px', fontFamily: 'Courier New, monospace' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-content': { padding: '12px 14px' },
  }),
]
```

**Props**

```typescript
interface MarkdownEditorProps {
  content: string
  scrollToLine?: number | null   // SearchScreen の openInEditor から渡す
  onChange: (content: string) => void
  onSave: () => void
  readOnly?: boolean
}
```

**content の同期方針**

CodeMirror は内部状態（Transaction）で変更を管理するため、外部から `content` prop が変わったときのみ `setState` する（毎 render で書き込むとカーソルが飛ぶ）。

```typescript
useEffect(() => {
  if (!viewRef.current) return
  const currentContent = viewRef.current.state.doc.toString()
  if (currentContent !== content) {
    viewRef.current.dispatch({
      changes: { from: 0, to: currentContent.length, insert: content },
    })
  }
}, [content])
// ※ ファイル切り替え時（openDocument 後）のみ発火させるため、
//    依存配列に openedDocument.id も含める
```

**scrollToLine の実装**

```typescript
useEffect(() => {
  if (!scrollToLine || !viewRef.current) return
  const pos = viewRef.current.state.doc.line(scrollToLine).from
  viewRef.current.dispatch({
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    selection: { anchor: pos },
  })
}, [scrollToLine])
```

---

### 5.4 自動保存（デバウンス）の詳細

**onChange → saveDocument のフロー**

```typescript
// EditorScreen.tsx

const handleEditorChange = (content: string) => {
  documentStore.setEditorContent(content)

  // 最初の変更時のみ document_set_dirty を呼ぶ
  if (!openedDocument?.isDirty) {
    documentStore.setDirty(activeProject!.id, openedDocument!.id, true)
  }

  // sync_mode = 'manual' の場合はデバウンス保存しない
  if (activeProject?.syncMode === 'manual') return

  // デバウンス: 1秒後に保存
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  saveTimerRef.current = setTimeout(() => {
    documentStore.saveDocument()
  }, DEBOUNCE_MS)
}

// Cmd+S: 即時保存（デバウンスキャンセル）
const handleManualSave = () => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  documentStore.saveDocument()
}
```

**saveDocument の内部フロー（documentStore）**

```typescript
saveDocument: async () => {
  const { openedDocument, editorContent } = get()
  if (!openedDocument) return null

  const projectId = openedDocument.projectId
  const documentId = openedDocument.id

  // SHA 比較（未変更なら skip）
  if (editorContent === openedDocument.content) return null

  set(s => ({ saveStatuses: { ...s.saveStatuses, [documentId]: 'committing' } }))

  try {
    const result = await invoke<SaveResult>('document_save', {
      project_id: projectId,
      document_id: documentId,
      content: editorContent,
    })
    // 成功 → doc_save_progress イベントで 'done' に更新される
    return result
  } catch (e) {
    const err = handleError(e, 'document_save')
    set(s => ({ saveStatuses: { ...s.saveStatuses, [documentId]: 'failed' } }))
    if (err.code === 'GitHubAuthRequired') {
      useUiStore.getState().showModal({ type: 'github_auth_required' })
    }
    return null
  }
}
```

**doc_save_progress イベントのステージ遷移**

| stage | saveStatus | SaveStatusBar 表示 |
|-------|-----------|-------------------|
| `committing` | `'committing'` | `◌ committing…` |
| `pushing` | `'pushing'` | `◌ pushing…` |
| `done` | `'done'` | `● synced · {branch}` |
| `push_failed` | `'failed'` | `✕ push failed · retry?` |

---

### 5.5 SaveStatusBar

エディタ下部の固定ステータスバー（高さ: 18px）。

```typescript
interface SaveStatusBarProps {
  saveStatus: SaveStatus       // documentStore.currentSaveStatus()
  syncStatus: string           // projectStore.activeStatus()
  pushStatus: string           // openedDocument.pushStatus
  filename: string
  encoding: 'UTF-8'
  lineCount: number
  currentLine: number
  onRetryPush: () => void
}
```

**左側（ファイル情報）**: `Markdown · UTF-8 · Ln {currentLine}`  
**右側（保存状態）**: 下表

| saveStatus / pushStatus | 表示テキスト | 色 |
|------------------------|------------|-----|
| `idle` + `synced` | `● synced · main` | 緑 |
| `committing` | `◌ committing…` | 黄 |
| `pushing` | `◌ pushing…` | 黄 |
| `done` | `● synced · main` | 緑（2秒後に通常表示に戻る） |
| `failed` / `push_failed` | `✕ push failed · [RETRY]` | 赤 + RETRY ボタン |
| `idle` + isDirty | `● unsaved` | 黄 |

---

---

### 5.6 AiEditBanner — **廃止（v2.0）**

> **廃止理由**: aiEditStore・ai_edit_branches テーブルの廃止にともない、EditorScreen の「⚠ AI updated」バナーは不要になった。Claude Code による設計書変更のレビューは、Terminal 完了後の PR 作成フローを経て PRScreen の Design Docs タブで行う。

**削除するファイル**
- `src/components/editor/AiEditBanner.tsx`
- `src/components/editor/AiEditBannerRight.tsx`

---

### 5.7 LinkedIssuesPanel

右サイドバー下部。アクティブドキュメントに紐づく Issue 一覧。

```typescript
interface LinkedIssuesPanelProps {
  issues: Issue[]
  isLoading: boolean
  onOpenIssue: (issueId: number) => void
  onLinkIssue: () => void     // FilePicker でドキュメント→Issue 逆引き
}
```

**openDocument 時の LinkedIssues ロード**

```typescript
// documentStore.openDocument の末尾
await get().loadLinkedIssues(projectId, documentId)
```

**LinkedIssueItem の表示**

```
◆ #43  feat: Auto git-commit on save   [open]
◆ #41  chore: Setup basic CI           [open]
+ link issue
```

**`+ link issue` クリック時**

```typescript
const handleLinkIssue = async () => {
  // Issue 一覧をピッカーで表示（uiStore.openFilePicker の Issue 版）
  // Phase 1 では issue_list からシンプルな選択ダイアログで実装
  const issueId = await uiStore.showModal({ type: 'issue_picker' })
  if (issueId) {
    await invoke('issue_doc_link_add', {
      project_id: activeProject!.id,
      issue_id: issueId,
      document_id: openedDocument!.id,
    })
    await documentStore.loadLinkedIssues(activeProject!.id, openedDocument!.id)
  }
}
```

---

### 5.8 UnsavedWarningModal

`uiStore.showModal({ type: 'unsaved_warning', filename })` で表示。Promise を返す。

```typescript
// 表示内容
// ⚠ 未保存の変更があります
// {filename} の変更が保存されていません。
// [保存して切替]  [破棄]  [キャンセル]
```

| ボタン | 戻り値 | 処理 |
|--------|--------|------|
| 保存して切替 | `'save'` | `saveDocument()` → プロジェクト切替 |
| 破棄 | `'discard'` | 変更を破棄してプロジェクト切替 |
| キャンセル | `'cancel'` | 何もしない |

---

## 6. キーボードショートカット

| ショートカット | 動作 |
|-------------|------|
| `Cmd+S` / `Ctrl+S` | 即時保存（デバウンスキャンセル） |
| `Cmd+Z` / `Ctrl+Z` | Undo（CodeMirror 内部） |
| `Cmd+Shift+Z` / `Ctrl+Y` | Redo（CodeMirror 内部） |
| `Cmd+F` / `Ctrl+F` | ページ内検索（CodeMirror 標準） |

---

## 7. mount / unmount 処理

**mount 時**

```typescript
useEffect(() => {
  const project = projectStore.activeProject()
  if (!project) return

  // 1. ドキュメント一覧を取得
  documentStore.loadDocuments(project.id)

  // 2. 最後に開いたドキュメントを復元
  if (project.lastOpenedDocumentId) {
    documentStore.openDocument(project.id, project.lastOpenedDocumentId)
  }

  // 3. polling が未開始なら開始
  invoke('polling_start', { project_id: project.id })
}, [])
```

**unmount 時**

```typescript
useEffect(() => {
  return () => {
    // デバウンスタイマーをクリア
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    // 未保存の内容がある場合は強制保存（sync_mode='auto' のみ）
    if (hasUnsavedChanges && activeProject?.syncMode === 'auto') {
      documentStore.saveDocument()
    }
  }
}, [])
```

---

## 8. isProjectSwitching 中の表示

`uiStore.isProjectSwitching === true` の間は EditorPane と RightSidebar の上にオーバーレイを表示してインタラクションをブロックする。

```typescript
// AppShell が管理するため EditorScreen 側では対応不要
// ただし isProjectSwitching 中は DocumentTree・MarkdownEditor を disabled 扱いにする
<MarkdownEditor
  content={editorContent}
  readOnly={isProjectSwitching}
  ...
/>
```

---

## 9. エラーハンドリング

| エラー | 表示場所 | 対応 |
|--------|---------|------|
| `document_save` 失敗（`Git`） | SaveStatusBar の push_failed 表示 | RETRY ボタン → `retryPush()` |
| `GitHubAuthRequired` | UnsavedWarningModal と同様のモーダル | Settings 画面への誘導 |
| `document_list` 失敗 | DocumentTree にエラーメッセージ | RELOAD ボタン |
| `openDocument` 失敗（`NotFound`） | EditorPane 中央に「ファイルが見つかりません」 | DocumentTree から再選択 |

---

## 10. ファイル一覧

```
src/screens/EditorScreen.tsx
src/components/editor/ProjectSidebar.tsx
src/components/editor/ProjectListItem.tsx
src/components/editor/ProjectSyncStatus.tsx
src/components/editor/DocumentTree.tsx
src/components/editor/TreeNode.tsx
src/components/editor/EditorPane.tsx
src/components/editor/EditorToolbar.tsx
src/components/editor/MarkdownEditor.tsx         ← CodeMirror 6 ラッパー
~~src/components/editor/AiEditBanner.tsx~~       ← ★ v2.0 廃止
~~src/components/editor/AiEditBannerRight.tsx~~  ← ★ v2.0 廃止
src/components/editor/SaveStatusBar.tsx
src/components/editor/RightSidebar.tsx
src/components/editor/MarkdownPreview.tsx
src/components/editor/LinkedIssuesPanel.tsx
src/components/editor/LinkedIssueItem.tsx
src/components/shared/UnsavedWarningModal.tsx    ← ConflictScreen でも流用
```

---

## 11. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | sync_mode='manual' 時の手動 SYNC ボタンの配置場所 | SaveStatusBar 右端に「SYNC」ボタンを追加。`document_save` を直接呼ぶ |
| U-02 | 複数ファイル連続保存時のコミットまとめ（push 保留）ロジック | Rust 側 `document_save` が push を debounce して内部でまとめる方針を採用（フロントは 1 ファイルずつ invoke） |
| U-03 | MarkdownPreview のスクロール同期（エディタ ↔ プレビュー） | Phase 2 以降。Phase 1 ではプレビューは独立スクロール |
| U-04 | DocumentTree のファイル右クリックメニュー（削除・リネーム等） | Phase 2 以降。Phase 1 では選択のみ |
