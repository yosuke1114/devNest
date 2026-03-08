# DevNest ユーザーシナリオ

## ペルソナ

**田中 陽介（35歳）**
IT企業勤務のソフトウェアエンジニア。業務のかたわら、週末を中心に複数の個人プロダクトを開発している。現在は3リポジトリを並行管理中。設計書はMarkdownで書くが、GitHub・エディタ・AIツールを行き来する手間が増えてきており、コンテキストスイッチのコストを痛感している。

- **環境**: macOS、VS Code、Claude Code（CLI）、GitHub
- **課題**: 設計書とIssueが乖離しがち / AIに毎回背景を説明するのが面倒 / git commitを忘れる

---

## シナリオ一覧

| # | シナリオ名 | 主要機能 | 画面 |
|---|-----------|---------|------|
| S-01 | 新プロジェクトの登録 | F-01, F-04, F-05, F-13 | Setup |
| S-02 | 設計書を書いて自動コミット | F-02, F-03, F-05 | Editor |
| S-03 | AIにIssueを下書きさせる | F-12, F-13, F-14, F-15 | AI Issue |
| S-04 | Claude CodeでIssueを実装する | F-16, F-17, F-18, F-19 | Terminal |
| S-05 | AIが書き換えたコードと設計書をレビューしてマージ | F-06, F-07, F-17 | PR（Design Docs）|
| S-06 | 設計書からキーワードで情報を探す | F-21 | Search |
| S-07 | Pullしたらコンフリクトが起きた | F-08 | Conflict |
| S-08 | 複数リポジトリを切り替えて作業する | F-01 | Editor |

---

## S-01 新プロジェクトの登録

**背景**
陽介は新しい個人プロジェクト「devnest」を始めた。ローカルにリポジトリをクローンし、`docs/` 以下にMarkdownで設計書を書き始めている。DevNestに登録してAI連携を使えるようにしたい。

**操作フロー**
1. DevNestを起動 → Setupウィザードが表示される
2. プロジェクト名「devnest」、ローカルディレクトリを指定 → `.md` ファイルが自動検出される
3. GitHubタブ → 「CONNECT WITH GITHUB」を押す → ブラウザが開いてOAuth認証 → 「Authorize DevNest」をクリック → 2秒後に完了モーダル
4. リポジトリ「yosuke/devnest」・ブランチ「main」を選択
5. Syncタブ → Auto（保存時自動コミット）を選択、AI編集は「別ブランチ+PRレビュー」を選択
6. Indexタブ → 「BUILD INDEX NOW」を押す → 5ファイルがembedding処理される（約3秒）
7. 完了画面 → 「OPEN EDITOR →」をクリック

**期待結果**
- エディタが開き、プロジェクトサイドバーに「devnest」が表示される
- ステータスバーに「● synced · main」が表示される

---

## S-02 設計書を書いて自動コミット

**背景**
陽介は `docs/architecture.md` のgit2-rsセクションに新しい仕様を追記したい。保存すれば自動でコミットされるはずだが、うまく動くか確認したい。

**操作フロー**
1. エディタ画面 → ファイルツリーから `docs/architecture.md` を選択
2. CodeMirrorエディタに仕様を追記する
3. `Cmd+S` で保存 → ステータスバーが「● unsaved」→「↑ pushing…」→「● synced · main」に変わる
4. Sync/Diff画面 → 「YOUR EDITS」に `architecture.md: ↑ pushed` が表示される

**期待結果**
- コミットメッセージ `docs: update architecture.md` で自動コミット・プッシュされる
- 手動でgit操作する必要がない

---

## S-03 AIにIssueを下書きさせる

**背景**
陽介はエディタ保存時の自動git commit機能を実装したい。仕様の詳細はすでに設計書に書いてあるので、それを参照させてAIにIssueを作ってほしい。

