# DevNest Phase 13 テスト計画書
# Advanced Orchestration — ロール・メッセージング・ガード・監視

**バージョン**: 1.0
**作成日**: 2026-03-16
**対象フェーズ**: Phase 13
**前提**: devnest-test-design.md（Phase 1〜12）の補遺
**ステータス**: 確定

---

## 1. テスト対象モジュール

| モジュール | 層 | 対応Step |
|-----------|-----|---------|
| `role_manager.rs` | ITa | 13-A |
| `guard_manager.rs` | ITa | 13-A |
| `watchdog.rs` | ITa | 13-B |
| `mail_store.rs` | ITa | 13-C |
| `context_store.rs` | ITa | 13-C |
| `session_store.rs` | ITa | 13-D |
| `knowledge_store.rs` | ITa | 13-E |
| `health_check.rs` | ITa | 13-E |
| `XtermPane`（役割バッジ） | ITb | 13-A |
| `GuardViolationDialog` | ITb | 13-A |
| `CrashRecoveryDialog` | ITb | 13-D |
| ロール別Swarm実行フロー | ST | 13-A〜E |

---

## 2. モック設計（Phase 13追加分）

### 2.1 Gitフック検証用ヘルパー

```rust
// src-tauri/src/swarm/tests/mock_git_hooks.rs

use tempfile::TempDir;
use std::process::Command;

/// テスト用gitリポジトリにhooksを設置して検証するヘルパー
pub struct GitHookTestEnv {
    pub dir: TempDir,
}

impl GitHookTestEnv {
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        Command::new("git").args(["init"]).current_dir(dir.path()).output().unwrap();
        Command::new("git")
            .args(["commit", "--allow-empty", "-m", "init"])
            .current_dir(dir.path()).output().unwrap();
        Self { dir }
    }

    /// hooksが設置されているか確認
    pub fn hook_exists(&self, hook_name: &str) -> bool {
        self.dir.path().join(".git/hooks").join(hook_name).exists()
    }

    /// git pushを実行してブロックされるか確認
    pub fn try_git_push(&self) -> bool {
        let output = Command::new("git")
            .args(["push", "origin", "main"])
            .current_dir(self.dir.path())
            .output()
            .unwrap();
        // exit code 1 = フックでブロック
        !output.status.success()
    }
}
```

### 2.2 SQLiteメールストアのインメモリモック

```rust
// テストでは:memory: DBを使用
pub fn create_test_mail_store() -> MailStore {
    MailStore::open(Path::new(":memory:"), "test-session-1").unwrap()
}
```

### 2.3 知識蓄積のClaude APIモック（フロント側）

```typescript
// src/test/mocks/claude-api.ts に追加

// 知識抽出リクエストのモック
http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
    const body = await request.json() as any;
    if (body.messages?.[0]?.content?.includes("知識を抽出")) {
        return HttpResponse.json({
            content: [{
                type: "text",
                text: JSON.stringify([
                    {
                        category: "error_pattern",
                        content: "portable-ptyでエラーが出た場合は...",
                        expiresAt: null,
                    }
                ])
            }]
        });
    }
}),
```

---

## 3. ITa テストケース一覧

### 3.1 role_manager × worker

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITa-13-01 | init_role_templatesが.devnest/roles/を作成する | 正常 | 4ファイルが生成される |
| ITa-13-02 | 既存テンプレートは上書きしない | 正常 | カスタマイズが保護される |
| ITa-13-03 | Scout役割のテンプレートを読み込める | 正常 | scout.mdの内容が返る |
| ITa-13-04 | 存在しないテンプレートはNoneを返す | 異常 | None返却 |
| ITa-13-05 | Scout役割のblocked_git_commandsにgit_pushが含まれる | 正常 | vec!["git push",...] |
| ITa-13-06 | Shell役割のblocked_git_commandsは空 | 正常 | 空Vec |
| ITa-13-07 | Builder役割のblocked_commandsにgit_pushが含まれる | 正常 | git push がブロック対象 |
| ITa-13-08 | Merger役割のblocked_commandsにrm_rfが含まれる | 正常 | rm -rf がブロック対象 |

