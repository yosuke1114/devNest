# DevNest ドキュメント↔ソース マッピング構造 設計書

## 1. 概要

DevNestにおいて、設計書とソースコードの対応関係（マッピング）を構造的に管理し、
ドキュメントの自動最新化フローの土台とする仕組みを設計する。

### 設計方針
- **マッピング情報の一元管理**: 各設計書のfrontmatter（YAML）にマッピング定義を埋め込む
- **双方向追跡**: ソース → 設計書、設計書 → ソース の両方向から参照可能
- **粒度の柔軟性**: ファイル単位〜セクション単位まで対応
- **自動検証可能**: CIやDevNest UIから整合性チェックを実行可能

---

## 2. リポジトリ構造

```
devnest/
├── docs/
│   ├── architecture/          # アーキテクチャ設計書
│   │   └── system-overview.md
│   ├── modules/               # モジュール構造設計
│   │   ├── rust-modules.md
│   │   └── frontend-modules.md
│   ├── screens/               # 画面別詳細設計
│   │   ├── editor-screen.md
│   │   ├── sync-diff-screen.md
│   │   └── project-dashboard.md
│   ├── api/                   # API/インターフェース定義
│   │   ├── tauri-commands.md
│   │   └── github-integration.md
│   ├── error-handling/        # エラーハンドリング設計
│   │   └── error-strategy.md
│   └── .doc-map.yaml          # マッピングインデックス（自動生成）
├── src/
│   ├── lib.rs
│   ├── commands/
│   ├── github/
│   ├── editor/
│   └── ...
└── src-tauri/
    └── ...
```

---

## 3. Frontmatter スキーマ定義

### 3.1 基本構造

各設計書のfrontmatterに `mapping` フィールドを定義する。

```yaml
---
title: "EditorScreen 詳細設計"
doc_type: screen_design        # 設計書の種類
version: "1.2.0"
last_synced_commit: "a1b2c3d"  # 最後にソースと同期確認したコミット
status: current                # current | outdated | draft | archived

mapping:
  # この設計書が対応するソースコードの範囲
  sources:
    - path: "src/editor/"
      scope: directory           # directory | file | function | module
      description: "エディタ画面のRustバックエンド"

    - path: "src/components/EditorScreen.tsx"
      scope: file
      description: "エディタ画面のReactコンポーネント"

    - path: "src/commands/editor_commands.rs"
      scope: file
      description: "エディタ関連Tauriコマンド"

  # セクション単位の細粒度マッピング（任意）
  sections:
    - heading: "## 状態管理"
      sources:
        - path: "src/editor/state.rs"
          scope: file
    - heading: "## ファイル保存フロー"
      sources:
        - path: "src/editor/save.rs"
          scope: file
        - path: "src/commands/editor_commands.rs"
          functions: ["save_file", "auto_save"]

  # 依存する他の設計書
  depends_on:
    - doc: "docs/modules/rust-modules.md"
      relationship: references    # references | extends | implements
    - doc: "docs/error-handling/error-strategy.md"
      relationship: implements

  # この設計書が定義するインターフェース（API設計書向け）
  defines:
    - type: tauri_command
      names: ["save_file", "load_file", "auto_save"]
    - type: event
      names: ["file-changed", "save-completed"]

tags: [editor, frontend, rust, tauri-commands]
---
```

### 3.2 `doc_type` の種類と用途

| doc_type | 用途 | 主なマッピング粒度 |
|---|---|---|
| `architecture` | アーキテクチャ設計書 | ディレクトリ・モジュール単位 |
| `module_structure` | モジュール構造設計 | ディレクトリ・ファイル単位 |
| `screen_design` | 画面別詳細設計 | ファイル・関数単位 |
| `api_definition` | API/インターフェース定義 | 関数・型定義単位 |
| `error_handling` | エラーハンドリング設計 | モジュール横断 |

### 3.3 `scope` の定義

