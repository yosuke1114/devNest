# DevNest cmuxインスパイア機能 設計書

> **文書ID**: DESIGN-CMUX-FEATURES
> **起源**: cmux (https://www.cmux.dev) の機能をDevNest流にアレンジ
> **対象機能**: 通知リング、アプリ内ブラウザ、Socket API、分割ペイン
> **位置づけ**: 既存Phase体系への追加機能として組み込み

---

## 1. 概要: cmux → DevNest の翻訳

cmuxは「AIエージェントのマルチタスク管理に特化したターミナル」。
DevNestは「開発ポートフォリオ管理ハブ」。

cmuxがターミナル上で解決しているUX課題を、
DevNestのTauri/Reactアプリケーションの文脈で再解釈する。

| cmuxの機能 | cmuxでの用途 | DevNestでの再解釈 |
|-----------|------------|-----------------|
| 通知リング | エージェント完了をペイン枠の光で通知 | エージェント/保守アラートをサイドバー+タブに視覚フィードバック |
| アプリ内ブラウザ | PR/ドキュメントをターミナル横に表示 | GitHub PR/Issue/設計書をアプリ内WebViewで表示 |
| Socket API | 外部スクリプトからcmuxを操作 | CLIやスクリプトからDevNest操作を自動化 |
| 分割ペイン | ターミナル+ブラウザを並置 | ターミナル+ブラウザ+設計書+コードビューを自由配置 |

---

## 2. 通知リング

### コンセプト

cmuxではエージェントが完了/注意を必要とするとペインの枠が光る。
DevNestではこれを以下の3レイヤーで実装する。

```
Layer 1: サイドバーメニューのパルスアニメーション
  → エージェントタブの🤖アイコンが脈動
  → GitHubバッジ数がリアルタイム更新

Layer 2: プロジェクトビューのタブインジケーター
  → [保守] タブに🔴ドットが出現（脆弱性検出時）
  → [AI Review] タブに✨エフェクト（レビュー完了時）

Layer 3: ヘッダー通知ベルのリアルタイム更新
  → 未読バッジ数が即座に増加
  → macOS ネイティブ通知も同時発火（Tauri notification API）
```

### 実装設計

```rust
// src-tauri/src/notification/ring.rs

use tauri::Emitter;

/// 通知リングイベントの種別
#[derive(Debug, Clone, Serialize)]
pub enum RingEvent {
    /// エージェントタスクが注意を要求（承認待ち、エラー等）
    AgentAttention {
        task_id: String,
        task_type: String,
        urgency: RingUrgency,
    },
    /// 保守アラート（脆弱性、カバレッジ低下等）
    MaintenanceAlert {
        product_id: String,
        alert_type: String,
        severity: AlertSeverity,
    },
    /// 設計書鮮度アラート
    DocStale {
        product_id: String,
        doc_path: String,
        staleness_score: f64,
    },
    /// GitHub イベント（PR レビュー要求、マージ等）
    GitHubEvent {
        product_id: String,
        event_type: String,
        title: String,
    },
}

#[derive(Debug, Clone, Serialize)]
pub enum RingUrgency {
    Info,       // 青パルス — 完了通知
    Warning,    // 黄パルス — 注意が必要
    Critical,   // 赤パルス — 即座の対応が必要
}

/// フロントエンドにリアルタイムイベントを配信
pub fn emit_ring_event(app: &tauri::AppHandle, event: RingEvent) {
    // Tauriイベントシステムで配信
    app.emit("ring-event", &event).ok();

    // macOS ネイティブ通知も発火（Critical/Warning のみ）
    if matches!(event.urgency(), Some(RingUrgency::Critical | RingUrgency::Warning)) {
        send_native_notification(app, &event);
    }
}
```

```typescript
// src/hooks/useRingNotification.ts

import { listen } from '@tauri-apps/api/event';

interface RingEvent {
  type: 'AgentAttention' | 'MaintenanceAlert' | 'DocStale' | 'GitHubEvent';
  urgency: 'Info' | 'Warning' | 'Critical';
  // ...
}

export function useRingNotification() {
  const [rings, setRings] = useState<RingEvent[]>([]);

  useEffect(() => {
    const unlisten = listen<RingEvent>('ring-event', (event) => {
      setRings(prev => [event.payload, ...prev]);

      // サイドバーアニメーション発火
      triggerSidebarPulse(event.payload);

      // タブインジケーター更新
      triggerTabIndicator(event.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return rings;
}
```

### サイドバーのパルスアニメーション

```css
/* エージェントメニューの脈動 */
@keyframes ring-pulse {
  0%, 100% { box-shadow: none; }
  50% { box-shadow: 0 0 0 3px rgba(124, 115, 255, 0.4); }
}

.sidebar-item.ringing {
  animation: ring-pulse 2s ease-in-out infinite;
}

/* Critical は赤で脈動 */
.sidebar-item.ringing-critical {
  animation: ring-pulse-critical 1s ease-in-out infinite;
}

@keyframes ring-pulse-critical {
  0%, 100% { box-shadow: none; }
  50% { box-shadow: 0 0 0 3px rgba(226, 75, 74, 0.5); }
}
```

---

## 3. アプリ内ブラウザ

### コンセプト

cmuxではターミナル横にブラウザを分割表示してPRを確認できる。
DevNestではTauriのWebView機能を使い、GitHub PR/Issue/ドキュメントを
アプリ内で直接閲覧・操作できるようにする。

### 用途

| 用途 | 表示するURL | 操作 |
|------|-----------|------|
| PR レビュー | GitHub PR ページ | diff確認、コメント、承認 |
| Issue 詳細 | GitHub Issue ページ | コメント追加、ラベル変更 |
| 設計書プレビュー | docs/ のMarkdownをHTML変換 | 閲覧のみ（編集は設計書ビューワー） |
| CI/CD ログ | GitHub Actions ページ | ログ確認 |
| 外部ドキュメント | 任意のURL | ライブラリドキュメント参照 |

### 実装設計

```rust
// src-tauri/src/browser/mod.rs

/// アプリ内ブラウザの管理
pub struct InAppBrowser {
    windows: HashMap<String, tauri::WebviewWindow>,
}

impl InAppBrowser {
    /// ブラウザパネルを開く
    pub fn open_panel(
        &mut self,
        app: &tauri::AppHandle,
        request: BrowserRequest,
    ) -> Result<(), BrowserError> {
        // Tauri WebviewWindow をメインウィンドウ内のパネルとして生成
        // 分割ペインシステムと連携して配置
    }

    /// URLを変更（既存パネルの中身を入れ替え）
    pub fn navigate(
        &mut self,
        panel_id: &str,
        url: &str,
    ) -> Result<(), BrowserError>

    /// パネルを閉じる
    pub fn close_panel(&mut self, panel_id: &str) -> Result<(), BrowserError>
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BrowserRequest {
    pub url: String,
    pub title: Option<String>,
    pub position: PanelPosition,    // 分割ペインシステムと連携
    pub size_ratio: f32,            // 0.0〜1.0
}

#[tauri::command]
pub async fn open_browser_panel(
    request: BrowserRequest,
) -> Result<String, AppError>  // panel_id を返す

#[tauri::command]
pub async fn navigate_browser(
    panel_id: String,
    url: String,
) -> Result<(), AppError>

#[tauri::command]
pub async fn close_browser_panel(
    panel_id: String,
) -> Result<(), AppError>
```

### コンテキスト連携

DevNest固有の価値: ブラウザが「今何を見ているか」を他の機能と連携させる。

```
PR #42 をブラウザで開く
    │
    ├── doc-mapping が PR の changed files を自動分析
    │   → 影響設計書を右パネルに表示
    │
    ├── review/engine が PR diff のAIレビューを提案
    │   → ブラウザ横にレビュー結果パネル
    │
    └── agile/kanban が PR に紐づくカードを特定
        → カードのステータスを表示
```

```rust
/// ブラウザでGitHub URLを開いたときの自動コンテキスト分析
pub async fn analyze_browser_context(
    url: &str,
    doc_index: &DocIndex,
) -> Option<BrowserContext> {
    if let Some(pr_info) = parse_github_pr_url(url) {
        // PR diffから影響設計書を特定
        let affected_docs = find_affected_docs_for_pr(&pr_info, doc_index).await;
        // 関連カンバンカードを検索
        let linked_cards = find_linked_cards(&pr_info).await;
        return Some(BrowserContext::PullRequest {
            pr_info,
            affected_docs,
            linked_cards,
        });
    }
    None
}
```

---

## 4. Socket API（DevNest Automation API）

### コンセプト

cmuxではSocket APIで外部スクリプトからターミナルを操作できる。
DevNestでは同様に、CLIやスクリプトからDevNestの全機能を操作可能にする。

### 用途

| ユースケース | 呼び出し元 | 操作 |
|------------|----------|------|
| CI/CDからDevNestに通知 | GitHub Actions | 保守スキャン結果の受信 |
| Claude Codeからタスク登録 | Claude Code hooks | Agentic Flowにタスク追加 |
| シェルスクリプトから保守実行 | cron / launchd | 定期スキャンの外部トリガー |
| エディタ連携 | Neovim plugin | 現在のファイルの設計書を表示 |
| Ayumu連携 | ayumu_gateway.py | Claude Codeセッション状態の受信 |

### 実装設計

```rust
// src-tauri/src/api/socket_server.rs

use tokio::net::UnixListener;

/// DevNest Socket API サーバー
/// Unix domain socket でローカル通信
pub struct DevNestApiServer {
    socket_path: PathBuf,    // ~/.devnest/devnest.sock
    listener: UnixListener,
}

impl DevNestApiServer {
    pub async fn start(app: tauri::AppHandle) -> Result<Self, ApiError> {
        let socket_path = dirs::home_dir()
            .unwrap()
            .join(".devnest/devnest.sock");
        let listener = UnixListener::bind(&socket_path)?;

        tokio::spawn(async move {
            loop {
                if let Ok((stream, _)) = listener.accept().await {
                    handle_connection(stream, app.clone()).await;
                }
            }
        });

        Ok(Self { socket_path, listener })
    }
}

/// APIリクエスト（JSON-RPCライク）
#[derive(Debug, Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub params: serde_json::Value,
}

/// 利用可能なAPIメソッド
pub enum ApiMethod {
    // ── 通知 ──
    Notify,                      // 外部から通知を送信
    EmitRingEvent,               // 通知リングを発火

    // ── エージェント ──
    SubmitTask,                  // タスクをキューに追加
    GetTaskStatus,               // タスク状態の取得
    ApproveTask,                 // タスクの承認

    // ── 保守 ──
    TriggerScan,                 // 保守スキャンの実行
    GetHealthStatus,             // ヘルスステータスの取得

    // ── ブラウザ ──
    OpenBrowser,                 // アプリ内ブラウザでURLを開く
    NavigateBrowser,             // ブラウザのURLを変更

    // ── プロジェクト ──
    SwitchProduct,               // アクティブプロダクトの切替
    GetCurrentProduct,           // 現在のプロダクト情報

    // ── 設計書 ──
    CheckDocStaleness,           // 設計書鮮度チェック
    GetAffectedDocs,             // 変更影響設計書の取得

    // ── カンバン ──
    CreateCard,                  // カンバンカード作成
    MoveCard,                    // カード移動
}
```

### CLI ツール

```bash
# DevNest CLI（Socket API のフロントエンド）
# ~/.devnest/devnest.sock に接続して操作

# 通知を送信
devnest notify --title "CI完了" --body "build #123 passed" --urgency info

# 保守スキャンを実行
devnest scan --product devnest

# タスクを登録
devnest task submit --type doc_update --doc "docs/api/tauri-commands.md"

# アプリ内ブラウザでPRを開く
devnest browser open "https://github.com/user/devnest/pull/42"

# プロダクト情報を取得
devnest product current --json

# 設計書鮮度を確認
devnest docs staleness --product devnest
```

### Claude Code フック連携

```yaml
# ~/.claude/hooks.yaml（Claude Code設定）
hooks:
  post_task:
    - command: devnest notify --title "Claude Code完了" --body "$TASK_SUMMARY" --urgency info
  on_error:
    - command: devnest notify --title "Claude Codeエラー" --body "$ERROR_MESSAGE" --urgency critical
  post_commit:
    - command: devnest docs staleness --product "$PROJECT_NAME" --auto-alert
```

### Ayumu連携

```python
# ayumu_gateway.py からDevNest Socket APIに接続
import socket
import json

def notify_devnest(event_type, data):
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(os.path.expanduser("~/.devnest/devnest.sock"))
    request = json.dumps({
        "method": "EmitRingEvent",
        "params": {
            "type": event_type,
            "data": data
        }
    })
    sock.sendall(request.encode() + b"\n")
    response = sock.recv(4096)
    sock.close()
    return json.loads(response)
```

---

## 5. 分割ペイン

### コンセプト

cmuxではターミナル内で水平・垂直に分割してマルチペイン作業ができる。
DevNestではメインコンテンツエリアを自由に分割し、
ターミナル+ブラウザ+設計書+コードビューを同時表示する。

### レイアウトパターン

```
Pattern A: コードレビュー
┌──────────────────┬──────────────────┐
│                  │                  │
│  PR diff         │  設計書          │
│  (ブラウザ)       │  (doc viewer)    │
│                  │                  │
├──────────────────┴──────────────────┤
│  AI Review Findings                 │
│  (review/engine の結果)             │
└─────────────────────────────────────┘

Pattern B: エージェント監視
┌──────────────────┬──────────────────┐
│                  │                  │
│  Agent Log       │  ブラウザ         │
│  (実行ログ)       │  (PR/CI)         │
│                  │                  │
└──────────────────┴──────────────────┘

Pattern C: 設計書駆動開発
┌──────────────────┬──────────────────┐
│                  │                  │
│  設計書           │  生成コード      │
│  (Markdown)      │  (code viewer)   │
│                  │                  │
└──────────────────┴──────────────────┘

Pattern D: フル装備（3分割）
┌────────────┬────────────┬───────────┐
│            │            │           │
│  カンバン   │  ブラウザ    │  設計書    │
│            │  (PR)      │           │
│            │            │           │
└────────────┴────────────┴───────────┘
```

### 実装設計

```typescript
// src/components/SplitPane/SplitPaneContainer.tsx

interface PaneConfig {
  id: string;
  type: PaneType;
  props: Record<string, any>;
  size: number;        // flex比率
}

type PaneType =
  | 'browser'          // アプリ内ブラウザ
  | 'doc-viewer'       // 設計書ビューワー
  | 'code-viewer'      // コードビューワー（読み取り専用）
  | 'agent-log'        // エージェント実行ログ
  | 'review-findings'  // AIレビュー結果
  | 'kanban'           // カンバンボード
  | 'terminal'         // 組み込みターミナル（xterm.js / 既存）

interface SplitLayout {
  direction: 'horizontal' | 'vertical';
  children: (PaneConfig | SplitLayout)[];  // 再帰的にネスト可能
}

// プリセットレイアウト
const PRESETS: Record<string, SplitLayout> = {
  'code-review': {
    direction: 'vertical',
    children: [
      {
        direction: 'horizontal',
        children: [
          { id: 'pr', type: 'browser', props: {}, size: 1 },
          { id: 'doc', type: 'doc-viewer', props: {}, size: 1 },
        ]
      },
      { id: 'findings', type: 'review-findings', props: {}, size: 0.4 },
    ]
  },
  'agent-monitor': {
    direction: 'horizontal',
    children: [
      { id: 'log', type: 'agent-log', props: {}, size: 1 },
      { id: 'browser', type: 'browser', props: {}, size: 1 },
    ]
  },
  'doc-driven': {
    direction: 'horizontal',
    children: [
      { id: 'doc', type: 'doc-viewer', props: {}, size: 1 },
      { id: 'code', type: 'code-viewer', props: {}, size: 1 },
    ]
  },
};
```

### ドラッグでのリサイズ

```typescript
// 分割バーをドラッグしてペインサイズを変更
// allotment ライブラリ（React用分割ペイン）を使用

import { Allotment } from 'allotment';

function SplitPaneContainer({ layout }: { layout: SplitLayout }) {
  return (
    <Allotment vertical={layout.direction === 'vertical'}>
      {layout.children.map(child => {
        if ('direction' in child) {
          return <SplitPaneContainer layout={child} />;
        }
        return (
          <Allotment.Pane preferredSize={child.size * 100 + '%'}>
            <PaneRenderer config={child} />
          </Allotment.Pane>
        );
      })}
    </Allotment>
  );
}
```

### キーボードショートカット

| ショートカット | 操作 |
|-------------|------|
| `⌘\` | 垂直分割を追加 |
| `⌘⇧\` | 水平分割を追加 |
| `⌘W` | アクティブペインを閉じる |
| `⌘⇧1〜4` | プリセットレイアウト切替 |
| `⌘←→` | フォーカスペイン切替 |
| `⌘⇧←→` | ペインサイズ調整 |

---

## 6. 既存Phase体系への組み込み

| 機能 | 組み込み先 | 理由 |
|------|----------|------|
| 通知リング | **Phase 4 (Agentic Flow) に追加** | エージェントタスクのリアルタイム通知がメイン用途 |
| アプリ内ブラウザ | **Phase 6 (共通基盤) に追加** | core層の機能として全画面で利用可能にする |
| Socket API | **Phase 6 (共通基盤) に追加** | CLIとの連携基盤として早期に構築 |
| 分割ペイン | **Phase 6 (共通基盤) に追加** | UIの基盤機能として早期に構築 |

### タスク追加

```
Phase 6 に以下を追加:
  Task 6.8:  通知リングシステム（ring.rs + useRingNotification）
  Task 6.9:  アプリ内ブラウザ（browser/mod.rs + BrowserPanel.tsx）
  Task 6.10: Socket API サーバー（api/socket_server.rs + devnest CLI）
  Task 6.11: 分割ペインシステム（SplitPaneContainer.tsx + プリセット）

Phase 6 タスク数: 7 → 11
全体タスク数: 32 → 36
```

---

## 7. DevNest × cmux の差別化

| 観点 | cmux | DevNest |
|------|------|---------|
| 基盤 | ターミナルアプリ | 開発管理ハブ |
| 通知 | ターミナルペインの枠が光る | サイドバー + タブ + ベル + macOS通知 の4層 |
| ブラウザ | URLを開くだけ | PR表示時にdoc-mapping影響分析が自動連動 |
| API | ターミナル操作の自動化 | 保守スキャン/タスク登録/設計書分析まで操作可能 |
| 分割 | ターミナル+ブラウザ | ターミナル+ブラウザ+設計書+レビュー+カンバン |

DevNestの差別化ポイントは**コンテキスト連携**。
ブラウザでPRを開くと設計書影響が自動表示され、
Socket APIでClaude Codeの完了がDevNestの通知リングに連動し、
分割ペインで設計書を見ながら生成コードを確認する。
単なる「並べて表示」ではなく「情報が連鎖する」体験を提供する。
