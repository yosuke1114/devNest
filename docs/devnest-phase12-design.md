# DevNest Phase 12 設計書
# Advanced Swarm — Worker依存グラフ・AI自動解決・拡張監視

**バージョン**: 0.2
**作成日**: 2026-03-15
**ステータス**: 要件定義完了
**前提**: Phase 11（DevNest Swarm MVP）完了済み

---

## 1. 概要

Phase 11で先送りした項目を実装する。
Phase 11が「並列実行できる」であれば、Phase 12は「より賢く・より自律的に動く」。

### 1.1 Phase 12で実装するもの

| # | 項目 | Phase 11での状態 |
|---|------|----------------|
| 1 | Worker依存グラフ（直列実行チェーン） | `depends_on`フィールドのみ確保、未実装 |
| 2 | コンフリクトAI自動解決 | D案として先送り |
| 3 | Shellワーカーのアイドル検出 | 種別バッジのみ、先送り |
| 4 | 設定画面の拡張項目 | Shellパス・起動オプションを先送り |
| 5 | 並列Worker上限の動的調整 | 固定上限8で先送り |

---

## 2. フィーチャー別要件定義

---

### Feature 12-1: Worker依存グラフ（直列実行チェーン）

#### 課題
```
Phase 11: 全SubTaskが独立している前提
→ W1の結果を受けてW2が動くケースに対応できない

例:
  W1: APIエンドポイントを修正
  W2: そのAPIを使うテストを修正  ← W1完了後でないと正しく書けない
```

#### ユーザーストーリー
```
As a developer,
I want to define task dependencies between Workers,
So that dependent tasks start automatically after their predecessors complete.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-12-01 | 依存グラフ定義 | SubTask間の依存関係を定義できる |
| F-12-02 | 依存グラフUI | DAG（有向非巡回グラフ）をビジュアルで確認できる |
| F-12-03 | 自動順序制御 | 依存するWorkerの完了を待って次のWorkerを起動 |
| F-12-04 | TaskSplitter拡張 | Claude APIが依存関係も含めてSubTaskを生成 |
| F-12-05 | 循環依存検出 | 循環依存をバリデーションしてエラー表示 |

#### データ構造

```rust
struct SubTask {
    id: u32,
    title: String,
    files: Vec<PathBuf>,
    instruction: String,
    depends_on: Vec<u32>,  // Phase 11で確保済みのフィールドを活用
}

// 実行状態
enum ExecutionState {
    Waiting,    // 依存タスクが未完了
    Ready,      // 依存タスクが全完了、実行可能
    Running,    // 実行中
    Done,       // 完了
    Error,      // エラー
}
```

#### 未決定事項
- [x] 依存グラフのUI表現 → **B案（ステージ表示）。将来必要になればDAGに拡張**
- [x] 依存失敗時の挙動 → **A案（Skip）。サマリーに「W1失敗のためW2をスキップ」と明示**
- [ ] TaskSplitterが自動生成する依存関係の精度をどう担保するか

---

### Feature 12-2: コンフリクトAI自動解決

#### 課題
```
Phase 11: MergeViewでユーザーが手動解決
→ 明らかに両方採用すべきケース（importの追加同士など）を
  AIに自動解決させて手間を省きたい
```

#### ユーザーストーリー
```
As a developer,
I want AI to automatically resolve simple merge conflicts,
So that I only need to review and approve the resolution.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-12-06 | AI解決提案 | コンフリクトブロックをClaude APIに渡して解決案を生成 |
| F-12-07 | 解決案プレビュー | MergeViewに解決案を表示してユーザーが承認/修正 |
| F-12-08 | 信頼度スコア | AIがどの程度自信を持っているか表示（High/Medium/Low） |
| F-12-09 | 自動承認モード | 信頼度Highの場合のみ自動コミットするオプション |

#### Claude APIへ送る情報

```rust
struct ConflictBlock {
    file: PathBuf,
    ours: String,        // worker-A側のコード
    theirs: String,      // worker-B側のコード
    context: String,     // 前後のコード（±20行）
    task_a: SubTask,     // worker-Aのタスク説明
    task_b: SubTask,     // worker-Bのタスク説明
}
```

#### 未決定事項
- [x] 信頼度スコアの算出方法 → **A案（Claude APIの自己申告）。判断根拠も含めてJSON返却**
- [x] 自動承認モードのデフォルト → **OFF。ユーザーが設定画面で明示的にONにする**
- [ ] AI解決に失敗した場合のフォールバック（手動解決へ）

---

### Feature 12-3: Shellワーカーのアイドル検出

#### 課題
```
Phase 11: Shellは種別バッジ（🐚）のみ
→ コマンド実行中かどうかが視覚的にわからない
```

#### ユーザーストーリー
```
As a developer,
I want to see whether a Shell pane is idle or running a command,
So that I can tell at a glance which panes are busy.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-12-10 | アイドル検出 | Shellのプロンプト表示を検知してIdle/Runningを判定 |
| F-12-11 | Shellステータスバッジ | 🐚 Idle / 🐚● Running をバッジで表示 |
| F-12-12 | プロンプトパターン設定 | ユーザーのシェルプロンプト文字列を設定画面で指定可能 |

#### 実装方針
```
PTY出力を監視して行末を確認:
  $ や % や ❯ で終わる行 → Idle
  それ以外の出力が続く   → Running