---

### 3.2 guard_manager × git_hooks

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITa-13-09 | Scout役割でpre-pushフックが設置される | 正常 | .git/hooks/pre-push が存在 |
| ITa-13-10 | Builder役割でpre-pushフックが設置される | 正常 | .git/hooks/pre-push が存在 |
| ITa-13-11 | Shell役割ではフックが設置されない | 正常 | フックファイルなし |
| ITa-13-12 | Scout役割のpre-pushがgit pushをブロックする | 正常 | exit code 1 |
| ITa-13-13 | フックがDEVNEST_GUARD_VIOLATIONシグナルを出力する | 正常 | stdout に含まれる |
| ITa-13-14 | detect_guard_violationがgit_pushを検出する | 正常 | Some(GitPush) |
| ITa-13-15 | detect_guard_violationが無関係な出力でNoneを返す | 正常 | None |
| ITa-13-16 | フックが実行権限を持っている | 正常 | chmod 755確認 |

---

### 3.3 watchdog × manager

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITa-13-17 | record_activityで最終活動時刻が更新される | 正常 | last_output_atが現在時刻 |
| ITa-13-18 | 閾値以内の無音ではstalled_workersが空 | 正常 | 空Vec |
| ITa-13-19 | 閾値超過でstalled_workersにWorkerが含まれる | 正常 | Worker IDが含まれる |
| ITa-13-20 | increment_nudgeでnudge_attemptsが増える | 正常 | attempts + 1 |
| ITa-13-21 | increment_nudgeでタイマーがリセットされる | 正常 | last_output_atが更新 |
| ITa-13-22 | remove_workerで活動記録が削除される | 正常 | stalled_workersに含まれない |
| ITa-13-23 | 複数Workerのスタックを同時に検出できる | 正常 | 2Worker分が返る |
| ITa-13-24 | Nudge回数が上限に達したWorkerはstalled_workersに返り続ける | 境界値 | attempts >= max_attempts |

---

### 3.4 mail_store

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITa-13-25 | openでmail.dbが作成されWALモードになる | 正常 | journal_mode=wal |
| ITa-13-26 | sendでレコードが挿入される | 正常 | SELECT COUNT = 1 |
| ITa-13-27 | fetch_unreadで未読メールが取得される | 正常 | メッセージ内容が正しい |
| ITa-13-28 | fetch_unread後にread=1になる | 正常 | 既読フラグが立つ |
| ITa-13-29 | fetch_unreadを2回呼んでも同じメールは返らない | 正常 | 2回目は空 |
| ITa-13-30 | 別セッションのメールは取得されない | 正常 | session_idで分離 |
| ITa-13-31 | 全8メッセージ型がシリアライズ/デシリアライズできる | 正常 | 往復変換OK |
| ITa-13-32 | archive_sessionでJSONLファイルが生成される | 正常 | ファイルが存在 |
| ITa-13-33 | archive_session後にDBからレコードが削除される | 正常 | SELECT COUNT = 0 |
| ITa-13-34 | 並列sendが競合せずに全件挿入される | 境界値 | 10並列で全件OK |

---

### 3.5 context_store

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITa-13-35 | record_artifactで成果物が記録される | 正常 | artifacts[worker_id]が存在 |
| ITa-13-36 | saveとloadで内容が一致する | 正常 | 往復変換OK |
| ITa-13-37 | build_context_promptで依存Workerの情報が含まれる | 正常 | サマリー文字列に含まれる |
| ITa-13-38 | depends_onが空の場合は空文字列を返す | 正常 | "" |
| ITa-13-39 | 存在しないWorker IDはbuild_context_promptで無視される | 異常 | エラーなし・空文字列 |

---