**操作フロー**
1. グローバルナビ → 「◉（issues）」アイコン → Issue一覧が表示
2. 「+ NEW WITH AI」をクリック → AIウィザードのStep 1へ
3. テキストエリアに日本語で要件を入力：「エディタの保存時に自動でgit commitを走らせてGitHubにプッシュする機能を実装してほしい。失敗時はリトライも。」
4. 「SEARCH CONTEXT →」→ Step 2（Semantic Search）：`sync-flow.md`（0.94）、`architecture.md`（0.81）、`editor.md`（0.67）が表示される
5. 「GENERATE DRAFT →」→ Step 3（Draft）：Claudeがストリーミングでコンテンツを生成。AcceptanceCriteriaのチェックリストも自動生成
6. 内容を確認して「LOOKS GOOD →」→ Step 4（Edit）：タイトル・ラベル・アサイニーを調整
7. 「FILE ISSUE →」→ Step 5（Filed）：Issue #43が起票される
8. 「▶ LAUNCH TERMINAL」を押して実装へ

**期待結果**
- 設計書の内容を参照したIssueが作成される
- 毎回「背景を説明する」手間がなくなる

---

## S-04 Claude CodeでIssueを実装する

**背景**
Issue #43が起票された。ターミナルを開いてClaude Codeに実装を任せたい。進捗はUIで確認し、完了したらPRを作りたい。

**操作フロー**
1. ターミナル画面（Step 3の「▶ LAUNCH TERMINAL」から遷移）
2. xterm.jsパネルが開いた状態 → `claude code` コマンドが自動実行される
3. Claude Codeが Issue #43の内容・関連設計書を読み込み → `feat/auto-git-commit` ブランチを作成 → `src/core/git.rs` を実装 → テスト12件パス
4. 「Ready to commit. Proceed? [y/n]」→ `y` を入力
5. コミット後、上部に「PR READY: feat/auto-git-commit · 3 files changed」バナーが出現
6. 「CREATE PR →」を押す → PR #44が起票される

**期待結果**
- Claude Codeとターミナルを行き来せずにUIの中で完結する
- PRが自動生成されるのでレビューに移れる

---

## S-05 AIが書き換えたコードと設計書をレビューしてマージ（v2.0改訂）

**背景**
Claude Codeが Issue #43「Auto git-commit on editor save」を実装した。同一ブランチ `feat/43-auto-git-commit` にソースコード（3ファイル）と設計書 `architecture.md`（12行追加）が両方コミットされており、PR #44 が作成済みだ。コードと設計書をまとめてレビューしてマージしたい。

**操作フロー**
1. TerminalScreen に「✓ PR #44 を作成しました」バナーが表示されている → **[PR を開く →]** をクリック
2. PRScreen の **Design Docs タブ** が自動的に開く（`has_doc_changes=true` のため）
3. `docs/architecture.md`（+12 -1）の unified diff を確認する
   - 設計書の変更が意図通りであることを確認
   - 問題がなければ次のステップへ
4. **Code Changes タブ** に切り替えて `.ts` ファイルの変更を確認する
5. **Overview タブ** → ReviewPanel で「Approve」を選択 → **[SUBMIT REVIEW]**
6. MergePanel → **[MERGE COMMIT]** をクリック
7. 「✓ マージ完了　feat/43-auto-git-commit → main」「設計書 1 ファイルがマージされました」が表示される

**期待結果**
- コードと設計書を 1 本の PR・1 画面でまとめてレビューしてマージできる
- 設計書の変更が自動で main に入ることがない（必ずレビューを経る）

**REQUEST CHANGES フロー（設計書に問題があった場合）**

1. Design Docs タブ → **[REQUEST CHANGES ↩]** をクリック
2. テキストエリアに修正指示を入力（例：「retry 回数を 5 回に変更してください」）
3. **[SEND TO CLAUDE CODE →]** をクリック
4. TerminalScreen に自動遷移し、Claude Code が同一ブランチで再実装を開始する
5. 完了後、PR が自動更新され再度 Design Docs タブで確認できる

