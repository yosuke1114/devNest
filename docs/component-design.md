---
title: "コンポーネント設計"
doc_type: module_structure
version: "1.0.0"
last_synced_commit: null
status: superseded

> **注意**: このドキュメントは `docs/08-ui-component-design.md` に置き換えられました。
> 最新の UI コンポーネント設計は 08-ui-component-design.md を参照してください（2026-03-14 実装完了）。
mapping:
  sources:
    - path: "src/components/"
      scope: directory
      description: "全 React コンポーネント"
    - path: "src/screens/"
      scope: directory
      description: "画面コンポーネント"
tags: [frontend, react, components]
---

# DevNest — 画面別コンポーネント設計書

**バージョン**: 2.0
**作成日**: 2026-03-07
**改訂日**: 2026-03-08（要件変更対応）
**対象**: フロントエンド（React + TypeScript）
**前提資料**: ストア設計書 v4.0 / DB スキーマ設計書 v2.0 / ユーザーシナリオ S-01〜S-11（S-05 改訂版）
**変更履歴**: v1.0 → v2.0：SyncDiffScreen 廃止・AiEditBanner 削除・EditorScreen の aiEditStore 依存削除・TerminalScreen の PRReadyBanner 遷移先変更・PRScreen に Design Docs タブ追加・コンポーネントマトリクス更新

---

## 1. 設計方針

### 1.1 コンポーネント分類

| 分類 | 命名 | 責務 |
|------|------|------|
| **Screen** | `{Name}Screen` | ルーティングの単位。ストアと接続する唯一の層。Props はほぼ持たない |
| **Panel** | `{Name}Panel` | Screen 内の大きな区画。独立したスクロール・状態を持つ |
| **Feature** | `{Name}{機能}` | 特定機能に特化したコンポーネント。ストア参照可 |
| **UI** | `{Name}` / `{Name}Item` | 汎用 UI パーツ。ストアに依存しない。Props で完全制御 |
| **Modal** | `{Name}Modal` | `uiStore.activeModal` 経由で表示するオーバーレイ |

### 1.2 Props 設計の原則

- **Screen は Props を持たない**（ストアから全て読む）
- **UI コンポーネントはストア非依存**（`onXxx` コールバックで上位に委譲）
- **非同期ステータスは Screen / Feature 層で吸収**（UI へは `isLoading / isError / data` を渡す）
- **型は `src/types/` に集約**し、Props 型は `interface {Name}Props` で定義する

### 1.3 ファイル構成

```
src/
  screens/
    SetupScreen.tsx
    EditorScreen.tsx
    IssuesScreen.tsx
    TerminalScreen.tsx
    ~~SyncDiffScreen.tsx~~  # ★ v2.0 廃止（PRScreen に統合）
    PRScreen.tsx
    ConflictScreen.tsx
    SearchScreen.tsx
    NotificationsScreen.tsx
    SettingsScreen.tsx
  components/
    layout/
      GlobalNav.tsx
      AppShell.tsx
    editor/
      DocumentTree.tsx
      MarkdownEditor.tsx
      LinkedIssuesPanel.tsx
      ~~AiEditBanner.tsx~~  # ★ v2.0 廃止（aiEditStore 廃止にともない削除）
      UnsavedWarningModal.tsx
      SaveStatusBar.tsx
    issues/
      IssueList.tsx
      IssueListItem.tsx
      IssueDetail.tsx
      AIWizard.tsx
      WizardStep{1-5}.tsx
      DocLinkPanel.tsx
    pr/
      PRList.tsx
      PRListItem.tsx
      PRDetail.tsx
      DiffViewer.tsx
      InlineComment.tsx
      ReviewPanel.tsx
      MergePanel.tsx
      TabDesignDocs.tsx       # ★ v2.0 追加（Phase 4）
      DocDiffViewer.tsx       # ★ v2.0 追加（Phase 4）
      DocDiffHeader.tsx       # ★ v2.0 追加（Phase 4）
      DocFileDiff.tsx         # ★ v2.0 追加（Phase 4）
      RequestChangesPanel.tsx # ★ v2.0 追加（Phase 4）
    terminal/
      TerminalPane.tsx
      PRReadyBanner.tsx       # ★ v2.0 変更（遷移先: sync-diff → pr）
      PRCreateModal.tsx       # ★ v2.0 変更（aiEditStore → prStore）
    ~~sync-diff/~~            # ★ v2.0 廃止（ディレクトリごと削除）
      ~~SyncDiffSidebar.tsx~~
      ~~AiEditDiffViewer.tsx~~
      ~~RejectInputModal.tsx~~
    conflict/
      ConflictFileList.tsx
      ConflictBlockEditor.tsx
    search/
      SearchBar.tsx
      SearchResults.tsx
      SearchResultItem.tsx
      DocumentPreview.tsx
    notifications/
      NotificationList.tsx
      NotificationItem.tsx
    settings/
      SectionGitHub.tsx
      SectionAI.tsx
      SectionSync.tsx
      SectionAppearance.tsx
      SectionDanger.tsx
    shared/
      StatusPill.tsx
      AsyncButton.tsx
      FilePicker.tsx
      IndexProgressBar.tsx
```

