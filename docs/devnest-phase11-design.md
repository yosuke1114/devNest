# DevNest Phase 11 設計書
# Multi-Agent Terminal Orchestrator

**バージョン**: 0.3
**作成日**: 2026-03-14
**ステータス**: 要件定義完了

---

## 1. 概要

### 1.1 フィーチャー名

**DevNest Swarm** — 複数のAIエージェントを並列実行・統合管理するマルチエージェントターミナルオーケストレーター

### 1.2 解決する課題

| 現状の課題 | Phase 11での解決 |
|-----------|----------------|
| Claude Codeは1セッション1タスクしか動かせない | 複数Workerを並列実行しタスクを分散処理 |
| エージェントの実行状況が見えない | リアルタイムステータスUIで全Worker監視 |
| タスク分割を手動でやる必要がある | OrchestratorがClaude APIで自動分解 |
| 通常のシェル作業との切り替えが煩雑 | AIワーカーと通常シェルをグリッド内に混在 |

### 1.3 ゴール

- 1つの大きなタスクを複数のClaude Codeエージェントが**並列**で処理する
- ユーザーは全エージェントの状態を**一画面で俯瞰**できる
- タスク完了後、結果を**自動集約**してユーザーに提示する

### 1.4 UIイメージ

```
左ペイン（Orchestratorパネル）:
  タスク入力 → SubTask一覧 → 進捗バー → イベントログ
  ⚙️アイコンからSwarm設定モーダルを開く

右ペイン（Terminal Grid）:
  2×2〜2×3のタイル型ターミナル
  🤖 ClaudeCode Worker（ステータスバッジあり）
  🐚 Shell（種別バッジのみ）
```

> 詳細なインタラクティブモックアップは要件定義セッション（2026-03-14）で作成済み。

---

## 2. ユーザーストーリー

### US-11-01: タスクを並列実行する
```
As a developer,
I want to give one large task to DevNest Swarm,
So that multiple Claude Code agents work in parallel and finish faster.
```

### US-11-02: 実行状況をリアルタイムで見る
```
As a developer,
I want to see all agents' status at a glance,
So that I can spot failures or bottlenecks immediately.
```

### US-11-03: タスク分割を自動化する
```
As a developer,
I want the orchestrator to automatically split my task,
So that I don't have to manually decide which agent does what.
```

### US-11-04: 通常シェルと混在させる
```
As a developer,
I want to mix normal shell panes with AI agent panes,
So that I can do manual work alongside automated tasks.
```

### US-11-05: 結果を集約して確認する
```
As a developer,
I want to see a summary of what all agents did,
So that I can review and decide next steps efficiently.
```

---

## 3. 機能要件

### 3.1 Orchestratorパネル

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-11-01 | タスク入力 | 自然言語でタスクを入力するUI |
| F-11-02 | 自動タスク分解 | Claude APIがSubTaskリストを生成 |
| F-11-03 | Worker割り当て | SubTaskをWorkerに自動アサイン |
| F-11-04 | 実行開始/停止 | 全体または個別Workerの制御 |
| F-11-05 | 結果集約表示 | 全Worker完了後にサマリーを表示 |

### 3.2 Terminal Grid

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-11-06 | タイル型レイアウト | 複数ターミナルを格子状に配置 |
| F-11-07 | Worker/Shell混在 | Claude CodeワーカーとShellを同一グリッドに配置 |
| F-11-08 | ペイン追加/削除 | 動的にペインを増減できる |
| F-11-09 | ペインリサイズ | ドラッグでサイズ調整 |
| F-11-10 | フォーカス管理 | クリックでアクティブペインを切り替え |

### 3.3 Worker管理

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-11-11 | Workerライフサイクル | 起動・停止・再起動 |
| F-11-12 | ステータス追跡 | Idle / Running / Done / Error |
| F-11-13 | ログストリーミング | Worker出力をリアルタイムで表示 |
| F-11-14 | エラー検出 | Claude Codeのエラー出力を検知してステータス反映 |
| F-11-15 | 完了検出 | タスク完了を自動検知 |