---

## S-06 設計書からキーワードで情報を探す

**背景**
陽介はOAuthトークンのリフレッシュ仕様を確認したい。どのファイルに書いてあったか覚えていないので検索したい。

**操作フロー**
1. グローバルナビ → 「⌕（search）」アイコン
2. 検索バーに「oauth」と入力 → サジェストに「github oauth」が表示される → Enter
3. 左パネルに2件のヒット：`architecture.md`（0.95）・`specs/auth-flow.md`（0.88）
4. `architecture.md` の結果をクリック → 右パネルにマッチ行（黄ハイライト）とコンテキスト行が表示される
5. 「OPEN IN EDITOR →」でエディタに遷移

**期待結果**
- どのファイルにどのセクションがあるかを素早く特定できる
- Semantic検索への切り替えも1クリックで可能

---

## S-07 Pullしたらコンフリクトが起きた

**背景**
陽介がリモートの変更をPullしたところ、`architecture.md` と `sync-flow.md` でコンフリクトが検知された。手動で解決したい。

**操作フロー**
1. Conflict画面に「⚠ Merge Conflict Detected」モーダルが表示される
2. 影響ファイル：`architecture.md`（2コンフリクト）・`sync-flow.md`（1コンフリクト）を確認
3. 「Manual merge」を選択 → 手動マージエディタが開く
4. Conflict 1：リモートの変更（debounce 500ms・retry 5回）の方が仕様として正しいので「USE THEIRS」
5. Conflict 2：手元の変更（tauri-plugin-stronghold）が正しいので「USE MINE」
6. 進捗バーが「2/2 resolved」になる → 「SAVE & MERGE →」がアクティブになる
7. クリックして完了

**期待結果**
- コンフリクトを1ファイルずつ・1ブロックずつ丁寧に解決できる
- 「USE ALL MINE / USE ALL THEIRS」で一括解決も可能

---

## S-08 複数リポジトリを切り替えて作業する

**背景**
陽介はdevnestの作業を一時中断して、別プロジェクト「api-server」のIssueを確認したい。

**操作フロー**
1. エディタ画面のプロジェクトサイドバー → 「api-server」をクリック
2. ファイルツリーが api-server の設計書に切り替わる
3. グローバルナビ → Issues画面 → api-server のIssue一覧が表示される
4. 確認後、サイドバーで「devnest」をクリックして戻る

**期待結果**
- リポジトリの切り替えがサイドバー1クリックで完結する
- 各プロジェクトのコンテキスト（設計書・Issue・インデックス）が独立して管理される

---

## 画面遷移マップ

```
[起動]
  └─ Setup（初回のみ）
       └─ [完了] → Editor ──────────────────────┐
                                                  │
[グローバルナビ（常時）]                          │
  ✎ Editor ←──── AI updated badge ←─── Sync/Diff│
  ◉ Issues ──→ + NEW WITH AI ──→ AI Issue Wizard │
                                  └─ LAUNCH TERMINAL → Terminal ─→ PR READY ─→ PR
  ⬡ PR  ←──────────────────────────────────────────────────────────────────────┘
  ▶ Terminal
  ⌕ Search ──→ OPEN IN EDITOR ──→ Editor
  ⚠ Conflict（Pullコンフリクト時）
  ⚙ Settings（GitHub OAuth含む）
```

---

## S-09 PRにコメントを書いてレビューを完了させる

**背景**
Claude Codeが作成したPR #44（feat/auto-git-commit）をレビューしたい。コードは問題なさそうだが、1点コメントを残してからApproveしたい。

