# DevNest — Zustand 状態管理設計書

**バージョン**: 4.0
**作成日**: 2026-03-07
**改訂日**: 2026-03-08（要件変更対応）
**対象**: フロントエンド（React + TypeScript + Zustand）
**前提資料**: Rust コマンド定義書 v4.0 / ユーザーシナリオ S-01〜S-11（S-05 改訂版）
**変更履歴**:
- v3.0：シナリオ検証 Round 2（16件）全件反映
- v4.0：**aiEditStore 廃止・prStore 拡張**（Claude Code が feat/xxx 同一ブランチにコード+設計書をコミットする運用変更にともない、ai_edit_branches テーブルと SyncDiffScreen を廃止。設計書 diff は prStore / PRScreen（Design Docs タブ）に統合。terminalStore から readyBranchId・aiEditStore 依存を削除し has_doc_changes を追加）

---

## 1. 設計方針

### 1.1 ストア分割の考え方

Zustand はグローバルシングルトンではなく **ドメイン単位のスライス分割** を採用する。  
各スライスは `invoke`（Tauri IPC）の呼び出しと `listen`（イベント受信）の責務を持ち、React コンポーネントはストアを介してのみバックエンドと通信する。

```
┌─────────────────────────────────────────────────────────┐
│  React Components                                        │
│   useProjectStore / useDocumentStore / ...              │
└──────────────┬──────────────────────────────────────────┘
               │ read state / call actions
┌──────────────▼──────────────────────────────────────────┐
│  Zustand Stores（スライス）                              │
│   projectStore / documentStore / issueStore / ...       │
└──────────────┬──────────────────────────────────────────┘
               │ invoke / listen
┌──────────────▼──────────────────────────────────────────┐
│  Tauri IPC（Rust バックエンド）                          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 命名規則

| 種別 | 規則 | 例 |
|------|------|----|
| ストアファイル | `src/stores/{domain}.store.ts` | `project.store.ts` |
| フック | `use{Domain}Store` | `useProjectStore` |
| 状態フィールド | camelCase | `activeProjectId` |
| アクション | 動詞+名詞 | `loadProjects`, `saveDocument` |
| 非同期状態 | `{action}Status` | `saveStatus` |
| エラー | `{action}Error` | `saveError` |

### 1.3 非同期ステータスの型

全ストアで共通の非同期ステータス型を使用する。

```typescript
// src/types/async.ts
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export interface AsyncState<T> {
  data: T | null
  status: AsyncStatus
  error: string | null
}
```

### 1.4 Tauri IPC ラッパー

`invoke` 呼び出しは `src/lib/ipc.ts` に集約する（型安全のため）。

```typescript
// src/lib/ipc.ts
import { invoke as tauriInvoke } from '@tauri-apps/api/core'

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args)
}
```

---

## 2. ストア一覧

| # | ストア | ファイル | 主な責務 |
|---|--------|---------|---------|
| 3.1 | projectStore | `project.store.ts` | プロジェクト一覧・アクティブプロジェクト・ステータス・git pull・index build |
| 3.2 | githubAuthStore | `github-auth.store.ts` | GitHub OAuth認証・接続状態 |
| 3.3 | documentStore | `document.store.ts` | 設計書一覧・エディタ状態・保存・dirty管理・sync logs・linked Issues |
| 3.4 | issueStore | `issue.store.ts` | Issue一覧・ドラフト・Wizard状態・doc links・activeIssueId |
| 3.5 | prStore | `pr.store.ts` | PR一覧・詳細・コードdiff・**設計書diff**・コメント・requestChanges・githubNumber解決 |
| ~~3.6~~ | ~~aiEditStore~~ | ~~`ai-edit.store.ts`~~ | **廃止（v4.0）**。設計書diff管理は prStore に統合。SyncDiffScreen 廃止。 |
| 3.7 | terminalStore | `terminal.store.ts` | PTYセッション・出力ログ・has_doc_changes管理（readyBranchId廃止） |
| 3.8 | conflictStore | `conflict.store.ts` | コンフリクトファイル・解消状態・並列 saveResolutions |
| 3.9 | searchStore | `search.store.ts` | 検索クエリ・結果・履歴 |
| 3.10 | notificationStore | `notification.store.ts` | 通知一覧・未読数・OS通知・画面遷移変換 |
| 3.11 | uiStore | `ui.store.ts` | 画面遷移・モーダル（Promise返却）・ファイルピッカー・プロジェクト切替フラグ |

---

## 3. 各ストア詳細定義

---

### 3.1 projectStore

プロジェクト一覧とアクティブプロジェクトを管理する。アプリの中心となるストア。

```typescript
// src/stores/project.store.ts

interface Project {
  id: number
  name: string
  localPath: string
  githubOwner: string | null
  githubRepo: string | null
  defaultBranch: string | null
  syncMode: 'auto' | 'manual'
  aiEditMode: 'branch_pr' | 'direct'
  lastSyncedAt: string | null
}

interface ProjectStatus {
  syncStatus: 'synced' | 'dirty' | 'pushing' | 'conflict'
  dirtyCount: number
  pendingPushCount: number
  branch: string | null
  githubConnected: boolean
  hasUnresolvedConflict: boolean
  pendingAiReviewCount: number
}

interface ProjectState {
  // ── 状態 ──────────────────────────────
  projects: Project[]
  activeProjectId: number | null
  projectStatuses: Record<number, ProjectStatus>  // projectId → status
  loadStatus: AsyncStatus
  createStatus: AsyncStatus
  createError: string | null

  // ── 算出プロパティ ─────────────────────
  activeProject: () => Project | null
  activeStatus: () => ProjectStatus | null

  // ── アクション ────────────────────────
  loadProjects: () => Promise<void>
  setActiveProject: (projectId: number) => Promise<void>
  createProject: (name: string, localPath: string) => Promise<Project>
  updateProject: (projectId: number, patch: ProjectPatch) => Promise<void>
  deleteProject: (projectId: number) => Promise<void>
  refreshStatus: (projectId: number) => Promise<void>
  buildIndex: (projectId: number) => Promise<void>       // ★NEW SS-01-03
  pullLatest: (projectId: number) => Promise<void>       // ★NEW SS-07-01