### 3.4 リアルタイム監視

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-11-16 | ステータスバッジ | 各ペインにWorkerステータスをオーバーレイ表示 |
| F-11-17 | 進捗バー | 全体の完了率を表示 |
| F-11-18 | イベントログ | 全Workerのイベントを時系列で集約 |
| F-11-19 | 完了通知 | タスク完了/失敗時にデスクトップ通知 |

### 3.5 エラーハンドリング・コンフリクト解決

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-11-20 | コンフリクト解決UI | マージ時のコンフリクトをCodeMirror 6 MergeViewでdiff表示。W1採用/W2採用/両方/手動編集を選択可能。解決後は自動コミット |
| F-11-21 | 部分完了通知 | Case B/C エラー時に成功/失敗Workerの一覧をサマリーパネルに表示。失敗タスクを明記 |
| F-11-22 | リトライUI | Case A エラー時に自動リトライ中をバッジで表示（🔄）。リトライ結果を即時反映 |

| 項目 | 要件 | 備考 |
|------|------|------|
| 並列Worker数 | デフォルト4・最大8 | 設定画面で変更可能 |
| ターミナルレンダリング | @xterm/xterm（既存） | DevNestに導入済み |
| PTY管理 | portable-pty（Rust側） | WezTerm由来、macOS実績◎ |
| タスク分解API | Claude API（Rust側） | モデルは要選定 |
| 状態管理 | Tauri Events（Rust→React） | 既存パターン踏襲 |
| パフォーマンス | Worker追加時のUI遅延 < 200ms | 要検証 |
| タイムアウト | デフォルト30分・5〜120分で設定可能 | 設定画面で変更可能（並列Worker上限と同一画面） |

---

## 5. アーキテクチャ

### 5.1 レイヤー構成

```
┌─────────────────────────────────────────────────┐
│  UI Layer（React + TypeScript）                  │
│                                                  │
│  ┌──────────────┐   ┌────────────────────────┐  │
│  │ Orchestrator │   │    Terminal Grid       │  │
│  │ Panel        │   │  ┌────┐ ┌────┐ ┌────┐ │  │
│  │              │   │  │ W1 │ │ W2 │ │ W3 │ │  │
│  │ [Task Input] │   │  └────┘ └────┘ └────┘ │  │
│  │ [SubTask List│   │  ┌────┐ ┌────┐        │  │
│  │ [Progress]   │   │  │ W4 │ │ sh │        │  │
│  └──────┬───────┘   │  └────┘ └────┘        │  │
│         │           └────────────────────────┘  │
└─────────┼───────────────────────────────────────┘
          │  Tauri Commands / Events
┌─────────┼───────────────────────────────────────┐
│  Core Layer（Rust / Tauri）                      │
│                                                  │
│  ┌──────┴───────┐   ┌────────────────────────┐  │
│  │ Orchestrator │   │   Worker Manager       │  │
│  │ Engine       │   │                        │  │
│  │              │   │  WorkerHandle[]        │  │
│  │ TaskSplitter │   │  PtyProcess[]          │  │
│  │  (Claude API)│   │  StatusBus             │  │
│  └──────────────┘   └────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 5.2 データフロー

```
1. ユーザーがタスクを入力
        ↓
2. TaskSplitter（Claude API）がSubTaskリストを生成
        ↓
3. OrchestratorがWorkerをspawnしSubTaskをアサイン
        ↓
4. 各WorkerがClaude Code CLIをサブプロセスとして起動
        ↓
5. PTY出力をUI（xterm）にストリーミング
        ↓
6. 完了検出 → ステータス更新 → EventBusでUI通知
        ↓
7. 全Worker完了 → ResultAggregatorがサマリー生成
```

### 5.3 Worker種別

Workerは**実行モード**と**種別**の2軸で分類する。

```
WorkerMode
├── Interactive（手動）
│   ├── Shell（zsh/bash）          通常シェル操作
│   └── ClaudeCode（手動モード）   ユーザーが直接指示を打つ
└── Batch（自動）
    └── ClaudeCode（プロンプト付き起動）
              ↑ Orchestratorが自動アサインするのはここだけ