**操作フロー**
1. グローバルナビ → 「⬡（PR）」アイコン → PR一覧
2. PR #44「feat: Auto git-commit on editor save」を選択 → Overview タブ
3. 「Files changed」タブに切り替える → 変更ファイル一覧と差分が表示
4. `src/core/git.rs` の 42行目（retry ロジック）の行番号をクリック → インラインコメント入力欄が開く
5. 「backoff の最大間隔を 4s → 8s に変更を検討してほしい」とコメントを入力 → 「ADD REVIEW COMMENT」
6. 「Diff」タブ → コメントアイコンが42行目に表示されていることを確認
7. Overview タブ → Reviews セクションの「APPROVE」をクリック → ステータスが「✓ approved by yosuke」に変わる
8. 「MERGE PR」がアクティブになる → クリック → PR がマージされ、ステータスが「⬡ merged」に変わる

**期待結果**
- インラインコメントを残しながらApproveできる
- マージ後、Issue #43 のステータスが自動で「closed」に変わる

---

## S-10 IssueからリンクされていないMarkdownを設計書に紐付ける

**背景**
Issue #42（OAuth token refresh）を調べていたら、`specs/auth-flow.md` に関連する仕様が書いてあることに気づいた。このIssueに手動でリンクしておきたい。

**操作フロー**
1. Issues画面 → Issue #42 を選択 → 詳細ビューの右サイドバー「Design Docs」欄
2. 「+ link doc」をクリック → ファイルピッカーモーダルが開く
3. ファイルツリーから `specs/auth-flow.md` を選択（または検索バーで「auth」と入力してフィルタ）
4. 「LINK」をクリック → モーダルが閉じ、サイドバーの「Design Docs」に `specs/auth-flow.md` が追加される
5. 詳細タブ本文エリア → 「Related Design Docs」セクションに `specs/auth-flow.md` が表示される
6. `specs/auth-flow.md` の「open →」リンクをクリック → エディタ画面に遷移してそのファイルが開く

**期待結果**
- IssueとMarkdownが双方向で関連付けられる
- 設計書側でもどのIssueからリンクされているか確認できる（F-22）

---

## S-11 OS通知からDevNestの該当画面に飛ぶ

**背景**
陽介がブラウザで別作業をしていると、macOSの通知センターに「DevNest: PR #44 — CI checks passed」という通知が届いた。そのまま該当PRに飛びたい。

**操作フロー**
1. macOS通知センターにバナーが表示される：
   - タイトル：「DevNest」
   - 本文：「PR #44 feat/auto-git-commit — CI checks passed ✓」
2. バナーをクリック → DevNest がフォアグラウンドに浮上する
3. PR #44 の詳細画面（Overviewタブ）が直接開く
4. CI passing バッジが緑になっており「MERGE PR」がアクティブな状態

**通知が届くタイミング（F-23 対象イベント）**

| イベント | 通知内容 | 遷移先 |
|---------|---------|--------|
| CI checks passed/failed | PR #N — checks passed/failed | PR詳細 |
| PR レビューコメント受信 | @user commented on PR #N | PR詳細 > Diff タブ |
| Issue に自分がアサインされた | You were assigned to #N | Issue詳細 |
| AI編集のPRが作成された | Claude opened PR #N | PR詳細 |
| コンフリクト検知 | Conflict in architecture.md | Conflict画面 |

**期待結果**
- 通知をクリックするだけで該当コンテキストに直接遷移できる
- DevNest が非アクティブでも重要イベントを見逃さない

---

## 画面遷移マップ（更新版）

```
[起動]
  └─ Setup（初回のみ）
       └─ [完了] → Editor

[グローバルナビ（常時）]
  ✎ Editor ←───── AI updated badge ←──── Sync/Diff
  ◉ Issues ──→ + NEW WITH AI ──→ AI Issue Wizard
     │                             └─ LAUNCH TERMINAL → Terminal ─→ PR READY ─→ PR
     └─ + link doc ──→ [File Picker Modal] ──→ Issue detail（S-10）
  ⬡ PR ←─────────────────────────────────────────────────────────────────────────┘
     └─ Files changed ──→ [Inline Comment] ──→ APPROVE ──→ MERGE（S-09）
  ▶ Terminal
  ⌕ Search ──→ OPEN IN EDITOR ──→ Editor
  ⚠ Conflict（Pullコンフリクト時）
  ⚙ Settings（GitHub OAuth含む）

[OS通知（F-23）]
  通知バナークリック ──→ DevNest フォアグラウンド ──→ 該当画面に直接遷移（S-11）
```