  // ── 内部ヘルパー ──────────────────────
  _patchStatus: (projectId: number, patch: Partial<ProjectStatus>) => void
  _resetDomainStores: () => void  // ★NEW SS-08-02: プロジェクト切り替え時に他ストアをリセット
```

**主要アクションの実装方針**

```typescript
setActiveProject: async (projectId) => {
  // ① 旧プロジェクトの polling 停止
  const prev = get().activeProjectId
  if (prev && prev !== projectId) {
    await invoke('polling_stop', { project_id: prev })
  }
  // ② SS2-S08-01: 切り替え中フラグを立てる（空状態の一瞬を隠す）
  useUiStore.getState().set({ isProjectSwitching: true })
  // ③ アクティブ切り替え
  set({ activeProjectId: projectId })
  // ④ ドメインストアをリセット（SS-08-02: 旧プロジェクトのデータが見えないようにする）
  get()._resetDomainStores()
  // ⑤ ステータス取得
  await get().refreshStatus(projectId)
  // ⑥ has_unresolved_conflict → uiStore に通知
  const status = get().activeStatus()
  if (status?.hasUnresolvedConflict) {
    useUiStore.getState().showConflictBadge(true)
  }
  // ⑦ 新プロジェクトの polling 開始
  await invoke('polling_start', { project_id: projectId })
  // ⑧ 切り替え完了（documentStore.loadDocuments 完了後に false にする責務はloadDocuments側）
  useUiStore.getState().set({ isProjectSwitching: false })
}

// SS-08-02: _resetDomainStores 実装
_resetDomainStores: () => {
  useDocumentStore.getState().reset()
  useIssueStore.getState().reset()
  usePrStore.getState().reset()
  useAiEditStore.getState().reset()
  useConflictStore.getState().reset()
  useSearchStore.getState().reset()
}

// SS-07-01: pullLatest 実装
pullLatest: async (projectId) => {
  await invoke('git_pull', { project_id: projectId })
  // 結果は git_pull_done イベントで受信 → conflictStore.onGitPullDone が処理
}

// SS-01-03: buildIndex 実装
buildIndex: async (projectId) => {
  set({ /* uiStore へ委譲 */ })
  useUiStore.getState().set({ indexingInProgress: true })
  await invoke('index_build', { project_id: projectId })
  // 進捗は index_progress / index_done イベントで受信 → uiStore.onIndexProgress が処理
}
```

---

### 3.2 githubAuthStore ★NEW（SS-01-01）

GitHub OAuth 認証フローを管理する。Setup ウィザードと Settings 画面から使用する。

```typescript
// src/stores/github-auth.store.ts

interface GitHubUser {
  login: string
  name: string | null
  avatarUrl: string | null
}

interface GitHubAuthState {
  // ── 状態 ──────────────────────────────
  user: GitHubUser | null
  authStatus: 'idle' | 'waiting_callback' | 'success' | 'error'
  authError: string | null
  revokeStatus: AsyncStatus

  // ── 算出プロパティ ─────────────────────
  isConnected: () => boolean

  // ── アクション ────────────────────────
  startAuth: (projectId: number) => Promise<void>          // github_auth_start → ブラウザ起動
  completeAuth: (projectId: number, code: string) => Promise<void>  // github_auth_complete
  checkStatus: (projectId: number) => Promise<void>        // github_auth_status → user 更新
  revokeAuth: (projectId: number) => Promise<void>         // github_auth_revoke

  // イベントハンドラ
  onAuthDone: (payload: { success: boolean; userLogin?: string }) => void

  // ── 内部ヘルパー ──────────────────────
  reset: () => void
}
```

**`onAuthDone` の実装方針**

```typescript
onAuthDone: ({ success, userLogin }) => {
  if (success) {
    set({ authStatus: 'success', authError: null })
    // Setup ウィザードの次ステップへ（uiStore 経由）
    useUiStore.getState().advanceSetupStep()
  } else {
    set({ authStatus: 'error', authError: 'GitHub 認証に失敗しました' })
  }
}
```

---

### 3.3 documentStore

設計書一覧・エディタの内容・保存状態を管理する。  
dirty 状態・保存ステータスはファイルごとに独立して管理する。

```typescript
// src/stores/document.store.ts

interface Document {
  id: number
  projectId: number
  path: string
  sha: string
  embeddingStatus: 'pending' | 'indexed' | 'stale'
  pushStatus: 'synced' | 'pending_push' | 'push_failed'
  isDirty: boolean
  isDeleted: boolean
}

interface DocumentWithContent extends Document {
  content: string
  // ★ v4.0: pendingAiBranch 削除（aiEditStore 廃止にともない AiEditBanner も削除）
}

interface SaveResult {
  commitSha: string
  pushedAt: string
  newSha: string
}

type SaveStatus = 'idle' | 'committing' | 'pushing' | 'done' | 'failed'

interface DocumentState {
  // ── 状態 ──────────────────────────────
  documents: Document[]                          // プロジェクト全件ツリー
  openedDocument: DocumentWithContent | null     // エディタに表示中
  editorContent: string                          // CodeMirror の現在内容
  saveStatuses: Record<number, SaveStatus>       // documentId → saveStatus
  saveErrors: Record<number, string | null>
  listStatus: AsyncStatus
  getStatus: AsyncStatus
  syncLogs: SyncLog[]                            // ★NEW SS-02-01: Sync/Diff「YOUR EDITS」表示用
  syncLogsStatus: AsyncStatus                    // ★NEW
  linkedIssues: Issue[]                          // ★NEW SS-10-02: Editor右サイドバー「Linked Issues」
  linkedIssuesStatus: AsyncStatus                // ★NEW

  // ── 算出プロパティ ─────────────────────
  currentSaveStatus: () => SaveStatus
  hasUnsavedChanges: () => boolean               // editorContent !== openedDocument?.content

  // ── アクション ────────────────────────
  loadDocuments: (projectId: number) => Promise<void>
  openDocument: (projectId: number, documentId: number) => Promise<void>
  setEditorContent: (content: string) => void    // CodeMirror onChange（同期）
  saveDocument: () => Promise<SaveResult | null>
  retryPush: (projectId: number, documentId: number) => Promise<void>
  setDirty: (projectId: number, documentId: number, isDirty: boolean) => Promise<void>
  scanDocuments: (projectId: number) => Promise<void>
  loadSyncLogs: (projectId: number) => Promise<void>   // ★NEW SS-02-01
  loadLinkedIssues: (projectId: number, documentId: number) => Promise<void>  // ★NEW SS-10-02

  // ── イベントハンドラ（Rust → フロント）──
  onSaveProgress: (payload: SaveProgressPayload) => void

  // ── 内部ヘルパー ──────────────────────
  _updateDocumentField: (documentId: number, patch: Partial<Document>) => void
  reset: () => void  // ★NEW SS-08-02: プロジェクト切り替え時に呼ぶ
}

// ★NEW SS-02-01: SyncLog 型
interface SyncLog {
  id: number
  projectId: number
  operation: 'commit' | 'push' | 'pull' | 'conflict_resolve'
  filePath: string | null
  commitSha: string | null
  status: 'success' | 'failed'
  createdAt: string
}

// Tauri イベント payload 型
interface SaveProgressPayload {
  status: 'committing' | 'pushing' | 'done' | 'failed'
  documentId: number
}
```

**`onSaveProgress` の実装方針（SS-02-02）**

```typescript
onSaveProgress: ({ status, documentId }) => {
  set(state => ({
    saveStatuses: { ...state.saveStatuses, [documentId]: status }
  }))
  // 'done' 受信後に projectStore.refreshStatus を呼ぶ（syncStatus='synced' 反映）
  if (status === 'done') {
    const { activeProjectId } = useProjectStore.getState()
    if (activeProjectId) {
      useProjectStore.getState().refreshStatus(activeProjectId)
    }
  }
}
```

**dirty 管理の実装方針**

```typescript
setEditorContent: (content) => {
  const { openedDocument, editorContent } = get()
  const wasClean = editorContent === openedDocument?.content
  const isNowDirty = content !== openedDocument?.content
  set({ editorContent: content })

  // idle → dirty の遷移時のみ invoke（キーストローク毎には呼ばない）
  if (wasClean && isNowDirty && openedDocument) {
    invoke('document_set_dirty', {
      project_id: openedDocument.projectId,
      document_id: openedDocument.id,
      is_dirty: true,
    })
  }
}
```

**複数ファイル連続保存の debounce 管理**

```typescript
// src/lib/save-debouncer.ts
// documentStore の外部に置く debounce 管理クラス
class SaveDebouncer {
  private timer: ReturnType<typeof setTimeout> | null = null
  private forceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingIds = new Set<number>()

