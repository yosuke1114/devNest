# IssuesScreen 詳細設計書

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**対象画面**: IssuesScreen（Issue 一覧・詳細・AI Wizard）  
**対応シナリオ**: S-03  
**対応タスク**: F-D01・F-D02・F-D03・F-D04

---

## 1. 画面概要

GitHub Issue の一覧・詳細表示と、AI による Issue 下書き生成（5 ステップ Wizard）を管理する。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'issues'`（uiStore） |
| Props | なし |
| レイアウト | GlobalNav 表示・左右 2 ペイン（通常時）/ Wizard 全面オーバーレイ（wizardOpen=true） |
| 主要ユースケース | Issue 参照・Terminal 起動・AI Issue 作成 |

---

## 2. レイアウト仕様

### 2.1 通常時（wizardOpen=false）

```
┌──────┬──────────────────────┬────────────────────────────┐
│      │  IssueFilterBar      │                            │
│ Nav  ├──────────────────────┤       IssueDetail          │
│      │  IssueList           │  （activeIssueId が null   │
│      │  └ IssueListItem × N │   の場合は EmptyState）    │
│      │                      │                            │
│      │  [+ NEW WITH AI]     │                            │
└──────┴──────────────────────┴────────────────────────────┘
  左ペイン: 260px              右ペイン: flex:1
```

### 2.2 Wizard 表示時（wizardOpen=true）

```
┌──────┬──────────────────────┬────────────────────────────┐
│      │                      │                            │
│ Nav  │  IssueList           │    AIWizard（全面）        │
│      │  （縮小・暗転）       │    WizardStepDots          │
│      │                      │    WizardStep{1〜5}        │
│      │                      │                            │
└──────┴──────────────────────┴────────────────────────────┘
```

Wizard は右ペイン全体を占有する。左ペインの IssueList は表示を維持するが `pointer-events: none` で操作不可にする。

---

## 3. コンポーネントツリー

```
IssuesScreen
  ├── IssueLeftPane
  │     ├── IssueFilterBar
  │     ├── NewWithAIButton          # [+ NEW WITH AI] ボタン
  │     └── IssueList
  │           └── IssueListItem × N
  ├── IssueDetail                    # wizardOpen=false 時
  │     ├── IssueHeader
  │     ├── IssueStatusBadge
  │     ├── IssueBody                # react-markdown
  │     ├── DocLinkPanel
  │     │     ├── DocLinkItem × N
  │     │     └── DocLinkPickerModal
  │     └── IssueActions             # LAUNCH TERMINAL / NEW WITH AI
  └── AIWizard                       # wizardOpen=true 時
        ├── WizardHeader             # タイトル + WizardStepDots + CANCEL
        ├── WizardStep1Input         # 要件テキスト入力
        ├── WizardStep2Search        # セマンティック検索結果
        ├── WizardStep3Draft         # AI streaming ドラフト表示
        ├── WizardStep4Edit          # タイトル・ラベル・担当者 編集
        └── WizardStep5Filed         # 起票完了 + LAUNCH TERMINAL
```

---

## 4. 状態設計

### 4.1 ストア参照

```typescript
// issueStore
const issues = useIssueStore(s => s.issues)
const listStatus = useIssueStore(s => s.listStatus)
const activeIssueId = useIssueStore(s => s.activeIssueId)
const wizardOpen = useIssueStore(s => s.wizardOpen)
const wizardStep = useIssueStore(s => s.wizardStep)
const wizardInputText = useIssueStore(s => s.wizardInputText)
const activeDraft = useIssueStore(s => s.activeDraft)
const contextChunks = useIssueStore(s => s.contextChunks)
const contextSearchStatus = useIssueStore(s => s.contextSearchStatus)
const generateStatus = useIssueStore(s => s.generateStatus)
const streamBuffer = useIssueStore(s => s.streamBuffer)
const githubLabels = useIssueStore(s => s.githubLabels)
const labelsStatus = useIssueStore(s => s.labelsStatus)
const activeIssueDocLinks = useIssueStore(s => s.activeIssueDocLinks)
const docLinksStatus = useIssueStore(s => s.docLinksStatus)