```

```rust
enum WorkerMode {
    Interactive,  // ユーザーがターミナルに直接タイプ
    Batch,        // Orchestratorがプロンプト付きで起動
}

enum WorkerKind {
    ClaudeCode,   // claude "タスク内容" で起動
    Shell,        // /bin/zsh, /bin/bash
}

struct WorkerConfig {
    kind: WorkerKind,
    mode: WorkerMode,
    label: String,
    working_dir: PathBuf,
    task: Option<SubTask>,  // Batch + ClaudeCode のみ
    env: HashMap<String, String>,
}
```

---

## 6. TaskSplitter 設計

### 6.1 入出力仕様

**入力（ユーザープロンプト例）:**
```
「このPRのレビュー指摘を全部修正して。
  - renderer.jsのメモリリーク
  - App.tsxの型エラー3箇所
  - shell/index.htmlのCSS崩れ」
```

**Claude APIへ送るシステムプロンプト（草案）:**
```
あなたはタスク分解の専門家です。
ユーザーのタスクを独立して並列実行可能なサブタスクに分割してください。

制約:
- 各サブタスクは他のサブタスクの結果に依存しないこと
- 各サブタスクには対象ファイル/ディレクトリを明記すること
- 分割数は最大8つまで
- JSON形式で返すこと

