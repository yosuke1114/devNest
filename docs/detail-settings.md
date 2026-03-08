# SettingsScreen 詳細設計書

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**対象画面**: SettingsScreen（プロジェクト設定・GitHub・AI・同期・外観・Danger Zone）  
**対応シナリオ**: —（全シナリオ共通の設定変更）

---

## 1. 画面概要

アクティブプロジェクトの設定（GitHub 接続・AI API・同期ポリシー・外観・削除）を管理する。セクションナビで切り替え、変更は SAVE CHANGES ボタンで一括保存する。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'settings'`（uiStore） |
| Props | なし |
| レイアウト | GlobalNav なし・左サイドバー（セクションナビ）+ 右コンテンツエリア |

---

## 2. レイアウト仕様

```
┌───────────────┬──────────────────────────────────────────────────────┐
│SettingsSidebar│  Settings / {SectionLabel}  [● unsaved] [SAVE] [DISCARD]│
│  (200px)      ├──────────────────────────────────────────────────────┤
│ GitHub    ●   │  SectionContent（activeSection に応じて切替）         │
│ Anthropic ●   │  スクロール可（maxWidth: 760px）                      │
│ Claude Code ● │                                                      │
│ Sync          │                                                      │
│ Appearance    │                                                      │
│ ─────────     │                                                      │
│ Danger Zone   │                                                      │
│               │                                                      │
│ v0.1.0-dev    │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
```

---

## 3. コンポーネントツリー

```
SettingsScreen
  ├── SettingsSidebar
  │     ├── SectionNavItem × N        # GitHub / Anthropic / Claude Code / Sync / Appearance / Danger Zone
  │     └── VersionFooter
  ├── SettingsTopBar                  # "Settings / {SectionLabel}" + unsaved + SAVE / DISCARD
  └── SettingsContent
        ├── SectionGitHub
        ├── SectionAI
        ├── SectionClaudeCode
        ├── SectionSync
        ├── SectionAppearance
        └── SectionDanger
```

---

## 4. 状態設計

### 4.1 ストア参照

```typescript
const activeProject = useProjectStore(s => s.activeProject())
const buildIndex = useProjectStore(s => s.buildIndex)
const updateProject = useProjectStore(s => s.updateProject)
const deleteProject = useProjectStore(s => s.deleteProject)

const user = useGithubAuthStore(s => s.user)
const isConnected = useGithubAuthStore(s => s.isConnected())
const revokeStatus = useGithubAuthStore(s => s.revokeStatus)

const indexingInProgress = useUiStore(s => s.indexingInProgress)
const indexProgress = useUiStore(s => s.indexProgress)
```

### 4.2 ローカル state

```typescript
const [activeSection, setActiveSection] = useState<SectionId>('github')

// Sync セクション：フォームの編集値（SAVE で一括送信）
const [syncDraft, setSyncDraft] = useState<SyncDraft | null>(null)
const [hasUnsaved, setHasUnsaved] = useState(false)
```

`syncDraft` は `activeProject` の現在値を初期値とし、フォーム変更時に更新する。SAVE CHANGES で `updateProject` を呼び、DISCARD で `activeProject` の値にリセットする。

---

## 5. SettingsSidebar

```typescript
type SectionId = 'github' | 'ai' | 'claudecode' | 'sync' | 'appearance' | 'danger'

