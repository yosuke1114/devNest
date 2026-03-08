# NotificationsScreen 詳細設計書

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**対象画面**: NotificationsScreen（アプリ内通知の一覧・既読管理・画面遷移）  
**対応シナリオ**: S-10  
**対応タスク**: F（Phase 5）

---

## 1. 画面概要

Rust バックエンドから発火したアプリ内通知（CI 結果・PR コメント・Conflict 検知等）を一覧表示し、既読管理・画面遷移を行う。OS 通知（許可済みの場合）はアプリ外でも通知が届くが、本画面はアプリ内ログの役割を担う。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'notifications'`（uiStore） |
| Props | なし |
| レイアウト | GlobalNav 表示・ヘッダー + 通知リスト（シングルカラム） |

---

## 2. レイアウト仕様

```
┌──────┬──────────────────────────────────────────────────────┐
│      │  NotificationHeader                                  │
│ Nav  │  （未読数 / MARK ALL READ / 通知許可バナー）           │
│      ├──────────────────────────────────────────────────────┤
│      │  NotificationList                                    │
│      │  └ NotificationItem × N                             │
│      │                                                      │
│      │  EmptyState（通知なし時）                             │
└──────┴──────────────────────────────────────────────────────┘
```

---

## 3. コンポーネントツリー

```
NotificationsScreen
  ├── NotificationHeader
  │     ├── UnreadBadge               # 未読数バッジ
  │     ├── MarkAllReadButton
  │     └── PermissionBanner          # permissionStatus≠'granted' 時に表示
  └── NotificationList
        └── NotificationItem × N
              ├── EventTypeIcon
              ├── NotificationBody    # タイトル・本文
              ├── Timestamp
              └── NavigateButton      # → 対象画面へ
```

---

## 4. 状態設計

### 4.1 ストア参照

```typescript
const notifications = useNotificationStore(s => s.notifications)
const unreadCount = useNotificationStore(s => s.unreadCount)
const listStatus = useNotificationStore(s => s.listStatus)
const permissionStatus = useNotificationStore(s => s.permissionStatus)

const activeProjectId = useProjectStore(s => s.activeProjectId)
```

---

## 5. 各コンポーネントの詳細仕様

### 5.1 NotificationHeader

```typescript
interface NotificationHeaderProps {
  unreadCount: number
  permissionStatus: 'granted' | 'denied' | 'skipped' | 'unknown'
  onMarkAllRead: () => void
  onRequestPermission: () => void
}
```

**表示内容**

```
NOTIFICATIONS   [3 unread]                      [MARK ALL READ]
```

**PermissionBanner**（`permissionStatus !== 'granted'` の場合）

| permissionStatus | 表示 |
|-----------------|------|
| `denied` | 「OS 通知がブロックされています。システム設定から許可してください。」（赤） |
| `skipped` / `unknown` | 「OS 通知を許可すると CI 結果・PR コメントをリアルタイムで受け取れます。」[ALLOW] ボタン（黄） |

**MARK ALL READ 押下時**

```typescript
const handleMarkAllRead = async () => {
  await notificationStore.markRead(activeProjectId!)
  // markRead の引数に notificationId を渡さない → 全件既読
}
```

---

### 5.2 NotificationItem

```typescript
interface NotificationItemProps {
  notification: Notification
  onRead: (id: number) => void
  onNavigate: (id: number) => void
}
```

**EventTypeIcon**

| eventType | アイコン | 色 |
|-----------|---------|-----|
| `ci_passed` | ✓ | 緑 |
| `ci_failed` | ✕ | 赤 |
| `pr_reviewed` | ◆ | 紫 |
| `issue_assigned` | ◈ | 青 |
| `pr_opened_by_ai` | ◈ | 青 |
| `conflict` | ⚠ | 黄 |

**表示レイアウト**

```
[✓]  CI が通過しました                          2h ago  [→]
     feat/43-auto-git-commit のチェックがすべて通過しました
```

- 未読の場合：左ボーダー 2.5px（ink 色）+ 背景色（`fillD`）
- 既読の場合：通常背景・テキスト色 `inkL`

**クリック時の動作**

```typescript
const handleClick = async (notification: Notification) => {
  // 未読なら既読にする
  if (!notification.isRead) {
    await notificationStore.markRead(activeProjectId!, notification.id)
  }
  // 対象画面へ遷移
  await notificationStore.navigate(activeProjectId!, notification.id)
}
```

**`notificationStore.navigate` の内部実装**

```typescript
navigate: async (projectId, notificationId) => {
  const notif = get().notifications.find(n => n.id === notificationId)
  if (!notif?.destScreen) return

  switch (notif.destScreen) {
    case 'pr':
      if (notif.destResourceId) {
        await usePrStore.getState().openPrByGithubNumber(projectId, notif.destResourceId)
      }
      useUiStore.getState().navigate('pr')
      break
    case 'conflict':
      useUiStore.getState().navigate('conflict')
      break
    case 'issues':
      if (notif.destResourceId) {
        await useIssueStore.getState().setActiveIssue(projectId, notif.destResourceId)
      }
      useUiStore.getState().navigate('issues')
      break
    default:
      useUiStore.getState().navigate(notif.destScreen as Screen)
  }
}
```

---

### 5.3 EmptyState

通知が 0 件の場合に NotificationList の代わりに表示する。

```
🔔

通知はありません
CI 結果・PR コメント・Conflict 検知などをここで受け取れます
```

---

## 6. mount 処理

```typescript
useEffect(() => {
  if (!activeProjectId) return
  notificationStore.loadNotifications(activeProjectId)
  // → notification_list を invoke → notifications・unreadCount をセット
}, [])
```

---

## 7. リアルタイム通知受信

```typescript
// initListeners 内（AppShell で一度だけ登録）
listen('notification_new', ({ payload }) => {
  notificationStore.onNotificationNew(payload)
  // → notifications 先頭に追加・unreadCount++ → GlobalNav バッジ更新
})
```

`onNotificationNew` の内部

```typescript
onNotificationNew: ({ notificationId, title, eventType }) => {
  // DB から詳細を取得して先頭に挿入
  invoke<Notification>('notification_get', { notification_id: notificationId }).then(notif => {
    set(s => ({
      notifications: [notif, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }))
  })
}
```

---

## 8. ファイル一覧

```
src/screens/NotificationsScreen.tsx
src/components/notifications/NotificationHeader.tsx
src/components/notifications/UnreadBadge.tsx
src/components/notifications/MarkAllReadButton.tsx
src/components/notifications/PermissionBanner.tsx
src/components/notifications/NotificationList.tsx
src/components/notifications/NotificationItem.tsx
src/components/notifications/EventTypeIcon.tsx
```

---

## 9. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | 通知の保持期間 | DB 側で 30 日以上前の通知を定期削除（Rust のバックグラウンドタスク） |
| U-02 | 通知のフィルタリング（eventType 別） | Phase 5 では全件表示のみ。フィルタは Phase 6 以降 |