出力形式:
{
  "tasks": [
    {
      "id": 1,
      "title": "短いタイトル",
      "files": ["path/to/file"],
      "instruction": "Workerへの具体的な指示"
    }
  ]
}
```

**出力（SubTaskリスト）:**
```json
{
  "tasks": [
    {
      "id": 1,
      "title": "renderer.js メモリリーク修正",
      "files": ["src/renderer.js"],
      "instruction": "renderer.jsのメモリリークを修正してください。..."
    },
    {
      "id": 2,
      "title": "App.tsx 型エラー修正",
      "files": ["src/App.tsx"],
      "instruction": "App.tsxの型エラー3箇所を修正してください。..."
    }
  ]
}
```

### 6.2 依存関係チェック（TODO）

- 同一ファイルに複数タスクが触れる場合の競合防止
- 直列実行が必要な場合の依存グラフ管理
- → Phase 11-D以降で詳細設計

---

## 7. 実装ステップ

### Step 11-A: タイル型マルチターミナルUI（MVP）

**目標**: 複数のxtermペインを画面に並べてPTY接続する

**タスク:**
- [ ] `XtermPane` コンポーネント作成（1ペイン = 1xterm.jsインスタンス）
- [ ] `TerminalGrid` コンポーネント作成（Flexboxグリッドレイアウト）
- [ ] Rust側: `WorkerManager` 構造体（PTYの複数管理）
- [ ] Tauri Command: `spawn_worker`, `kill_worker`
- [ ] ペイン追加/削除UI

**完了基準:**
- 4ペイン同時表示してそれぞれで独立したシェルが動く
- ペインを追加/削除できる

---

### Step 11-B: Worker状態管理

**目標**: Workerのライフサイクルとステータスをリアルタイムで管理する

**タスク:**
- [ ] `WorkerStatus` 列挙型定義（Idle/Running/Done/Error）
- [ ] PTY出力パーサー（Claude Codeの完了/エラーパターン検出）
- [ ] Tauri Events: `worker_status_changed`, `worker_output`
- [ ] UIのステータスバッジ表示
- [ ] 進捗バーコンポーネント

**完了基準:**
- Worker起動→実行→完了がUIに反映される
- エラー時にバッジが変わる

---

### Step 11-C: TaskSplitter統合

**目標**: ユーザー入力からSubTaskリストを自動生成する

**タスク:**
- [ ] Orchestratorパネル UI作成
- [ ] Claude API呼び出し（**Rust側**・APIキーはKeychainから取得）
- [ ] SubTaskリストのUI表示・編集
- [ ] 手動調整オプション（タスクを統合/分割/削除）
- [ ] 同一ファイルへの複数Worker割り当て禁止チェック

**完了基準:**
- 自然言語入力からSubTaskリストが生成される
- ユーザーが内容を確認・編集できる
- APIキーがフロントに渡らない

---

### Step 11-D: OrchestratorエンジンとWorker自動割り当て

**目標**: SubTaskをWorkerに自動アサインして並列実行する

**タスク:**
- [ ] `Orchestrator` エンジン実装（Rust）
- [ ] Worker-SubTask割り当てロジック
- [ ] 実行キュー管理
- [ ] ファイル競合チェック（同一ファイルへの同時書き込み防止）

**完了基準:**
- SubTask承認後に自動でWorkerが起動して実行開始される

---

### Step 11-E: 結果集約とサマリー

**目標**: 全Worker完了後に結果を集約してユーザーに提示する

**タスク:**
- [ ] ResultAggregatorの設計
- [ ] Gitdiff集約表示
- [ ] サマリーUI（成功/失敗Worker一覧、何をやったか）
- [ ] 次のアクション提案（PR作成など）
- [ ] コンフリクト解決UI（CodeMirror 6 MergeView）（F-11-20）
- [ ] 部分完了通知UI（F-11-21）
- [ ] リトライUIのステータス表示（F-11-22）

**完了基準:**
- 全Worker完了後にサマリーパネルが表示される
- コンフリクト発生時にMergeViewで解決できる
- エラー時に成功/失敗の内訳が確認できる

---

## 8. 技術的な検討事項

| 項目 | 状態 | 内容 |
|------|------|------|
| PTYライブラリ | **確定** | `portable-pty`（WezTerm由来、macOS実績◎） |
| Claude Code起動方法 | **確定** | `claude "プロンプト"`（Batch）/ 直接入力（Interactive） |
| TaskSplitter実装場所 | **確定** | Rust側（セキュリティ優先） |
| 完了検出方法 | **確定** | プロセス終了コード（主系）+ 出力パターン（補助）+ タイムアウト |
| 出力パターン文字列 | **実測待ち** | Step 11-B で実測して確定（→ 9.4参照） |
| ファイル競合防止 | **確定** | 事前チェック + Gitブランチ分離（→ 9.3参照） |
| ShellワーカーのステータスUI | **確定** | Phase 11は種別バッジのみ（🐚ラベル）。将来フェーズでアイドル検出（C案）に拡張 |
| タイムアウト値 | **確定** | デフォルト30分・5〜120分で設定可能（設定画面で変更） |
| Worker間通信 | **確定** | Phase 11では不要。WorkerHandleに拡張用フィールドのみ確保 |

---

## 9. アーキテクチャ決定事項

### 9.1 TaskSplitter実装場所: **Rust側**

**決定**: TaskSplitterはRust（Tauri Core）側に実装する。

**理由:**
- セキュリティ: APIキーをKeychainで管理し、フロントに一切渡さない
- 一貫性: DevNestのAPIキー管理方針（tauri-plugin-store）と統一
- 将来性: OrchestratorエンジンとRustで一気通貫にできる

```rust
// フロントはテキストだけ渡す
let tasks = invoke("split_task", {
    prompt: userInput,       // テキストのみ
    context: { files, projectName }
    // APIキーはRust側でKeychainから取得
}).await;
```

---

### 9.2 Workerへのタスク渡し方法: **2モード併用**

**決定**: InteractiveモードとBatchモードの2パターンを実装する。

| モード | 方法 | 用途 |
|--------|------|------|
| Interactive | ユーザーがPTYに直接タイプ | 手動操作・通常シェル |
| Batch | `claude "プロンプト"` で起動時に渡す | Orchestrator自動実行 |

---

### 9.3 ファイル競合防止: **事前チェック + Gitブランチ分離**

**決定**: 2層の防御を実装する。

**Layer 1 — 事前チェック（TaskSplitter段階）:**
```
SubTask生成時に同一ファイルへの複数Worker割り当てを禁止
→ そもそも競合を発生させない
→ TaskSplitterのシステムプロンプトに制約として明記
```

**Layer 2 — Gitブランチ分離（Worker起動時）:**
```bash
# Worker起動時に作業ブランチを作成
git checkout -b swarm/worker-{id}