interface SectionNavItem {
  id: SectionId
  icon: string
  label: string
  sub: string
  statusDot?: 'green' | 'red' | null   // 接続状態インジケーター
}
```

**セクション一覧**

| id | アイコン | ラベル | sub | statusDot |
|----|--------|--------|-----|-----------|
| `github` | 🔗 | GitHub | OAuth App authentication | `isConnected ? 'green' : 'red'` |
| `ai` | ✦ | Anthropic API | Issue drafting & embeddings | APIキー設定済みなら `'green'` |
| `claudecode` | ◈ | Claude Code | CLI path & version | 検出済みなら `'green'` |
| `sync` | ↑↓ | Sync | Auto-commit & push policy | — |
| `appearance` | ◐ | Appearance | Theme & font | — |
| `danger` | ⚠ | Danger Zone | Delete project | —（赤表示） |

**VersionFooter**

```
DevNest v0.1.0-dev
Tauri 2.x · React 18
```

---

## 6. SettingsTopBar

```
Settings / GitHub            [● unsaved changes]  [SAVE CHANGES]  [DISCARD]
```

**SAVE CHANGES 押下時**

```typescript
const handleSave = async () => {
  if (!syncDraft || !activeProject) return
  await projectStore.updateProject(activeProject.id, {
    syncMode: syncDraft.syncMode,
    debounceMs: syncDraft.debounceMs,
    commitMsgFormat: syncDraft.commitMsgFormat,
    aiBranchPolicy: syncDraft.aiBranchPolicy,
    autoDeleteAiBranch: syncDraft.autoDeleteAiBranch,
  })
  setHasUnsaved(false)
}
```

**DISCARD 押下時**

```typescript
const handleDiscard = () => {
  setSyncDraft(null)  // activeProject の現在値にリセット
  setHasUnsaved(false)
}
```

---

## 7. 各セクションの詳細仕様

### 7.1 SectionGitHub

```typescript
interface SectionGitHubProps {
  isConnected: boolean
  user: GitHubUser | null
  revokeStatus: AsyncStatus
  onConnect: () => void
  onRevoke: () => void
}
```

**接続済み時の表示**

```
Connection Status    ● connected  @yosuke  ·  github.com
                     [RECONNECT]  [DISCONNECT]

Repository           yosuke/devnest
Default Branch       main
Access Token         ●●●●●●●●●●●●  [SHOW]
```

**未接続時の表示**

```
Connection Status    ✕ disconnected
                     [CONNECT WITH GITHUB →]
                     ℹ ブラウザが開き、GitHub OAuth認証ページに遷移します。
                       認証後、トークンはOSキーチェーンに保存されます。
```

**DISCONNECT（revoke）押下時**

```typescript
const handleRevoke = async () => {
  // 確認モーダル
  const confirmed = await uiStore.showModal({
    type: 'confirm',
    title: 'GitHub 接続を解除しますか？',
    message: '解除後は自動同期・Issue/PR 操作が無効になります。',
    confirmLabel: 'DISCONNECT',
    danger: true,
  })
  if (confirmed) {
    await githubAuthStore.revokeAuth(activeProject!.id)
  }
}
```

---

### 7.2 SectionAI

```typescript
interface SectionAIProps {
  apiKeySet: boolean
  draftModel: string
  embeddingModel: string
  contextTopK: number
  onChange: (patch: Partial<AISettings>) => void
}
```

**UI 要素**

| フィールド | 種別 | 値 |
|-----------|------|-----|
| API Key | マスクテキスト + SAVE KEY ボタン | `sk-ant-…` |
| Model（Issue Drafting） | ドロップダウン | `claude-sonnet-4-6`（デフォルト） |
| Embedding Model | ドロップダウン | `claude-haiku-4-5`（低コスト優先） |
| Context Top-K | スライダー（1〜10） | デフォルト: 3 |

**API Key の保存**

```typescript
// API Key は app_settings('anthropic.api_key') に保存（OSキーチェーン経由）
// project_update ではなく settings_set コマンドを使用
await invoke('settings_set', { key: 'anthropic.api_key', value: apiKey })
```

---

### 7.3 SectionClaudeCode

Claude Code CLI の検出・バージョン確認・パス設定。

```
Claude Code CLI

Status       ● detected  v1.x.x
Path         /usr/local/bin/claude  [BROWSE]
             [CHECK NOW]

ℹ Claude Code がインストールされていない場合は
  https://claude.ai/code からインストールしてください。
