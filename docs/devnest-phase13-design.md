# DevNest Phase 13 設計書
# Advanced Orchestration — ロール・メッセージング・ガード・監視

**バージョン**: 0.2
**作成日**: 2026-03-16
**ステータス**: 要件定義完了
**前提**: Phase 11（Swarm MVP）・Phase 12（Advanced Swarm）完了済み

---

## 1. 概要

### 1.1 Phase 13の位置づけ

GitHub調査（overstory・agent-orchestrator・CrewAI等）から判明した
DevNestの構造的な不足を解消するフェーズ。

```
Phase 11: 並列実行できる（タイル型ターミナル・基本Swarm）
Phase 12: より賢く動く（依存グラフ・AI解決・動的調整）
Phase 13: より堅牢・自律的に動く ← ここ
  ├── Workerに役割を持たせる（ロールベース）
  ├── Worker同士が通信できる（SQLiteメール）
  ├── 危険な操作をブロックする（ツールガード）
  ├── スタックを自動検知・回復する（Watchdog）
  └── セッションをまたいで学習する（知識蓄積）
```

### 1.2 参考プロジェクト

| プロジェクト | スター | 参考にする機能 |
|-------------|--------|--------------|
| overstory（jayminwest） | ⭐1k | ロール・SQLiteメール・Watchdog・mulch |
| agent-orchestrator（ComposioHQ） | ⭐2.7k | CI統合・ツールガード・プラグイン |
| CrewAI | ⭐100k+ | ロール定義・フロー制御 |

### 1.3 Phase 13で実装するもの

| # | Feature | 概要 |
|---|---------|------|
| 1 | **ロールベースWorker** | scout/builder/reviewer/mergerの4役割 |
| 2 | **Worker間SQLiteメール** | WALモードによるWorker間非同期通信 |
| 3 | **ツール実行ガード** | 危険なgit操作・ファイル書き込みをロールで制限 |
| 4 | **Watchdog・スタック検出** | スタック自動検知・nudge・自動リカバリ |
| 5 | **知識蓄積（Mulch相当）** | セッションをまたいだエラーパターン蓄積 |
| 6 | **クラッシュリカバリ** | Worker途中状態の保存・再開 |
| 7 | **ヘルスチェック** | セルフ診断コマンド |
| 8 | **Worker間コンテキスト共有** | 前Workerの成果物を次Workerに自動注入 |

---

## 2. フィーチャー別要件定義

---

### Feature 13-1: ロールベースWorker

#### 課題
```
Phase 11/12: ClaudeCode / Shell の2種別のみ
→ 「調査だけするWorker」「実装だけするWorker」「レビューだけするWorker」
  を区別できない
→ 全Workerが同じ権限で動いてしまう
```

#### ユーザーストーリー
```
As an orchestrator (Claude),
I want to assign specific roles to Workers,
So that each Worker does only what it's supposed to do
and cannot accidentally break things outside its scope.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-13-01 | Worker役割定義 | scout/builder/reviewer/merger の4役割を定義 |
| F-13-02 | 役割別プロンプトテンプレート | 役割ごとのシステムプロンプトを自動付加 |
| F-13-03 | 役割バッジUI | ペインヘッダーに役割アイコンを表示 |
| F-13-04 | 役割に応じたアクセス制限 | F-13-11（ツールガード）と連携 |

#### 役割定義

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WorkerRole {
    Scout,     // 🔍 調査専門（ファイル読み取りのみ・書き込み禁止）
    Builder,   // 🔨 実装専門（指定ファイルへの書き込みのみ）
    Reviewer,  // 👁️ レビュー専門（読み取りのみ・コメント生成）
    Merger,    // 🔀 マージ専門（git操作のみ）
    Lead,      // 🎯 リード（サブWorker管理・書き込み禁止）
    Shell,     // 🐚 通常シェル（既存）
}
```

#### 役割別システムプロンプト（CLAUDE.md相当）

```markdown
# Scout役割プロンプト
あなたはコード調査の専門家です。
- ファイルを読み込んで分析することに特化してください
- ファイルへの書き込みは一切行わないでください
- 調査結果はJSONフォーマットで出力してください
- 不明な点は推測せず、エスカレーションしてください

出力フォーマット:
{
  "findings": [...],
  "affected_files": [...],
  "risks": [...],
  "recommendation": "..."
}
```