# 全Worker完了後にOrchestratorがマージ
git checkout {base_branch}
git merge swarm/worker-{id}
# コンフリクト発生時 → UIでユーザーに通知・判断を委ねる
```

---

### 9.4 Batchモードの完了検出: **3層構成**

**決定**: プロセス終了コード（主系）+ 出力パターンマッチ（補助）+ タイムアウト（安全弁）の3層で実装する。

```rust
enum CompletionSignal {
    ProcessExit(ExitCode),       // 主系: claudeプロセスのexit
    OutputPattern(PatternKind),  // 補助: 進捗・エラー検出
    Timeout(Duration),           // 安全弁: 強制終了
}

enum PatternKind {
    Progress,   // 実行中の進捗表示用
    Error,      // エラー検出用
    // ⚠️ 具体的なパターン文字列は実装フェーズで実測して決定
    // → Step 11-B で claude コマンドの実出力をキャプチャして確定
}
```

**⚠️ 実測が必要な項目（Step 11-B タスク）:**

出力パターンマッチで使う文字列は、Claude Codeの公式仕様として公開されていないため、実装フェーズで以下の手順で確定する。

```bash
# Step 11-B 開始時に実施
# 複数のタスクパターンで実行し出力を記録する
claude "簡単なタスク" 2>&1 | tee logs/claude-simple.log
claude "ファイル修正タスク" 2>&1 | tee logs/claude-fileop.log
claude "エラーが起きるタスク" 2>&1 | tee logs/claude-error.log

# ログを分析してパターンを抽出
# → PatternKindの具体値として設計書に追記する
```

**注意**: Claude Codeのバージョンアップで出力フォーマットが変わる可能性があるため、パターンマッチはプロセス終了コードの補助として位置づけ、単独で完了判断しない。

---

### 9.5 エラーハンドリング方針: **ケース別対応**

**決定**: Workerエラーの状況に応じて以下の挙動をとる。

| ケース | 状況 | 挙動 |
|--------|------|------|
| **Case A** | 1つのWorkerがエラー | エラーWorkerのみ自動リトライ（1回）。リトライ後もエラーならCase Bに準じる |
| **Case B** | 複数Workerがエラー（一部成功） | 成功したWorkerの変更だけマージして部分完了とする。エラーWorkerはサマリーに明記 |
| **Case C** | 全Workerがエラー | ユーザーに選択させる（全破棄 or 部分マージ） |

```rust
enum ErrorPolicy {
    // Case A: 1Workerエラー → 自動リトライ
    AutoRetry { max_attempts: u32 }, // max_attempts = 1

    // Case B: 複数エラー（一部成功）→ 部分完了
    PartialMerge,

    // Case C: 全エラー → ユーザー選択
    UserDecision,
}

enum UserDecision {
    DiscardAll,   // 全破棄（ブランチを削除）
    PartialMerge, // 成功分だけマージ（Case Cでは0件）
}
```

**UIフロー:**
```
Case A:
  ❌ W2 エラー検出
    → 自動リトライ中... 🔄
    → 成功 ✅ / 失敗 → Case Bへ

Case B:
  ⚠️ 一部のWorkerが失敗しました
  成功: W1, W3 / 失敗: W2
  → 成功分（W1, W3）を自動マージして完了

Case C:
  ❌ 全てのWorkerが失敗しました
  [全破棄] [部分マージ（0件）]
```

---

### 9.6 マージコンフリクト時のUI: **C案（diff表示）**

**決定**: DevNest内でdiff表示 + 解決アクションUIを実装する。

**実装構成:**

```
Rust側:
  git merge実行 → コンフリクト検出
  <<<<<<< / ======= / >>>>>>> マーカーをパース
  コンフリクトブロックを構造化してフロントに渡す