  schedule(documentId: number, saveFn: () => void) {
    this.pendingIds.add(documentId)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(saveFn, 1000)   // 1秒 debounce
    if (!this.forceTimer) {
      this.forceTimer = setTimeout(() => {  // 最大 5秒
        saveFn()
        this.forceTimer = null
      }, 5000)
    }
  }

  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.forceTimer) { clearTimeout(this.forceTimer); this.forceTimer = null }
    this.pendingIds.clear()
  }
}
```

---

### 3.4 issueStore

Issue 一覧・AI Wizard ドラフト・Wizard のステップ状態を管理する。

```typescript
// src/stores/issue.store.ts

interface Issue {
  id: number
  projectId: number
  githubNumber: number
  title: string
  body: string
  status: 'open' | 'closed' | 'in_progress'
  labels: string[]
  assigneeLogin: string | null
  linkedPrNumber: number | null
  githubUpdatedAt: string
}

interface IssueDraft {
  id: number
  projectId: number
  title: string
  body: string
  draftBody: string | null          // streaming 途中
  labels: string[]
  assigneeLogin: string | null
  wizardContext: WizardContext | null
  status: 'draft' | 'submitting' | 'submitted' | 'failed'
}

interface WizardContext {
  chunks: Array<{ documentId: number; chunkId: number; score: number }>
}

interface ContextChunk {
  documentId: number
  chunkId: number
  score: number
  path: string
  preview: string
}

type WizardStep = 1 | 2 | 3 | 4 | 5  // 入力 / 検索 / 生成 / 編集 / 完了

interface IssueState {
  // ── 状態 ──────────────────────────────
  issues: Issue[]
  listStatus: AsyncStatus
  syncStatus: AsyncStatus
  activeIssueId: number | null              // ★NEW SS-04-02: Terminal 遷移時に引き継ぐ

  // Wizard
  wizardOpen: boolean
  wizardStep: WizardStep
  wizardInputText: string                   // ★NEW SS-03-02: Step1 のテキスト入力
  activeDraft: IssueDraft | null
  contextChunks: ContextChunk[]
  contextSearchStatus: AsyncStatus
  generateStatus: AsyncStatus               // streaming 中は 'loading'
  streamBuffer: string                      // issue_draft_chunk の累積
  githubLabels: GitHubLabel[]
  labelsStatus: AsyncStatus
  createStatus: AsyncStatus
  createError: string | null

  // Doc Links（SS-10-01）
  activeIssueDocLinks: IssueDocLinkWithDoc[]  // ★NEW: activeIssueId のリンク一覧
  docLinksStatus: AsyncStatus                 // ★NEW

  // ── 算出プロパティ ─────────────────────
  openIssues: () => Issue[]
  issueById: (id: number) => Issue | undefined
  getContextDocIds: () => number[]  // ★NEW SS-04-01: activeIssueDocLinks から documentId を抽出

  // ── アクション ────────────────────────
  loadIssues: (projectId: number) => Promise<void>
  syncIssues: (projectId: number) => Promise<void>
  // SS2-S04-01: setActiveIssue は loadDocLinks も自動で呼ぶ（projectId が必要）★
  setActiveIssue: (projectId: number, issueId: number | null) => Promise<void>

  // Wizard
  openWizard: () => Promise<void>
  closeWizard: (projectId: number) => Promise<void>
  setWizardStep: (step: WizardStep) => void
  setWizardInputText: (text: string) => void          // ★NEW SS-03-02
  searchContext: (projectId: number) => Promise<void>
  generateDraft: (projectId: number) => Promise<void>
  updateDraftEdit: (patch: DraftEditPatch) => Promise<void>
  loadGithubLabels: (projectId: number) => Promise<void>
  submitIssue: (projectId: number) => Promise<Issue>

  // イベントハンドラ
  onDraftChunk: (payload: { draftId: number; delta: string }) => void
  onDraftDone: (payload: { draftId: number }) => void

  // Issue リンク管理
  loadDocLinks: (projectId: number, issueId: number) => Promise<void>  // ★CHANGED: void に変更（ストアに保持）
  addDocLink: (projectId: number, issueId: number, documentId: number) => Promise<void>
  removeDocLink: (projectId: number, issueId: number, documentId: number) => Promise<void>

  // 内部ヘルパー
  _updateIssueStatus: (githubNumber: number, status: 'open' | 'closed') => void
  reset: () => void
}

interface GitHubLabel { id: number; name: string; color: string }
interface IssueDocLink { issueId: number; documentId: number; linkType: string }
interface IssueDocLinkWithDoc extends IssueDocLink {
  document: Document
}
interface DraftEditPatch { title?: string; labels?: string[]; assigneeLogin?: string }
```

**`setActiveIssue` の実装方針（SS2-S04-01）**

```typescript
// SS2-S04-01: loadDocLinks を自動で呼び activeIssueDocLinks を確実に取得する
setActiveIssue: async (projectId, issueId) => {
  set({ activeIssueId: issueId, activeIssueDocLinks: [], docLinksStatus: 'loading' })
  if (issueId !== null) {
    await get().loadDocLinks(projectId, issueId)
  }
}
```

**`searchContext` の実装方針（SS2-S03-02）**

```typescript
// SS2-S03-02: wizardInputText を query として使う
searchContext: async (projectId) => {
  const query = get().wizardInputText  // Step1 で入力したテキストをそのまま使用
  set({ contextSearchStatus: 'loading' })
  const chunks = await invoke<ContextChunk[]>('search_context_for_issue', {
    project_id: projectId,
    query,
    limit: 5,
  })
  set({ contextChunks: chunks, contextSearchStatus: 'success' })
  // wizard_context を draft に反映
  const { activeDraft } = get()
  if (activeDraft) {
    await invoke('issue_draft_update', {
      project_id: projectId,
      draft_id: activeDraft.id,
      wizard_context: { chunks: chunks.map(c => ({ document_id: c.documentId, chunk_id: c.chunkId, score: c.score })) },
    })
  }
}
```

**Terminal 遷移時の issueId 引き継ぎ（SS2-S03-01）**

```typescript
// S-03「LAUNCH TERMINAL」ボタン押下時の処理（コンポーネント責務）
// ① setActiveIssue で activeIssueId をセット（loadDocLinks も自動実行）
await issueStore.setActiveIssue(projectId, issueId)
// ② Terminal 画面に遷移
// NavigateParams.issueId は補助情報として渡すが、
// TerminalScreen は issueStore.activeIssueId を正として読む
uiStore.navigate('terminal', { issueId })
```

---

### 3.5 prStore

PR 一覧・詳細・diff・コメント・レビューを管理する。

```typescript
// src/stores/pr.store.ts