### 3.6 session_store

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITa-13-40 | update_heartbeatでlast_heartbeat_atが更新される | 正常 | datetime更新 |
| ITa-13-41 | 5分以内のセッションはfind_crashed_sessionsに含まれない | 正常 | 空Vec |
| ITa-13-42 | 5分以上古いセッションがfind_crashed_sessionsに含まれる | 正常 | session_idが含まれる |
| ITa-13-43 | コミットありWorkerはExisting(branch)を返す | 正常 | ResumeBranch::Existing |
| ITa-13-44 | コミットなしWorkerはNew(branch-retry)を返す | 正常 | ResumeBranch::New |
| ITa-13-45 | 完了済みWorkerはクラッシュリカバリ対象外 | 正常 | status='done'は除外 |

---

### 3.7 health_check

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITa-13-46 | git存在時はdependenciesがOkを返す | 正常 | HealthStatus::Ok |
| ITa-13-47 | claudeがない場合はdependenciesがErrorを返す | 異常 | HealthStatus::Error |
| ITa-13-48 | run_health_checkが8カテゴリ全て返す | 正常 | reports.len() == 8 |

---

## 4. ITb テストケース一覧

### 4.1 XtermPane（役割バッジ）

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITb-13-01 | Scout役割で🔍バッジが表示される | 正常 | data-role="scout" |
| ITb-13-02 | Builder役割で🔨バッジが表示される | 正常 | data-role="builder" |
| ITb-13-03 | Reviewer役割で👁️バッジが表示される | 正常 | data-role="reviewer" |
| ITb-13-04 | Merger役割で🔀バッジが表示される | 正常 | data-role="merger" |
| ITb-13-05 | Shell役割で🐚バッジが表示される | 正常 | data-role="shell" |

---

### 4.2 GuardViolationDialog

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITb-13-06 | guard-violation(git_push)でUI通知が表示される | 正常 | トースト表示 |
| ITb-13-07 | git_push違反ではダイアログが表示されない | 正常 | モーダルなし |
| ITb-13-08 | ロール違反でダイアログが表示される | 正常 | モーダル表示 |
| ITb-13-09 | [継続させる]クリックでダイアログが閉じる | 正常 | モーダル非表示 |
| ITb-13-10 | [停止する]クリックでkill_workerが呼ばれる | 正常 | invokeが呼ばれる |
| ITb-13-11 | 違反Workerのラベルがダイアログに表示される | 正常 | worker_idが含まれる |

---

### 4.3 CrashRecoveryDialog

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITb-13-12 | クラッシュセッションがない場合ダイアログが表示されない | 正常 | 非表示 |
| ITb-13-13 | クラッシュセッションがある場合ダイアログが表示される | 正常 | 表示 |
| ITb-13-14 | 完了済みWorkerに✅スキップが表示される | 正常 | ✅テキスト |
| ITb-13-15 | コミットありWorkerに🔄続きから再開が表示される | 正常 | 🔄テキスト |
| ITb-13-16 | コミットなしWorkerに🆕新規再実行が表示される | 正常 | 🆕テキスト |
| ITb-13-17 | [再開する]クリックでresume_crashed_sessionが呼ばれる | 正常 | invokeが呼ばれる |
| ITb-13-18 | [破棄する]クリックでdiscard_crashed_sessionが呼ばれる | 正常 | invokeが呼ばれる |
| ITb-13-19 | [再開する]後にダイアログが閉じる | 正常 | 非表示 |

---

### 4.4 ロール選択UI（WorkerConfig）

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITb-13-20 | Worker追加時にロールを選択できる | 正常 | 役割セレクタ表示 |
| ITb-13-21 | デフォルトロールはBuilderである | 正常 | role="builder" |
| ITb-13-22 | ロール変更がWorkerConfigに反映される | 正常 | config.role更新 |

---

### 4.5 Watchdog UI

| テストID | テスト名 | 正常/異常 | 検証内容 |
|---------|---------|---------|---------|
| ITb-13-23 | worker-nudgedイベントでペインが⚡強調表示される | 正常 | 視覚的強調 |
| ITb-13-24 | worker-stalledイベントで⚠️バッジが表示される | 異常 | stalledバッジ |
| ITb-13-25 | スタック状態からNudge後に復帰したらバッジが消える | 正常 | バッジ非表示 |

---

## 5. ST テストケース一覧