---

## 全シナリオ × 機能カバレッジ

| シナリオ | F-01 | F-02/03 | F-05/06 | F-07 | F-08 | F-09 | F-12〜15 | F-16〜20 | F-21 | F-22 | F-23 |
|---------|------|---------|---------|------|------|------|---------|---------|------|------|------|
| S-01 Setup | ✓ | | ✓ | | | | | | | | |
| S-02 Editor | | ✓ | ✓ | | | | | | | | |
| S-03 AI Issue | | | | | | ✓ | ✓ | | | | |
| S-04 Terminal | | | | | | | | ✓ | | | |
| S-05 PR Design Docs | | | ✓ | ✓ | | | | ✓ | | | |
| S-06 Search | | | | | | | | | ✓ | | |
| S-07 Conflict | | | | | ✓ | | | | | | |
| S-08 Multi-repo | ✓ | | | | | | | | | | |
| S-09 PR Review | | | | | | | | | | | |
| S-10 Doc Link | | | | | | ✓ | | | | ✓ | |
| S-11 OS通知 | | | | | | | | | | | ✓ |

---

## 仕様追記（シミュレーション P-08〜P-16 対応）

> シナリオ机上シミュレーションで発見した未定義事項の仕様を定義する。

---

### P-08 push失敗時の挙動

**ステータスバー表示**

| 状態 | 表示 | 操作 |
|------|------|------|
| 未保存 | `● unsaved` (yellow) | — |
| push中 | `◌ pushing…` (yellow) | — |
| 成功 | `● synced · main` (green) | — |
| 失敗 | `✕ push failed · retry?` (red) | `RETRY` ボタン表示 |

**リトライ仕様**
- 自動リトライ: 最大3回 · exponential backoff (1s, 2s, 4s)
- 3回失敗後: ステータスバーに `RETRY` ボタンを表示し手動トリガーに委ねる
- エラー詳細: ステータスバークリックでトースト展開（"Push failed: remote rejected (403)"など）

---

### P-09 複数ファイル連続保存時のコミット動作

**debounce 仕様**
- 単ファイル保存: 1秒 debounce 後にコミット
- 複数ファイル連続保存: **ファイルをまたいで debounce を共有する**
  - 最後の保存から1秒以内に別ファイルが保存された場合、まとめて1コミットにする
  - コミットメッセージ: `docs: update overview.md, architecture.md` (複数ファイル名を列挙、3ファイル超は `docs: update 4 files`)
- 最大待機時間: 5秒（連続保存が続いても5秒後には強制コミット）

---

### P-10 AI Issue入力欄の空バリデーション

- テキストエリアが空の状態で「SEARCH CONTEXT →」を押した場合、ボタンを disabled にしてエラーメッセージを表示する
- エラーメッセージ: `内容を入力してから次に進んでください。`（InfoNote / type: danger）
- 空白のみ（スペース・改行）も空扱いとする

---

### P-11 セマンティック検索 0件時のフォールバック

**フォールバック優先順位**
1. インデックス済みファイルがある場合: `"関連する設計書が見つかりませんでした。コンテキストなしでドラフトを生成しますか？"` (InfoNote / warn) + `GENERATE WITHOUT CONTEXT` ボタン
2. インデックスが空（未構築）の場合: `"設計書がインデックスされていません。Setupでインデックスを作成してください。"` (InfoNote / danger) + `GO TO SETUP` ボタン
3. GitHub接続なし: セマンティック検索自体は動作する（ローカルのみ）

---

### P-12 ラベル追加UI