interface PullRequest {
  id: number
  projectId: number
  githubNumber: number
  title: string
  body: string
  state: 'open' | 'merged' | 'closed'
  headBranch: string
  baseBranch: string
  linkedIssueNumber: number | null
  checksStatus: 'pending' | 'passing' | 'failing' | null
  createdBy: 'user' | 'claude_code'
  githubUpdatedAt: string
}

interface FileDiff {
  path: string
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

interface DiffHunk {
  header: string
  lines: DiffLine[]
}

interface DiffLine {
  lineType: 'context' | 'add' | 'del'
  content: string
  lineNumberOld: number | null
  lineNumberNew: number | null
  fileLineNumber: number | null
}

interface PrComment {
  id: number
  prId: number
  body: string
  authorLogin: string
  commentType: 'inline' | 'review' | 'issue_comment'
  path: string | null
  line: number | null
  isPending: boolean
  githubId: number | null
  createdAt: string
}

interface PrReview {
  id: number
  prId: number
  state: 'approved' | 'changes_requested' | 'pending'
  reviewerLogin: string
  body: string | null
  submitStatus: 'pending_submit' | 'submitted'
}

interface PrState {
  // ── 状態 ──────────────────────────────
  prs: PullRequest[]
  listStatus: AsyncStatus
  activePrId: number | null
  activeTab: 'overview' | 'code-diff' | 'design-docs'  // ★ v4.0: 'diff' → 'code-diff' / 'design-docs' 追加
  prDetail: {
    pr: PullRequest
    reviews: PrReview[]
    comments: PrComment[]
    linkedIssue: Issue | null
  } | null
  detailStatus: AsyncStatus
  codeDiffs: FileDiff[]             // ★ v4.0: fileDiffs → codeDiffs（.ts/.rs 等、.md 除く）
  docDiffs: DocFileDiff[]           // ★ v4.0 追加：設計書 diff（.md のみ）Phase 4
  codeDiffStatus: AsyncStatus       // ★ v4.0: diffStatus → codeDiffStatus
  docDiffStatus: AsyncStatus        // ★ v4.0 追加：設計書 diff ロード状態 Phase 4
  commentStatus: AsyncStatus
  reviewStatus: AsyncStatus
  mergeStatus: AsyncStatus
  mergeError: string | null
  requestChangesStatus: AsyncStatus // ★ v4.0 追加 Phase 4
  requestChangesError: string | null // ★ v4.0 追加 Phase 4

  // ── 算出プロパティ ─────────────────────
  activePr: () => PullRequest | undefined
  canMerge: () => boolean
  openPrByGithubNumber: (projectId: number, githubNumber: number) => Promise<void>
  commentsForLine: (path: string, fileLineNumber: number) => PrComment[]
  prByBranchName: (branchName: string) => PullRequest | undefined  // ★ v4.0 追加

  // ── アクション ────────────────────────
  loadPrs: (projectId: number) => Promise<void>
  syncPrs: (projectId: number) => Promise<void>
  openPr: (projectId: number, prId: number, tab?: 'overview' | 'code-diff') => Promise<void>
  setActivePr: (projectId: number, prId: number) => Promise<void>  // ★ v4.0 追加
  setActiveTab: (tab: 'overview' | 'code-diff' | 'design-docs') => void
  loadCodeDiff: (projectId: number, prId: number) => Promise<void> // ★ v4.0: loadDiff → loadCodeDiff
  loadDocDiff: (projectId: number, prId: number) => Promise<void>  // ★ v4.0 追加 Phase 4
  addComment: (projectId: number, prId: number, params: CommentParams) => Promise<void>
  submitReview: (projectId: number, prId: number, state: 'approved' | 'changes_requested', body?: string) => Promise<void>
  mergePr: (projectId: number, prId: number, method: 'merge' | 'squash' | 'rebase') => Promise<void>
  requestChanges: (projectId: number, prId: number, comment: string) => Promise<void>  // ★ v4.0 追加 Phase 4
  createPrFromBranch: (projectId: number, branchName: string, issueNumber?: number) => Promise<PullRequest>  // ★ v4.0: branchId → branchName