---

## 2. レイアウト・共通コンポーネント

---

### 2.1 AppShell

アプリ全体のルートレイアウト。`uiStore.currentScreen` に応じて Screen を切り替える。

```typescript
// Props: なし（ストアのみ）
interface AppShellState {
  currentScreen: Screen    // uiStore
  isProjectSwitching: boolean  // uiStore
  activeModal: Modal | null    // uiStore
}
```

**責務**
- `initListeners()` の呼び出し（アプリ起動時 1 回）
- `currentScreen` に応じた Screen のレンダリング
- `activeModal` に応じたモーダルのレンダリング
- `isProjectSwitching` 中はグローバルローディングオーバーレイを表示

```tsx
// 擬似実装
export function AppShell() {
  const { currentScreen, isProjectSwitching, activeModal } = useUiStore()

  useEffect(() => { initListeners() }, [])

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <GlobalNav />
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isProjectSwitching && <SwitchingOverlay />}
        {SCREEN_MAP[currentScreen]}
      </main>
      {activeModal && <ModalRenderer modal={activeModal} />}
    </div>
  )
}
```

---

### 2.2 GlobalNav

左端の縦型ナビゲーションバー。

```typescript
interface GlobalNavProps {
  // Props なし（uiStore・notificationStore・projectStore から読む）
}
```

**表示要素**

| 要素 | 参照ストア | 条件 |
|------|----------|------|
| プロジェクト切替ドロップダウン | `projectStore.projects` | 常時 |
| Editor アイコン | `uiStore` | 常時 |
| Issues アイコン | `uiStore` | 常時 |
| PR アイコン | `uiStore` | 常時 |
| Terminal アイコン | `uiStore` | 常時 |
| Search アイコン | `uiStore` | 常時 |
| Conflict アイコン + バッジ | `uiStore.conflictBadge` | `conflictBadge=true` 時に赤バッジ |
| Notifications アイコン + バッジ | `notificationStore.unreadCount` | `unreadCount > 0` 時に数字バッジ |
| Settings アイコン | `uiStore` | 常時 |

**責務**
- アイコンクリック → `uiStore.navigate(screen)`
- プロジェクト切替 → `projectStore.setActiveProject(id)`（未保存チェックは `setActiveProject` 内部で処理）

---

## 3. Screen 別コンポーネント設計

---

### 3.1 SetupScreen

新規プロジェクト登録ウィザード（5 ステップ）。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `projectStore` | `createProject()`, `updateProject()`, `buildIndex()` |
| `githubAuthStore` | `startAuth()`, `user`, `authStatus` |
| `uiStore` | `setupStep`, `advanceSetupStep()`, `setSetupStep()`, `indexProgress`, `indexingInProgress`, `navigate()` |

**子コンポーネント構成**

```
SetupScreen
  ├── SetupStepDots          # ステップ進捗ドット表示（Props: currentStep, totalSteps）
  ├── SetupStep1Project      # プロジェクト名・ローカルパス入力
  ├── SetupStep2GitHub       # GitHub OAuth 接続
  ├── SetupStep3Sync         # sync_mode / ai_branch_policy 設定
  ├── SetupStep4Index        # BUILD INDEX ボタン + IndexProgressBar
  ├── SetupStep5Notify       # OS 通知許可
  └── SetupStep6Done         # 完了画面 → OPEN EDITOR ボタン
```

**各ステップの Props**

