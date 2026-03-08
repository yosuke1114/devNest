# SearchScreen 詳細設計書

**バージョン**: 1.0  
**作成日**: 2026-03-08  
**対象画面**: SearchScreen（設計書 キーワード・セマンティック検索）  
**対応シナリオ**: S-06  
**対応タスク**: F（Phase 1 キーワード / Phase 3 セマンティック）

---

## 1. 画面概要

設計書をキーワード検索（Phase 1）またはセマンティック検索（Phase 3）し、マッチ箇所のプレビューから EditorScreen に直接ジャンプできる。

| 項目 | 内容 |
|------|------|
| ルート | `currentScreen === 'search'`（uiStore） |
| Props | なし |
| レイアウト | GlobalNav 表示・SearchBar（上部）+ 左結果リスト + 右プレビュー |

---

## 2. レイアウト仕様

```
┌──────┬──────────────────────────────────────────────────────────┐
│      │  SearchBar（上部固定）                                    │
│ Nav  ├────────────────────┬─────────────────────────────────────┤
│      │  SearchResultList  │  DocumentPreview                    │
│      │  （280px）         │  （flex: 1）                        │
│      │  └ SearchResult    │  ├ PreviewHeader（ファイル名・OPEN） │
│      │    Item × N        │  └ HighlightedChunk × N            │
└──────┴────────────────────┴─────────────────────────────────────┘
```

---

## 3. コンポーネントツリー

```
SearchScreen
  ├── SearchBar
  │     ├── SearchInput               # クエリ入力
  │     ├── SearchTypeToggle          # keyword / semantic / both
  │     └── SearchSuggestions         # 履歴サジェストドロップダウン
  ├── SearchResultList
  │     ├── ResultCountLabel          # "{N} results"
  │     └── SearchResultItem × N
  └── DocumentPreview
        ├── PreviewHeader             # ファイル名 + OPEN IN EDITOR ボタン
        └── HighlightedChunk × N
```

---

## 4. 状態設計

### 4.1 ストア参照

```typescript
const query = useSearchStore(s => s.query)
const searchType = useSearchStore(s => s.searchType)
const results = useSearchStore(s => s.results)
const searchStatus = useSearchStore(s => s.searchStatus)
const activeResultDocumentId = useSearchStore(s => s.activeResultDocumentId)
const history = useSearchStore(s => s.history)
const historyStatus = useSearchStore(s => s.historyStatus)

const activeProjectId = useProjectStore(s => s.activeProjectId)
```

### 4.2 ローカル state

```typescript
const [showSuggestions, setShowSuggestions] = useState(false)
const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

---

## 5. 各コンポーネントの詳細仕様

### 5.1 SearchBar

```typescript
interface SearchBarProps {
  query: string
  searchType: 'keyword' | 'semantic' | 'both'
  history: SearchHistory[]
  isLoading: boolean
  onQueryChange: (query: string) => void
  onSearchTypeChange: (type: 'keyword' | 'semantic' | 'both') => void
  onSelectHistory: (query: string) => void
}
```

**SearchInput**

```
🔍 [git2-rs の commit 処理について_______________] [×]
```

- プレースホルダー：「設計書を検索…（例: git2-rs commit 処理）」
- `×` ボタン：クエリをクリア + results をリセット
- フォーカス時に `showSuggestions=true`（history が空でない場合）
- 300ms デバウンスで `search()` を呼ぶ

```typescript
const handleQueryChange = (value: string) => {
  searchStore.setQuery(value)
  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  debounceTimerRef.current = setTimeout(() => {
    if (value.trim().length >= 2) {
      searchStore.search(activeProjectId!)
    }
  }, 300)
}
```

**SearchTypeToggle**

| ボタン | 説明 | Phase 1 |
|--------|------|---------|
| keyword | 全文キーワード検索 | 利用可能 |
| semantic | ベクトル類似度検索 | Phase 3 から |
| both | 両方を組み合わせ | Phase 3 から |

Phase 1 では `semantic` / `both` をグレーアウト表示し、ホバー時に「Phase 3 で利用可能になります」のツールチップを表示。

**SearchSuggestions**

`showSuggestions=true` かつ `history.length > 0` の時に表示するドロップダウン。

```
最近の検索:
  🕐 git2-rs commit
  🕐 oauth フロー
  🕐 debounce 設定