  // 楽観的更新ヘルパー
  _optimisticAddPr: (pr: PullRequest) => void
  reset: () => void
}

interface CommentParams {
  body: string
  commentType: 'inline' | 'review' | 'issue_comment'
  path?: string
  line?: number
}

**`mergePr` の実装方針（SS-09-01）**

```typescript
mergePr: async (projectId, prId, method) => {
  set({ mergeStatus: 'loading' })
  const result = await invoke<MergeResult>('pr_merge', { project_id: projectId, pr_id: prId, merge_method: method })
  set({ mergeStatus: 'success' })
  // PR ステータスを更新
  set(state => ({
    prs: state.prs.map(p => p.id === prId ? { ...p, state: 'merged' } : p)
  }))
  // SS-09-01: Issue を closed に更新（issueStore への依存を明示）
  if (result.issueClosed && result.closedIssueNumber) {
    useIssueStore.getState()._updateIssueStatus(result.closedIssueNumber, 'closed')
  }
}

// SS2-S09-01: canMerge は prDetail の最新値を参照
canMerge: () => {
  const { prDetail } = get()
  if (!prDetail) return false
  const checksPassing = prDetail.pr.checksStatus === 'passing'
  const hasApproval = prDetail.reviews.some(r => r.state === 'approved' && r.submitStatus === 'submitted')
  return checksPassing && hasApproval
}

// SS2-S11-01: github_number → DB id を解決して openPr を呼ぶ
openPrByGithubNumber: async (projectId, githubNumber) => {
  // prs キャッシュから探す
  const cached = get().prs.find(p => p.githubNumber === githubNumber)
  if (cached) {
    await get().openPr(projectId, cached.id)
    return
  }
  // キャッシュにない場合は pr_sync してから再試行
  await get().syncPrs(projectId)
  const found = get().prs.find(p => p.githubNumber === githubNumber)
  if (found) await get().openPr(projectId, found.id)
}
```

---

### 3.6 aiEditStore

AI 編集ブランチのレビュー待ち一覧・詳細・マージ/差し戻し状態を管理する。

```typescript
// src/stores/ai-edit.store.ts

interface AiEditBranch {
  id: number
  projectId: number
  branchName: string
  status: 'pending_review' | 'pending_pr' | 'merged' | 'rejected'
  diffStat: { additions: number; deletions: number; filesChanged: number } | null
  aiPromptSummary: string | null
  prId: number | null
  parentId: number | null
  createdAt: string
}

interface AiEditBranchDetail extends AiEditBranch {
  diffContent: string | null
  changedDocs: Array<{ documentId: number; path: string; changeType: 'modified' | 'created' | 'deleted' }>
}

interface AiEditState {
  // ── 状態 ──────────────────────────────
  branches: AiEditBranch[]
  listStatus: AsyncStatus
  activeBranchId: number | null
  activeBranchDetail: AiEditBranchDetail | null
  detailStatus: AsyncStatus
  mergeStatus: AsyncStatus
  rejectStatus: AsyncStatus

  // ── 算出プロパティ ─────────────────────
  pendingBranches: () => AiEditBranch[]  // status='pending_review' のみ
  activeBranch: () => AiEditBranch | undefined

  // ── アクション ────────────────────────
  loadBranches: (projectId: number) => Promise<void>
  openBranch: (projectId: number, branchId: number) => Promise<void>
  // ★NEW SS2-S05-01: Editor の「⚠ AI updated」バナーから documentId で自動遷移する際に使用
  openBranchByDocumentId: (projectId: number, documentId: number) => Promise<void>
  mergeBranch: (projectId: number, branchId: number) => Promise<void>
  rejectBranch: (projectId: number, branchId: number, reason: string, regenerate: boolean) => Promise<void>
  createPrFromBranch: (projectId: number, branchId: number, issueNumber?: number) => Promise<void>
  reset: () => void  // ★NEW SS-08-02
}
```

**`openBranchByDocumentId` の実装方針（SS2-S05-01）**

```typescript
// SS2-S05-01: Editor「⚠ AI updated」バナーから SyncDiff 画面へ遷移する際に呼ぶ
// documentId に対応する pending_review ブランチを自動で開く
openBranchByDocumentId: async (projectId, documentId) => {
  // branches が未取得の場合は取得
  if (get().branches.length === 0) {
    await get().loadBranches(projectId)
  }
  // ai_edit_branch_docs を持つブランチのうち、documentId が含まれるものを探す
  const match = get().branches.find(b =>
    b.status === 'pending_review'
    // changedDocs は AiEditBranchDetail にのみ含まれるため、一覧からは判定不可
    // → activeBranchDetail を順次チェックする代わりに、
    //   documentStore.openedDocument.pendingAiBranch.id を使う（既に解決済み）
  )
  // より確実な方法: documentStore の pendingAiBranch から branch_id を直接取得
  const pendingBranch = useDocumentStore.getState().openedDocument?.pendingAiBranch
  if (pendingBranch) {
    await get().openBranch(projectId, pendingBranch.id)
    useUiStore.getState().navigate('sync-diff')
  }
}
```

**`mergeBranch` の実装方針（SS-05-02）**

```typescript
mergeBranch: async (projectId, branchId) => {
  set({ mergeStatus: 'loading' })
  await invoke('ai_edit_branch_merge', { project_id: projectId, branch_id: branchId })
  set({ mergeStatus: 'success' })
  // SS-05-02: 変更設計書の sha・embeddingStatus を更新するため documents を再取得
  await useDocumentStore.getState().loadDocuments(projectId)
  await useProjectStore.getState().refreshStatus(projectId)
  // ブランチ一覧を更新
  await get().loadBranches(projectId)
}

// ★ v4.0 削除: createPrFromBranch は prStore に移管（branchId → branchName）
// ★ v4.0 削除: mergeBranch は廃止（SyncDiffScreen + ai_edit_branches 廃止）
```

---

### 3.6 aiEditStore — **廃止（v4.0）**

> **廃止理由**: Claude Code が `feat/{issue-id}-xxx` の同一ブランチにソースコードと設計書を両方コミットする運用に変更したため、別ブランチ方式（`ai-edit/xxx`）を前提とした `aiEditStore` は不要になった。設計書 diff は `prStore` に、差し替えレビューフローは `PRScreen`（Design Docs タブ / RequestChangesPanel）に統合。

**廃止するアーティファクト**

| アーティファクト | 廃止内容 |
|---------------|---------|
| `src/stores/ai-edit.store.ts` | ファイルごと削除 |
| `ai_edit_branches` DB テーブル | migration 0004 から除外 |
| `ai_edit_branch_docs` DB テーブル | migration 0004 から除外 |
| `aiEditStore` への参照（terminalStore・EditorScreen 等） | 全削除 |
| `SyncDiffScreen`・`sync-diff` ルート | PRScreen に統合・削除 |
| `AiEditBanner`（EditorScreen） | 削除 |
| `documentStore.openedDocument.pendingAiBranch` | 削除 |

**旧 aiEditStore の責務の移管先**

| 旧責務 | 移管先 |
|--------|--------|
| 設計書 diff 表示 | prStore の `docDiffs` + PRScreen TabDesignDocs |
| PR 作成 | prStore の `createPrFromBranch`（branchName で呼ぶ） |
| 設計書への再修正依頼 | prStore の `requestChanges` |
| Terminal 完了後のブランチ解決 | terminalStore の `hasDocChanges`（ブランチ名は `readyBranch` で十分。`readyBranchId` 廃止）|

---

### 3.7 terminalStore

PTY セッションの生存管理・出力バッファ・入力送信を管理する。

```typescript
// src/stores/terminal.store.ts

interface TerminalSession {
  id: number
  projectId: number
  issueNumber: number | null
  status: 'running' | 'completed' | 'aborted'
  startedAt: string
  endedAt: string | null
}

interface TerminalState {
  // ── 状態 ──────────────────────────────
  session: TerminalSession | null
  outputLog: string                   // xterm.js に書き込む累積テキスト
  startStatus: AsyncStatus
  readyBranch: string | null          // terminal_done で確定したブランチ名
  hasDocChanges: boolean              // ★ v4.0: .md ファイルの変更が含まれるか（readyBranchId 廃止）
  showPrReadyBanner: boolean

  // ── アクション ────────────────────────
  startSession: (projectId: number, issueNumber?: number) => Promise<void>
  sendInput: (data: string) => Promise<void>
  stopSession: () => Promise<void>

  // イベントハンドラ
  onTerminalOutput: (payload: { sessionId: number; data: string }) => void
  onTerminalDone: (payload: TerminalDonePayload) => void  // ★ v4.0: payload 型を拡張

  // ── 内部ヘルパー ──────────────────────
  _appendOutput: (data: string) => void
  _clearSession: () => void
}
```

**`startSession` の実装方針（SS-04-01・SS-04-02）**

```typescript
startSession: async (projectId, issueNumber) => {
  // SS-04-01: context_doc_ids は issueStore から取得（コンポーネントが加工して渡さない）
  const contextDocIds = issueNumber
    ? useIssueStore.getState().getContextDocIds()  // activeIssueDocLinks から抽出
    : []

  set({ startStatus: 'loading', outputLog: '', readyBranch: null, showPrReadyBanner: false })
  const session = await invoke<TerminalSession>('terminal_session_start', {
    project_id: projectId,
    issue_number: issueNumber ?? null,
    context_doc_ids: contextDocIds,
  })
  set({ session, startStatus: 'success' })
}
```

**`onTerminalDone` の実装方針（v4.0 変更）**

```typescript
// ★ v4.0: aiEditStore.loadBranches・readyBranchId 解決ロジックを削除
// has_doc_changes フラグをそのまま格納するだけになった
onTerminalDone: (payload: TerminalDonePayload) => {
  set({
    readyBranch: payload.branch_name,
    hasDocChanges: payload.has_doc_changes,  // ★ v4.0 追加
    showPrReadyBanner: payload.branch_name !== null,
    session: { ...get().session!, status: 'completed' },
  })
  // ★ v4.0 削除: useAiEditStore.getState().loadBranches(...)
  // ★ v4.0 削除: readyBranchId の解決ロジック
}
```

**TerminalDonePayload 型（v4.0 拡張）**

```typescript
interface TerminalDonePayload {
  session_id: number
  exit_code: number
  branch_name: string | null
  has_doc_changes: boolean   // ★ v4.0 追加：Rust 側で changed_files に .md が含まれるか判定
  changed_files: string[]
}
```

---

### 3.8 conflictStore

コンフリクトファイル・ブロック単位の解消状態を管理する。

```typescript
// src/stores/conflict.store.ts

interface ConflictBlock {
  index: number
  ours: string
  theirs: string
  startLine: number
}

interface ConflictFile {
  id: number
  filePath: string
  documentId: number | null
  isManaged: boolean
  conflictBlocks: ConflictBlock[]
  resolutions: Record<number, BlockResolution>  // blockIndex → resolution（ローカルstate）
}

interface BlockResolution {
  blockIndex: number
  resolution: 'ours' | 'theirs' | 'manual'
  manualContent?: string
}

interface ConflictState {
  // ── 状態 ──────────────────────────────
  managedFiles: ConflictFile[]
  unmanagedCount: number
  listStatus: AsyncStatus
  activeFileId: number | null
  resolveStatuses: Record<number, AsyncStatus>  // conflictId → status
  resolveAllStatus: AsyncStatus
  resolveAllError: string | null

  // ── 算出プロパティ ─────────────────────
  activeFile: () => ConflictFile | undefined
  totalBlocks: () => number
  resolvedBlocks: () => number
  allResolved: () => boolean

  // ── アクション ────────────────────────
  loadConflicts: (projectId: number) => Promise<void>
  setActiveFile: (fileId: number) => void

  // ブロック解消（ローカルstateのみ更新 → saveResolutions で一括送信）
  setBlockResolution: (fileId: number, blockIndex: number, resolution: BlockResolution) => void
  resolveAllBlocks: (fileId: number, resolution: 'ours' | 'theirs') => void  // USE ALL MINE/THEIRS

  // Rust へ送信
  // SS-07-03: 各ファイルの全ブロック選択完了後（またはUSE ALLボタン後）に呼ぶ。
  // resolveAll の前提として全ファイル分の saveResolutions が完了していること（allResolved()=true）
  saveResolutions: (projectId: number, fileId: number) => Promise<void>
  resolveAll: (projectId: number) => Promise<void>

  // イベントハンドラ
  onGitPullDone: (payload: GitPullDonePayload) => void

  reset: () => void  // ★NEW SS-08-02
}

interface GitPullDonePayload {
  status: 'success' | 'conflict'
  conflictFiles?: Array<{ path: string; blockCount: number }>
}
```

**`resolveAllBlocks`（USE ALL MINE/THEIRS）の実装方針**

```typescript
resolveAllBlocks: (fileId, resolution) => {
  set(state => {
    const file = state.managedFiles.find(f => f.id === fileId)
    if (!file) return {}
    const resolutions: Record<number, BlockResolution> = {}
    file.conflictBlocks.forEach(b => {
      resolutions[b.index] = { blockIndex: b.index, resolution }
    })
    return {
      managedFiles: state.managedFiles.map(f =>
        f.id === fileId ? { ...f, resolutions } : f
      )
    }
  })
  // invoke は saveResolutions で一括送信（resolution フィールドを使用）
}

saveResolutions: async (projectId, fileId) => {
  const file = get().managedFiles.find(f => f.id === fileId)
  if (!file) return
  const resolutions = Object.values(file.resolutions)
  // USE ALL: block_resolutions=[] で resolution フィールドを使う
  const isUniform = resolutions.every(r => r.resolution === resolutions[0].resolution)
  if (isUniform && resolutions.length === file.conflictBlocks.length) {
    await invoke('conflict_resolve', {
      project_id: projectId,
      conflict_id: fileId,
      block_resolutions: [],
      resolution: resolutions[0].resolution,
    })
  } else {
    await invoke('conflict_resolve', {
      project_id: projectId,
      conflict_id: fileId,
      block_resolutions: resolutions,
    })
  }
}
```

**`onGitPullDone` の実装方針（SS-07-02）**

```typescript
onGitPullDone: ({ status, conflictFiles }) => {
  if (status === 'conflict') {
    useUiStore.getState().navigate('conflict')
    useUiStore.getState().showConflictBadge(true)
    // conflict_list は ConflictScreen の mount 時に loadConflicts() で取得する
  }
}
```

**`resolveAll` の実装方針（SS2-S07-01）**

```typescript
// SS2-S07-01: saveResolutions を並列実行してから resolveAll を呼ぶ
resolveAll: async (projectId) => {
  set({ resolveAllStatus: 'loading', resolveAllError: null })
  try {
    // ① 全ファイル分の saveResolutions を並列実行
    const { managedFiles } = get()
    await Promise.all(
      managedFiles.map(file => get().saveResolutions(projectId, file.id))
    )
    // ② 全ファイル解消完了後に conflict_resolve_all を呼ぶ
    await invoke('conflict_resolve_all', { project_id: projectId })
    set({ resolveAllStatus: 'success' })
    useUiStore.getState().showConflictBadge(false)
    useProjectStore.getState().refreshStatus(projectId)
  } catch (err) {
    // ③ 一部失敗時はロールバックせずエラー表示（ユーザーが個別再試行できるよう状態を保持）
    set({ resolveAllStatus: 'error', resolveAllError: String(err) })
  }
}
```

---

### 3.9 searchStore

検索クエリ・結果・モード・履歴を管理する。

```typescript
// src/stores/search.store.ts

interface SearchResult {
  documentId: number
  path: string
  score: number
  matchedChunks: MatchedChunk[]
}

interface MatchedChunk {
  chunkId: number
  content: string
  highlightRanges: Array<[number, number]>
  startLine: number
}

interface SearchHistory {
  id: number
  query: string
  searchType: string
  createdAt: string
}

interface SearchState {
  // ── 状態 ──────────────────────────────
  query: string
  searchType: 'keyword' | 'semantic' | 'both'
  results: SearchResult[]
  searchStatus: AsyncStatus
  searchError: string | null
  activeResultDocumentId: number | null   // 右パネルに表示中
  history: SearchHistory[]
  historyStatus: AsyncStatus

  // ── アクション ────────────────────────
  setQuery: (query: string) => void          // 300ms debounce → search
  setSearchType: (type: 'keyword' | 'semantic' | 'both') => void  // 即時再検索
  search: (projectId: number) => Promise<void>
  setActiveResult: (documentId: number) => void
  loadHistory: (projectId: number) => Promise<void>
  // SS-06-01: uiStore.navigate と documentStore.openDocument の両方を呼ぶ
  openInEditor: (projectId: number, documentId: number, startLine: number) => void
  reset: () => void  // ★NEW SS-08-02
}
```

**`openInEditor` の実装方針（SS-06-01）**

```typescript
openInEditor: (projectId, documentId, startLine) => {
  // ① エディタ画面に遷移（scrollToLine を params で渡す）
  useUiStore.getState().navigate('editor', { documentId, scrollToLine: startLine })
  // ② ドキュメントを開く
  useDocumentStore.getState().openDocument(projectId, documentId)
}
```
```

---

### 3.10 notificationStore

通知一覧・未読バッジ・OS 通知発火・画面遷移を管理する。

```typescript
// src/stores/notification.store.ts

interface Notification {
  id: number
  projectId: number
  title: string
  body: string
  eventType: 'ci_passed' | 'ci_failed' | 'pr_reviewed' | 'issue_assigned' | 'pr_opened_by_ai' | 'conflict'
  isRead: boolean
  destScreen: string | null
  destResourceId: number | null
  createdAt: string
}

interface NavigationTarget {
  screen: string
  resourceId: number | null
  tab: string | null
  anchor: string | null
}

interface NotificationState {
  // ── 状態 ──────────────────────────────
  notifications: Notification[]
  unreadCount: number
  listStatus: AsyncStatus
  permissionStatus: 'granted' | 'denied' | 'skipped' | 'unknown'