```
directory  - ディレクトリ配下のすべてのファイルを対象
file       - 特定ファイル全体を対象
function   - ファイル内の特定の関数/メソッドを対象
module     - Rustの mod 単位を対象
type       - 特定の型定義（struct, enum, trait）を対象
```

---

## 4. マッピングインデックス（.doc-map.yaml）

frontmatterから自動生成される逆引きインデックス。
「このソースファイルはどの設計書に関係するか」を高速に検索するために使う。

```yaml
# 自動生成 - 手動編集禁止
# generated_at: 2026-03-12T10:00:00+09:00
# generated_from_commit: a1b2c3d

source_index:
  "src/editor/":
    - doc: "docs/screens/editor-screen.md"
      sections: ["全体"]
    - doc: "docs/modules/rust-modules.md"
      sections: ["## editor モジュール"]

  "src/editor/state.rs":
    - doc: "docs/screens/editor-screen.md"
      sections: ["## 状態管理"]

  "src/commands/editor_commands.rs":
    - doc: "docs/screens/editor-screen.md"
      sections: ["## ファイル保存フロー"]
    - doc: "docs/api/tauri-commands.md"
      sections: ["## Editor Commands"]

  "src/github/":
    - doc: "docs/api/github-integration.md"
      sections: ["全体"]
    - doc: "docs/architecture/system-overview.md"
      sections: ["## GitHub連携アーキテクチャ"]

doc_index:
  "docs/screens/editor-screen.md":
    sources:
      - "src/editor/"
      - "src/components/EditorScreen.tsx"
      - "src/commands/editor_commands.rs"
    depends_on:
      - "docs/modules/rust-modules.md"
      - "docs/error-handling/error-strategy.md"
```

---

## 5. マッピング活用フロー

```
┌─────────────────────────────────────────────────────────────────┐
│                    開発サイクル全体像                              │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────────┐      │
│  │ 開発者が  │───▶│ Claude Code  │───▶│  feature branch   │      │
│  │ タスク依頼│    │ がコード実装 │    │  にcommit         │      │
│  └──────────┘    └──────────────┘    └────────┬──────────┘      │
│                                               │                 │
│                                               ▼                 │
│                                    ┌──────────────────┐         │
│                                    │ DevNest が       │         │
│                                    │ diff を検知      │         │
│                                    └────────┬─────────┘         │
│                                             │                   │
│                              ┌──────────────┼──────────────┐    │
│                              ▼              ▼              ▼    │
│                     ┌──────────────┐ ┌───────────┐ ┌─────────┐ │
│                     │.doc-map.yaml │ │ 影響範囲  │ │ ステータ │ │
│                     │で逆引き検索  │ │ を特定    │ │ スを     │ │
│                     │              │ │           │ │ outdated │ │
│                     └──────┬───────┘ └─────┬─────┘ │ に変更   │ │
│                            │               │       └────┬────┘ │
│                            ▼               ▼            │      │
│                     ┌─────────────────────────────┐     │      │
│                     │  DevNest UI に通知表示       │◀────┘      │
│                     │  「EditorScreen設計書が      │            │
│                     │    古くなっている可能性」     │            │
│                     └──────────┬──────────────────┘            │
│                                │                               │
│                    ┌───────────┼───────────┐                   │
│                    ▼                       ▼                   │
│           ┌──────────────┐       ┌──────────────────┐          │
│           │ 手動で更新   │       │ Claude Code に   │          │
│           │              │       │ 更新を依頼       │          │
│           └──────────────┘       │ (コンテキスト    │          │
│                                  │  自動注入)       │          │
│                                  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. DevNest での実装方針

### 6.1 Rust バックエンド

```
src-tauri/src/
├── doc_mapping/
│   ├── mod.rs              # モジュールルート
│   ├── parser.rs           # frontmatter パーサー (YAML抽出)
│   ├── index.rs            # .doc-map.yaml の生成・読み込み
│   ├── diff_analyzer.rs    # git diff → 影響設計書の特定
│   └── staleness.rs        # 鮮度チェック (last_synced_commit vs HEAD)
```

### 6.2 主要なTauriコマンド

```rust
/// マッピングインデックスを再生成
#[tauri::command]
async fn rebuild_doc_index(project_path: String) -> Result<DocIndex, AppError>

