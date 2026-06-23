## ADDED Requirements

### Requirement: Dedicated RagModule orchestrates retrieval
The system SHALL define a `RagModule` in `src/modules/rag/rag.module.ts`. This module MUST import `AiModule` (for pgvector search and `IEmbeddingProvider`), `FarmModule` (for `DiaryRepository` etc.), and `KnowledgeModule` (for `KnowledgeRepository`). It SHALL export `RAGService`. 

#### Scenario: No circular dependencies
- **WHEN** the NestJS dependency graph is constructed
- **THEN** `AiModule` does not import `FarmModule` or `KnowledgeModule`, and `RagModule` acts as the orchestration layer

---

### Requirement: RAGService retrieves context for a user query
The system SHALL provide `RAGService`. Given a `userMessage` (string) and `userId` (string), it MUST:
1. Call `IEmbeddingProvider.embed(userMessage)` to get a query vector.
2. Call `EmbeddingRepository.searchSimilar(vector, limit, minScore, userId)` to get a ranked list of hits.
3. Fetch full source documents from MongoDB via domain repositories.
4. Reconstruct chunks by passing the document content through `ChunkingService` with the EXACT SAME preset used for embedding, selecting the element at `chunk_index`.
5. **Defense-in-depth**: For `diary_log` hits, the system MUST verify ownership (`DiaryLog.diary_id -> Diary.plot_id -> FarmPlot.user_id === userId`) to block data leaks if pgvector returns stale hits.
6. Assemble and return a `RAGContext` object.

```typescript
export interface SearchHit {
  source_id: string;
  source_type: 'diary_log' | 'knowledge_source';
  chunk_index: number;
  content_hash: string;
  score: number;
}

export interface RAGContext {
  context_text: string;   // assembled context string, max 6000 chars
  citations: Array<{
    source_id:   string;
    source_type: 'diary_log' | 'knowledge_source';
    chunk_index: number;
    score:       number;
  }>;
  has_context: boolean;   // true if context_text.length > 0
  retrieval_status: 'success' | 'no_match' | 'degraded';
}
```

#### Scenario: Defense-in-depth prevents PII leak
- **WHEN** pgvector contains a stale hit indicating user A owns diary log X, but Mongo confirms user B owns diary log X
- **THEN** the ownership check fails, the chunk is discarded, and the context is safely assembled without diary log X

---

### Requirement: Fail-Open Retrieval only catches Infrastructure Errors
If the embedding provider or vector database fails temporarily, `RAGService` MUST NOT crash the chat flow. It SHALL log a warning and return empty context with `retrieval_status = 'degraded'`. It MUST NOT catch validation or programming errors.

#### Scenario: Fail-open allows chat fallback
- **WHEN** `RAGService.retrieveContext()` encounters an `EmbedQuotaExceededException` or Redis Connection Timeout
- **THEN** it returns `{ context_text: '', citations: [], has_context: false, retrieval_status: 'degraded' }` and the caller continues execution

---

### Requirement: Exact Knowledge Identity in Cache (SHA-256)
The Redis cache for knowledge MUST use SHA-256. The key SHALL be `rag:knowledge:${sha256(hits.map(h => h.source_id + ':' + h.chunk_index + ':' + h.content_hash).sort().join(','))}`.
Diary logs MUST NOT be cached in Redis.

#### Scenario: Hash-based key prevents stale cache
- **WHEN** an admin updates a knowledge source, changing its `content_hash` in pgvector
- **THEN** a subsequent query generating the new `content_hash` misses the old cache and fetches the fresh chunk from MongoDB

---

### Requirement: Citations strictly match assembled context
If `RAGService.assembleContext()` truncates hits to stay within the 6000-character limit, the `citations` array MUST ONLY include hits that were actually included in `context_text`.