  // ── アクション ────────────────────────
  loadNotifications: (projectId: number) => Promise<void>
  markRead: (projectId: number, notificationId?: number) => Promise<void>
  navigate: (projectId: number, notificationId: number) => Promise<void>
  requestPermission: () => Promise<void>

  // イベントハンドラ（Rust → フロント）
  onNotificationNew: (payload: { notificationId: number; title: string; eventType: string }) => void
}
```

**`onNotificationNew` の実装方針**（OS 通知発火責務）

```typescript
onNotificationNew: async ({ notificationId, title, eventType }) => {
  // ① ストア更新（バッジ++）
  set(state => ({ unreadCount: state.unreadCount + 1 }))
  // ② OS 通知発火（フロント責務）
  const { permissionStatus } = get()
  if (permissionStatus === 'granted') {
    await sendNotification({
      title: 'DevNest',
      body: title,
      data: { notificationId },   // クリック時に notification_navigate で使用
    })
  }
  // ③ 一覧を再取得
  const { activeProjectId } = useProjectStore.getState()
  if (activeProjectId) await get().loadNotifications(activeProjectId)
}
```

**`navigate` の実装方針（SS-11-02・SS2-S11-01）**

```typescript
navigate: async (projectId, notificationId) => {
  const target = await invoke<NavigationTarget>('notification_navigate', {
    project_id: projectId,
    notification_id: notificationId,
  })
  // SS-11-02: NavigationTarget → uiStore.navigate への変換ロジック
  // SS2-S11-01: screen='pr' の場合は resourceId が DB の prs.id か github_number か
  //             不明なケースに備え openPrByGithubNumber 経由で解決する
  if (target.screen === 'pr' && target.resourceId != null) {
    await usePrStore.getState().openPrByGithubNumber(projectId, target.resourceId)
    useUiStore.getState().navigate('pr', {
      tab: target.tab ?? undefined,
      anchor: target.anchor ?? undefined,
    })
  } else {
    const params: NavigateParams = {
      ...(target.resourceId != null ? { prId: target.resourceId } : {}),
      ...(target.tab ? { tab: target.tab } : {}),
      ...(target.anchor ? { anchor: target.anchor } : {}),
    }
    useUiStore.getState().navigate(target.screen as Screen, params)
  }
  await get().markRead(projectId, notificationId)
}
```

**Tauri 通知クリックハンドラ（SS-11-01）**

```typescript
// src/App.tsx（initListeners に追加）
import { onAction } from '@tauri-apps/plugin-notification'

await onAction(({ notification }) => {
  const notificationId = notification.data?.notificationId as number | undefined
  if (notificationId == null) return
  // ウィンドウをフォアグラウンドに
  appWindow.setFocus()
  // 画面遷移
  const { activeProjectId } = useProjectStore.getState()
  if (activeProjectId) {
    useNotificationStore.getState().navigate(activeProjectId, notificationId)
  }
})
```

---

### 3.11 uiStore

画面遷移・モーダル表示・グローバル UI 状態を管理する。  
ドメインストアから参照されるため依存方向に注意する（uiStore は他ストアに依存しない）。

```typescript
// src/stores/ui.store.ts

// ★ v4.0: 'sync-diff' を削除（SyncDiffScreen 廃止）
type Screen = 'setup' | 'editor' | 'issues' | 'pr' | 'terminal' | 'search' | 'conflict' | 'settings' | 'notifications'

interface Modal {
  type: 'file_picker' | 'unsaved_warning' | 'merge_confirm' | 'reject_input'
  props: Record<string, unknown>
  // SS-08-01: resolve を保持し Promise で選択結果を返す
  resolve?: (choice: string) => void
}

interface UiState {
  // ── 状態 ──────────────────────────────
  currentScreen: Screen
  previousScreen: Screen | null
  activeModal: Modal | null
  conflictBadge: boolean
  indexingInProgress: boolean
  indexProgress: { done: number; total: number; currentPath: string | null }
  setupStep: number
  isProjectSwitching: boolean   // ★NEW SS2-S08-01: 切り替え中ローディング制御

