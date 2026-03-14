# DevNest — Phase 5 実装スケジュール

**バージョン**: 1.0
**作成日**: 2026-03-09
**対象フェーズ**: Phase 5（OS 通知・バックグラウンドポーリング・NotificationsScreen）
**前提資料**: コマンド定義書 v4.0 / ストア設計書 v4.0 / DB スキーマ設計書 v2.0 / NotificationsScreen 詳細設計書 v1.0
**前提条件**: Phase 4 完了（S-04・S-05・S-07 動作確認済み）

---

## 1. Phase 5 スコープ

### 実現するユーザーシナリオ

| シナリオ | 概要 |
|---------|------|
| S-11 | OS 通知からDevNestの該当画面に飛ぶ（PR CI・コメント・Issue アサイン等） |

> Phase 1 で `notification_permission_request` の呼び出しのみ実装済み。
> Phase 5 で通知の生成・表示・遷移を完成させる。

### 対象コマンド（5 件）

| コマンド | 概要 |
|---------|------|
| `notification_list` | 通知一覧取得（ORDER BY created_at DESC） |
| `notification_mark_read` | 通知を既読（`notification_id` 省略で全件既読）|
| `notification_navigate` | 通知クリック時の遷移先リソースを返す（`NavigationTarget`） |
| `polling_start` | バックグラウンドポーリング開始（GitHub Notifications API + CI check-runs） |
| `polling_stop` | ポーリング停止 |

### 対象イベント（1 件）

| イベント | ペイロード | 用途 |
|---------|-----------|------|
| `notification_new` | `{ notification_id: number, title: string, event_type: string }` | 新着通知（OS 通知発火・バッジ更新） |

### 対象 DB テーブル（2 件）

`notifications` / `search_history`

### 通知イベント種別

| `event_type` | トリガー | 遷移先 |
|-------------|---------|--------|
| `ci_passed` | PR の CI が全件パス | PRScreen（Overview タブ） |
| `ci_failed` | PR の CI が失敗 | PRScreen（Overview タブ） |
| `pr_reviewed` | PR にレビューコメントが届く | PRScreen（Code Diff タブ） |
| `issue_assigned` | Issue に自分がアサインされる | IssuesScreen（Issue 詳細） |
| `pr_opened_by_ai` | Claude Code が PR を作成 | PRScreen（Design Docs タブ） |
| `conflict` | git pull でコンフリクト発生 | ConflictScreen |

### 対象画面

`NotificationsScreen` / `GlobalNav`（未読バッジ） / `SettingsScreen`（通知設定セクション）

---

## 2. タスク分解

### D — DB / マイグレーション（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| D-08 | `migrations/0005_notifications_search.sql` 作成（`notifications` + `search_history` テーブル + インデックス） | Phase 4 完了 | 0.5d |

**マイグレーション内容（抜粋）**

```sql
CREATE TABLE notifications (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title            TEXT    NOT NULL,
  body             TEXT    NOT NULL DEFAULT '',
  event_type       TEXT    NOT NULL
                     CHECK(event_type IN ('ci_passed','ci_failed','pr_reviewed',
                                         'issue_assigned','pr_opened_by_ai','conflict')),
  is_read          INTEGER NOT NULL DEFAULT 0,
  dest_screen      TEXT    NULLABLE,
  dest_resource_id INTEGER NULLABLE,
  dest_tab         TEXT    NULLABLE,
  dest_anchor      TEXT    NULLABLE,
  created_at       TEXT    NOT NULL
);

CREATE TABLE search_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  query       TEXT    NOT NULL,
  search_type TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE INDEX idx_notifications_project_read
  ON notifications(project_id, is_read, created_at DESC);
```

---

### R — Rust バックエンド（3 タスク）

#### R-L: ポーリング（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| R-L01 | `services/polling.rs` 作成（GitHub Notifications API `GET /notifications?participating=true` の定期取得・`subject.type` + `reason` から `event_type` を判定・`notifications` テーブルに INSERT）/ `polling_start` 実装（Tokio `spawn` + interval タスク管理）/ `polling_stop` 実装（タスク abort） | D-08 | 2.0d |
| R-L02 | CI ポーリング追加（`GET /repos/{owner}/{repo}/commits/{sha}/check-runs` で最新 PR の CI ステータスを監視・変化時に `notifications` INSERT + `pull_requests.checks_status` 更新）+ `notification_new` イベント発火（`polling_start` 内から） | R-L01 | 1.5d |

#### R-M: 通知コマンド（1 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| R-M01 | `notification_list` 実装（`notifications` テーブルから取得）/ `notification_mark_read` 実装（全件 or 個別既読・`unread_count` 返却）/ `notification_navigate` 実装（`dest_screen` / `dest_resource_id` から `NavigationTarget` 構築・`dest_resource_id=NULL` なら `ResourceDeleted` エラー） | D-08 | 1.0d |

---

### F — フロントエンド（6 タスク）

#### F-P: notificationStore（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-P01 | `notification.store.ts` 実装（`NotificationState` 型・`loadNotifications` / `markRead` / `navigate` / `requestPermission` / `onNotificationNew`） | R-M01 | 1.0d |
| F-P02 | `notificationStore.onNotificationNew` の OS 通知発火実装（`tauri-plugin-notification` の `sendNotification` 呼び出し）/ `notification_new` イベントリスナーを `initListeners` に追加 / `polling_start` を `projectStore.setActiveProject` 完了時に自動呼び出し | F-P01, R-L02 | 1.0d |

