# SetupScreen 詳細設計書

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**対象画面**: SetupScreen（新規プロジェクト登録ウィザード）  
**対応シナリオ**: S-01  
**対応タスク**: F-B01・F-B02

---

## 1. 画面概要

新規プロジェクト登録のための 6 ステップウィザード。アプリ初回起動時および「＋ New Project」から遷移する。全ステップ完了後に EditorScreen へ遷移する。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'setup'`（uiStore） |
| Props | なし |
| レイアウト | GlobalNav なし・ウィザード専用レイアウト |
| ステップ数 | 6（Project / GitHub / Sync / Index / Notify / Done） |

---

## 2. ステップ定義

| # | ステップ名 | 主な操作 | 関連コマンド |
|---|----------|---------|------------|
| 0 | Project | プロジェクト名・ローカルパス入力・.md ファイル確認 | `project_create` |
| 1 | GitHub | OAuth 接続・リポジトリ選択・デフォルトブランチ選択 | `github_auth_start` / `github_auth_complete` |
| 2 | Sync | sync_mode / ai_branch_policy 設定 | `project_update` |
| 3 | Index | ベクトルインデックス構築（Phase 3 まではスキップ可） | `index_build`（Phase 3） |
| 4 | Notify | OS 通知許可リクエスト | `notification_permission_request` |
| 5 | Done | 完了表示・OPEN EDITOR ボタン | — |

---

## 3. コンポーネントツリー

```
SetupScreen
  ├── SetupHeader            # タイトル・サブタイトル固定ヘッダー
  ├── SetupStepDots          # ステップ進捗ドット（クリックで完了済みステップに戻れる）
  ├── SetupBody              # 中央スクロール領域（maxWidth: 560px）
  │     ├── SetupStep0Project
  │     │     ├── FieldLabel
  │     │     ├── TextInput（プロジェクト名）
  │     │     ├── TextInput + BrowseButton（ローカルパス）
  │     │     ├── DetectedFileList  # スキャン結果 + チェックボックス
  │     │     └── AsyncButton（NEXT）
  │     ├── SetupStep1GitHub
  │     │     ├── AuthStatusBadge    # idle / waiting / connected / error
  │     │     ├── ConnectButton      # CONNECT WITH GITHUB
  │     │     ├── RepoSelector       # リポジトリ選択（接続後に表示）
  │     │     ├── BranchSelector     # デフォルトブランチ選択
  │     │     └── NavButtons（BACK / NEXT）
  │     ├── SetupStep2Sync
  │     │     ├── SyncModeToggle     # Auto / Manual
  │     │     ├── AiBranchPolicySelector
  │     │     └── NavButtons
  │     ├── SetupStep3Index
  │     │     ├── FileCountSummary   # 対象ファイル件数・チャンク数
  │     │     ├── IndexProgressBar
  │     │     ├── AsyncButton（BUILD INDEX NOW）
  │     │     └── NavButtons（SKIP 含む）
  │     ├── SetupStep4Notify
  │     │     ├── NotifyDescription  # 通知の用途説明
  │     │     ├── AsyncButton（ALLOW NOTIFICATIONS）
  │     │     └── NavButtons（SKIP 含む）
  │     └── SetupStep5Done
  │           ├── DoneSummary        # 登録内容サマリー
  │           └── AsyncButton（OPEN EDITOR）
  └── （モーダルなし）
