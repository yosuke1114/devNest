# DevNest 実装指示書 追補 — cmuxインスパイア機能（Task 6.8〜6.11）

> **目的**: `04-implementation-guide-v2.md` への追補。Phase 6に4タスクを追加。
> **参照設計書**: `09-cmux-inspired-features.md`
> **Phase 6タスク数**: 7 → 11 / **全体タスク数**: 32 → 36
> **ブランチ規則**: `feature/p6-ring`, `feature/p6-browser`, `feature/p6-socket-api`, `feature/p6-split-pane`

---

## Task 6.8: 通知リングシステム

### Rustバックエンド

**ファイル作成先**: `src-tauri/src/notification/ring.rs`

**やること**:

1. `RingEvent` enum を定義（設計書セクション2参照）:
   - `AgentAttention` — タスク承認待ち/エラー/完了
   - `MaintenanceAlert` — 脆弱性/カバレッジ低下/負債閾値超過
   - `DocStale` — 設計書鮮度スコアが0.7超過
   - `GitHubEvent` — PR レビュー要求/マージ/Issue更新

2. `RingUrgency` enum（Info/Warning/Critical）で視覚エフェクトを制御

3. `emit_ring_event()` 関数:
   - Tauriイベントシステム（`app.emit("ring-event", &event)`）でフロントエンドに配信
   - Critical/Warningの場合は `tauri-plugin-notification` でmacOSネイティブ通知も発火

4. 既存モジュールとの接続:
   - `agent/engine.rs`: タスクステータス変更時に `emit_ring_event(AgentAttention)` を呼ぶ
   - `maintenance/`: スキャン結果で閾値超過時に `emit_ring_event(MaintenanceAlert)` を呼ぶ
   - `doc_mapping/staleness.rs`: 鮮度チェック結果で `emit_ring_event(DocStale)` を呼ぶ
   - `mcp/adapters/github.rs`: GitHubイベント受信時に `emit_ring_event(GitHubEvent)` を呼ぶ

5. Cargo.toml に `tauri-plugin-notification` を追加

```rust
#[derive(Debug, Clone, Serialize)]
pub enum RingEvent {
    AgentAttention {
        task_id: String,
        task_type: String,
        product_id: String,
        urgency: RingUrgency,
        message: String,
    },
    MaintenanceAlert {
        product_id: String,
        alert_type: String,
        severity: AlertSeverity,
        message: String,
    },
    DocStale {
        product_id: String,
        doc_path: String,
        staleness_score: f64,
    },
    GitHubEvent {
        product_id: String,
        event_type: String,
        title: String,
        url: Option<String>,
    },
}

pub fn emit_ring_event(app: &tauri::AppHandle, event: RingEvent) {
    app.emit("ring-event", &event).ok();
    if event.is_native_notification_worthy() {
        send_native_notification(app, &event);
    }
}
```

### Reactフロントエンド

**ファイル作成先**: `src/hooks/useRingNotification.ts`, `src/components/Sidebar/RingIndicator.tsx`

**やること**:

1. `useRingNotification` カスタムフック:
   - `listen<RingEvent>('ring-event', ...)` でバックエンドイベントを購読
   - アクティブなリングイベントのリストを状態管理
   - 一定時間（5秒）後にInfo urgencyのリングを自動消去

2. `RingIndicator` コンポーネント:
   - サイドバーメニュー項目に重ねるパルスアニメーション
   - urgencyに応じた色（Info=青, Warning=黄, Critical=赤）
   - CSSアニメーション: `@keyframes ring-pulse`

3. タブインジケーター:
   - Project Viewの各タブにドットインジケーター追加
   - `MaintenanceAlert` → [保守]タブにドット
   - `AgentAttention` → エージェントメニューにパルス

4. ヘッダー通知ベルとの連携:
   - RingEvent発火時に `NotificationPanel` の未読リストにも追加
   - バッジ数のリアルタイム更新

**完了条件**:
- エージェントタスク完了時にサイドバーの🤖がパルスする
- 脆弱性検出時にmacOS通知が表示される
- 通知ベルのバッジ数がリアルタイム更新される

**ドキュメント更新**:
- `docs/notification/ring-system.md` を新規作成
- `08-ui-component-design.md` にRingIndicatorを追記

---

## Task 6.9: アプリ内ブラウザ

### Rustバックエンド

**ファイル作成先**: `src-tauri/src/browser/mod.rs`