  // ── アクション ────────────────────────
  navigate: (screen: Screen, params?: NavigateParams) => void
  navigateBack: () => void
  // SS-08-01: Promise<string> を返す（'save'|'discard'|'cancel' 等）
  showModal: (modal: Omit<Modal, 'resolve'>) => Promise<string>
  // ★NEW SS2-S10-01: ファイルピッカー専用。documentId（number）を型安全に返す
  openFilePicker: (projectId: number) => Promise<number | null>
  closeModal: (choice: string) => void
  showConflictBadge: (show: boolean) => void
  advanceSetupStep: () => void
  setSetupStep: (step: number) => void

  // イベントハンドラ
  onIndexProgress: (payload: { done: number; total: number; currentPath: string | null }) => void
  onIndexDone: (payload: { projectId: number; indexed: number }) => void
}

interface NavigateParams {
  prId?: number
  issueId?: number
  tab?: string
  anchor?: string
  documentId?: number
  scrollToLine?: number
}

**`showModal` の実装方針（SS-08-01）**

```typescript
showModal: (modal) => {
  return new Promise<string>((resolve) => {
    set({ activeModal: { ...modal, resolve } })
  })
}

closeModal: (choice) => {
  const { activeModal } = get()
  activeModal?.resolve?.(choice)
  set({ activeModal: null })
}

// SS2-S10-01: ファイルピッカー専用アクション（documentId を型安全に返す）
openFilePicker: (projectId) => {
  return new Promise<number | null>((resolve) => {
    set({
      activeModal: {
        type: 'file_picker',
        props: { projectId },
        resolve: (choice: string) => resolve(choice === 'cancel' ? null : Number(choice)),
      }
    })
  })
}
```

**使用例（`projectStore.setActiveProject` 内）**

```typescript
const choice = await useUiStore.getState().showModal({
  type: 'unsaved_warning',
  props: { filename: openedDocument?.path }
})
// choice: 'save' | 'discard' | 'cancel'
if (choice === 'cancel') return
if (choice === 'save') await saveDocument()
```
```

---

## 4. Tauri イベントリスナーの初期化

アプリ起動時（`App.tsx`）に全イベントリスナーを登録する。

```typescript
// src/App.tsx（抜粋）
import { listen } from '@tauri-apps/api/event'

async function initListeners() {
  // 設計書保存進捗
  await listen<SaveProgressPayload>('doc_save_progress', ({ payload }) => {
    useDocumentStore.getState().onSaveProgress(payload)
  })
  // AI Issue 生成
  await listen<{ draft_id: number; delta: string }>('issue_draft_chunk', ({ payload }) => {
    useIssueStore.getState().onDraftChunk({ draftId: payload.draft_id, delta: payload.delta })
  })
  await listen<{ draft_id: number }>('issue_draft_done', ({ payload }) => {
    useIssueStore.getState().onDraftDone({ draftId: payload.draft_id })
  })
  // ターミナル
  await listen<{ session_id: number; data: string }>('terminal_output', ({ payload }) => {
    useTerminalStore.getState().onTerminalOutput({ sessionId: payload.session_id, data: payload.data })
  })
  await listen<{ session_id: number; exit_code: number; branch_name: string | null }>('terminal_done', ({ payload }) => {
    useTerminalStore.getState().onTerminalDone({ sessionId: payload.session_id, exitCode: payload.exit_code, branchName: payload.branch_name })
  })
  // git pull
  await listen<GitPullDonePayload>('git_pull_done', ({ payload }) => {
    useConflictStore.getState().onGitPullDone(payload)
  })
  // インデックス
  await listen<{ done: number; total: number; current_path?: string }>('index_progress', ({ payload }) => {
    useUiStore.getState().onIndexProgress({ done: payload.done, total: payload.total, currentPath: payload.current_path ?? null })
  })
  await listen<{ project_id: number; indexed: number }>('index_done', ({ payload }) => {
    useUiStore.getState().onIndexDone({ projectId: payload.project_id, indexed: payload.indexed })
  })
  // 通知
  await listen<{ notification_id: number; title: string; event_type: string }>('notification_new', ({ payload }) => {
    useNotificationStore.getState().onNotificationNew({ notificationId: payload.notification_id, title: payload.title, eventType: payload.event_type })
  })

  // SS-11-01: Tauri 通知クリックハンドラ ★NEW
  // @tauri-apps/plugin-notification の onAction を使用
  await onAction(({ notification }) => {
    const notificationId = notification.data?.notificationId as number | undefined
    if (notificationId == null) return
    appWindow.setFocus()
    const { activeProjectId } = useProjectStore.getState()
    if (activeProjectId) {
      useNotificationStore.getState().navigate(activeProjectId, notificationId)
    }
  })
}
```

---

## 5. ストア間の依存関係

依存方向は一方向を維持する。循環依存を避けるために uiStore は他ストアに依存しない。

```
projectStore ←── githubAuthStore（Setup時のAuth完了でsetActiveProject）
      │        ←── documentStore ──→ projectStore（save完了後のrefreshStatus）
      │        ←── issueStore
      │        ←── prStore ────────→ issueStore（mergePr後のclose更新）
      │                          ──→ terminalStore（requestChanges後のPRReadyBanner非表示）
      │        ~~←── aiEditStore~~（★ v4.0 廃止）
      │        ←── terminalStore ──→ issueStore（getContextDocIds）
      │                              ★ v4.0: aiEditStore への依存削除
      │        ←── conflictStore ──→ uiStore（コンフリクト検知後のnavigate）
      │                          ──→ projectStore（★NEW SS2-S07-01: resolveAll後のrefreshStatus）
      │        ←── searchStore ───→ uiStore（openInEditor）
      │                          ──→ documentStore（openDocument）
      │        ←── notificationStore → uiStore（navigate委譲）
      │                            ──→ prStore（★NEW SS2-S11-01: openPrByGithubNumber）
      ▼
    uiStore（他ストアから一方向で参照される。uiStore は他ストアを import しない）
```

> **注意**: `projectStore._resetDomainStores` は全ドメインストアを参照するが、
> これはアプリ起動後に各ストアが初期化済みであることが前提の初期化ヘルパーであり、
> 通常の依存方向の例外として許容する。

---

## 6. 未保存変更の保護フロー（P-15 対応）

プロジェクト切り替え時の未保存ダイアログは uiStore と documentStore の連携で実現する。

```typescript
// projectStore.setActiveProject の先頭で実行
setActiveProject: async (projectId) => {
  const { hasUnsavedChanges, saveDocument } = useDocumentStore.getState()
  if (hasUnsavedChanges()) {
    // uiStore 経由でダイアログを表示し、ユーザーの選択を待つ
    const choice = await useUiStore.getState().showModal({
      type: 'unsaved_warning',
      props: { filename: useDocumentStore.getState().openedDocument?.path }
    })
    if (choice === 'save') await saveDocument()
    else if (choice === 'cancel') return  // 切り替えキャンセル
    // 'discard' はそのまま続行
  }
  // ...以降の切り替え処理
}
```

---

## 7. ストア初期化シーケンス

アプリ起動〜エディタ表示までのストア初期化順序。

```
1. initListeners()                    // Tauri イベントリスナー登録
2. projectStore.loadProjects()        // プロジェクト一覧取得
3. [最後のアクティブプロジェクトを復元]
4. projectStore.setActiveProject(id)  // ステータス取得 + polling 開始
5. documentStore.loadDocuments(id)    // 設計書ツリー取得
6. documentStore.openDocument(id, lastDocId)  // 最後に開いたファイルを開く
7. notificationStore.loadNotifications(id)    // 通知取得
8. notificationStore.requestPermission()      // 初回のみ権限ダイアログ
```

---

## 8. 付録：コンポーネント × ストア対応表

| 画面 / コンポーネント | 使用するストア | 備考 |
|----------------------|--------------|------|
| SetupWizard | projectStore, githubAuthStore, uiStore | setupStep で制御 |
| ProjectSidebar | projectStore | isProjectSwitching でローディング制御 |
| EditorScreen | documentStore, uiStore | ★ v4.0: aiEditStore 削除・AiEditBanner 削除 |
| GlobalNav | projectStore, notificationStore, uiStore | conflictBadge |
| StatusBar | projectStore, documentStore | syncStatus・saveStatus |
| IssueListScreen | issueStore, projectStore | setActiveIssue で loadDocLinks 自動呼び出し |
| AIWizard（全ステップ） | issueStore, searchStore | wizardInputText → searchContext |
| TerminalScreen | terminalStore, issueStore | ★ v4.0: aiEditStore 削除 |
| ~~SyncDiffScreen~~ | ~~aiEditStore, documentStore~~ | **★ v4.0 廃止**（PRScreen に統合） |
| PRScreen | prStore, issueStore, projectStore | ★ v4.0: codeDiffs・docDiffs・requestChanges 追加 |
| SearchScreen | searchStore, documentStore, uiStore | openInEditor が両ストアを呼ぶ |
| ConflictScreen | conflictStore, projectStore | mount時に loadConflicts |
| NotificationScreen | notificationStore, uiStore | — |
| SettingsScreen | projectStore, githubAuthStore | — |