React側:
  CodeMirror 6 の MergeView（公式）をそのまま活用
  ┌─────────────────────────────────────┐
  │ ⚠️ App.tsx コンフリクト              │
  │                                     │
  │ [Worker-1]        │  [Worker-2]      │
  │ import { A }...   │  import { B }... │
  │ （差分ハイライト）                    │
  │                                     │
  │ [W1を採用][W2を採用][両方][手動編集]  │
  └─────────────────────────────────────┘

解決後:
  git add → git commit で自動コミット
```

**実装工数見積もり:** 4〜4.5日（Step 11-E内で実施）

**将来フェーズ（D案）: AI自動解決**

コンフリクト箇所をClaude APIに渡し、両Workerの変更意図を理解した上で自動統合する。

```
コンフリクトブロック + 各Workerのタスク説明
        ↓ Claude API
「Worker-1はimport追加、Worker-2も別のimport追加
  → 両方を採用してimport文を統合」
        ↓
自動解決案をMergeViewに表示
ユーザーが承認 or 手動修正
```

```rust
// 将来実装イメージ
struct ConflictBlock {
    file: PathBuf,
    ours: String,       // worker-A側
    theirs: String,     // worker-B側
    context: String,    // 前後のコード
    task_a: SubTask,    // worker-Aのタスク説明
    task_b: SubTask,    // worker-Bのタスク説明
}
// → Claude APIに渡して解決案を生成
```

### 9.7 設定画面のUI仕様: **B案（Orchestratorパネル内モーダル）**

**決定**: Orchestratorパネルの⚙️アイコンからモーダルで設定を開く。画面遷移なしで文脈を途切れさせない。

**設定項目:**

| 設定項目 | デフォルト | 範囲 |
|---------|-----------|------|
| 並列Worker上限 | 4 | 2 / 4 / 6 / 8 |
| タイムアウト | 30分 | 5〜120分 |
| Gitブランチプレフィックス | `swarm/worker-` | 自由入力 |

**UIイメージ:**
```
Orchestratorパネル
┌─────────────────────────────────┐
│ 🤖 DevNest Swarm           ⚙️  │ ← クリックでモーダル
│ タスクを入力...                  │
└─────────────────────────────────┘

⚙️モーダル
┌─────────────────────────────────┐
│ ⚙️ Swarm設定            [✕]    │
├─────────────────────────────────┤
│ 並列Worker上限                   │
│  ┌──┬──┬──┬──┐                 │
│  │ 2│●4│  6│  8│               │
│  └──┴──┴──┴──┘                 │
│ タイムアウト                      │
│  ◀ ──────●──────── ▶  30分     │
│    5分              120分        │
│ Gitブランチプレフィックス           │
│  [ swarm/worker-           ]    │
│              [キャンセル] [保存]  │
└─────────────────────────────────┘
```

**将来追加予定の設定項目:**
- Shellのデフォルトパス（zsh / bash）
- Claude Codeの起動オプション

---

すべての未決定事項が解決されました。✅

| # | 項目 | 決定内容 |
|---|------|---------|
| 1 | PTYライブラリ | `portable-pty` |
| 2 | 並列Worker上限 | デフォルト4・最大8・設定可能 |
| 3 | Worker間通信 | Phase 11では不要、拡張フィールドのみ確保 |
| 4 | ShellワーカーのステータスUI | 種別バッジのみ（将来アイドル検出に拡張） |
| 5 | マージコンフリクト時のUI | C案（diff表示）、将来D案（AI自動解決） |
| 6 | エラーハンドリング | Case A: 自動リトライ1回 / Case B: 部分完了 / Case C: ユーザー選択 |
| 8 | 設定画面のUI仕様 | B案（Orchestratorパネル内⚙️モーダル） |

---

## 11. 関連ドキュメント

- DevNest Phase 1-5 実装ガイド
- DevNest Phase 6-10 実装計画
- `@xterm/xterm` 既存実装（要確認）