**やること**:

1. `InAppBrowser` 構造体:
   - `open_panel()`: TauriのWebview機能でブラウザパネルを生成
   - `navigate()`: 既存パネルのURLを変更
   - `close_panel()`: パネルを閉じる
   - `get_open_panels()`: 開いているパネル一覧

2. Tauriコマンド:

```rust
#[tauri::command]
pub async fn open_browser_panel(
    url: String,
    title: Option<String>,
    position: PanelPosition,
) -> Result<String, AppError>  // panel_id

#[tauri::command]
pub async fn navigate_browser(
    panel_id: String,
    url: String,
) -> Result<(), AppError>

#[tauri::command]
pub async fn close_browser_panel(
    panel_id: String,
) -> Result<(), AppError>

#[tauri::command]
pub async fn get_browser_panels() -> Result<Vec<BrowserPanelInfo>, AppError>
```

3. コンテキスト自動分析:

```rust
/// ブラウザでGitHub URLを開いたときの自動分析
#[tauri::command]
pub async fn analyze_browser_context(
    url: String,
) -> Result<Option<BrowserContext>, AppError> {
    // GitHub PR URL → PR情報パース → doc-mapping影響分析
    // GitHub Issue URL → 関連カンバンカード検索
    // その他URL → None
}
```

4. GitHub URL判定: `https://github.com/{owner}/{repo}/pull/{number}` パターンマッチ

### Reactフロントエンド

**ファイル作成先**: `src/components/Browser/BrowserPanel.tsx`, `src/components/Browser/BrowserContextBar.tsx`

**やること**:

1. `BrowserPanel`:
   - `<iframe>` or Tauri WebView でURL表示
   - タイトルバー（URL表示 + 戻る/進む + 閉じる）
   - リサイズハンドル（分割ペインシステムと連携）

2. `BrowserContextBar`:
   - GitHub PR表示時に自動で下部に表示
   - 影響設計書一覧（doc-mapping分析結果）
   - 関連カンバンカードへのリンク
   - 「AIレビュー実行」ボタン

3. サイドバーやコンテンツ内からの遷移:
   - Issues一覧 → Issue詳細をブラウザパネルで開く
   - PR一覧 → PRをブラウザパネルで開く
   - 設計書内のリンク → ブラウザパネルで開く

**完了条件**:
- URLを指定してブラウザパネルが開く
- GitHub PR表示時にdoc-mapping影響分析が自動表示される
- 複数パネルを同時に開ける

**ドキュメント更新**:
- `docs/browser/in-app-browser.md` を新規作成
- `08-ui-component-design.md` にBrowserPanelを追記

---

## Task 6.10: Socket API サーバー

### Rustバックエンド

**ファイル作成先**: `src-tauri/src/api/socket_server.rs`, `src-tauri/src/api/methods.rs`

**やること**:

1. Unix domain socket サーバー:
   - ソケットパス: `~/.devnest/devnest.sock`
   - アプリ起動時に自動開始、終了時にソケット削除
   - JSON-RPC 2.0 ライクなリクエスト/レスポンス形式
   - tokio非同期ハンドラ

```rust
pub struct DevNestApiServer {
    socket_path: PathBuf,
}

impl DevNestApiServer {
    pub async fn start(app: tauri::AppHandle) -> Result<Self, ApiError> {
        let socket_path = Self::socket_path();
        // 既存ソケットがあれば削除
        if socket_path.exists() {
            std::fs::remove_file(&socket_path)?;
        }
        let listener = tokio::net::UnixListener::bind(&socket_path)?;

        let app_clone = app.clone();
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let app = app_clone.clone();
                        tokio::spawn(handle_connection(stream, app));
                    }
                    Err(e) => eprintln!("Socket accept error: {}", e),
                }
            }
        });

        Ok(Self { socket_path })
    }

    pub fn socket_path() -> PathBuf {
        dirs::home_dir().unwrap().join(".devnest/devnest.sock")
    }
}
```

2. API メソッドルーター:

```rust
pub async fn handle_request(
    request: ApiRequest,
    app: &tauri::AppHandle,
) -> ApiResponse {
    match request.method.as_str() {
        // 通知
        "notify" => handle_notify(request.params, app).await,
        "emit_ring" => handle_emit_ring(request.params, app).await,

        // エージェント
        "task.submit" => handle_task_submit(request.params, app).await,
        "task.status" => handle_task_status(request.params, app).await,
        "task.approve" => handle_task_approve(request.params, app).await,
        "task.list" => handle_task_list(request.params, app).await,

        // 保守
        "scan.trigger" => handle_scan_trigger(request.params, app).await,
        "health.status" => handle_health_status(request.params, app).await,

        // ブラウザ
        "browser.open" => handle_browser_open(request.params, app).await,
        "browser.navigate" => handle_browser_navigate(request.params, app).await,

        // プロジェクト
        "product.current" => handle_product_current(request.params, app).await,
        "product.switch" => handle_product_switch(request.params, app).await,

        // 設計書
        "docs.staleness" => handle_docs_staleness(request.params, app).await,
        "docs.affected" => handle_docs_affected(request.params, app).await,

        // カンバン
        "kanban.create_card" => handle_create_card(request.params, app).await,
        "kanban.move_card" => handle_move_card(request.params, app).await,

        _ => ApiResponse::error("Unknown method"),
    }
}
```

3. リクエスト/レスポンス型:

```rust
#[derive(Debug, Deserialize)]
pub struct ApiRequest {
    pub jsonrpc: String,     // "2.0"
    pub id: Option<u64>,
    pub method: String,
    pub params: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub jsonrpc: String,
    pub id: Option<u64>,
    pub result: Option<serde_json::Value>,
    pub error: Option<ApiErrorResponse>,
}
```

4. `main.rs` でアプリ起動時にサーバーを開始:

```rust
// src-tauri/src/main.rs の setup 内
app.setup(|app| {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        DevNestApiServer::start(handle).await.ok();
    });
    Ok(())
});
```

### CLIツール

**ファイル作成先**: `cli/src/main.rs`（別クレート or バイナリ）

**やること**:

1. `devnest` CLI コマンド:
   - `~/.devnest/devnest.sock` に接続してAPIメソッドを呼ぶ
   - サブコマンド: `notify`, `scan`, `task`, `browser`, `product`, `docs`, `kanban`
   - `--json` フラグで機械可読な出力

```rust
// cli/src/main.rs
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "devnest")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
    /// JSON出力
    #[arg(long)]
    json: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// 通知を送信
    Notify {
        #[arg(long)]
        title: String,
        #[arg(long)]
        body: String,
        #[arg(long, default_value = "info")]
        urgency: String,
    },
    /// 保守スキャンを実行
    Scan {
        #[arg(long)]
        product: Option<String>,
    },
    /// タスク操作
    Task {
        #[command(subcommand)]
        action: TaskAction,
    },
    /// ブラウザ操作
    Browser {
        #[command(subcommand)]
        action: BrowserAction,
    },
    /// プロダクト操作
    Product {
        #[command(subcommand)]
        action: ProductAction,
    },
    /// 設計書操作
    Docs {
        #[command(subcommand)]
        action: DocsAction,
    },
}
```

2. Socket接続ユーティリティ:

```rust
async fn send_request(method: &str, params: serde_json::Value) -> Result<ApiResponse> {
    let socket_path = dirs::home_dir().unwrap().join(".devnest/devnest.sock");
    let stream = tokio::net::UnixStream::connect(&socket_path).await?;
    // JSON-RPC リクエスト送信 → レスポンス受信
}
```

**完了条件**:
- DevNest起動中に `devnest notify --title "test" --body "hello"` で通知が表示される
- `devnest docs staleness --product devnest --json` で鮮度データがJSONで返る
- DevNest未起動時に接続エラーが適切に返る

**ドキュメント更新**:
- `docs/api/socket-api.md` を新規作成（全メソッドのリファレンス）
- `docs/api/cli-reference.md` を新規作成（CLIの使い方）

---

## Task 6.11: 分割ペインシステム

### Reactフロントエンド

**ファイル作成先**: `src/components/SplitPane/SplitPaneContainer.tsx`, `src/components/SplitPane/PaneRenderer.tsx`, `src/components/SplitPane/presets.ts`

**やること**:

1. npm依存追加: `allotment`（React用分割ペインライブラリ）

2. `SplitPaneContainer`:
   - `SplitLayout` 型の再帰的なレイアウト定義をレンダリング
   - allotmentの `<Allotment>` コンポーネントでリサイズ対応
   - ペインの追加/削除/入れ替え