- ラベル一覧はGitHubリポジトリから取得（`GET /repos/{owner}/{repo}/labels`）
- Issue作成ウィザード Step 4（Edit）でドロップダウン一覧から選択
- AI が自動付与した `ai-assist` ラベルはチェック済みで表示（削除可能）
- GitHubに存在しないラベルは赤枠でエラー表示し、保存時にGitHub側でラベル作成を促す

---

### P-13 Claude Codeが生成するブランチ名規則

**命名規則**
```
feat/{issue-id}-{sanitized-title}
例: feat/43-auto-git-commit-on-editor-save
```

**sanitize ルール**
- 英数字・ハイフン以外を除去（日本語・記号を含む場合はスキップ）
- 全角文字のみの場合: `feat/{issue-id}-issue` にフォールバック
- 最大長: 60文字（超過した場合は末尾を切り捨て）

**確認ステップ**
- ターミナル起動時に「ブランチ名プレビュー」を表示（編集可能）
- ユーザーが Enter するまでブランチを作成しない

---

### P-14 AI編集設計書の「差し戻し」フロー

**Sync/Diff画面のアクションボタン**

| ボタン | 動作 |
|--------|------|
| MERGE | AI編集ブランチを main にマージ。ブランチは自動削除。 |
| REQUEST CHANGES | コメント入力欄を展開。コメント付きでAIに再生成を依頼。再生成後、同ブランチを更新してDiffビューに戻る。 |
| EDIT | DevNest内エディタでAI編集内容を直接修正。保存するとブランチを更新。 |

**「REQUEST CHANGES」フロー**
1. コメント欄展開: `修正指示を入力… (例: retry回数を5回に変更して)` 
2. 「SEND TO AI」ボタン → Claude に再生成依頼
3. Diffビューが更新版に差し替わる
4. 再度 MERGE / REQUEST CHANGES を選択

**マージ後のブランチ自動削除**
- デフォルト: ON（設定で変更可能）
- Settings > Sync > "Delete AI edit branches after merge"

---

### P-15 プロジェクト切り替え時の未保存警告

**トリガー条件**
- エディタに unsaved の変更がある状態でプロジェクトサイドバーを別プロジェクトに切り替えたとき

**ダイアログ表示**
```
⚠ 未保存の変更があります
overview.md の変更が保存されていません。

[保存して切替]  [破棄して切替]  [キャンセル]
```

**各ボタンの動作**
- `保存して切替`: Cmd+S 相当の保存を実行 → push → 切り替え
- `破棄して切替`: 変更を破棄してプロジェクトを切り替え
- `キャンセル`: ダイアログを閉じ、元のプロジェクトに留まる

**プロジェクトサイドバーの未保存インジケーター**
- アクティブプロジェクト名の右に `●` (yellow) を表示

---

### P-16 Issue と PR の自動 close 連携

**`closes #N` 自動挿入**
- AI Issue Wizard の Step 4（Edit）で「Closes Issue」フィールドを表示
- Claude Code が PR を作成する際、PRのbodyに `closes #{issue-id}` を自動で挿入
- GitHub の仕様により、PRがデフォルトブランチ（main）にマージされた時点で該当Issueが自動 close

**手動起票PRの場合**
- PR作成画面の「Description」フィールドに `closes #N` をテンプレートとして表示
- ユーザーが削除した場合は自動closeされない（GitHubの標準動作に従う）

**Issueステータスの反映**
- DevNest内でも `PR merged → Issue closed` をリアルタイムで反映（GitHub webhook）

---

## 仕様追記（Round 2 シミュレーション N-03・N-04・N-07・N-10 対応）

---

### N-03 ターミナル実行中の Claude Code 中断手段

**ターミナルヘッダーの STOP ボタン**

| 状態 | 表示 |
|------|------|
| 実行中 | `● running` (green) + `■ STOP` ボタン (red border) |
| 停止後 | `● stopped` (gray) |