// projectStore
const activeProject = useProjectStore(s => s.activeProject())
```

### 4.2 ローカル state

```typescript
// IssueFilterBar のフィルタ値（URL パラメータ不要なためローカル管理）
const [statusFilter, setStatusFilter] = useState<string>('all')
const [labelFilter, setLabelFilter] = useState<string>('all')
const [milestoneFilter, setMilestoneFilter] = useState<string>('all')
const [searchText, setSearchText] = useState<string>('')
```

### 4.3 フィルタリングロジック

```typescript
const filteredIssues = useMemo(() => {
  return issues.filter(issue => {
    if (statusFilter !== 'all' && issue.status !== statusFilter) return false
    if (labelFilter !== 'all' && !issue.labels.includes(labelFilter)) return false
    if (milestoneFilter !== 'all' && issue.milestone !== milestoneFilter) return false
    if (searchText && !issue.title.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })
}, [issues, statusFilter, labelFilter, milestoneFilter, searchText])
```

---

## 5. IssueLeftPane の詳細仕様

### 5.1 IssueFilterBar

```typescript
interface IssueFilterBarProps {
  statusFilter: string
  labelFilter: string
  milestoneFilter: string
  searchText: string
  availableLabels: string[]    // issues から抽出したユニークラベル
  availableMilestones: string[]
  onStatusChange: (v: string) => void
  onLabelChange: (v: string) => void
  onMilestoneChange: (v: string) => void
  onSearchChange: (v: string) => void
}
```

**フィルタ要素**

| 要素 | 種別 | 選択肢 |
|------|------|--------|
| Status | セグメントボタン | all / open / in_progress / closed |
| Label | ドロップダウン | all + issues から抽出したラベル一覧 |
| Milestone | ドロップダウン | all + milestone 一覧 |
| テキスト検索 | テキスト入力 | タイトルの部分一致 |

### 5.2 IssueListItem

```typescript
interface IssueListItemProps {
  issue: Issue
  isActive: boolean
  onClick: (issueId: number) => void
}
```

**表示要素**

| 要素 | 表示条件 | 内容 |
|------|---------|------|
| StatusPill | 常時 | open / in_progress / closed |
| Issue 番号 | 常時 | `#{githubNumber}` |
| Milestone バッジ | `issue.milestone` あり | マイルストーン名 |
| タイトル | 常時 | 最大 2 行・超過時省略 |
| Label タグ | `labels.length > 0` | 最大 3 件表示・超過は `+N` |
| Assignee アバター | 常時 | 未設定時は破線円 |
| 更新日時 | 常時 | 相対表記（"2 min ago" 等） |
| コメント数 | `comments > 0` | `💬 {N}` |
| Linked PR | `linkedPrNumber` あり | `⬡ PR#{N}` |

**アクティブ状態**: 左ボーダー 2.5px + 背景色変化

### 5.3 NewWithAIButton

IssueList 上部に常時表示。

```typescript
// クリック時
const handleNewWithAI = async () => {
  await issueStore.openWizard()  // activeDraft を新規作成 → wizardOpen=true・wizardStep=1
}
```

---

## 6. IssueDetail の詳細仕様

### 6.1 activeIssueId が null の場合

```
EmptyState:
  「Issue を選択してください」
  または
  「+ NEW WITH AI で Issue を作成」ボタン
```

### 6.2 IssueHeader

```typescript
interface IssueHeaderProps {
  issue: Issue
}
```

**表示内容**
```
[open]  #43  feat: Auto git-commit on editor save
             ⬡ PR#44 に関連  |  updated 2h ago
```

### 6.3 IssueBody

`issue.body` を `react-markdown` でレンダリング。コードブロック対応。

### 6.4 DocLinkPanel

```typescript
interface DocLinkPanelProps {
  links: IssueDocLinkWithDoc[]
  isLoading: boolean
  onAdd: () => void
  onRemove: (documentId: number) => void
  onOpen: (documentId: number) => void
}

interface IssueDocLinkWithDoc {
  documentId: number
  path: string
  linkType: 'manual' | 'ai_confirmed'
}
```

**表示内容**

```
DESIGN DOCS
📄 docs/sync-flow.md     [ai]  [✕]
📄 docs/architecture.md  [manual]  [✕]
+ link doc
```

| バッジ | 意味 |
|--------|------|
| `[ai]` | AI Wizard が自動リンクした（`link_type='ai_confirmed'`） |
| `[manual]` | ユーザーが手動でリンクした |

**`+ link doc` クリック時の DocLinkPickerModal**

```typescript
// uiStore.openFilePicker() を使用
const handleAdd = async () => {
  const documentId = await uiStore.openFilePicker()   // FilePicker Modal を開く
  if (documentId) {
    await issueStore.addDocLink(activeProject!.id, activeIssueId!, documentId)
  }
}
```

FilePicker は既存の `src/components/shared/FilePicker.tsx` を流用。  
既にリンク済みのファイルは「✓ ALREADY LINKED」セクションで区別表示する。

### 6.5 IssueActions

```typescript
interface IssueActionsProps {
  issue: Issue
  onLaunchTerminal: () => void
  onNewWithAI: () => void
}
```

**表示ボタン**

| ボタン | 条件 | 処理 |
|--------|------|------|
| LAUNCH TERMINAL | 常時 | `setActiveIssue` → `navigate('terminal')` |
| NEW WITH AI | 常時 | `openWizard()` |

**LAUNCH TERMINAL の処理**

```typescript
const handleLaunchTerminal = async () => {
  await issueStore.setActiveIssue(activeProject!.id, issue.id)
  // setActiveIssue 内部で loadDocLinks も自動実行（SS2-S04-01）
  uiStore.navigate('terminal')
}
```

---

## 7. AI Wizard の詳細仕様

### 7.1 WizardHeader

```typescript
interface WizardHeaderProps {
  step: WizardStep      // 1〜5
  onCancel: () => void
}
```

**CANCEL 押下時**

```typescript
const handleCancel = async () => {
  if (!activeDraft) return
  await issueStore.closeWizard(activeProject!.id)
  // closeWizard 内部で issue_draft_cancel を呼ぶ
  // title が空なら DELETE・あれば保持（後で draft_list から再開可能）
}
```

**WizardStepDots**

| 状態 | 表示 |
|------|------|
| `i < step` | 塗りつぶし ✓ |
| `i === step` | 塗りつぶし番号 |
| `i > step` | アウトライン番号 |

完了済みステップへの戻りクリックは **Step 3（Draft）以降は不可**（生成済みドラフトの整合性のため）。

---

### 7.2 WizardStep1Input（要件入力）

```typescript
interface WizardStep1Props {
  inputText: string
  onInputChange: (text: string) => void
  onNext: () => void
  onCancel: () => void
}
```

**UI 要素**

| 要素 | 内容 |
|------|------|
| テキストエリア | 要件テキスト入力（最低 10 文字・最大 2000 文字） |
| 文字数カウンター | `{inputText.length} / 2000` |
| SEARCH CONTEXT → | バリデーション通過後に Step 2 へ |

**SEARCH CONTEXT 押下時の処理**

```typescript
const handleNext = async () => {
  if (inputText.trim().length < 10) {
    setError('内容を入力してから次に進んでください。')
    return
  }
  // wizardInputText をストアに保存（searchContext で使用）
  issueStore.setWizardInputText(inputText)
  // issue_draft_update でテキストを保存（クラッシュ対策）
  await issueStore.updateDraftEdit({ wizardInputText: inputText })
  // Step 2 へ → searchContext は Step 2 の mount 時に実行
  issueStore.setWizardStep(2)
}
```

---

### 7.3 WizardStep2Search（セマンティック検索結果）

```typescript
interface WizardStep2Props {
  chunks: ContextChunk[]
  isLoading: boolean
  onNext: () => void
  onBack: () => void
}
```

**mount 時に searchContext を実行**

```typescript
useEffect(() => {
  if (contextSearchStatus === 'idle') {
    issueStore.searchContext(activeProject!.id)
    // → search_context_for_issue を invoke
    // → contextChunks に結果を格納
  }
}, [])
```

**Phase 1 での注意**

`search_context_for_issue` は Phase 3（sqlite-vec）で実装される。Phase 1 では常に `contextChunks=[]` が返るため、「インデックスが未構築のため自動検索はスキップされます。手動でドキュメントを紐づけてください。」と表示し、NEXT を有効化する。

**UI 要素**

| 要素 | 表示条件 | 内容 |
|------|---------|------|
| ローディング | `isLoading` | `◌ セマンティック検索中…` |
| IndexNotReady 警告 | Phase 1 / index 未構築 | スキップ案内 |
| ContextChunkCard × N | `chunks.length > 0` | ファイル名・類似度スコア・プレビュー |
| GENERATE DRAFT → | 常時（ローディング中は disabled） | Step 3 へ |

**ContextChunkCard の表示**

```
📄 sync-flow.md     sim: 0.94  [スコア順 1位は強調表示]
   ## Auto-commit flow
   On save event, git2-rs triggers commit…
```

**GENERATE DRAFT 押下時の処理**

```typescript
const handleNext = async () => {
  issueStore.setWizardStep(3)
  // Step 3 の mount 時に generateDraft を実行
}
```

---

### 7.4 WizardStep3Draft（AI ドラフト生成）

```typescript
interface WizardStep3Props {
  streamBuffer: string
  isStreaming: boolean
  onStop: () => void
  onRegenerate: () => void
  onNext: () => void
  onBack: () => void
}
```

**mount 時に generateDraft を実行**

```typescript
useEffect(() => {
  if (generateStatus === 'idle') {
    issueStore.generateDraft(activeProject!.id)
    // → issue_draft_generate を invoke
    // → issue_draft_chunk イベント → onDraftChunk → streamBuffer に追記
    // → issue_draft_done イベント → onDraftDone → generateStatus='success'
  }
}, [])
```

**streaming 状態管理**

| generateStatus | isStreaming | 表示 |
|---------------|-----------|------|
| `loading` | true | `● streaming…` + STOP ボタン |
| `loading`（STOP後） | false | `■ stopped` |
| `success` | false | 完了（LOOKS GOOD / EDIT / REGENERATE ボタン） |
| `error` | false | エラーメッセージ + RETRY ボタン |

**STOP ボタン押下時**

```typescript
const handleStop = async () => {
  await invoke('issue_draft_cancel', {
    project_id: activeProject!.id,
    draft_id: activeDraft!.id,
  })
  // generateStatus は 'loading' のままだが isStreaming=false 扱いにする
  // streamBuffer に途中まで生成されたテキストが残る → NEXT / REGENERATE を有効化
}
```

**ドラフト表示エリア**

`streamBuffer` を `react-markdown` でリアルタイムレンダリング。streaming 中は末尾にカーソル（`|`）を表示。

**ボタン構成（streaming 完了後）**

| ボタン | 処理 |
|--------|------|
| LOOKS GOOD → | Step 4 へ（ドラフトをそのまま使用） |
| EDIT | Step 4 へ（同上・Step 4 でタイトル・本文編集） |
| REGENERATE | `generateDraft` を再実行 |
| ← BACK | Step 2 に戻る（`generateStatus` をリセット） |

---

### 7.5 WizardStep4Edit（編集・レビュー）

```typescript
interface WizardStep4Props {
  draft: IssueDraft
  labels: GitHubLabel[]
  labelsStatus: AsyncStatus
  onTitleChange: (title: string) => void
  onLabelsChange: (labels: string[]) => void
  onAssigneeChange: (login: string | null) => void
  onSubmit: () => void
  onBack: () => void
}
```

**mount 時の処理**

```typescript
useEffect(() => {
  if (labelsStatus === 'idle') {
    issueStore.loadGithubLabels(activeProject!.id)
    // → github_labels_list を invoke
  }
}, [])
```

**UI 要素**

| 要素 | 内容 |
|------|------|
| Title 入力 | 必須・最大 255 文字 |
| Body プレビュー | `activeDraft.body` を react-markdown でレンダリング（読み取り専用） |
| Labels セレクター | GitHub リポジトリのラベル一覧をドロップダウン表示・複数選択可 |
| Assignee セレクター | `@{login}` 形式・Phase 1 では認証ユーザーのみ選択可（`self` / `none`） |
| FILE ボタン | `submitIssue` を実行 |

**FILE ボタン押下時の処理**

```typescript
const handleSubmit = async () => {
  // バリデーション
  if (!draft.title.trim()) {
    setTitleError('タイトルを入力してください')
    return
  }
  // issue_draft_update で最終編集を保存
  await issueStore.updateDraftEdit({
    title: draft.title,
    labels: draft.labels,
    assigneeLogin: draft.assigneeLogin,
  })
  // issue_create を実行 → Step 5 へ
  await issueStore.submitIssue(activeProject!.id)
  // submitIssue 内部: draft.status='submitting' → GitHub API → issues に INSERT
  // 成功: draft.status='submitted' → setWizardStep(5)
}
```

**エラーハンドリング**

| エラー | 表示場所 | 対応 |
|--------|---------|------|
| `GitHub`（API エラー） | FILE ボタン下のインライン赤バナー | RETRY ボタン |
| `GitHubAuthRequired` | モーダル → Settings 誘導 | — |
| `GitHubRateLimit` | インライン + `reset_at` まで待機 | 自動リトライ |

---

### 7.6 WizardStep5Filed（完了）

```typescript
interface WizardStep5Props {
  issue: Issue
  onLaunchTerminal: () => void
  onClose: () => void
}
```

**UI 要素**

```
✓  Issue が作成されました

#43  feat: Auto git-commit on editor save   [open]

linked docs: docs/sync-flow.md, docs/architecture.md
（wizard_context から自動リンクされたファイル一覧）

[▶ LAUNCH TERMINAL]    [LATER]
```

**LAUNCH TERMINAL 押下時**

```typescript
const handleLaunchTerminal = async () => {
  // wizardOpen=false にして IssueDetail に戻る
  issueStore.setWizardStep(1)
  issueStore.setWizardOpen(false)
  // activeIssueId を今作った Issue にセット → Terminal へ
  await issueStore.setActiveIssue(activeProject!.id, issue.id)
  uiStore.navigate('terminal')
}
```

**LATER 押下時**

```typescript
const handleClose = () => {
  issueStore.closeWizard(activeProject!.id)
  // wizardOpen=false → IssueDetail に新規 Issue が表示される
}
```

---

## 8. mount / unmount 処理

**mount 時**

```typescript
useEffect(() => {
  const project = projectStore.activeProject()
  if (!project) return
  // Issue 一覧を取得（キャッシュ済みなら skip）
  if (issueStore.listStatus === 'idle') {
    issueStore.loadIssues(project.id)
  }
}, [])
```

**issue_sync_done イベント受信時**

```typescript
// initListeners 内
listen('issue_sync_done', ({ payload }) => {
  issueStore.onSyncDone(payload)
  // issues を再取得して IssueList を更新
})
```

---

## 9. エラーハンドリング

| エラー | 表示場所 | 対応 |
|--------|---------|------|
| `issue_list` 失敗 | IssueList にエラーメッセージ | RELOAD ボタン |
| `issue_sync` 失敗 | IssueFilterBar 上部のトースト | 自動リトライなし |
| `search_context_for_issue` 失敗（IndexNotReady） | Step 2 に警告 + スキップ案内 | SKIP して Step 3 へ |
| `issue_draft_generate` 失敗 | Step 3 のエラーバナー | REGENERATE ボタン |
| `issue_create` 失敗 | Step 4 の FILE ボタン下 | RETRY ボタン |

---

## 10. ファイル一覧

```
src/screens/IssuesScreen.tsx
src/components/issues/IssueLeftPane.tsx
src/components/issues/IssueFilterBar.tsx
src/components/issues/NewWithAIButton.tsx
src/components/issues/IssueList.tsx
src/components/issues/IssueListItem.tsx
src/components/issues/IssueDetail.tsx
src/components/issues/IssueHeader.tsx
src/components/issues/IssueBody.tsx
src/components/issues/IssueActions.tsx
src/components/issues/DocLinkPanel.tsx
src/components/issues/DocLinkItem.tsx
src/components/issues/DocLinkPickerModal.tsx
src/components/wizard/AIWizard.tsx
src/components/wizard/WizardHeader.tsx
src/components/wizard/WizardStepDots.tsx
src/components/wizard/WizardStep1Input.tsx
src/components/wizard/WizardStep2Search.tsx
src/components/wizard/WizardStep3Draft.tsx
src/components/wizard/WizardStep4Edit.tsx
src/components/wizard/WizardStep5Filed.tsx
src/components/wizard/ContextChunkCard.tsx
src/components/wizard/LabelSelector.tsx
```

---

## 11. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | WizardStep4 の Body を直接編集できるか | Phase 1 では読み取り専用プレビューのみ。直接編集は Phase 2（CodeMirror 6 埋め込み） |
| U-02 | Assignee の選択肢（チームメンバー一覧） | Phase 1 では `self`（認証ユーザー）と `none` のみ。`/repos/{owner}/{repo}/assignees` は Phase 2 |
| U-03 | Wizard の途中再開（ドラフト保存からの復元） | `issue_draft_list` で保存済みドラフトを取得し、Wizard 起動時に選択できるようにする。Phase 2 |
| U-04 | Phase 1 での `search_context_for_issue` が `IndexNotReady` を返す際のプロセス | Step 2 をスキップして Step 3 に進む。Step 2 には「インデックス未構築のためスキップ」と表示 |