```typescript
// src/components/SplitPane/types.ts
export interface PaneConfig {
  id: string;
  type: PaneType;
  props: Record<string, any>;
  minSize?: number;
}

export type PaneType =
  | 'browser'
  | 'doc-viewer'
  | 'code-viewer'
  | 'agent-log'
  | 'review-findings'
  | 'kanban'
  | 'terminal';

export interface SplitLayout {
  direction: 'horizontal' | 'vertical';
  children: (PaneConfig | SplitLayout)[];
  sizes?: number[];  // allotmentの初期サイズ
}
```

3. `PaneRenderer`:
   - PaneType に応じて適切なコンポーネントをレンダリング
   - 各ペインにヘッダーバー（タイトル + 閉じるボタン）

```typescript
function PaneRenderer({ config }: { config: PaneConfig }) {
  const Component = PANE_COMPONENTS[config.type];
  return (
    <div className="pane-wrapper">
      <div className="pane-header">
        <span>{PANE_LABELS[config.type]}</span>
        <button onClick={() => removePane(config.id)}>✕</button>
      </div>
      <Component {...config.props} />
    </div>
  );
}

const PANE_COMPONENTS: Record<PaneType, React.FC> = {
  'browser': BrowserPanel,
  'doc-viewer': DocViewer,
  'code-viewer': CodeViewer,
  'agent-log': AgentLogPanel,
  'review-findings': ReviewFindingsPanel,
  'kanban': KanbanBoard,
  'terminal': TerminalPanel,    // 既存の @xterm/xterm v6
};
```

4. プリセットレイアウト:

```typescript
// src/components/SplitPane/presets.ts
export const LAYOUT_PRESETS: Record<string, SplitLayout> = {
  'code-review': {
    direction: 'vertical',
    children: [
      {
        direction: 'horizontal',
        children: [
          { id: 'pr', type: 'browser', props: {} },
          { id: 'doc', type: 'doc-viewer', props: {} },
        ],
        sizes: [50, 50],
      },
      { id: 'findings', type: 'review-findings', props: {} },
    ],
    sizes: [70, 30],
  },
  'agent-monitor': {
    direction: 'horizontal',
    children: [
      { id: 'log', type: 'agent-log', props: {} },
      { id: 'browser', type: 'browser', props: {} },
    ],
    sizes: [50, 50],
  },
  'doc-driven': {
    direction: 'horizontal',
    children: [
      { id: 'doc', type: 'doc-viewer', props: {} },
      { id: 'code', type: 'code-viewer', props: {} },
    ],
    sizes: [50, 50],
  },
  'full': {
    direction: 'horizontal',
    children: [
      { id: 'kanban', type: 'kanban', props: {} },
      { id: 'browser', type: 'browser', props: {} },
      { id: 'doc', type: 'doc-viewer', props: {} },
    ],
    sizes: [33, 34, 33],
  },
};
```

5. キーボードショートカット:
   - `useKeyboardShortcuts` フックで登録
   - `⌘\` 垂直分割追加, `⌘⇧\` 水平分割追加, `⌘W` ペイン閉じ
   - `⌘⇧1〜4` プリセット切替

6. レイアウトの永続化:
   - 現在のレイアウトを `tauri-plugin-store` で保存
   - アプリ再起動時に復元

**完了条件**:
- プリセット4種類が切り替えで動作する
- ペインのドラッグリサイズが動作する
- ペインの追加/削除が動作する
- レイアウトがアプリ再起動後に復元される

**ドキュメント更新**:
- `docs/ui/split-pane.md` を新規作成
- `08-ui-component-design.md` のコンポーネントツリーにSplitPane系を追記

---

## ドキュメント更新チェックリスト（Task 6.8-6.11完了時）

- [ ] `docs/notification/ring-system.md` が作成されている
- [ ] `docs/browser/in-app-browser.md` が作成されている
- [ ] `docs/api/socket-api.md` が作成されている（全メソッドリファレンス）
- [ ] `docs/api/cli-reference.md` が作成されている
- [ ] `docs/ui/split-pane.md` が作成されている
- [ ] `08-ui-component-design.md` のコンポーネントツリーが更新されている
- [ ] `docs/modules/rust-modules.md` に `notification`, `browser`, `api` モジュールが追加されている
- [ ] `docs/api/tauri-commands.md` にブラウザ関連コマンドが追加されている
- [ ] 各ファイルの設計書マッピングが更新されている
