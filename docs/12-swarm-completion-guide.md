# DevNest Swarm機能 完成計画 実装指示書

> **目的**: 既存swarm骨格（14ファイル）を本格稼働させる4つの実装ステップ。
> **前提**: orchestrator.rs, task_splitter.rs, commands/swarm.rs 等が実装済み。
> **ブランチ規則**: `feature/swarm-<step>` (例: `feature/swarm-ui`)

---

## 現状の swarm アーキテクチャ

```
commands/swarm.rs (Tauriコマンド — 全コマンド実装済み)
    │
    ├── split_task         → TaskSplitter (Claude APIでタスク分解)
    ├── orchestrator_start → Orchestrator (依存グラフ解析→Worker並列起動)
    ├── orchestrator_notify_worker_done → 依存チェーン解決→次Wave起動
    ├── orchestrator_merge_all         → 成功ブランチ一括マージ
    ├── orchestrator_ai_resolve_conflict → AIコンフリクト解決
    └── spawn_worker / kill_worker / list_workers → Worker管理
```

**足りないもの**: UI画面、doc-mapping連携、Agentic Flow統合、通知リング連携

---

## Step 1: Swarm UI画面の実装

### 目標
swarmの全機能をGUIから操作・監視できるようにする。

### 画面配置
サイドバーの「管理」セクション内、エージェントの下に配置。
既存の `commands/swarm.rs` のTauriコマンドをフロントエンドから呼び出す。

```
── 管理 ──────────────
🤖 エージェント
🐝 Swarm            ← 新規追加
📊 スプリント
```

### 画面構成: SwarmScreen (`/swarm`)