```typescript
interface SetupStep1Props {
  name: string
  localPath: string
  onNameChange: (v: string) => void
  onLocalPathChange: (v: string) => void
  onNext: () => void
}

interface SetupStep2Props {
  authStatus: 'idle' | 'waiting_callback' | 'success' | 'error'
  user: GitHubUser | null
  onConnect: () => void
  onSkip: () => void
}

interface SetupStep3Props {
  syncMode: 'auto' | 'manual'
  aiBranchPolicy: 'separate' | 'direct'
  onSyncModeChange: (v: 'auto' | 'manual') => void
  onAiBranchPolicyChange: (v: 'separate' | 'direct') => void
  onNext: () => void
}

interface SetupStep4Props {
  isIndexing: boolean
  progress: { done: number; total: number; currentPath: string | null }
  onBuildIndex: () => void
  onNext: () => void
}

interface SetupStep5Props {
  permissionStatus: 'granted' | 'denied' | 'skipped' | 'unknown'
  onRequest: () => void
  onSkip: () => void
}

interface SetupStepDotsProps {
  currentStep: number  // 0-based
  totalSteps: number
  labels: string[]
}
```

---

### 3.2 EditorScreen

設計書エディタ。左：プロジェクト・ファイルツリー、中央：Markdown エディタ、右：プレビュー + Linked Issues。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `projectStore` | `projects`, `activeProject()`, `activeStatus()` |
| `documentStore` | `documents`, `openedDocument`, `editorContent`, `currentSaveStatus()`, `hasUnsavedChanges()`, `openDocument()`, `setEditorContent()`, `saveDocument()`, `linkedIssues`, `loadLinkedIssues()` |
| ~~`aiEditStore`~~ | **★ v2.0 削除**（aiEditStore 廃止・AiEditBanner 削除） |
| `uiStore` | `navigate()`, `isProjectSwitching` |

**子コンポーネント構成**

```
EditorScreen
  ├── ProjectSidebar                   # 左ペイン（幅: 200px 固定）
  │     ├── ProjectSelector            # プロジェクト切替ドロップダウン
  │     └── DocumentTree               # ファイルツリー
  ├── EditorPane                       # 中央ペイン（flex: 1）
  │     ├── ~~AiEditBanner~~           # ★ v2.0 削除（aiEditStore 廃止）
  │     ├── SaveStatusBar              # 保存・push ステータスバー
  │     ├── MarkdownEditor             # CodeMirror 6 エディタ
  │     └── UnsavedWarningModal        # プロジェクト切替時の未保存警告
  └── RightSidebar                     # 右ペイン（幅: 240px）
        ├── MarkdownPreview            # プレビュー（react-markdown）
        └── LinkedIssuesPanel          # Linked Issues 一覧
```

**子コンポーネントの Props**

```typescript
// DocumentTree
interface DocumentTreeProps {
  documents: Document[]
  activeDocumentId: number | null
  isLoading: boolean
  onSelect: (documentId: number) => void
}

// MarkdownEditor
interface MarkdownEditorProps {
  content: string
  scrollToLine?: number | null        // searchStore.openInEditor から渡す
  onChange: (content: string) => void
  onSave: () => void                  // Cmd+S
  readOnly?: boolean
}

// ★ v2.0 削除: AiEditBanner（aiEditStore 廃止にともない削除）

// SaveStatusBar
interface SaveStatusBarProps {
  saveStatus: SaveStatus              // documentStore.currentSaveStatus()
  syncStatus: 'synced' | 'dirty' | 'pushing' | 'conflict'  // projectStore.activeStatus()
  pushStatus: 'synced' | 'pending_push' | 'push_failed'    // openedDocument.pushStatus
  onRetryPush: () => void
}

// LinkedIssuesPanel
interface LinkedIssuesPanelProps {
  issues: Issue[]
  isLoading: boolean
  onOpenIssue: (issueId: number) => void   // → uiStore.navigate('issues')
  onAddLink: () => void                    // → uiStore.openFilePicker 的な逆引き（Doc→Issue）
}

// UnsavedWarningModal（uiStore.activeModal 経由で表示）
interface UnsavedWarningModalProps {
  filename: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}
```

---

### 3.3 IssuesScreen

Issue 一覧・詳細・AI Wizard を管理する画面。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `issueStore` | `issues`, `listStatus`, `activeIssueId`, `wizardOpen`, `wizardStep`, `openIssues()`, `loadIssues()`, `setActiveIssue()`, `openWizard()`, `closeWizard()` |
| `projectStore` | `activeProject()` |
| `uiStore` | `navigate()` |