/// 指定コミット範囲の変更で影響を受ける設計書を返す
#[tauri::command]
async fn find_affected_docs(
    project_path: String,
    from_commit: String,
    to_commit: Option<String>,  // None = HEAD
) -> Result<Vec<AffectedDoc>, AppError>

/// 設計書の鮮度ステータスを一括チェック
#[tauri::command]
async fn check_doc_staleness(
    project_path: String,
) -> Result<Vec<DocStaleness>, AppError>

/// Claude Code に渡すコンテキスト（影響設計書の内容）を生成
#[tauri::command]
async fn generate_update_context(
    project_path: String,
    doc_path: String,
) -> Result<UpdateContext, AppError>
```

### 6.3 フロントエンド（React）

DevNest UIに以下を追加:

- **Doc Health Dashboard**: 全設計書の鮮度を一覧表示（🟢current / 🟡outdated / 🔴stale）
- **Mapping Visualizer**: ソース↔設計書の対応をインタラクティブに表示
- **Update Trigger**: outdatedな設計書に対して「Claude Codeで更新」ボタン

---

## 7. 整合性チェックのルール

### 7.1 自動検出パターン

| チェック項目 | 方法 | 重要度 |
|---|---|---|
| マッピング先のファイルが存在するか | パス存在チェック | 🔴 Error |
| マッピング先のファイルが削除されていないか | git status | 🔴 Error |
| last_synced_commit 以降にソースが変更されたか | git log --since | 🟡 Warning |
| frontmatterのfunctions指定が実在するか | AST解析 / grep | 🟡 Warning |
| 循環依存がないか | depends_on グラフ解析 | 🟡 Warning |
| マッピングされていないソースファイルがあるか | カバレッジ計算 | 🔵 Info |

### 7.2 鮮度スコア算出

```
staleness_score = 
    (days_since_last_sync * 0.3)
  + (source_commits_since_sync * 0.5)
  + (source_lines_changed / total_source_lines * 0.2)

ステータス判定:
  score < 0.3  → 🟢 current
  score < 0.7  → 🟡 outdated
  score >= 0.7 → 🔴 stale
```

---

## 8. Claude Code 連携

### 8.1 タスク依頼時のコンテキスト自動注入

DevNestからClaude Codeにタスクを渡す際、以下のコンテキストを自動付与:

```markdown
## 関連設計書情報

以下の設計書がこのタスクの変更範囲に関連しています。
ソースコードの変更に合わせて、設計書も更新してください。

### 影響を受ける設計書
1. `docs/screens/editor-screen.md` (status: current)
   - 関連セクション: "## ファイル保存フロー"
   - マッピング: src/editor/save.rs, src/commands/editor_commands.rs

### 更新ルール
- frontmatter の `last_synced_commit` を更新後のコミットハッシュに更新
- frontmatter の `version` をセマンティックに更新（破壊的変更→メジャー、機能追加→マイナー、修正→パッチ）
- 新しいファイル/関数を追加した場合は `mapping.sources` にも追加
- `status` を `current` に設定
```

### 8.2 PR テンプレートへの組み込み

```markdown
## ドキュメント影響チェック

- [ ] 変更したソースに対応する設計書を更新済み
- [ ] frontmatter の last_synced_commit を更新済み
- [ ] 新規ファイルのマッピングを追加済み

### 影響設計書（自動検出）
<!-- DevNest が自動挿入 -->
```

---

## 9. 将来の拡張ポイント

- **マルチプロダクト対応**: プロダクトごとの `docs/` + `.doc-map.yaml` を切り替え
- **Agentic Flow**: 鮮度が一定以下になったら自動でClaude Codeに更新タスクを発行
- **変更影響グラフ**: depends_on を辿って「この変更の波及範囲」を可視化
- **カバレッジレポート**: マッピングされていないソースの割合を計測