```
┌─────────────────────────────────────────────────────────────┐
│  🐝 Swarm                                                   │
│  [タスク分解] [実行中] [コンフリクト] [履歴]                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  （選択中のタブの内容を表示）                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### タブ1: タスク分解 (`/swarm/split`)

```
┌─────────────────────────────────────────────────────────────┐
│  タスク分解                                                  │
│                                                             │
│  ┌─ プロンプト入力 ──────────────────────────────────────┐  │
│  │ タスクの内容を入力...                                  │  │
│  │                                                       │  │
│  │ 例: "認証機能をOAuth2.0に移行したい。                   │  │
│  │      既存のsession認証も並行して維持する"               │  │
│  │                                                       │  │
│  │ [コンテキストファイルを追加]                             │  │
│  └───────────────────────────────────────────────────────┘  │
│  [🔀 タスク分解を実行]                                       │
│                                                             │
│  ┌─ 分解結果 ────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  Wave 1 (並列可能)                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐             │  │
│  │  │ #1 DB スキーマ   │  │ #2 OAuth設定    │             │  │
│  │  │ depends: なし    │  │ depends: なし    │             │  │
│  │  │ files: schema/  │  │ files: config/  │             │  │
│  │  └─────────────────┘  └─────────────────┘             │  │
│  │          │                     │                       │  │
│  │          ▼                     ▼                       │  │
│  │  Wave 2 (Wave 1完了後)                                  │  │
│  │  ┌─────────────────┐  ┌─────────────────┐             │  │
│  │  │ #3 認証ミドル    │  │ #4 テスト追加    │             │  │
│  │  │ depends: [1,2]  │  │ depends: [1]    │             │  │
│  │  └─────────────────┘  └─────────────────┘             │  │
│  │                                                       │  │
│  │  ⚠️ ファイル競合警告: #1と#3が schema/ を共有           │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ 設定 ────────────────────────────────────────────────┐  │
│  │ 最大Worker数: [4 ▾]  タイムアウト: [30分 ▾]            │  │
│  │ ☐ --dangerously-skip-permissions                      │  │
│  │ ☐ 高信頼度コンフリクトの自動承認                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [🚀 Swarm実行を開始]                                        │
└─────────────────────────────────────────────────────────────┘
```

**やること**:

1. `SwarmSplitTab.tsx` を作成
2. プロンプト入力エリア（テキストエリア + コンテキストファイル選択）
3. 「タスク分解を実行」ボタン → `split_task` Tauriコマンド呼び出し
4. 分解結果の依存グラフ可視化:
   - `SubTask.depends_on` からWave構造を自動算出
   - Wave単位でグルーピング表示
   - 依存関係を矢印で視覚化
5. ファイル競合警告の表示（`conflict_warnings`）
6. 循環依存エラーの表示（`cycle_error`）
7. SwarmSettings の設定UI
8. 「Swarm実行を開始」ボタン → `orchestrator_start` 呼び出し

```typescript
// Wave構造の算出ロジック（フロントエンド側）
function computeWaves(tasks: SubTask[]): SubTask[][] {
  const waves: SubTask[][] = [];
  const done = new Set<number>();

  while (done.size < tasks.length) {
    const wave = tasks.filter(t =>
      !done.has(t.id) &&
      t.depends_on.every(dep => done.has(dep))
    );
    if (wave.length === 0) break; // 循環依存
    waves.push(wave);
    wave.forEach(t => done.add(t.id));
  }
  return waves;
}
```

### タブ2: 実行中 (`/swarm/running`)

```
┌─────────────────────────────────────────────────────────────┐
│  実行中: run-abc12345                                        │
│  ステータス: 🟡 Running    進捗: 2/5 完了                    │
│  ベースブランチ: develop                                      │
│                                                             │
│  ┌─ Worker一覧 ──────────────────────────────────────────┐  │
│  │                                                       │  │
│  │ ✅ #1 DBスキーマ     worker-abc-1  Done     2m 30s    │  │
│  │ ✅ #2 OAuth設定      worker-abc-2  Done     1m 45s    │  │
│  │ 🔄 #3 認証ミドル     worker-abc-3  Running  3m 12s    │  │
│  │ 🔄 #4 テスト追加     worker-abc-4  Running  1m 05s    │  │
│  │ ⏳ #5 E2Eテスト      (待機中)      Waiting  depends:[3,4]│
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ リソース ───────────────────────────────────────────┐   │
│  │ CPU: ████████░░ 78%    Memory: ██████░░░░ 62%        │   │
│  │ Workers: 2/4 active                                   │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ ライブログ（選択Worker） ────────────────────────────┐   │
│  │ [worker-abc-3] ファイルを分析中...                     │   │
│  │ [worker-abc-3] src/auth/middleware.rs を編集中          │   │
│  │ [worker-abc-4] テストケースを生成中...                  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                             │
│  [⏸️ 一時停止]  [❌ キャンセル]                               │
└─────────────────────────────────────────────────────────────┘
```

**やること**:

1. `SwarmRunningTab.tsx` を作成
2. `orchestrator_get_status` を定期ポーリング（1秒間隔）or Tauriイベント `orchestrator-status-changed` をリッスン
3. Worker一覧: ExecutionState に応じたアイコン（✅Done / 🔄Running / ⏳Waiting / ❌Error / ⏭️Skipped）
4. 経過時間のリアルタイム表示
5. リソースモニター: `get_system_resources` コマンドで CPU/Memory を表示
6. ライブログ: Worker選択 → ターミナル出力のストリーム表示（`worker-output` イベント）
7. キャンセルボタン → `orchestrator_cancel`
8. 全Worker完了 → 「マージ実行」ボタン表示

### タブ3: コンフリクト (`/swarm/conflicts`)

```
┌─────────────────────────────────────────────────────────────┐
│  コンフリクト解決                                             │
│                                                             │
│  2件のコンフリクトが検出されました                             │
│                                                             │
│  ┌─ src/auth/middleware.rs (行 42-58) ───────────────────┐  │
│  │                                                       │  │
│  │  <<<<<<< ours (worker-abc-3)                          │  │
│  │  fn authenticate(req: &Request) -> Result<User> {     │  │
│  │      let token = extract_bearer(req)?;                │  │
│  │  =======                                              │  │
│  │  fn authenticate(req: &Request) -> AuthResult {       │  │
│  │      let token = extract_oauth_token(req)?;           │  │
│  │  >>>>>>> theirs (worker-abc-4)                        │  │
│  │                                                       │  │
│  │  🤖 AI解決案:                                          │  │
│  │  fn authenticate(req: &Request) -> Result<User> {     │  │
│  │      let token = extract_oauth_token(req)?;           │  │
│  │  信頼度: 🟢 High                                       │  │
│  │                                                       │  │
│  │  [AI案を採用] [Oursを採用] [Theirsを採用] [手動編集]   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  [全件解決してコミット]                                       │
└─────────────────────────────────────────────────────────────┘
```

**やること**:

1. `SwarmConflictsTab.tsx` を作成
2. `orchestrator_get_conflicts` でコンフリクトブロック取得
3. ours/theirs のdiff表示（シンタックスハイライト付き）
4. 「AI解決案」ボタン → `orchestrator_ai_resolve_conflict` 呼び出し
5. 解決方法選択 → `orchestrator_resolve_conflict` 呼び出し
6. 全件解決後 → `orchestrator_commit_resolution` でコミット

### タブ4: 履歴 (`/swarm/history`)

過去のswarm実行結果を一覧表示。

**やること**:
1. `SwarmHistoryTab.tsx` を作成
2. 実行履歴をSQLiteに保存（`orchestrator_run` テーブル追加）
3. 実行ごとの成功/失敗/マージ結果を表示

### コンポーネントツリー

```
SwarmScreen
├── SwarmTabs
├── SwarmSplitTab
│   ├── PromptInput
│   ├── ContextFileSelector
│   ├── DependencyGraph          ← Wave構造の可視化
│   ├── ConflictWarnings
│   ├── SwarmSettingsPanel
│   └── StartButton
├── SwarmRunningTab
│   ├── WorkerList
│   │   └── WorkerCard           ← 各Worker状態表示
│   ├── ResourceMonitor          ← CPU/Memory
│   ├── WorkerLogPanel           ← ライブログ
│   └── ActionButtons            ← 一時停止/キャンセル/マージ
├── SwarmConflictsTab
│   ├── ConflictBlockView        ← diff表示
│   ├── AiResolutionPanel        ← AI解決案
│   └── ResolutionActions        ← 採用/手動編集
└── SwarmHistoryTab
    └── RunHistoryList
```

### ルーティング追加

```
/swarm              → SwarmScreen
/swarm/split        → タスク分解タブ
/swarm/running      → 実行中タブ
/swarm/conflicts    → コンフリクトタブ
/swarm/history      → 履歴タブ
```

### サイドバー更新

`08-ui-component-design.md` に追加:

```
── 管理 ──────────────
🤖 エージェント
🐝 Swarm              ← 新規
📊 スプリント
```

---

## Step 2: doc-mapping連携

### 目標
TaskSplitterがタスク分解する際に、doc-mappingの設計書コンテキストを自動注入する。
各Workerに関連設計書の内容が渡されるようにする。

### やること

**ファイル変更**: `src-tauri/src/swarm/task_splitter.rs`

1. `TaskSplitter::split()` のシステムプロンプトを拡張:

```rust
// task_splitter.rs の SYSTEM_PROMPT に追加
const SYSTEM_PROMPT_WITH_DOCS: &str = r#"あなたはタスク分解の専門家です。
...（既存のプロンプト）...

追加制約:
- 各サブタスクの instruction に、関連する設計書のパスを参照指示として含めること
- 設計書の内容とソースコードの整合性を維持するよう指示すること
- 設計書の frontmatter (last_synced_commit, version) を更新するよう指示すること
"#;
```

2. `split()` に doc-mapping コンテキストを追加:

```rust
pub async fn split_with_docs(
    &self,
    prompt: &str,
    project_path: &str,
    context_files: &[String],
    doc_index: &DocIndex,          // 追加: doc-mappingインデックス
) -> Result<Vec<SubTask>> {
    // 1. context_files からdoc-mapで関連設計書を検索
    let related_docs = find_related_docs(context_files, doc_index);

    // 2. 設計書の内容をコンテキストに追加
    let doc_context = format_doc_context(&related_docs);

    // 3. 拡張プロンプトでClaude APIに送信
    let user_message = format!(
        "プロジェクト: {}\n\nタスク:\n{}\n\n関連設計書:\n{}\n\nファイル構成:\n{}",
        project_path, prompt, doc_context,
        context_files.join("\n")
    );

    // ...
}
```

3. 各Worker の instruction に設計書参照を自動付与:

```rust
// orchestrator.rs の make_worker_config を拡張
fn make_worker_config_with_docs(
    assign: &WorkerAssignment,
    repo: &PathBuf,
    run_id: &str,
    settings: &SwarmSettings,
    doc_index: &DocIndex,
) -> WorkerConfig {
    let mut metadata = HashMap::new();

    // 既存の metadata 設定...

    // doc-mapping: タスクの対象ファイルから関連設計書を特定
    let related_docs: Vec<String> = assign.task.files.iter()
        .flat_map(|f| doc_index.find_docs_for_source(f))
        .map(|entry| entry.doc.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    if !related_docs.is_empty() {
        let doc_instruction = format!(
            "\n\n## 関連設計書\n以下の設計書を参照し、実装との整合性を維持してください:\n{}\n\n実装完了後、設計書の frontmatter (last_synced_commit, version) を更新してください。",
            related_docs.iter().map(|d| format!("- {}", d)).collect::<Vec<_>>().join("\n")
        );
        let instruction = metadata.get("task_instruction").cloned().unwrap_or_default();
        metadata.insert("task_instruction".to_string(), format!("{}{}", instruction, doc_instruction));
    }

    // ...
}
```

**ファイル変更**: `src-tauri/src/commands/swarm.rs`

4. `split_task` コマンドに doc_index を渡す:

```rust
#[tauri::command]
pub async fn split_task(
    request: SplitTaskRequest,
    state: State<'_, AppState>,
) -> Result<SplitTaskResult, String> {
    let api_key = load_anthropic_key(&state).await?;
    let splitter = TaskSplitter::new(&api_key);

    // doc-mapping インデックスを読み込み
    let doc_index = load_doc_index(&request.project_path).ok();

    let tasks = if let Some(index) = &doc_index {
        splitter.split_with_docs(
            &request.prompt, &request.project_path,
            &request.context_files, index
        ).await
    } else {
        splitter.split(
            &request.prompt, &request.project_path,
            &request.context_files
        ).await
    }.map_err(|e| e.to_string())?;

    // ...
}
```

---

## Step 3: Agentic Flow統合

### 目標
保守スキャンの結果からswarmを自動発動できるようにする。
Agentic Flowのタスクとしてswarm実行を組み込む。

### やること

**ファイル変更**: `src-tauri/src/agent/task.rs` (既存のTaskType拡張)

1. TaskType に SwarmExecution を追加:

```rust
pub enum TaskType {
    // ... 既存のタスク型 ...

    /// Swarm並列実行（複数サブタスクを同時進行）
    SwarmExecution {
        prompt: String,
        settings: SwarmSettings,
    },
}
```

2. SwarmExecution のハンドラ実装:

```rust
// Agentic FlowのタスクハンドラからSwarm Orchestratorを起動
async fn handle_swarm_execution(
    task: &AgentTask,
    prompt: &str,
    settings: &SwarmSettings,
    app: &AppHandle,
) -> Result<TaskResult, AgentError> {
    // 1. TaskSplitterでサブタスク分解
    let subtasks = split_task_for_agent(prompt, &task.product_id).await?;

    // 2. Orchestrator起動
    let run = start_orchestrator_run(subtasks, settings.clone(), app).await?;

    // 3. 完了を待機（orchestrator-merge-done イベント）
    let result = wait_for_orchestrator_completion(&run.run_id, app).await?;

    Ok(TaskResult::SwarmCompleted(result))
}
```

**ファイル作成**: `src-tauri/src/swarm/agentic_bridge.rs`

3. 保守→Swarm自動発動のブリッジ:

```rust
/// 保守スキャン結果からswarmタスクを自動生成
pub fn create_swarm_tasks_from_maintenance(
    scan_result: &MaintenanceScanResult,
    product: &Product,
) -> Vec<AgentTask> {
    let mut tasks = Vec::new();

    // カバレッジ低下 → テスト追加swarm
    if scan_result.coverage_drop > 2.0 {
        let hot_paths = scan_result.hot_paths.iter()
            .take(5)
            .map(|p| p.file_path.clone())
            .collect::<Vec<_>>();

        tasks.push(AgentTask::new(
            TaskType::SwarmExecution {
                prompt: format!(
                    "以下のファイルにユニットテストを追加してください:\n{}",
                    hot_paths.join("\n")
                ),
                settings: SwarmSettings::default(),
            },
            product.id.clone(),
            TaskPriority::Medium,
        ));
    }

    // 技術的負債が閾値超過 → リファクタリングswarm
    if scan_result.debt_score > 70.0 {
        let top_candidates = scan_result.refactor_candidates.iter()
            .take(3)
            .map(|c| format!("- {} (score: {:.2})", c.file_path, c.score))
            .collect::<Vec<_>>();

        tasks.push(AgentTask::new(
            TaskType::SwarmExecution {
                prompt: format!(
                    "以下のファイルをリファクタリングしてください:\n{}",
                    top_candidates.join("\n")
                ),
                settings: SwarmSettings { max_workers: 3, ..Default::default() },
            },
            product.id.clone(),
            TaskPriority::Low,
        ));
    }

    tasks
}
```

4. ワークフローYAMLへの swarm ステップ追加:

```yaml
# .devnest/workflows/weekly-maintenance.yaml に追加
  - name: test-coverage-swarm
    action: evaluate
    condition: "scan.result.coverage_drop > 2.0"
    on_true: run-test-swarm
    on_false: report

  - name: run-test-swarm
    action: swarm_execution
    params:
      prompt: "ホットパスにユニットテストを追加"
      max_workers: 3
    requires_approval: true
    next: report
```

---

## Step 4: 通知リング連携

### 目標
Swarm Worker の状態変化を通知リングシステムに接続し、
サイドバーのSwarmメニューにリアルタイムフィードバックを提供する。

### やること

**ファイル変更**: `src-tauri/src/swarm/orchestrator.rs`

1. Worker状態変更時に RingEvent を発火:

```rust
// orchestrator.rs の update_worker_status 内に追加

// Worker完了時
if status == WorkerStatus::Done {
    crate::notification::ring::emit_ring_event(
        app,
        RingEvent::SwarmWorkerUpdate {
            run_id: run.run_id.clone(),
            worker_id: worker_id.to_string(),
            task_title: assign.task.title.clone(),
            status: "done".to_string(),
            urgency: RingUrgency::Info,
        },
    );
}

// Workerエラー時
if status == WorkerStatus::Error {
    crate::notification::ring::emit_ring_event(
        app,
        RingEvent::SwarmWorkerUpdate {
            run_id: run.run_id.clone(),
            worker_id: worker_id.to_string(),
            task_title: assign.task.title.clone(),
            status: "error".to_string(),
            urgency: RingUrgency::Warning,
        },
    );
}

// 全Worker完了→マージ準備時
if run.status == RunStatus::Merging {
    crate::notification::ring::emit_ring_event(
        app,
        RingEvent::SwarmRunComplete {
            run_id: run.run_id.clone(),
            total: run.total,
            done: run.done_count,
            has_conflicts: false,  // マージ後に更新
            urgency: RingUrgency::Info,
        },
    );
}
```

**ファイル変更**: `src-tauri/src/notification/ring.rs`

2. RingEvent に Swarm系イベントを追加:

```rust
#[derive(Debug, Clone, Serialize)]
pub enum RingEvent {
    // ... 既存のイベント ...

    /// Swarm Worker の状態変化
    SwarmWorkerUpdate {
        run_id: String,
        worker_id: String,
        task_title: String,
        status: String,      // "done" | "error" | "retrying"
        urgency: RingUrgency,
    },

    /// Swarm 実行全体の完了
    SwarmRunComplete {
        run_id: String,
        total: u32,
        done: u32,
        has_conflicts: bool,
        urgency: RingUrgency,
    },
}
```

**ファイル変更**: フロントエンド

3. サイドバーの Swarm メニューにリングインジケーター:

```typescript
// SwarmメニューのRing表示
function SwarmMenuItem() {
  const rings = useRingNotification();
  const swarmRings = rings.filter(r =>
    r.type === 'SwarmWorkerUpdate' || r.type === 'SwarmRunComplete'
  );

  const hasError = swarmRings.some(r => r.status === 'error');
  const isRunning = swarmRings.some(r => r.status === 'running');

  return (
    <SidebarItem
      icon="🐝"
      label="Swarm"
      ringing={isRunning}
      ringingUrgency={hasError ? 'critical' : isRunning ? 'info' : undefined}
      badge={swarmRings.length > 0 ? swarmRings.length : undefined}
    />
  );
}
```

4. Swarm完了時の通知ベル連携:

```typescript
// SwarmRunComplete → 通知パネルに追加
useEffect(() => {
  listen<RingEvent>('ring-event', (event) => {
    if (event.payload.type === 'SwarmRunComplete') {
      addNotification({
        category: 'agent',
        title: `Swarm完了: ${event.payload.done}/${event.payload.total} タスク成功`,
        body: event.payload.has_conflicts
          ? 'コンフリクトがあります。確認してください。'
          : '全タスクが正常に完了しました。',
        urgency: event.payload.has_conflicts ? 'warning' : 'info',
      });
    }
  });
}, []);
```

---

## ドキュメント更新チェックリスト

### Step 1 完了時
- [ ] `08-ui-component-design.md` にSwarm画面を追加
- [ ] サイドバーに 🐝 Swarm を追加
- [ ] ルーティングに `/swarm/*` を追加
- [ ] `docs/screens/swarm-screen.md` を新規作成

### Step 2 完了時
- [ ] `docs/swarm/doc-mapping-integration.md` を新規作成
- [ ] `doc-mapping-design.md` にswarm連携セクションを追加
- [ ] task_splitter.rs の設計書マッピング更新

### Step 3 完了時
- [ ] `docs/swarm/agentic-bridge.md` を新規作成
- [ ] ワークフローYAMLにswarmステップの例を追加
- [ ] `devnest-multiproduct-agentic.md` にswarm統合を追記

### Step 4 完了時
- [ ] `docs/notification/ring-system.md` にSwarmイベントを追記
- [ ] 通知リングのイベント種別一覧を更新