#### F-Q: NotificationsScreen（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-Q01 | `NotificationsScreen.tsx` / `NotificationList.tsx` / `NotificationItem.tsx` 実装（未読バッジ・既読/未読スタイル・クリックで `navigate`）/ `NotificationPermissionBanner.tsx`（権限未付与時のバナー） | F-P01 | 1.0d |
| F-Q02 | `GlobalNav` に未読バッジを追加（`notificationStore.unreadCount > 0` 時に赤バッジ表示）/ `SettingsScreen` に通知設定セクション追加（通知権限状態表示・`ALLOW NOTIFICATIONS` ボタン） | F-Q01 | 0.5d |

#### F-R: 通知からの画面遷移（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| F-R01 | `notificationStore.navigate` のフロント遷移実装（`NavigationTarget` → `uiStore.navigate` への変換・`screen='pr'` 時は `prStore.openPrByGithubNumber` 経由で解決）| F-P01, Phase 2 F-E01 | 1.0d |
| F-R02 | Tauri のウィンドウフォーカス処理（OS 通知クリック → DevNest フォアグラウンド浮上 → 該当画面に遷移）/ `tauri::window::Window::set_focus()` を `notification_navigate` 呼び出し前後に実装 | R-M01 | 0.5d |

---

### E — 結合・動作確認（2 タスク）

| ID | タスク | 依存 | 見積 |
|----|--------|------|------|
| E-11 | S-11 シナリオ通し確認（ポーリング → CI passed 通知 → OS バナー → クリック → PRScreen に遷移） | F-R02 | 1.0d |
| E-12 | 全シナリオ通し確認（S-01〜S-11）・リグレッションテスト | E-11 | 1.0d |

---

## 3. 依存グラフ

```
Phase 4 完了
  │
  ├── D-08 ──→ R-L01 ──→ R-L02
  │              │          │
  │              │     F-P01 ←── R-M01
  │              │       │
  │              │       ├── F-P02 ──→ E-11 ──→ E-12
  │              │       ├── F-Q01 ──→ F-Q02
  │              │       └── F-R01 ──→ F-R02
  │              │
  └── R-M01 ←───┘
```

---

## 4. スケジュール

| 週 | 期間 | タスク | 累計消化 |
|----|------|--------|---------|
| W1 | 1〜5日目 | D-08, R-L01 | 2.5d |
| W2 | 6〜10日目 | R-L02, R-M01 | 5.0d |
| W3 | 11〜15日目 | F-P01, F-P02 | 7.0d |
| W4 | 16〜20日目 | F-Q01, F-Q02, F-R01 | 9.5d |
| W5 | 21〜25日目 | F-R02, E-11, E-12, バッファ | 12.0d |

**合計見積もり: 約 12 日（実稼働）≒ 5 週間**

---

## 5. 新規追加ファイル一覧

### Rust

```
src-tauri/src/services/polling.rs
src-tauri/src/commands/notification.rs
src-tauri/migrations/0005_notifications_search.sql
```

### フロントエンド

```
src/stores/notification.store.ts
src/screens/NotificationsScreen.tsx
src/components/notifications/NotificationList.tsx
src/components/notifications/NotificationItem.tsx
src/components/notifications/NotificationPermissionBanner.tsx
```

---

## 6. Phase 完了後の全体サマリー

| Phase | 主要機能 | 実稼働見積 | 期間目安 |
|-------|---------|-----------|---------|
| Phase 1 | プロジェクト管理・設計書エディタ・Issue 管理（S-01〜S-03） | 36d | 10 週 |
| Phase 2 | PR 管理・GitHub 同期（S-09） | 20.5d | 9 週 |
| Phase 3 | セマンティック検索・インデックス（S-03 強化・S-06） | 13.5d | 6 週 |
| Phase 4 | Claude Code Terminal・Conflict・PR Design Docs（S-04・S-05・S-07） | 20d | 9 週 |
| Phase 5 | OS 通知・ポーリング（S-11） | 12d | 5 週 |
| **合計** | **S-01〜S-11 全シナリオ** | **102d** | **39 週（約 10 ヶ月）** |

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| GitHub Notifications API のレート制限（ポーリング間隔が短すぎる場合） | R-L01 が API エラーを繰り返す | デフォルト 60 秒間隔・GitHub の `X-Poll-Interval` ヘッダーを尊重して動的に調整 |
| macOS 通知権限の再リクエスト（一度拒否後） | F-P02 の通知が届かない | 拒否後は `SettingsScreen` から macOS システム設定への案内リンクを表示 |
| Tauri ウィンドウフォーカス処理（`set_focus()` が macOS で期待通り動かない場合） | F-R02 が不安定 | `NSApplication.activate(ignoringOtherApps: true)` の代替手段を検討。Tauri の `WindowExt` trait を確認 |
| ポーリング中のプロジェクト削除・GitHub 接続解除 | R-L01 が孤立タスクになる | `polling_stop` を `project_delete` / `github_auth_revoke` のコマンドハンドラ内で必ず呼ぶ |
| `notification_navigate` の `dest_resource_id` が PR の DB id か github_number か不明なケース | F-R01 が遷移先を誤解決 | `openPrByGithubNumber` 経由（Phase 2 実装済み）で両方試みて解決する |
