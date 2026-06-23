## Why

The RAG pipeline specs across `embedding_spec.md` and `aifeature.md` have accumulated drift from the actual implementation. Key differences include chunking parameters, `ChunkingService` API, `EmbeddingRepository` schema, user-scoped search filter logic, and knowledge cache key strategy. This change resolves these discrepancies, fixes architectural issues (circular dependencies, data privacy, state race conditions), and implements the missing `RAGService`.

This is an implementation change that will update the specs, refactor the existing code, add tests, and implement the retrieval layer, while strictly adhering to MVP scope.

## What Changes

- **Implement `RagModule`:** A dedicated module for context retrieval that depends on `AiModule` and persistence ports, eliminating the circular dependency between Farm/Knowledge and AI.
- **Reconcile `ChunkingService` API:** Adopt the generic `chunkText(text, options)` with `maxChunks` and `minLength` in the options contract.
- **Strict Data Segregation in pgvector:** Remove the `text` column from pgvector to honor the rule that it holds NO business content. Retain `content_hash` for fast deduplication.
- **Accurate Source Mapping:** Use `diary_log` and `knowledge_source` as the canonical source types. RAG will reconstruct chunks dynamically upon retrieval.
- **Fix Embedding Deduplication:** Introduce a pre-check `findActiveChunkStates()` to skip Gemini calls if the content hash hasn't changed for a chunk index.
- **Safe Embedding Lifecycle:** Embed and upsert completely before deactivating old chunks (transactional switch) to prevent temporary context loss.
- **Fix `searchSimilar` isolation:** Secure the query with `source_type = 'diary_log' AND metadata->>'user_id' = $4`.
- **Accurate Knowledge Cache:** Use SHA-256 of `source_id:chunk_index:content_hash` to prevent cache misses and PII leaks.
- **Fail-Open Retrieval:** Allow `RAGService` to return a `degraded` status rather than crashing Chat when AI/Search services are unavailable.

## Capabilities

### New Capabilities
- `rag-context-retrieval`: Formal spec and implementation for `RAGService.retrieveContext()` — robust embedding, pgvector ANN search (user-scoped), MongoDB exact-chunk hydration (via ChunkingService), fail-open context assembly, and identity-aware caching.

### Modified Capabilities
- `embedding_spec.md`: Significant updates to schema (remove `text`, enforce `content_hash`), queue naming, job idempotency (via content hash), safe transactional chunk updates, and chunking options contract.

## Impact

- **Code:** Creates `src/modules/rag/`, updates `EmbeddingProcessor` and `EmbeddingRepository` in `AiModule`.
- **Database:** Drops `text` column from `embeddings` table, updates constraints for `diary_log` and `knowledge_source`.
- **APIs:** Chat module (if exists) will consume `RagModule` instead of rolling its own retrieval.
- **Dependencies:** Maintains existing NestJS, pgvector, BullMQ, Redis stack. No new collections.