**子コンポーネント構成**

```
IssuesScreen
  ├── IssueFilterBar                   # ステータス・ラベル・マイルストーン・テキスト絞り込み
  ├── IssueList                        # 左ペイン：一覧
  │     └── IssueListItem × N
  ├── IssueDetail                      # 右ペイン：詳細（activeIssueId が null の場合は空状態）
  │     ├── IssueHeader                # タイトル・ステータス・番号
  │     ├── IssueBody                  # 本文（Markdown レンダリング）
  │     ├── DocLinkPanel               # 紐づき設計書一覧 + リンク追加
  │     └── IssueActions               # LAUNCH TERMINAL ボタン等
  └── AIWizard                         # wizardOpen=true 時にフルスクリーン表示
        ├── WizardStep1Input
        ├── WizardStep2Search
        ├── WizardStep3Draft
        ├── WizardStep4Edit
        └── WizardStep5Filed
```

**Props**

```typescript
// IssueListItem
interface IssueListItemProps {
  issue: Issue
  isActive: boolean
  onClick: (issueId: number) => void
}

// IssueFilterBar
interface IssueFilterBarProps {
  statusFilter: string
  labelFilter: string
  milestoneFilter: string
  searchText: string
  onStatusChange: (v: string) => void
  onLabelChange: (v: string) => void
  onMilestoneChange: (v: string) => void
  onSearchChange: (v: string) => void
}

// IssueDetail
interface IssueDetailProps {
  issue: Issue
  docLinks: IssueDocLinkWithDoc[]
  docLinksStatus: AsyncStatus
  onLaunchTerminal: () => void         // setActiveIssue → navigate('terminal')
  onAddDocLink: (documentId: number) => void
  onRemoveDocLink: (documentId: number) => void
  onOpenDocument: (documentId: number) => void
}

// DocLinkPanel
interface DocLinkPanelProps {
  links: IssueDocLinkWithDoc[]
  isLoading: boolean
  onAdd: () => void                    // → uiStore.openFilePicker()
  onRemove: (documentId: number) => void
  onOpen: (documentId: number) => void
}

// IssueActions
interface IssueActionsProps {
  issue: Issue
  onLaunchTerminal: () => void
  onNewWithAI: () => void
}
```

**AIWizard の Props（各ステップ）**

```typescript
// WizardStep1Input
interface WizardStep1Props {
  inputText: string                    // issueStore.wizardInputText
  onInputChange: (text: string) => void
  onNext: () => void                   // searchContext() → setWizardStep(2)
  onCancel: () => void
}

// WizardStep2Search
interface WizardStep2Props {
  chunks: ContextChunk[]
  isLoading: boolean
  onNext: () => void                   // generateDraft() → setWizardStep(3)
  onBack: () => void
}

// WizardStep3Draft
interface WizardStep3Props {
  streamBuffer: string                 // リアルタイム表示
  isStreaming: boolean                 // generateStatus === 'loading'
  onStop: () => void                   // issue_draft_cancel（streaming 中断）
  onRegenerate: () => void             // generateDraft() 再実行
  onNext: () => void
  onBack: () => void
}

// WizardStep4Edit
interface WizardStep4Props {
  draft: IssueDraft
  labels: GitHubLabel[]
  labelsStatus: AsyncStatus
  onTitleChange: (title: string) => void
  onLabelsChange: (labels: string[]) => void
  onAssigneeChange: (login: string | null) => void
  onNext: () => void                   // submitIssue()
  onBack: () => void
}

// WizardStep5Filed
interface WizardStep5Props {
  issue: Issue                         // 作成された Issue
  onLaunchTerminal: () => void
  onClose: () => void
}
```

---

### 3.4 TerminalScreen

Claude Code PTY セッションを表示・操作する画面。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `terminalStore` | `session`, `outputLog`, `startStatus`, `readyBranch`, `hasDocChanges`, `showPrReadyBanner`, `startSession()`, `sendInput()`, `stopSession()` |
| `issueStore` | `activeIssueId`, `issueById()` |
| ~~`aiEditStore`~~ | **★ v2.0 削除**（`createPrFromBranch` は `prStore` に移管） |
| `prStore` | `createPrFromBranch()`, `setActiveTab()` |
| `projectStore` | `activeProjectId` |
| `uiStore` | `navigate()` |

**子コンポーネント構成**