⚠️ プロンプト文字列はユーザーによって異なる
→ F-12-12 で設定可能にすることで対応
→ デフォルト: $ | % | ❯ | > の4パターン
```

#### 未決定事項
- [x] デフォルトのプロンプトパターン一覧 → **B案（6パターン）: `$` `%` `>` `#` `❯` `→`**
- [x] 正規表現対応をするか → **A案（固定文字列のみ）。将来必要ならPhase 13以降で対応**

---

### Feature 12-4: 設定画面の拡張項目

#### 課題
```
Phase 11の設定モーダル:
  - 並列Worker上限
  - タイムアウト
  - Gitブランチプレフィックス

先送りした項目:
  - Shellのデフォルトパス（zsh/bash）
  - Claude Codeの起動オプション
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-12-13 | Shellパス設定 | デフォルトShellを選択（zsh/bash/fish/カスタム） |
| F-12-14 | Claude Code起動オプション | `--dangerously-skip-permissions`等のフラグをON/OFF |
| F-12-15 | プロンプトパターン設定 | F-12-12のShellプロンプト文字列設定 |
| F-12-16 | 自動承認モード設定 | F-12-09のAI自動解決の閾値設定 |

#### 設定画面イメージ（拡張後）

```
⚙️ Swarm設定

【基本】
  並列Worker上限    [ 2 | ●4 | 6 | 8 ]
  タイムアウト      ◀──●──▶ 30分

【Git】
  ブランチプレフィックス  [ swarm/worker- ]

【Shell】
  デフォルトShell   ● zsh ○ bash ○ fish ○ カスタム
  プロンプトパターン [ $|%|❯|>          ]

【Claude Code】
  起動オプション    ☐ --dangerously-skip-permissions
                   ☐ --no-stream

【AI解決】
  自動承認モード    ☐ 信頼度Highのコンフリクトを自動承認

                              [キャンセル] [保存]
```

---

### Feature 12-5: 並列Worker上限の動的調整

#### 課題
```
Phase 11: 上限8固定（設定で変更可能）
→ システムリソースが逼迫していても制限されない
→ 逆にリソースに余裕があっても上限8を超えられない
```

#### ユーザーストーリー
```
As a developer,
I want DevNest to automatically adjust the Worker limit based on system resources,
So that I don't need to manually tune the limit.
```

#### 機能要件

| 機能ID | 機能名 | 説明 |
|--------|--------|------|
| F-12-17 | リソース監視 | CPU・メモリ使用率をリアルタイムで取得 |
| F-12-18 | 動的上限調整 | リソース状況に応じて稼働可能Worker数を調整 |
| F-12-19 | リソースインジケーター | Orchestratorパネルにリソース使用率を表示 |

#### 調整ロジック（確定）

```
起動OK:   CPU < 60% かつ Memory空き > 2GB → 設定上限まで起動OK
起動抑制: CPU > 75% または Memory空き < 1GB → 新規Worker起動を抑制
Pause:    CPU > 90% → 実行中Workerを一時停止（Pause）
```

#### 未決定事項
- [x] リソース閾値の具体値 → **B案（標準）: CPU 60/75/90%、Memory 2GB/1GB**
- [x] Workerの一時停止（Pause）をサポートするか → **A案（Pauseなし）。起動抑制で十分。将来B案（手動Pause）に拡張**
- [x] リソース取得ライブラリ選定 → **`sysinfo`クレート。CPU・メモリ両方対応、macOS実績◎**

---

## 3. 実装優先度

| 優先度 | Feature | 理由 |
|--------|---------|------|
| 🔴 高 | 12-1 依存グラフ | Swarmの表現力が大幅に上がる。実用性への影響大 |
| 🔴 高 | 12-2 AI自動解決 | Phase 11のコンフリクトUIの自然な延長 |
| 🟡 中 | 12-3 Shellアイドル検出 | UX改善。実装は比較的シンプル |
| 🟡 中 | 12-4 設定画面拡張 | 12-3と12-2の設定が必要になるので連動 |
| 🟢 低 | 12-5 動的調整 | あると便利だが緊急性は低い |

---

## 4. 未決定事項まとめ

| # | Feature | 項目 | 状態 |
|---|---------|------|------|
| 1 | 12-1 | 依存グラフのUI表現 | ✅ B案（ステージ表示） |
| 2 | 12-1 | 依存失敗時の依存先タスクの挙動（Skip? Error?） | ✅ A案（Skip + サマリー明示） |
| 3 | 12-2 | 信頼度スコアの算出方法 | ✅ A案（Claude API自己申告） |
| 4 | 12-2 | 自動承認モードのデフォルト | ✅ デフォルトOFF |
| 5 | 12-3 | デフォルトのプロンプトパターン一覧 | ✅ B案（`$` `%` `>` `#` `❯` `→`） |
| 6 | 12-3 | 正規表現対応をするか | ✅ A案（固定文字列のみ） |
| 7 | 12-5 | リソース閾値の具体値 | ✅ B案（CPU 60/75/90%・Memory 2GB/1GB） |
| 8 | 12-5 | Workerの一時停止（Pause）をサポートするか | ✅ A案（Pauseなし・将来B案に拡張） |
| 9 | 12-5 | リソース取得ライブラリ選定 | ✅ `sysinfo`クレート |

---

## 5. 関連ドキュメント

- DevNest Phase 11 設計書（devnest-phase11-design.md）
- DevNest Phase 11 Step-A 実装指示書（devnest-phase11-step-a-impl.md）