```markdown
# Builder役割プロンプト
あなたは実装の専門家です。
- 以下のファイルのみ変更してください: {assigned_files}
- スコープ外のファイルには触れないでください
- 変更内容をコミットメッセージに詳細に記載してください
- テストが失敗した場合は自動修正を試みてください
```

```markdown
# Reviewer役割プロンプト
あなたはコードレビューの専門家です。
- ファイルへの書き込みは一切行わないでください
- 以下の観点でレビューしてください:
  1. バグ・エラーハンドリング
  2. パフォーマンス
  3. セキュリティ
  4. 設計の一貫性
- レビュー結果はJSONフォーマットで出力してください
```

#### 未決定事項
- [x] Lead役割をPhase 13でサポートするか → **Phase 14以降に先送り。2層構造（Orchestrator→Worker）で十分**
- [x] 役割テンプレートのカスタマイズをUIで提供するか → **B案（.devnest/roles/*.md）。Gitで管理・設定モーダルに「編集」ボタンのみ配置**

---

### Feature 13-2: Worker間SQLiteメール

#### 課題
```
Phase 11/12: Worker間通信なし
→ W1がW2に「ここを見ておいて」と伝えられない
→ OrchestratorがすべてのWorker状態を把握する必要がある
```

#### ユーザーストーリー
```
As a Worker (Claude Code),
I want to send a message to another Worker,
So that I can pass context, findings, or requests
without going through the user.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-13-05 | SQLiteメールストア | .devnest/mail.db にWALモードで保存 |
| F-13-06 | メール送信API | Worker→Worker/Orchestratorへのメッセージ送信 |
| F-13-07 | メール受信・注入 | 起動時に未読メールをWorkerのstdinに注入 |
| F-13-08 | プロトコルメッセージ型 | 8種類の型安全なメッセージ |
| F-13-09 | メールUIパネル | Orchestratorパネルでメール一覧を確認できる |

#### メールプロトコル

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MailMessage {
    WorkerDone {
        from: WorkerId,
        summary: String,
        artifacts: Vec<PathBuf>,
    },
    MergeReady {
        from: WorkerId,
        branch: String,
        files_changed: Vec<PathBuf>,
    },
    Merged {
        from: WorkerId,
        branch: String,
    },
    MergeFailed {
        from: WorkerId,
        reason: String,
    },
    Escalation {
        from: WorkerId,
        question: String,
        context: String,
    },
    HealthCheck {
        from: WorkerId,
        status: WorkerStatus,
    },
    Dispatch {
        from: WorkerId,
        to: WorkerId,
        task: SubTask,
    },
    Assign {
        from: WorkerId,
        to: WorkerId,
        files: Vec<PathBuf>,
    },
}
```

#### SQLiteスキーマ

```sql
-- .devnest/mail.db
CREATE TABLE mail (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_worker TEXT NOT NULL,
    to_worker   TEXT NOT NULL,    -- "orchestrator" or worker_id
    type        TEXT NOT NULL,
    payload     TEXT NOT NULL,    -- JSON
    read        INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    session_id  TEXT NOT NULL
);

CREATE INDEX idx_to_worker_read ON mail(to_worker, read);
CREATE INDEX idx_session ON mail(session_id);
```

#### Worker起動時の注入フロー

```
Worker起動
    ↓
.devnest/mail.db から to_worker = {worker_id} AND read = 0 を取得
    ↓
未読メールをプロンプトに追記して注入:
  「以下のメッセージが届いています:
   [WorkerDone from W1]: renderer.jsの修正完了。
   影響ファイル: src/App.tsx」
    ↓
read = 1 に更新
```

#### 未決定事項
- [x] メール配送タイミング → **A案（起動時のみ注入）。将来Watchdog連動のポーリングに拡張**
- [x] メールの保持期間 → **セッション完了時に.devnest/mail-archive.jsonlへアーカイブ後削除。クラッシュ時はリカバリ用に保持。DevNest起動時に前回の既読メールを削除**
- [ ] Orchestratorパネルのメール表示UI詳細

---

### Feature 13-3: ツール実行ガード

#### 課題
```
Phase 11/12: Workerが何をしても制限なし
→ --dangerously-skip-permissions でgit pushやrm -rfが実行できてしまう
→ reviewerがファイルを書き換えてしまう可能性
```

#### ユーザーストーリー
```
As a system,
I want to mechanically block dangerous operations per role,
So that no Worker can cause irreversible damage outside its scope.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-13-10 | 禁止コマンドリスト | 役割ごとに禁止するgit操作を定義 |
| F-13-11 | PTY出力インターセプト | Workerの入力をRust側で監視・ブロック |
| F-13-12 | ガード違反通知 | 違反検出時にUIに警告を表示 |
| F-13-13 | ファイルスコープ強制 | 指定ファイル外への書き込みを検出・警告 |

#### ロール別ガードルール

```rust
impl WorkerRole {
    pub fn blocked_commands(&self) -> Vec<&str> {
        match self {
            WorkerRole::Scout | WorkerRole::Reviewer | WorkerRole::Lead => vec![
                "git push",
                "git reset --hard",
                "git clean -f",
                "rm -rf",
                "write_file",   // Claude Codeのwrite tool
                "edit_file",    // Claude Codeのedit tool
            ],
            WorkerRole::Builder => vec![
                "git push",           // pushはMergerの役割
                "git reset --hard",
                "git clean -f",
            ],
            WorkerRole::Merger => vec![
                "rm -rf",
            ],
            WorkerRole::Shell => vec![],  // 制限なし
        }
    }
}
```

#### 実装方針

```
Claude CodeのPTY入力を監視する方法:
  OptionA: PTYに書き込まれる前にRust側でインターセプト
    → ユーザーの入力も含まれるため誤検知リスク
    → 実装複雑

  OptionB: PTY出力（Workerが実行しようとするコマンド）を監視
    → パターンマッチでgit push等を検出してWorkerに警告メッセージを注入
    → より現実的

  OptionC: Gitフック（pre-push等）をWorkerのworktreeに設定
    → git操作に限り確実にブロックできる
    → 実装シンプル・実績あり
```

#### 未決定事項
- [x] ガード実装方式 → **D案（Gitフック + ロールプロンプト）。git操作はフックで機械的ブロック、ファイル書き込みはロール定義で自律制御**
- [x] ガード違反時の挙動 → **C案（種別ごと）。Gitフック違反はUI通知のみ・ロール違反はユーザーに[継続/停止]を選ばせる**
- [ ] ファイルスコープ強制の粒度（ファイル単位 vs ディレクトリ単位）

---

### Feature 13-4: Watchdog・スタック検出

#### 課題
```
Phase 11/12:
  タイムアウト（30分）で強制終了するのみ
  スタック（無限ループ・フリーズ）の自動検知なし
  → 実際には数分で詰まっているのに30分待つことになる
```

#### ユーザーストーリー
```
As a developer,
I want DevNest to automatically detect stalled Workers
and attempt recovery without my intervention,
So that I don't waste time waiting for stuck processes.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-13-14 | アクティビティ監視 | 一定時間出力がないWorkerをスタックと判断 |
| F-13-15 | Nudge機能 | スタックしたWorkerにシグナルを送って再活性化 |
| F-13-16 | 自動リカバリ | Nudge失敗後に再起動・タスク再割り当て |
| F-13-17 | Watchdogデーモン | バックグラウンドでWorker状態を定期監視 |
| F-13-18 | スタックUI表示 | スタックWorkerをUIで強調表示 |

#### スタック判定ロジック

```rust
struct WatchdogConfig {
    // 最後の出力から何秒でスタックと判断するか
    stall_threshold_secs: u64,    // デフォルト: 120秒（設定で30〜600秒に変更可能）
    // Nudge試行回数
    nudge_max_attempts: u32,      // デフォルト: 3回
    // Nudge間隔
    nudge_debounce_ms: u64,       // デフォルト: 500ms
    // 監視間隔
    poll_interval_secs: u64,      // デフォルト: 30秒
}

enum WatchdogAction {
    Nudge(WorkerId),       // 軽いシグナル（Enterキー相当を送る）
    Restart(WorkerId),     // プロセス再起動
    Escalate(WorkerId),    // ユーザーに通知して判断を委ねる
}
```

#### Nudgeの実装

```rust
// スタック検出時の対応フロー
async fn handle_stall(worker_id: &str, attempt: u32) -> WatchdogAction {
    match attempt {
        0..=2 => {
            // Nudge: PTYにEnterキー相当を送る
            write_to_pty(worker_id, b"\n").await;
            WatchdogAction::Nudge(worker_id.to_string())
        }
        3 => {
            // リスタート
            WatchdogAction::Restart(worker_id.to_string())
        }
        _ => {
            // ユーザーにエスカレーション
            WatchdogAction::Escalate(worker_id.to_string())
        }
    }
}
```

#### 未決定事項
- [x] スタック閾値のデフォルト値 → **120秒。設定画面で30〜600秒に変更可能**
- [x] Nudge実装方法 → **A案（\nをPTYに送信）。overstory実証済み・write_to_worker()の1行で実装**
- [x] Watchdog起動方式 → **C案（Batch Worker存在時に自動起動・全Batch Worker終了時に自動停止）**

---

### Feature 13-5: 知識蓄積（Mulch相当）

#### 課題
```
Phase 11/12: セッションをまたいだ学習なし
→ 同じエラーパターンを毎回Workerが再発見する
→ 「このプロジェクトでは○○に注意」という知識が蓄積されない
```

#### ユーザーストーリー
```
As an orchestrator (Claude),
I want to accumulate knowledge from past sessions,
So that Workers automatically avoid known pitfalls
and apply proven patterns from day one.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-13-19 | 知識ストア | .devnest/knowledge.md にMarkdownで蓄積 |
| F-13-20 | 自動抽出 | Worker完了時にエラーパターン・解決策を自動抽出 |
| F-13-21 | 知識注入 | Worker起動時に関連知識をプロンプトに追加 |
| F-13-22 | 知識管理UI | 蓄積された知識の確認・編集・削除 |
| F-13-23 | プロジェクト別管理 | プロジェクトごとに知識を分離管理 |

#### 知識ストアの形式

```markdown
<!-- .devnest/knowledge.md -->

# DevNest Swarm 知識ベース

## エラーパターン

### PTY接続エラー
- **発生条件**: portable-ptyでmacOS 14以降
- **症状**: `Error: PTY spawn failed`
- **解決策**: `launchctl`でのプロセス起動が必要
- **記録日**: 2026-03-15
- **発生回数**: 3

### TypeScript型エラー多発ファイル
- **ファイル**: `src/renderer/App.tsx`
- **注意点**: `useState`の型引数が省略されているケースが多い
- **推奨アプローチ**: 変更前に型チェックを先に実行
- **記録日**: 2026-03-15

## プロジェクト固有の制約
- `src/core/` 配下は変更禁止（Phase 1-5の安定コア）
- テストは必ず`cargo test`で通過確認してからコミット
```

#### 自動抽出ロジック

```rust
// Worker完了時に呼ばれる
async fn extract_knowledge(
    worker_output: &str,
    task: &SubTask,
    outcome: WorkerOutcome,  // Success / Error
) -> Vec<KnowledgeEntry> {
    // Claude APIで要約・構造化
    let prompt = format!(
        "以下のWorker実行ログから学習すべき知識を抽出してください。\n\
         タスク: {}\n結果: {:?}\n\nログ:\n{}",
        task.instruction, outcome, worker_output
    );
    // → KnowledgeEntry[]を返す
}
```

#### Worker起動時の注入

```
Worker起動プロンプト:
  「[重要] このプロジェクトの注意事項:
   - src/renderer/App.tsxの変更時は事前に型チェックを実行してください
   - portable-ptyのエラーが出た場合は...
   [過去の類似タスクでの解決策]
   - 同様のTypeScript修正タスクでは...」
```

#### 未決定事項
- [x] 知識の有効期限 → **D案（カテゴリ別）。エラーパターン・プロジェクト制約は永続、自動抽出メモは30日で削除**
- [x] 知識抽出のタイミング → **B案（セッション完了時に一括）。ResultAggregatorと同タイミングで実行**
- [ ] 知識の信頼度スコア（発生回数・成功率）

---

### Feature 13-6: クラッシュリカバリ

#### 課題
```
Phase 11/12:
  Workerがクラッシュしたら最初からやり直し
  → 途中まで完了していた作業が失われる
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-13-24 | セッション状態保存 | .devnest/sessions.db にWorker状態を永続化 |
| F-13-25 | クラッシュ検出 | 異常終了を検知してリカバリモードに入る |
| F-13-26 | 途中再開 | 完了済みSubTaskをスキップして未完了から再開 |
| F-13-27 | リカバリUI | クラッシュ後の再開確認ダイアログ |

#### 状態保存スキーマ

```sql
-- .devnest/sessions.db
CREATE TABLE sessions (
    id           TEXT PRIMARY KEY,
    created_at   TEXT,
    task_input   TEXT,    -- 元のタスク文字列
    status       TEXT     -- running / completed / crashed
);

CREATE TABLE session_workers (
    session_id   TEXT,
    worker_id    TEXT,
    role         TEXT,
    subtask_id   INTEGER,
    status       TEXT,    -- waiting/running/done/error/skipped
    branch       TEXT,
    started_at   TEXT,
    completed_at TEXT,
    PRIMARY KEY (session_id, worker_id)
);
```

#### 再開フロー

```
DevNest起動時
    ↓
sessions.db に status='crashed' のセッションがあるか確認
    ↓ あった場合
「前回のSwarmセッションが中断されています。
  完了済み: W1 ✅ W3 ✅
  未完了:   W2 ❌ W4 ⏸
  再開しますか？ [再開] [破棄]」
    ↓ 再開を選択
完了済みSubTaskをスキップ → 未完了Workerを再起動
```

#### 未決定事項
- [x] クラッシュ検出方法 → **C案（プロセス終了コード + ハートビート）。Watchdogの30秒ポーリングと連動してheartbeat_atを更新。DevNest起動時に5分以上古いセッションをクラッシュ判定**
- [x] 再開時のGitブランチ扱い → **C案（コミット有無で切り替え）。途中コミットあり→既存ブランチ継続、なし→新規ブランチ作成**

---

### Feature 13-7: ヘルスチェック

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-13-28 | セルフ診断コマンド | DevNest自身の健全性を診断 |
| F-13-29 | 診断カテゴリ | 8カテゴリの診断を実行 |
| F-13-30 | 自動修正 | 修正可能な問題を自動で解決 |

#### 診断カテゴリ

```
1. dependencies  claude/git/portable-ptyなど依存ツールの存在確認
2. config        設定値の妥当性チェック
3. databases     mail.db / sessions.db / knowledge.md の整合性
4. agents        実行中Workerのゾンビプロセス確認
5. git           worktreeの状態・孤立ブランチ確認
6. resources     CPU/メモリの現在状態
7. api           Claude APIへの疎通確認
8. logs          ログファイルのサイズ・ローテーション確認
```

---

### Feature 13-8: Worker間コンテキスト共有

#### 課題
```
Phase 11/12:
  各Workerは自分のタスクしか知らない
  → W1がAPIを修正してもW2はその変更内容を知らない
  → W2が古い仮定でコードを書いてしまう
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-13-31 | 成果物記録 | Worker完了時にgit diffを.devnest/context.jsonに保存 |
| F-13-32 | コンテキスト注入 | 依存Workerの成果物を次Workerのプロンプトに自動追加 |
| F-13-33 | コンテキストUI | Orchestratorパネルで成果物サマリーを確認できる |

#### 成果物記録フォーマット

```json
// .devnest/context.json
{
  "session_id": "swarm-abc123",
  "artifacts": {
    "worker-1": {
      "role": "builder",
      "completed_at": "2026-03-16T10:30:00Z",
      "modified_files": ["src/api.ts"],
      "git_diff_summary": "ApiResponse型を統一。status: numberを追加",
      "exported_symbols": ["ApiResponse", "RequestConfig"]
    }
  }
}
```

---

## 3. 実装優先度

| 優先度 | Feature | 理由 |
|--------|---------|------|
| 🔴 高 | 13-1 ロールベースWorker | 13-3・13-4の前提。安全性の土台 |
| 🔴 高 | 13-3 ツール実行ガード | ロールと連動。危険操作防止は必須 |
| 🔴 高 | 13-4 Watchdog・スタック検出 | 実用性に直結。放置されるWorkerを防ぐ |
| 🟡 中 | 13-2 Worker間SQLiteメール | 自律性向上。Phase 12依存グラフの自然な延長 |
| 🟡 中 | 13-8 コンテキスト共有 | Worker間通信の最もシンプルな形 |
| 🟡 中 | 13-6 クラッシュリカバリ | 長時間タスクの安全性 |
| 🟢 低 | 13-5 知識蓄積 | 効果大だが実装複雑。後回し可 |
| 🟢 低 | 13-7 ヘルスチェック | あると便利だが緊急性低 |

---

## 4. Stepマップ

| Step | Feature | 内容 |
|------|---------|------|
| 13-A | 13-1 + 13-3 | ロールベースWorker + ツールガード |
| 13-B | 13-4 | Watchdog・スタック検出・Nudge |
| 13-C | 13-2 + 13-8 | SQLiteメール + コンテキスト共有 |
| 13-D | 13-6 | クラッシュリカバリ |
| 13-E | 13-5 + 13-7 | 知識蓄積 + ヘルスチェック |

---

## 5. 未決定事項まとめ

| # | Feature | 項目 | 状態 |
|---|---------|------|------|
| 1 | 13-1 | Lead役割をPhase 13でサポートするか | ✅ Phase 14以降に先送り |
| 2 | 13-1 | 役割テンプレートのカスタマイズUI | ✅ B案（.devnest/roles/*.md・Gitで管理） |
| 3 | 13-2 | メール配送タイミング | ✅ A案（起動時のみ・将来ポーリングに拡張） |
| 4 | 13-2 | メールの保持期間 | ✅ セッション完了時アーカイブ・クラッシュ時保持・起動時既読削除 |
| 5 | 13-3 | ガード実装方式 | ✅ D案（Gitフック + ロールプロンプトの2層） |
| 6 | 13-3 | ガード違反時の挙動 | ✅ C案（Gitフック違反→UI通知のみ・ロール違反→ユーザー判断） |
| 7 | 13-4 | スタック閾値のデフォルト値 | ✅ 120秒・設定で30〜600秒に変更可能 |
| 8 | 13-4 | Nudge実装方法 | ✅ A案（\nをPTYに送信） |
| 9 | 13-4 | Watchdog自動起動 vs 手動起動 | ✅ C案（Batch Worker存在時に自動起動・終了時に自動停止） |
| 10 | 13-5 | 知識の有効期限 | ✅ D案（カテゴリ別：永続 / 30日自動削除） |
| 11 | 13-5 | 知識抽出のタイミング | ✅ B案（セッション完了時一括・ResultAggregatorと連動） |
| 12 | 13-6 | クラッシュ検出方法 | ✅ C案（終了コード + ハートビート・5分閾値） |
| 13 | 13-6 | 再開時のGitブランチ扱い | ✅ C案（コミット有無で切り替え） |

---

## 6. ClaudeがAIオーケストレーターとして開発する際の観点

### Claudeがworkerに要求すること

```
1. タスク完了シグナルの明確な出力
   → 「TASK_COMPLETE: {summary}」形式で終了を宣言

2. ファイルスコープの厳守
   → 割り当てられたファイル以外に触れない

3. エスカレーションプロトコルの遵守
   → 判断できない場合は Escalation メールを送信して停止

4. 構造化ログの出力
   → 何を読んで何を変えたかをJSONで記録

5. 知識の報告
   → 発見したエラーパターンや注意点を完了時に報告
```

### Claudeが人間に要求すること

```
1. タスクスペックの明確化
   → 「何を・どこまで・何を変えてはいけないか」を事前に定義

2. 承認ゲートへの即時対応
   → Escalationメールが来たら迅速にフィードバック

3. 知識ベースへの貢献
   → 「このプロジェクト固有の制約」を事前に登録

4. ロール設計の責任
   → どのWorkerにどのロールを割り当てるかを決定

5. マージ判断
   → コンフリクト解決の最終判断は人間が行う
```

---

## 7. 関連ドキュメント

- devnest-phase11-design.md
- devnest-phase12-design.md
- devnest-phase12-steps-impl.md
- devnest-test-design.md

## 8. 参考リポジトリ

- https://github.com/jayminwest/overstory（SQLiteメール・Watchdog・mulch・ツールガード）
- https://github.com/ComposioHQ/agent-orchestrator（ロール・CI統合・プラグイン）
- https://github.com/crewAIInc/crewAI（ロール定義・フロー制御）