```
TerminalScreen
  ├── TerminalHeader                   # Issue 番号表示・STOP ボタン
  ├── TerminalPane                     # xterm.js レンダリング領域（リサイズ可）
  ├── PRReadyBanner                    # showPrReadyBanner=true 時に表示
  └── PRCreateModal                    # PR 作成フォーム（モーダル）
```

**Props**

```typescript
// TerminalPane
interface TerminalPaneProps {
  outputLog: string                    // xterm.js の write に流す
  isRunning: boolean                   // session.status === 'running'
  height: number                       // リサイズ可能な高さ（px）
  onInput: (data: string) => void      // xterm.js onData → terminalStore.sendInput
  onResize: (height: number) => void
}

// TerminalHeader
interface TerminalHeaderProps {
  issueNumber: number | null
  issueTitle: string | null
  isRunning: boolean
  onStop: () => void                   // terminalStore.stopSession()
  onStart: () => void                  // terminalStore.startSession()
}

// PRReadyBanner（★ v2.0 変更）
interface PRReadyBannerProps {
  branchName: string
  hasDocChanges: boolean               // ★ v2.0 追加
  onCreatePR: () => void               // PRCreateModal を開く
  onReviewChanges: () => void          // ★ v2.0: 旧 onViewDiff → PRScreen Design Docs タブへ遷移
  onDismiss: () => void
}

// PRCreateModal（★ v2.0 変更）
interface PRCreateModalProps {
  branchName: string
  defaultTitle: string                 // Issue タイトルから生成
  defaultIssueNumber: number | null
  isLoading: boolean                   // prStore.createPrFromBranch 実行中（★ v2.0: aiEditStore → prStore）
  onSubmit: (title: string, issueNumber: number | null) => void
  onClose: () => void
}
```

**mount 時の処理**

```typescript
// TerminalScreen の useEffect
useEffect(() => {
  const { activeIssueId } = useIssueStore.getState()
  const { activeProjectId } = useProjectStore.getState()
  // session が未開始かつ activeIssueId がある場合は startSession
  if (!terminalStore.session && activeProjectId) {
    terminalStore.startSession(activeProjectId, activeIssueId ?? undefined)
  }
}, [])
```

---

---

### 3.5 SyncDiffScreen — **廃止（v2.0）**

> **廃止理由**: Claude Code が `feat/{issue-id}-xxx` 同一ブランチにコードと設計書を両方コミットする運用に変更したため、別ブランチのレビューを目的とした SyncDiffScreen は不要になった。設計書 diff の確認・承認・差し戻しはすべて PRScreen の **Design Docs タブ**（3.6節）に統合。

**削除するファイル**

- `src/screens/SyncDiffScreen.tsx`
- `src/components/sync-diff/SyncDiffSidebar.tsx`
- `src/components/sync-diff/AiEditDiffViewer.tsx`
- `src/components/sync-diff/RejectInputModal.tsx`

---

### 3.6 PRScreen

PR 一覧・詳細（Overview / Code Changes / **Design Docs**）・レビュー・マージを管理する画面。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `prStore` | `prs`, `listStatus`, `activePrId`, `activeTab`, `prDetail`, `codeDiffs`, `codeDiffStatus`, `docDiffs`, `docDiffStatus`, `requestChangesStatus`, `activePr()`, `canMerge()`, `commentsForLine()`, `prByBranchName()`, `loadPrs()`, `openPr()`, `setActivePr()`, `setActiveTab()`, `loadCodeDiff()`, `loadDocDiff()`, `addComment()`, `submitReview()`, `mergePr()`, `requestChanges()` |
| `issueStore` | `issueById()` |
| `projectStore` | `activeProjectId` |

**子コンポーネント構成**

```
PRScreen
  ├── PRFilterBar                      # ステータスフィルタ
  ├── PRList                           # 左ペイン：PR 一覧
  │     └── PRListItem × N
  └── PRDetail                         # 右ペイン：PR 詳細
        ├── PRDetailHeader             # タイトル・番号・ステータス・Linked Issue
        ├── PRDetailTabs               # Overview / Code Changes / Design Docs タブ
        ├── TabOverview                # (activeTab='overview')
        │     ├── PRDescriptionPanel   # 本文（Markdown）
        │     ├── ReviewList           # レビュー一覧
        │     ├── ReviewPanel          # Approve / REQUEST CHANGES ボタン（★ v2.0）
        │     ├── ChecksStatusBadge    # CI チェック状態
        │     └── MergePanel           # MERGE ボタン（canMerge() で活性制御）
        ├── TabCodeDiff                # (activeTab='code-diff') ★ v2.0: 旧 TabDiff
        │     └── DiffViewer
        │           └── FileDiff × N
        │                 └── DiffHunkWithComments
        │                       └── InlineComment × N
        └── TabDesignDocs              # (activeTab='design-docs') ★ v2.0 追加 Phase 4
              ├── DocDiffHeader        # 変更ファイル数・全体 +/- 統計
              ├── DocFileDiff × N      # .md ファイルごとの diff
              │     └── DiffHunk × N
              └── RequestChangesPanel  # REQUEST CHANGES → Terminal 遷移
```