### ST-13-01: ロール別Worker並列実行フロー
```
前提: DevNestが起動している
1. タスクを入力して分解を実行
2. SubTaskリストでScout・Builder・Reviewerが割り当てられていることを確認
3. 実行開始
4. 各ペインヘッダーに役割アイコンが表示されることを確認
   Scout → 🔍 / Builder → 🔨 / Reviewer → 👁️
5. 全Worker完了後にサマリーが表示されることを確認
期待: 役割に応じたアイコンが正しく表示され並列実行が完了する
```

### ST-13-02: ガード違反検出フロー（Gitフック）
```
1. Scout役割のWorkerを起動
2. Workerがgit pushを試みる（モック）
3. Gitフックがブロックしてエラーが返ることを確認
4. UIに⚠️ガード違反通知が表示されることを確認
5. ダイアログが表示されないことを確認（Gitフック違反は通知のみ）
期待: git pushがブロックされUI通知が表示される
```

### ST-13-03: ガード違反ダイアログ（ロール違反）
```
1. Reviewer役割のWorkerがファイル書き込みを試みる（モック）
2. [継続/停止]ダイアログが表示されることを確認
3. [停止する]をクリック
4. WorkerがError状態になることを確認
期待: ロール違反時にユーザーが判断できる
```

### ST-13-04: スタック検出・Nudgeフロー
```
1. Batch Workerを起動
2. Watchdogが自動起動することを確認（ResourceIndicator等で確認）
3. Workerが120秒無音状態をシミュレート（モック）
4. ⚡Nudge通知がUIに表示されることを確認
5. Nudge後にWorkerが再活性化することを確認
期待: スタック検知とNudgeが自動で実行される
```

### ST-13-05: Nudge失敗→リスタートフロー
```
1. Batch Workerを起動
2. 3回Nudge失敗をシミュレート
3. ⚠️スタック通知が表示されることを確認
4. Workerが自動リスタートされることを確認
期待: Nudge3回失敗でリスタートが実行される
```

### ST-13-06: Worker間メール送信フロー
```
1. Scout → Builder の依存関係を持つSubTaskを実行
2. Scout完了時にmail.dbにWorkDoneメールが記録されることを確認
3. Builder起動時にScoutからのメールがプロンプトに注入されることを確認
期待: Scout→Builderへのコンテキスト伝達が正常に動作する
```

### ST-13-07: Escalationメールフロー
```
1. Builder Workerが判断できない状況をシミュレート
2. EscalationメールがOrchestratorに送信される
3. OrchestratorパネルにEscalation通知が表示される
4. ユーザーが返答を入力
5. Workerが再開される
期待: エスカレーションフローが正常に動作する
```

### ST-13-08: クラッシュリカバリフロー
```
1. Swarmを実行中にDevNestを強制終了（モック）
2. DevNestを再起動
3. CrashRecoveryDialogが表示されることを確認
4. 完了済みWorker・未完了Workerの状態が正しく表示される
5. [再開する]をクリック
6. 完了済みWorkerがスキップされて未完了Workerが再起動される
期待: クラッシュ後の正常な再開が実現できる
```

### ST-13-09: コミット有無によるブランチ切り替え
```
前提: クラッシュシナリオ（ST-13-08の続き）
1. コミットありWorkerが既存ブランチで再開されることを確認
2. コミットなしWorkerが新規ブランチ（-retry）で再開されることを確認
期待: 途中の作業が保護される
```

### ST-13-10: 知識蓄積フロー
```
1. エラーが発生するタスクを実行
2. セッション完了後にknowledge.mdに知識が追記されることを確認
3. 同種のタスクを再実行
4. Workerのプロンプトに前回の知識が注入されていることを確認
   （ログ出力で確認）
期待: セッションをまたいだ知識蓄積が機能する
```

### ST-13-11: ヘルスチェック実行
```
1. 設定メニューからヘルスチェックを実行
2. 8カテゴリの診断結果が表示されることを確認
3. 全て✅Okであることを確認（正常環境）
期待: ヘルスチェックが全カテゴリを診断して結果を表示する
```

