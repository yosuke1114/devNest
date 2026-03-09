-- Phase 3: ベクトル埋め込みテーブル（sqlite-vec 相当を BLOB で実装）

-- チャンクのベクトル埋め込みを格納するテーブル
-- embedding: text-embedding-3-small の 1536 次元ベクトル（f32 × 1536 = 6144 bytes）
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id   INTEGER PRIMARY KEY REFERENCES document_chunks(id) ON DELETE CASCADE,
  embedding  BLOB NOT NULL  -- 1536 個の f32 をリトルエンディアンで連結した raw bytes
);

-- document_chunks に embedding_status カラムを追加
ALTER TABLE document_chunks ADD COLUMN embedding_status TEXT NOT NULL DEFAULT 'pending'
  CHECK(embedding_status IN ('pending', 'indexed', 'stale', 'error'));

CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_chunk
  ON chunk_embeddings(chunk_id);