**Props**

```typescript
// PRListItem
interface PRListItemProps {
  pr: PullRequest
  isActive: boolean
  onClick: (prId: number) => void
}

// PRDetailHeader
interface PRDetailHeaderProps {
  pr: PullRequest
  linkedIssue: Issue | null
}

// PRDetailTabs（★ v2.0: Design Docs タブ追加）
interface PRDetailTabsProps {
  activeTab: 'overview' | 'code-diff' | 'design-docs'
  hasDocChanges: boolean               // Design Docs タブに ● バッジを表示するか
  onTabChange: (tab: 'overview' | 'code-diff' | 'design-docs') => void
}

// MergePanel
interface MergePanelProps {
  canMerge: boolean
  mergeStatus: AsyncStatus
  mergeError: string | null
  onMerge: (method: 'merge' | 'squash' | 'rebase') => void
}

// DiffViewer（Code Changes タブ用、旧 TabDiff）
interface DiffViewerProps {
  fileDiffs: FileDiff[]
  isLoading: boolean
  comments: PrComment[]
  onAddComment: (params: CommentParams) => void
}

// InlineComment
interface InlineCommentProps {
  comment: PrComment
  isPending: boolean                   // comment.isPending → ⚠ アイコン表示
}

// ReviewPanel
interface ReviewPanelProps {
  reviews: PrReview[]
  reviewStatus: AsyncStatus
  onSubmitReview: (state: 'approved' | 'changes_requested', body?: string) => void
}

// ★ v2.0 追加: Design Docs タブ関連（Phase 4）

// DocDiffHeader
interface DocDiffHeaderProps {
  docDiffs: DocFileDiff[]              // 変更ファイル一覧
  totalAdditions: number
  totalDeletions: number
}

// DocFileDiff
interface DocFileDiffProps {
  diff: DocFileDiff
  isExpanded: boolean
  onToggleExpand: () => void
}

// RequestChangesPanel
interface RequestChangesPanelProps {
  requestChangesStatus: AsyncStatus
  requestChangesError: string | null
  onRequestChanges: (comment: string) => void  // prStore.requestChanges → Terminal 遷移
}
```

---

### 3.7 ConflictScreen

git コンフリクトの解消画面。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `conflictStore` | `managedFiles`, `unmanagedCount`, `listStatus`, `activeFileId`, `totalBlocks()`, `resolvedBlocks()`, `allResolved()`, `resolveAllStatus`, `resolveAllError`, `loadConflicts()`, `setActiveFile()`, `setBlockResolution()`, `resolveAllBlocks()`, `saveResolutions()`, `resolveAll()` |
| `projectStore` | `activeProjectId` |
| `uiStore` | `navigate()` |

**子コンポーネント構成**

```
ConflictScreen
  ├── ConflictHeader                   # 件数・進捗バー・SAVE & MERGE ボタン
  ├── ConflictFileList                 # 左ペイン：コンフリクトファイル一覧
  │     └── ConflictFileItem × N
  └── ConflictBlockEditor              # 右ペイン：ブロック単位の解消 UI
        ├── ConflictToolbar            # USE ALL MINE / USE ALL THEIRS ボタン
        └── ConflictBlock × N
              ├── OursSide             # HEAD 側コンテンツ
              ├── TheirsSide           # THEIRS 側コンテンツ
              └── ResolutionButtons    # USE MINE / USE THEIRS / MANUAL ボタン
```

**Props**