**STOP ボタンの動作**
- Claude Code の PTY プロセスに `SIGINT` を送信（Ctrl+C 相当）
- xterm.js にフォーカスがなくてもボタンクリックで確実に中断できる
- 中断後は `● stopped` に切り替わり、ターミナルは手動入力モードへ

**xterm.js フォーカス仕様**
- ターミナルパネルが表示されたとき自動でフォーカスを当てる
- 他パネルをクリックしたとき xterm.js のフォーカスは外れる（意図的）
- フォーカスが外れた状態で `Ctrl+C` はターミナルに届かない → STOP ボタンで補完

---

### N-04 Claude Code の起動方式（自動 vs 手動）

**DevNest における起動フロー**

```
Issue詳細 →「▶ LAUNCH TERMINAL」クリック
         ↓
TerminalScreen に遷移
         ↓
「claude code」コマンドをターミナルに自動入力（preload）
         ↓
ユーザーが Enter で確定 → 実行開始
```

**起動方式の仕様**
- コマンドは**自動入力（preload）するが、Enter は自動で押さない**
- ユーザーが内容を確認してから Enter で実行するワンステップ方式
- 理由: Claude Code が何をするか確認する機会を残す。不意な実行を防ぐ

**自動入力されるコマンド**
```
claude code --issue 43 --context docs/sync-flow.md,docs/architecture.md
```
- `--issue`: Issue 番号（Issue詳細から引き継ぎ）
- `--context`: セマンティック検索で選ばれた設計書（Issue詳細の「Related Docs」から引き継ぎ）

**コマンドのカスタマイズ**
- ユーザーはターミナル上でコマンドを編集してから Enter を押せる
- 「LAUNCH TERMINAL」ボタンからではなく、ユーザーが手動で `claude code` と打ち込むことも可能

---

### N-07 ヘッダーのプロジェクトスイッチャーと未保存警告

**対象場面**
- Issues / PR / Search / Settings など、EditorScreen 以外の画面にいるとき
- エディタで設計書を編集中に別画面へ遷移した場合は未保存状態が残る可能性がある

**グローバルヘッダーのプロジェクト切り替え（Issues/PRなど）**
- これらの画面ではエディタを操作していないため、原則として未保存状態は発生しない
- EditorScreen でファイルを編集中に GlobalNav でほかの画面へ遷移した場合: ステータスバーの `● unsaved` インジケーターが保持されたままになる
- この状態で EditorScreen に戻ると、編集は破棄されずに残っている（React state が保持される）

**明示的な警告が必要なタイミング**

| 操作 | 警告 |
|------|------|
| EditorScreen でのプロジェクトサイドバー切り替え | ✅ ダイアログ表示 |
| GlobalNav でほかの画面へ遷移（Issues/PR など） | ❌ 警告なし（エディタ state は保持） |
| アプリ終了（Tauri ウィンドウを閉じる） | ✅ OS ネイティブダイアログ "Save before quit?" を表示 |

---

### N-10 通知権限未付与時のフォールバック

**通知権限のリクエストタイミング**

Setup ウィザードの Step 4（Index）完了後、最終ステップとして通知権限を求める：

```
Step 4: Index 完了
 ↓
「DevNestからの通知を許可しますか？」OS ネイティブダイアログ
 ↓
許可 → 通知機能 ON
却下 → 通知機能 OFF（設定から後で変更可能）
```

**通知一覧画面（NotificationScreen）の権限未付与時**

- 権限が未付与の場合、通知一覧に以下のバナーを表示：

```
🔔 通知が無効です
DevNestからの通知（PR・Issue・push失敗）を受け取るには許可が必要です。
[通知を許可する]  [後で]
```

- 「通知を許可する」クリック → OS ネイティブ権限ダイアログを再度表示
- macOS: `tauri::api::notification` の権限 API を使用
- 権限状態は Settings > Notifications にも表示・変更可能