```

---

## 4. 状態設計

SetupScreen はストアから読み取るだけで、ローカル state を最小限にとどめる。

### 4.1 uiStore から読む状態

```typescript
const setupStep = useUiStore(s => s.setupStep)                  // 現在のステップ（0〜5）
const indexProgress = useUiStore(s => s.indexProgress)          // { done, total, currentPath }
const indexingInProgress = useUiStore(s => s.indexingInProgress)
```

### 4.2 projectStore から読む状態

```typescript
const createStatus = useProjectStore(s => s.createStatus)       // 'idle'|'loading'|'success'|'error'
const createError = useProjectStore(s => s.createError)
const activeProject = useProjectStore(s => s.activeProject())
```

### 4.3 githubAuthStore から読む状態

```typescript
const authStatus = useGithubAuthStore(s => s.authStatus)        // 'idle'|'waiting_callback'|'success'|'error'
const authError = useGithubAuthStore(s => s.authError)
const user = useGithubAuthStore(s => s.user)
```

### 4.4 SetupScreen のローカル state

```typescript
// ステップをまたいで保持する入力値（project_create 呼び出しまで保持）
const [name, setName] = useState('')
const [localPath, setLocalPath] = useState('')
// Step 1 で確定するリポジトリ・ブランチ
const [selectedRepo, setSelectedRepo] = useState('')
const [selectedBranch, setSelectedBranch] = useState('main')
// Step 1 のリポジトリ一覧（github_auth 完了後に取得）
const [repos, setRepos] = useState<string[]>([])
const [branches, setBranches] = useState<string[]>([])
// Step 2
const [syncMode, setSyncMode] = useState<'auto' | 'manual'>('auto')
const [aiBranchPolicy, setAiBranchPolicy] = useState<'separate' | 'direct'>('separate')
```

---

## 5. 各ステップの詳細仕様

---

### 5.1 Step 0: Project

**UI 要素**

| 要素 | 種別 | 内容 |
|------|------|------|
| Project Name | テキスト入力 | 必須・最大 50 文字 |
| Local Directory | テキスト入力 + BROWSE ボタン | 必須・絶対パス |
| Detected .md Files | チェックリスト | スキャン結果一覧（読み取り専用・参考表示） |
| NEXT ボタン | AsyncButton | バリデーション通過後に `project_create` 呼び出し |

**バリデーション**

| フィールド | ルール | エラーメッセージ |
|-----------|--------|---------------|
| Project Name | 必須・1〜50文字・空白のみ不可 | 「プロジェクト名を入力してください」 |
| Local Directory | 必須・絶対パス形式（`/` または `C:\` 始まり） | 「ディレクトリの絶対パスを入力してください」 |

**NEXT ボタン押下時の処理**

```typescript
const handleStep0Next = async () => {
  // 1. バリデーション
  if (!name.trim()) { setNameError('プロジェクト名を入力してください'); return }
  if (!localPath.trim() || !isAbsolutePath(localPath)) { setPathError('ディレクトリの絶対パスを入力してください'); return }

  // 2. project_create（documents への .md スキャンも同時実行）
  const result = await projectStore.createProject(name.trim(), localPath.trim())
  // → ProjectCreateResult { project: Project, document_count: number }

  // 3. 成功 → Step 1 へ
  // projectStore.createStatus === 'success' になったら advanceSetupStep()
}
```

**エラー表示**

- `AppError.Validation`（DuplicatePath）→ Local Directory 欄のインラインエラー「このパスは既に登録されています」
- `AppError.Validation`（PathNotFound）→ Local Directory 欄のインラインエラー「ディレクトリが存在しません」
- `AppError.Validation`（NotGitRepo）→ Local Directory 欄のインラインエラー「git リポジトリではありません（`git init` が必要です）」

**DetectedFileList の表示**

`project_create` の戻り値 `document_count` を使って「`{count}` 個の .md ファイルを検出しました」と表示。個別ファイル一覧は Phase 1 では表示しない（Phase 3 のインデックス構築後に詳細を確認できる）。

---

### 5.2 Step 1: GitHub

**UI 要素**

| 要素 | 表示条件 | 内容 |
|------|---------|------|
| AuthStatusBadge | 常時 | authStatus に応じた接続状態表示 |
| CONNECT WITH GITHUB ボタン | `authStatus !== 'success'` | OAuth 開始 |
| 接続中スピナー | `authStatus === 'waiting_callback'` | 「GitHub 認証を待機中…」 |
| エラーメッセージ | `authStatus === 'error'` | authError の内容 + RETRY ボタン |
| RepoSelector | `authStatus === 'success'` | ドロップダウン（`{owner}/{repo}` 形式） |
| BranchSelector | リポジトリ選択後 | ブランチ一覧（デフォルト: `main`） |
| NEXT ボタン | `authStatus === 'success'` + リポジトリ選択済み | Step 2 へ進む |
| SKIP ボタン | 常時 | 認証なしで Step 2 へ（後で Settings から設定可） |

**AuthStatusBadge の状態**

| authStatus | 表示 | 色 |
|-----------|------|-----|
| `idle` | 「未接続」 | グレー |
| `waiting_callback` | 「認証待機中…」 | 黄色 + スピナー |
| `success` | `@{user.login}` | 緑 |
| `error` | 「認証に失敗しました」 | 赤 |

**CONNECT ボタン押下時の処理**

```typescript
const handleConnect = async () => {
  const project = projectStore.activeProject()
  if (!project) return
  await githubAuthStore.startAuth(project.id)
  // → ブラウザが開き、ユーザーが認証
  // → oauth コールバック → github_auth_done イベント
  // → githubAuthStore.onAuthDone → authStatus='success'
  // → uiStore.advanceSetupStep() は呼ばない（ユーザーがリポジトリ選択後に NEXT を押す）
}
```

**github_auth_done イベント受信後の追加処理**

```typescript
// initListeners 内
listen('github_auth_done', ({ payload }) => {
  githubAuthStore.onAuthDone(payload)
  if (payload.success) {
    // リポジトリ一覧を取得してドロップダウンを表示
    // github_labels_list はこの時点では不要
    fetchUserRepos().then(setRepos)
  }
})
```

**RepoSelector / BranchSelector**

- リポジトリ一覧: GitHub API `/user/repos?type=owner&sort=updated&per_page=30` で取得（`services/github.rs` に追加）
- ブランチ一覧: リポジトリ選択後に `/repos/{owner}/{repo}/branches` で取得
- 選択確定後に `project_update({ github_owner, github_repo, default_branch })` を呼ぶ

---

### 5.3 Step 2: Sync

**UI 要素**

| 要素 | 種別 | デフォルト |
|------|------|----------|
| Sync Mode | トグル（Auto / Manual） | Auto |
| AI Edit Policy | ラジオ（Separate branch + PR / Direct to main） | Separate branch |
| Sync Mode の説明文 | テキスト | Auto: 保存時に自動コミット＋プッシュ / Manual: 手動で Sync ボタンを押す |
| NEXT ボタン | — | `project_update` 後に Step 3 へ |

**NEXT ボタン押下時の処理**

```typescript
const handleStep2Next = async () => {
  const project = projectStore.activeProject()
  if (!project) return
  await projectStore.updateProject(project.id, {
    sync_mode: syncMode,
    ai_branch_policy: aiBranchPolicy,
  })
  uiStore.advanceSetupStep()
}
```

---

### 5.4 Step 3: Index

**UI 要素**

| 要素 | 表示条件 | 内容 |
|------|---------|------|
| 説明文 | 常時 | 「設計書をベクトルインデックス化します（セマンティック検索に必要）」 |
| FileCountSummary | 常時 | 「{document_count} ファイルが対象です」 |
| BUILD INDEX NOW | `!indexingInProgress && !indexed` | インデックス構築開始 |
| IndexProgressBar | `indexingInProgress` | `done / total` の進捗バー + `currentPath` |
| 完了メッセージ | インデックス完了後 | 「{done} ファイル・{chunkCount} チャンクを登録しました」 |
| NEXT ボタン | インデックス完了後 | Step 4 へ |
| SKIP（後で実行） | `!indexingInProgress` | インデックスなしで Step 4 へ（セマンティック検索が使えない旨を注記） |

**Phase 1 での扱い**

Phase 3 まで `index_build` コマンドは未実装のため、Step 3 では BUILD INDEX ボタンを表示するが「Phase 3 で利用可能になります」と表示し、SKIP を促す。ボタンは disabled にしない（将来の差し替えを容易にするため）。

```typescript
// Phase 1 での暫定実装
const handleBuildIndex = async () => {
  if (IS_PHASE_BEFORE_3) {
    // スキップ扱い
    uiStore.advanceSetupStep()
    return
  }
  const project = projectStore.activeProject()
  if (!project) return
  await projectStore.buildIndex(project.id)
  // index_progress / index_done イベントで IndexProgressBar を更新
}
```

**IndexProgressBar の詳細**

```typescript
interface IndexProgressBarProps {
  done: number
  total: number
  currentPath: string | null
  isVisible: boolean
}
// 表示: [████████░░░░] 8/12  architecture.md をインデックス中…
// width: (done / total) * 100 + '%'
```

---

### 5.5 Step 4: Notify

**UI 要素**

| 要素 | 内容 |
|------|------|
| 説明文 | CI 結果・PR コメント・Conflict 検知などをお知らせします |
| 通知イベント例リスト | `ci_pass`, `pr_comment`, `conflict` の説明を箇条書き |
| ALLOW NOTIFICATIONS | `notification_permission_request` 呼び出し |
| SKIP | 許可なしで Step 5 へ（後で Settings から変更可能） |

**ALLOW ボタン押下時の処理**

```typescript
const handleAllow = async () => {
  await invoke('notification_permission_request')
  // → OS のダイアログが表示される
  // → 結果は app_settings('app.notif_granted') に保存される
  // → 許可・拒否いずれの場合も Step 5 へ進む
  uiStore.advanceSetupStep()
}
```

**注意**: OS のダイアログ結果（granted / denied）は非同期で返るため、ボタン押下後はスピナーを表示せずに直接 Step 5 へ進む。許可状態は後から `settings_get('app.notif_granted')` で確認できる。

---

### 5.6 Step 5: Done

**UI 要素**

| 要素 | 内容 |
|------|------|
| 完了アイコン | ✓ マーク（大） |
| DoneSummary | プロジェクト名・リポジトリ・同期モード・インデックス状態の一覧 |
| OPEN EDITOR ボタン | EditorScreen へ遷移 |

**DoneSummary の内容**

```
Project:    devnest
Repository: yosuke/devnest (main)
Sync Mode:  Auto (on save)
AI Policy:  Separate branch + PR review
Index:      5 files ready  ／  Skipped（Phase 1）
```

**OPEN EDITOR 押下時の処理**

```typescript
const handleOpenEditor = async () => {
  const project = projectStore.activeProject()
  if (!project) return
  // polling 開始
  await invoke('polling_start', { project_id: project.id })
  // document_scan でファイルツリーを確認
  await documentStore.loadDocuments(project.id)
  // Editor 画面へ遷移
  uiStore.navigate('editor')
}
```

---

## 6. SetupStepDots の詳細仕様

```typescript
interface SetupStepDotsProps {
  currentStep: number    // 0-based（0〜5）
  totalSteps: number     // 6
  labels: string[]       // ['Project', 'GitHub', 'Sync', 'Index', 'Notify', 'Done']
}
```

**ドットの状態**

| 状態 | 条件 | 表示 |
|------|------|------|
| `done` | `i < currentStep` | 塗りつぶし ＋ ✓ ＋ クリック可能（前のステップに戻る） |
| `active` | `i === currentStep` | 塗りつぶし ＋ 番号 |
| `pending` | `i > currentStep` | アウトライン ＋ 番号 ＋ クリック不可 |

**戻り操作の制限**

- Step 0 には戻れない（project_create 実行済みのため）
- Step 1 は `done` 状態でもクリック不可（OAuth 再実行は Settings から）
- Step 2〜4 は `done` 状態でクリック可能（設定の修正）

---

## 7. グローバルエラー処理

SetupScreen に固有の GlobalNav はなし。エラーは各ステップのインライン表示で対応する。

| エラーコード | 表示場所 | 対応 |
|-----------|---------|------|
| `Validation` | 該当フィールド直下（赤テキスト） | 自動 |
| `GitHub` / `GitHubAuthRequired` | Step 1 の AuthStatusBadge | RETRY ボタン表示 |
| `Git` | Step 0 の NEXT 近く（赤バナー） | 手動確認を促す |
| `Internal` | ステップ下部の赤バナー | GitHub Issue 報告リンク |

---

## 8. アクセシビリティ・UX 注記

- NEXT / SKIP ボタンは `disabled` 中でも `cursor: not-allowed` を維持する
- `waiting_callback` 中はブラウザウィンドウを前面に出す操作はしない（ユーザーが手動で切り替え）
- Step 3 の INDEX は時間がかかるため、完了前にウィンドウを閉じても再起動後に続きから再開できる（`indexingInProgress` フラグを `app_settings` に保存）

---

## 9. ファイル一覧

```
src/screens/SetupScreen.tsx
src/components/setup/SetupHeader.tsx
src/components/setup/SetupStepDots.tsx
src/components/setup/SetupStep0Project.tsx
src/components/setup/SetupStep1GitHub.tsx
src/components/setup/SetupStep2Sync.tsx
src/components/setup/SetupStep3Index.tsx
src/components/setup/SetupStep4Notify.tsx
src/components/setup/SetupStep5Done.tsx
src/components/setup/DetectedFileList.tsx
src/components/setup/AuthStatusBadge.tsx
src/components/setup/RepoSelector.tsx
src/components/setup/BranchSelector.tsx
src/components/shared/IndexProgressBar.tsx  ← SetupStep3 / SettingsScreen 共用
```

---

## 10. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | BROWSE ボタンによるネイティブファイルピッカー | `tauri-plugin-dialog` の `open()` を使用。I-02 で依存追加済み |
| U-02 | リポジトリ一覧取得エンドポイント（`/user/repos`）はコマンド定義書 v3 に未定義 | `github_repos_list` コマンドを Phase 1 スコープに追加するか、services 層の内部処理に留めるかを判断 |
| U-03 | Step 3 の IndexProgress が完了した後の chunk 数取得方法 | `index_done` イベントの payload に `{ indexed: number, chunks: number }` を追加 |