```

- 各履歴をクリックで `setQuery(item.query)` + 即時 `search()`
- フォーカスアウトで 150ms 後に `showSuggestions=false`（クリックイベントが先に発火するよう遅延）

---

### 5.2 SearchResultList

```typescript
interface SearchResultItemProps {
  result: SearchResult
  isActive: boolean
  keyword: string
  onClick: (documentId: number) => void
}
```

**SearchResultItem の表示**

```
📄 docs/architecture.md        sim: 0.97
   ## git2-rs
   Rust crate for git operations.
   Commits fire automatically on save via git2-rs.
                                                  （最初のマッチチャンク 2〜3 行）
```

- `keyword` に一致する文字列を `<mark>` タグで黄色ハイライト
- スコア表示：keyword 検索時は非表示・semantic / both 時は `sim: {score}` 表示
- アクティブ状態：左ボーダー 2.5px + 背景色変化

**結果がない場合**

```
"{query}" に一致する設計書が見つかりませんでした。
  ・別のキーワードで試してください
  ・semantic 検索を有効にする（Phase 3 以降）
```

---

### 5.3 DocumentPreview

```typescript
interface DocumentPreviewProps {
  result: SearchResult | null
  keyword: string
  onOpenInEditor: (documentId: number, startLine: number) => void
}
```

**PreviewHeader**

```
📄 docs/architecture.md                    [OPEN IN EDITOR →]
```

**OPEN IN EDITOR の処理**

```typescript
const handleOpenInEditor = (startLine: number) => {
  searchStore.openInEditor(activeProjectId!, result!.documentId, startLine)
  // 内部で navigate('editor', { documentId, scrollToLine }) + openDocument()
}
```

**HighlightedChunk**

```typescript
interface HighlightedChunkProps {
  chunk: MatchedChunk
  keyword: string
}
```

チャンクの `content` を行ごとに表示し、`highlightRanges` に従って `keyword` をハイライトする。

```
Ln 8    ## git2-rs
Ln 9    Rust crate for git operations.
Ln 10   Commits fire automatically on save via **git2-rs**.  ← ハイライト
Ln 11   Debounce: 1 second after last keystroke.
                                              [→ Ln 10 で開く]
```

各チャンクに「→ Ln {startLine} で開く」リンクを表示。クリックで `onOpenInEditor(startLine)` を呼ぶ。

**ハイライト実装**

```typescript
function highlightKeyword(text: string, ranges: Array<[number, number]>): React.ReactNode {
  if (ranges.length === 0) return text
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (cursor < start) parts.push(text.slice(cursor, start))
    parts.push(<mark key={start} style={{ background: '#FFF3CD', padding: 0 }}>{text.slice(start, end)}</mark>)
    cursor = end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}
```

---

## 6. mount 処理

```typescript
useEffect(() => {
  if (!activeProjectId) return
  if (historyStatus === 'idle') {
    searchStore.loadHistory(activeProjectId)
  }
  // 前回の検索結果・クエリを復元（searchStore に保持）
}, [])
```

---

## 7. search コマンドの Phase 別動作

| searchType | Phase 1 | Phase 3 |
|-----------|---------|---------|
| `keyword` | `document_search_keyword`（SQLite FTS5） | 同左 |
| `semantic` | `IndexNotReady` → 「未実装」メッセージ | `document_search_semantic`（sqlite-vec） |
| `both` | keyword のみで代替 | 両方の結果をスコアで統合 |

---

## 8. エラーハンドリング

| エラー | 表示場所 | 対応 |
|--------|---------|------|
| `IndexNotReady`（semantic 検索） | SearchBar 下の黄色バナー | 「セマンティック検索は Phase 3 から」 |
| `search` 失敗（その他） | ResultList のエラーメッセージ | RETRY ボタン |

---

## 9. ファイル一覧

```
src/screens/SearchScreen.tsx
src/components/search/SearchBar.tsx
src/components/search/SearchInput.tsx
src/components/search/SearchTypeToggle.tsx
src/components/search/SearchSuggestions.tsx
src/components/search/SearchResultList.tsx
src/components/search/SearchResultItem.tsx
src/components/search/DocumentPreview.tsx
src/components/search/PreviewHeader.tsx
src/components/search/HighlightedChunk.tsx
src/lib/highlightKeyword.ts
```

---

## 10. 未解決事項

| # | 内容 | 対応方針 |
|---|------|---------|
| U-01 | ファイルフィルタ（docs/ / specs/ 等）の実装 | Phase 1 では全ファイル対象のみ。ファイルフィルタは Phase 2 |
| U-02 | 検索履歴の件数上限 | DB 側で直近 20 件を保持（`search_history` テーブル） |