```typescript
// ConflictHeader
interface ConflictHeaderProps {
  totalBlocks: number
  resolvedBlocks: number
  allResolved: boolean
  resolveAllStatus: AsyncStatus
  resolveAllError: string | null
  unmanagedCount: number               // docs/ 外のファイル件数（情報表示）
  onSaveAndMerge: () => void
}

// ConflictFileItem
interface ConflictFileItemProps {
  file: ConflictFile
  isActive: boolean
  resolvedCount: number                // Object.keys(file.resolutions).length
  totalCount: number                   // file.conflictBlocks.length
  onClick: (fileId: number) => void
}

// ConflictBlock
interface ConflictBlockProps {
  block: ConflictBlock
  resolution: BlockResolution | undefined
  onResolve: (blockIndex: number, resolution: BlockResolution) => void
}

// ConflictToolbar
interface ConflictToolbarProps {
  fileId: number
  onUseAllMine: () => void             // resolveAllBlocks(fileId, 'ours')
  onUseAllTheirs: () => void           // resolveAllBlocks(fileId, 'theirs')
}
```

---

### 3.8 SearchScreen

設計書のキーワード・セマンティック検索画面。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `searchStore` | `query`, `searchType`, `results`, `searchStatus`, `activeResultDocumentId`, `history`, `historyStatus`, `setQuery()`, `setSearchType()`, `setActiveResult()`, `loadHistory()`, `openInEditor()` |
| `projectStore` | `activeProjectId` |

**子コンポーネント構成**

```
SearchScreen
  ├── SearchBar                        # クエリ入力・モード切替・サジェスト
  │     └── SearchSuggestions          # 履歴サジェストドロップダウン
  ├── SearchResultList                 # 左ペイン：検索結果一覧
  │     └── SearchResultItem × N
  └── DocumentPreview                  # 右ペイン：選択結果のプレビュー
        └── HighlightedChunk × N
```

**Props**

```typescript
// SearchBar
interface SearchBarProps {
  query: string
  searchType: 'keyword' | 'semantic' | 'both'
  history: SearchHistory[]
  isLoading: boolean
  onQueryChange: (query: string) => void
  onSearchTypeChange: (type: 'keyword' | 'semantic' | 'both') => void
  onSelectHistory: (query: string) => void
}

// SearchResultItem
interface SearchResultItemProps {
  result: SearchResult
  isActive: boolean
  keyword: string                      // ハイライト用
  onClick: (documentId: number) => void
}

// DocumentPreview
interface DocumentPreviewProps {
  result: SearchResult | null
  keyword: string
  onOpenInEditor: (documentId: number, startLine: number) => void
}

// HighlightedChunk
interface HighlightedChunkProps {
  chunk: MatchedChunk
  keyword: string                      // ハイライト対象文字列
}
```

---

### 3.9 NotificationsScreen

アプリ内通知の一覧・既読管理・画面遷移画面。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `notificationStore` | `notifications`, `unreadCount`, `listStatus`, `permissionStatus`, `loadNotifications()`, `markRead()`, `navigate()`, `requestPermission()` |
| `projectStore` | `activeProjectId` |

**子コンポーネント構成**

```
NotificationsScreen
  ├── NotificationHeader               # 未読数・MARK ALL READ ボタン・通知許可バナー
  └── NotificationList
        └── NotificationItem × N
```

**Props**

```typescript
// NotificationHeader
interface NotificationHeaderProps {
  unreadCount: number
  permissionStatus: 'granted' | 'denied' | 'skipped' | 'unknown'
  onMarkAllRead: () => void
  onRequestPermission: () => void
}

// NotificationItem
interface NotificationItemProps {
  notification: Notification
  onRead: (id: number) => void         // markRead
  onNavigate: (id: number) => void     // notificationStore.navigate
}
```

---

### 3.10 SettingsScreen

プロジェクト設定・GitHub 接続・AI 設定・外観設定画面。

```typescript
// Props: なし
```

**ストア参照**

| ストア | 参照フィールド / アクション |
|--------|--------------------------|
| `projectStore` | `activeProject()`, `updateProject()`, `deleteProject()`, `buildIndex()`, `pullLatest()` |
| `githubAuthStore` | `user`, `isConnected()`, `revokeAuth()`, `startAuth()`, `revokeStatus` |
| `uiStore` | `indexingInProgress`, `indexProgress` |

**子コンポーネント構成**

```
SettingsScreen
  ├── SettingsSidebar                  # セクションナビ（左ペイン）
  └── SettingsContent                  # 右ペイン（activeSection に応じて切替）
        ├── SectionGitHub              # GitHub OAuth 接続・解除
        ├── SectionAI                  # Anthropic API Key・Claude Code 検出
        ├── SectionSync                # sync_mode・debounce・commit_msg_format
        ├── SectionAppearance          # テーマ・フォントサイズ
        └── SectionDanger              # プロジェクト削除
```

