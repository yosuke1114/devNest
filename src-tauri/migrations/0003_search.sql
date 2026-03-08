-- Phase 3: セマンティック検索 / キーワード検索インデックス

-- 設計書チャンク（セクション単位で分割）
CREATE TABLE document_chunks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  section_heading TEXT    NULLABLE,
  content         TEXT    NOT NULL,
  start_line      INTEGER NOT NULL,
  end_line        INTEGER NOT NULL,
  token_count     INTEGER NULLABLE,
  created_at      TEXT    NOT NULL,

  UNIQUE(document_id, chunk_index)
);

-- FTS5 仮想テーブル（SQLite 組み込みのキーワード検索エンジン）
CREATE VIRTUAL TABLE documents_fts USING fts5(
  content,
  section_heading,
  document_id UNINDEXED,
  chunk_id UNINDEXED,
  start_line UNINDEXED
);

-- 検索履歴（最新 50 件を保持）
CREATE TABLE search_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  query        TEXT    NOT NULL,
  search_type  TEXT    NOT NULL
                 CHECK(search_type IN ('keyword','semantic','both')),
  result_count INTEGER NULLABLE,
  created_at   TEXT    NOT NULL
);

CREATE INDEX idx_document_chunks_document
  ON document_chunks(document_id);

CREATE INDEX idx_search_history_project
  ON search_history(project_id, created_at DESC);
