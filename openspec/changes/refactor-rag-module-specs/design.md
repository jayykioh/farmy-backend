## Context

The RAG pipeline in FarmDiaries AI requires orchestration between text chunking, embedding generation (Gemini), vector storage (pgvector), and retrieval hydration (MongoDB). The initial specs had architectural flaws (circular dependencies, data leakage in pgvector) and drift compared to the actual implementation.

This design document explains the architectural decisions required to build a safe, robust, and correctly isolated retrieval layer while fixing the underlying embedding infrastructure, strictly constrained to MVP scope.

## Goals / Non-Goals

**Goals:**
- Implement a dedicated `RagModule` to cleanly separate retrieval orchestration from the shared `AiModule`.
- Eliminate circular dependencies between domain modules and AI infrastructure.
- Remove business content (`text`) from pgvector to strictly enforce the "derived search index only" rule.
- Define explicit source identities mapping directly to existing MongoDB collections (`DiaryLog` and `KnowledgeSource`).
- Prevent unnecessary Gemini API calls by pre-checking `content_hash`.
- Ensure context availability during document updates by using an Atomic Diff Replacement flow.
- Fix user-isolation queries, robust hydration, and cache identity strategies.

**Non-Goals:**
- Introducing semantic reranking, hybrid search, or a second vector database.
- Introducing `embedding_version` schemas or robust model-change migrations in MVP.
- Creating pre-chunked MongoDB collections (no `diary_chunks` or `knowledge_chunks`).

## Decisions

### Decision 1: Dedicated `RagModule` (Prevents Circular Dependency)

**Why:** Placing `RAGService` inside `AiModule` and injecting domain repositories creates a circular dependency.
**Resolution:** Create `src/modules/rag/rag.module.ts`. This module will import `AiModule` (for pgvector) and persistence ports from `FarmModule` and `KnowledgeModule`.

---

### Decision 2: Remove `text` column from pgvector; use `content_hash` only

**Why:** Storing user text violates the rule that MongoDB is the sole source of truth.
**Resolution:** Drop the `text` column. Keep `content_hash TEXT NOT NULL`. The deduplication logic will rely entirely on the hash. The original text will be dynamically reconstructed during retrieval.

---

### Decision 3: Source Identity and Hydration

**Why:** Ambiguity in `source_type` causes broken hydration. The actual content lives in `diary_logs` and `knowledge_sources`.
**Resolution:**
- `source_type` must be exactly `'diary_log'` or `'knowledge_source'`.
- `source_id` is the `_id` of the respective MongoDB document.
- Both types are chunked by `EmbeddingProcessor`.
- During RAG, `RagModule` fetches the full document from MongoDB, then runs the exact same `ChunkingService.chunkText` with the same preset, and extracts the text via `chunk_index` to hydrate the context.

---

### Decision 4: Atomic Diff Replacement (Safe & Accurate Dedup)

**Why:** Simple transaction replacement drops unchanged chunks if they were skipped from embedding.
**Resolution:**
1. Chunk the new document content.
2. Query `findActiveChunkStates(sourceId, sourceType)` to get all current active hashes.
3. Diff the chunks:
   - Same hash at same index -> `unchanged` (skip Gemini).
   - Different hash or new index -> `changed/new` (call Gemini).
   - Old index not in new chunks -> `stale`.
4. Transactionally: upsert `changed/new` with `is_active=true`, leave `unchanged` alone, and `deactivate` the `stale` chunks. Only deactivate the entire source if explicitly deleted.

---

### Decision 5: Explicit ChunkingOptions and Shared Presets

**Why:** `windowSize` and `stepSize` alone are insufficient to constrain chunks safely. Also, ingestion and hydration must use the exact same logic to guarantee `chunk_index` consistency.
**Resolution:** Define a strict interface with `maxChunks` and `minLength`. Export a shared `CHUNKING_PRESETS` constant. Both `EmbeddingProcessor` (ingestion) and `RagService` (hydration) will import and use `CHUNKING_PRESETS[sourceType]` to calculate chunks.

---

### Decision 6: Robust Cache Keys and Context Assembly

**Why:** `md5(query)` as a cache key causes PII leaks and collisions.
**Resolution:** Standardize on SHA-256 for all hashes. Cache key will be `rag:knowledge:${sha256(hits.map(h => h.source_id + ':' + h.chunk_index + ':' + h.content_hash).sort().join(','))}`. `EmbeddingRepository.searchSimilar` MUST return `content_hash`. Cache only applies to `knowledge_source`.

---

### Decision 7: Fail-Open Retrieval & Defense-in-Depth

**Why:** Infra failures shouldn't break Chat. Vector DB metadata might be stale.
**Resolution:**
- **Fail-open:** Catch only infra errors (timeout, network, quota) and return `degraded` status. Do not swallow validation/programming errors.
- **Defense-in-depth:** pgvector filters by `user_id` inside metadata. Mongo must re-verify ownership by resolving `DiaryLog -> Diary -> FarmPlot -> user_id` to absolutely block leaks.

---

### Decision 8: BullMQ JobId Lifecycle

**Why:** `jobId` tied to `contentHash` enforces idempotency natively in BullMQ.
**Resolution:** Enqueue jobs with `embed:{sourceType}:{sourceId}:{contentHash}`. The `contentHash` is the hash of the full document string. Set `removeOnComplete: true`. No need for `sourceVersion` timestamps in MVP.

---

### Decision 9: Delete and Rebuild Lifecycle

**Why:** Dropping the table for migration loses all vectors. Also, when a document is deleted, its vectors remain stale in pgvector if not explicitly removed.
**Resolution:**
- **Deactivate:** When `DiaryLog` or `KnowledgeSource` is deleted, the respective service MUST call `EmbeddingRepository.deactivateBySourceId()`.
- **Rebuild:** A utility script/endpoint will be provided to fetch all active documents from MongoDB and enqueue them into `embedding_queue` to rebuild the index safely without downtime after a schema migration.
