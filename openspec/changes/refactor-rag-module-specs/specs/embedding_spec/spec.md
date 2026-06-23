## MODIFIED Requirements

### Requirement: pgvector schema strictly excludes business content
The `embeddings` table in pgvector SHALL NOT include a `text` column. It MUST only store index and deduplication data. It SHALL include `content_hash` to accurately control deduplication.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         TEXT NOT NULL,         -- MongoDB _id (ObjectId as string)
  source_type       TEXT NOT NULL CHECK (source_type IN ('diary_log', 'knowledge_source')),
  chunk_index       INT  NOT NULL DEFAULT 0, -- 0-based index within source document
  content_hash      TEXT NOT NULL,         -- SHA-256(chunk_text)
  embedding         vector(768) NOT NULL,  -- text-embedding-004 output
  metadata          JSONB,                 -- { user_id?, crop_type? }
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- UNIQUE per source + chunk — allows multi-chunk per document
CREATE UNIQUE INDEX uq_embeddings_source_chunk
  ON embeddings (source_id, source_type, chunk_index);

-- HNSW index for ANN search < 10ms p99
CREATE INDEX idx_embeddings_hnsw
  ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Active-only filter index
CREATE INDEX idx_embeddings_active
  ON embeddings (source_type, is_active)
  WHERE is_active = TRUE;

-- Lookup by source_id — for deactivate / rebuild
CREATE INDEX idx_embeddings_source
  ON embeddings (source_id, source_type);
  
-- User isolation expression index
CREATE INDEX idx_embeddings_diary_owner
  ON embeddings ((metadata->>'user_id'))
  WHERE is_active = TRUE
    AND source_type = 'diary_log';
```

#### Scenario: Schema enforces strict dedup properties
- **WHEN** the `embeddings` table is inspected
- **THEN** it contains NO `text` column, and includes `content_hash` for fast deduplication.

---

### Requirement: Atomic Diff Replacement
To prevent temporary context loss and to accurately deduplicate unchanged chunks, `EmbeddingProcessor` SHALL use an Atomic Diff Replacement flow:
1. Chunk the incoming source text.
2. Call `EmbeddingRepository.findActiveChunkStates(sourceId, sourceType)` to get a Map of `chunkIndex -> { contentHash }`.
3. Compare the new chunks against the Map. Split them into `unchanged`, `changed/new`, and `stale` lists based on exact match of the `contentHash`.
4. Only calculate SHA-256 and call `IEmbeddingProvider.embed` for `changed/new` chunks.
5. In a single database transaction:
   - Upsert `changed/new` chunks (`is_active = TRUE`).
   - Do nothing to `unchanged` chunks.
   - Set `is_active = FALSE` for `stale` chunks.

#### Scenario: Unchanged chunks are skipped but remain active
- **WHEN** a diary log is updated where chunk 0 is unchanged, chunk 1 is modified, and chunk 2 is deleted
- **THEN** Gemini is only called for chunk 1, and the transaction only upserts chunk 1 and deactivates chunk 2. Chunk 0 remains fully active and is never deactivated.

---

### Requirement: ChunkingService limits and Shared Presets
The system SHALL use `ChunkingService.chunkText()` with strict limits. To guarantee `chunk_index` stability between ingestion and hydration, the presets MUST be shared.

```typescript
export interface ChunkingOptions {
  windowSize: number;
  stepSize: number;
  maxChunks: number;
  minLength?: number;
}

export const CHUNKING_PRESETS: Record<string, ChunkingOptions> = {
  diary_log: { windowSize: 300, stepSize: 100, maxChunks: 10, minLength: 20 },
  knowledge_source: { windowSize: 1000, stepSize: 200, maxChunks: 20, minLength: 0 }
};
```

#### Scenario: Sources are chunked deterministically
- **WHEN** `EmbeddingProcessor` receives a `knowledge_source`
- **THEN** it generates chunks according to the preset rules. The exact same preset will be used by `RAGService` to reconstruct the text later.

---

### Requirement: BullMQ queue uses idempotent jobId
The embedding queue SHALL be named `embedding_queue` with job name `embed_document`. Jobs MUST use a `jobId` formatted as `embed:{sourceType}:{sourceId}:{contentHash}` where `contentHash` is the SHA-256 hash of the entire document text. Queue MUST be configured with `removeOnComplete: true`.

#### Scenario: Jobs are implicitly deduplicated
- **WHEN** `DiaryService.updateLog()` is called on a document changing its content rapidly with the exact same text
- **THEN** the job deduplicates successfully because the `contentHash` is unique to the content state.

---

### Requirement: searchSimilar returns content_hash and applies isolation
The `searchSimilar(vector, opts, userId)` method SHALL secure queries using the `user_id` type guard and MUST return `content_hash` and `chunk_index` in its results so that `RAGService` can construct identity-based cache keys and re-hydrate text.

```sql
WHERE is_active = TRUE
  AND 1 - (embedding <=> $1::vector) >= $2
  AND (
    source_type = 'knowledge_source'
    OR (
      source_type = 'diary_log'
      AND metadata->>'user_id' = $4
    )
  )
ORDER BY embedding <=> $1::vector
LIMIT $3
```