```

**CHECK NOW 押下時**

```typescript
await invoke('settings_set', { key: 'claudecode.path', value: customPath })
// → Rust 側でパスの存在確認・バージョン取得
// → 成功: SectionNavItem の statusDot を green に更新
// → 失敗: 赤バナー「Claude Code が見つかりませんでした」
```

---

### 7.4 SectionSync

```typescript
interface SectionSyncProps {
  syncMode: 'auto' | 'manual'
  debounceMs: number
  commitMsgFormat: string
  aiBranchPolicy: 'separate' | 'direct'
  autoDeleteAiBranch: boolean
  hasUnsaved: boolean
  onChange: (patch: Partial<SyncDraft>) => void
}
```

**UI 要素**

| フィールド | 種別 | デフォルト |
|-----------|------|----------|
| Sync Mode | トグル（Auto / Manual） | Auto |
| Debounce（ms） | 数値入力（500〜10000） | 1000 |
| Commit Message Format | テキスト入力 | `docs: update {filename}` |
| AI Branch Policy | ラジオ（Separate branch / Direct to main） | Separate |
| Auto Delete AI Branch | チェックボックス | true |

**Commit Message Format のヘルプ**

```
利用可能な変数: {filename} {filepath} {project}
例: "docs: update {filename}" → "docs: update architecture.md"
```

---

### 7.5 SectionAppearance

Phase 1 では最低限の設定のみ。

```
Theme         [Light ▾]  （Dark は Phase 2）
Font Size     [12px ▾]   （10 / 11 / 12 / 13 / 14）
```

設定は `app_settings('ui.theme')` / `app_settings('ui.font_size')` に保存。

---

### 7.6 SectionDanger

```typescript
interface SectionDangerProps {
  projectName: string
  onDelete: () => void
}
```

**表示内容**

```
⚠ Danger Zone

Delete Project
このプロジェクトを削除します。設計書ファイルはローカルに残りますが、
DevNest のデータベースからすべての情報が削除されます。

[DELETE PROJECT "{projectName}"]（赤ボタン）
```

**DELETE 押下時**

```typescript
const handleDelete = async () => {
  const confirmed = await uiStore.showModal({
    type: 'confirm_text',
    title: 'プロジェクトを削除しますか？',
    message: `確認のため「${projectName}」と入力してください。`,
    confirmText: projectName,
    confirmLabel: 'DELETE',
    danger: true,
  })
  if (confirmed) {
    await projectStore.deleteProject(activeProject!.id)
    // 削除後は SetupScreen または別プロジェクトに遷移
    uiStore.navigate('setup')
  }
}
```

---

## 8. mount 処理

```typescript
useEffect(() => {
  // Sync セクションの初期値をアクティブプロジェクトから取得
  if (activeProject) {
    setSyncDraft({
      syncMode: activeProject.syncMode,
      debounceMs: activeProject.debounceMs ?? 1000,
      commitMsgFormat: activeProject.commitMsgFormat ?? 'docs: update {filename}',
      aiBranchPolicy: activeProject.aiBranchPolicy,
      autoDeleteAiBranch: activeProject.autoDeleteAiBranch ?? true,
    })
  }
}, [activeProject?.id])
```

---

## 9. エラーハンドリング

| エラー | 表示場所 | 対応 |
|--------|---------|------|
| `revokeAuth` 失敗 | SectionGitHub の赤バナー | RETRY ボタン |
| `settings_set`（API Key）失敗 | API Key フィールド下の赤テキスト | RETRY |
| `updateProject` 失敗 | SettingsTopBar 下の赤バナー | RETRY |
| `deleteProject` 失敗 | SectionDanger の赤バナー | RETRY |

---

## 10. ファイル一覧

```
src/screens/SettingsScreen.tsx
src/components/settings/SettingsSidebar.tsx
src/components/settings/SectionNavItem.tsx
src/components/settings/VersionFooter.tsx
src/components/settings/SettingsTopBar.tsx
src/components/settings/SectionGitHub.tsx
src/components/settings/SectionAI.tsx
src/components/settings/SectionClaudeCode.tsx
src/components/settings/SectionSync.tsx
src/components/settings/SectionAppearance.tsx
src/components/settings/SectionDanger.tsx
src/components/settings/shared/SettingsRow.tsx    ← 各フィールドのラッパー
src/components/settings/shared/SectionTitle.tsx
```

---

## 11. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | `app_settings` と `project` テーブルの設定の分類 | プロジェクト固有（sync_mode 等）は `projects` テーブル。グローバル（theme・font）は `app_settings` テーブル |
| U-02 | Dark テーマ | Phase 2。`app_settings('ui.theme')` に保存し、CSS カスタムプロパティで切り替え |
| U-03 | SectionAppearance のプレビュー | Phase 2。設定変更をリアルタイムでプレビュー表示 |