### ST-13-12: ロールテンプレートカスタマイズ
```
1. .devnest/roles/builder.mdを編集
   「変更前にテストを必ず実行してください」を追記
2. Builder Workerを起動
3. Workerのプロンプトにカスタマイズ内容が含まれることを確認
期待: .devnest/roles/*.mdのカスタマイズがWorkerに反映される
```

---

## 6. data-testid 追加一覧（Phase 13分）

| testid | 対象要素 |
|--------|---------|
| `worker-role-icon-{id}` | 役割アイコン |
| `guard-violation-toast` | Gitフック違反トースト |
| `guard-violation-dialog` | ロール違反ダイアログ |
| `guard-continue-button` | 継続ボタン |
| `guard-stop-button` | 停止ボタン |
| `crash-recovery-dialog` | クラッシュリカバリダイアログ |
| `crash-resume-button` | 再開ボタン |
| `crash-discard-button` | 破棄ボタン |
| `worker-stalled-badge-{id}` | スタックバッジ |
| `worker-nudged-badge-{id}` | Nudge中バッジ |
| `mail-panel` | メールパネル |
| `escalation-notification` | Escalation通知 |
| `health-check-panel` | ヘルスチェック結果パネル |
| `health-check-item-{category}` | 各カテゴリの結果 |
| `knowledge-panel` | 知識蓄積パネル |
| `role-selector-{worker-id}` | ロール選択UI |

---

## 7. テストケース数まとめ

| 層 | Phase 11-12 | Phase 13追加 | 合計 |
|----|------------|-------------|------|
| ITa | 26件 | 48件 | 74件 |
| ITb | 34件 | 25件 | 59件 |
| ST | 12件 | 12件 | 24件 |
| **合計** | **72件** | **85件** | **157件** |

---

## 8. CI設計（Phase 13追加分）

```yaml
# .github/workflows/test.yml への追加

# ITa Phase 13テスト（既存のitaジョブに統合）
- name: Run Phase 13 ITa tests
  working-directory: src-tauri
  run: cargo test swarm::tests::role_manager
       cargo test swarm::tests::guard_manager
       cargo test swarm::tests::watchdog
       cargo test swarm::tests::mail_store
       cargo test swarm::tests::context_store
       cargo test swarm::tests::session_store
       cargo test swarm::tests::knowledge_store
       cargo test swarm::tests::health_check
```

---

## 9. 実装チェックリスト

### 事前確認
- [ ] devnest-testid-guide.mdのPhase 13分testidを付与済み
- [ ] .devnest/roles/*.md が初期化済み
- [ ] rusqlite・chronoがCargo.tomlに追加済み

### モック
- [ ] mock_git_hooks.rs 完成
- [ ] create_test_mail_store() ヘルパー完成
- [ ] claude-api.ts に知識抽出モック追加

### ITa
- [ ] role_manager_test.rs（8ケース）
- [ ] guard_manager_test.rs（8ケース）
- [ ] watchdog_test.rs（8ケース）
- [ ] mail_store_test.rs（10ケース）
- [ ] context_store_test.rs（5ケース）
- [ ] session_store_test.rs（6ケース）
- [ ] health_check_test.rs（3ケース）
- [ ] `cargo test` が全件グリーン

### ITb
- [ ] XtermPane.test.tsx（役割バッジ 5ケース追加）
- [ ] GuardViolationDialog.test.tsx（6ケース）
- [ ] CrashRecoveryDialog.test.tsx（8ケース）
- [ ] WatchdogUI.test.tsx（3ケース）
- [ ] RoleSelector.test.tsx（3ケース）
- [ ] `npm run test:itb` が全件グリーン

### ST
- [ ] ST-13-01〜12の12ファイル完成
- [ ] `npm run test:st` が全件グリーン

---

## 10. 関連ドキュメント

- devnest-test-design.md（Phase 1〜12 テスト設計書）
- devnest-testid-guide.md（data-testid付与指示書）
- devnest-phase13-design.md
- devnest-phase13-steps-impl.md