**Props**

```typescript
// SectionGitHub
interface SectionGitHubProps {
  isConnected: boolean
  user: GitHubUser | null
  revokeStatus: AsyncStatus
  onConnect: () => void                // githubAuthStore.startAuth
  onRevoke: () => void                 // githubAuthStore.revokeAuth
}

// SectionSync
interface SectionSyncProps {
  syncMode: 'auto' | 'manual'
  debounceMs: number
  commitMsgFormat: string
  aiBranchPolicy: 'separate' | 'direct'
  autoDeleteAiBranch: boolean
  hasUnsaved: boolean
  onSave: (patch: ProjectPatch) => void
  onDiscard: () => void
}

// SectionDanger
interface SectionDangerProps {
  projectName: string
  onDelete: () => void                 // confirmModal → deleteProject
}
```

---

## 4. 共有 UI コンポーネント（src/components/shared/）

ストアに依存しない汎用パーツ。全て Props で完全制御する。

```typescript
// StatusPill: ステータスのバッジ表示
interface StatusPillProps {
  status: string
  variant: 'issue' | 'pr' | 'sync' | 'ai'
}

// AsyncButton: 非同期アクションボタン（ローディング・エラー状態を内包）
interface AsyncButtonProps {
  label: string
  loadingLabel?: string
  status: AsyncStatus
  disabled?: boolean
  variant?: 'primary' | 'danger' | 'ghost'
  onClick: () => void
}

// IndexProgressBar: インデックス構築の進捗バー
interface IndexProgressBarProps {
  done: number
  total: number
  currentPath: string | null
  isVisible: boolean
}

// FilePicker: ファイル選択モーダル（uiStore.openFilePicker から呼ばれる）
interface FilePickerProps {
  documents: Document[]
  onSelect: (documentId: number) => void
  onClose: () => void
}
```

---

## 5. モーダル一覧

`uiStore.activeModal.type` に応じて `AppShell` が表示する。

| type | コンポーネント | 返却値 |
|------|-------------|--------|
| `unsaved_warning` | `UnsavedWarningModal` | `'save'` \| `'discard'` \| `'cancel'` |
| `file_picker` | `FilePicker` | `documentId: number` \| `'cancel'` |
| `merge_confirm` | `MergeConfirmModal` | `'merge'` \| `'squash'` \| `'rebase'` \| `'cancel'` |
| `reject_input` | `RejectInputModal` | `{ reason, regenerate }` \| `'cancel'` |

---

## 6. コンポーネント × ストア依存マトリクス

| コンポーネント | project | githubAuth | document | issue | pr | ~~aiEdit~~ | terminal | conflict | search | notif | ui |
|--------------|:-------:|:----------:|:--------:|:-----:|:--:|:----------:|:--------:|:--------:|:------:|:-----:|:--:|
| AppShell | | | | | | | | | | | ✓ |
| GlobalNav | ✓ | | | | | | | | | ✓ | ✓ |
| SetupScreen | ✓ | ✓ | | | | | | | | | ✓ |
| EditorScreen | ✓ | | ✓ | | | ~~✓~~ → **削除** | | | | | ✓ |
| IssuesScreen | ✓ | | | ✓ | | | | | | | ✓ |
| TerminalScreen | ✓ | | | ✓ | ✓ | ~~✓~~ → **削除** | ✓ | | | | ✓ |
| ~~SyncDiffScreen~~ | ~~✓~~ | | ~~✓~~ | | | ~~✓~~ | | | | | ~~✓~~ |
| PRScreen | ✓ | | | ✓ | ✓ | | | | | | ✓ |
| ConflictScreen | ✓ | | | | | | | ✓ | | | ✓ |
| SearchScreen | ✓ | | | | | | | | ✓ | | |
| NotificationsScreen | ✓ | | | | | | | | | ✓ | |
| SettingsScreen | ✓ | ✓ | | | | | | | | | ✓ |

> **★ v2.0**: `aiEdit`（aiEditStore）列は廃止。EditorScreen・TerminalScreen・SyncDiffScreen の依存を削除。PRScreen は `terminal` ストアへの間接依存なし（prStore 経由で navigate のみ）。

