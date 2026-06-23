## 1. Database and Schema Updates

- [x] 1.1 Drop and recreate `embeddings` table: Remove `text` and `embedding_version`, enforce `content_hash TEXT NOT NULL`
- [x] 1.2 Add check constraint to `source_type` to only allow `'diary_log'` and `'knowledge_source'`
- [x] 1.3 Add expression index for user filtering: `CREATE INDEX idx_embeddings_diary_owner ON embeddings ((metadata->>'user_id')) WHERE is_active = TRUE AND source_type = 'diary_log'`

## 2. Shared AI Infrastructure (`AiModule`)

- [x] 2.1 Create `src/modules/ai/domain/chunking.constants.ts` and export `CHUNKING_PRESETS`
- [x] 2.2 Update `ChunkingOptions` interface to include `maxChunks` and `minLength`
- [x] 2.3 Implement `EmbeddingRepository.findActiveChunkStates(sourceId, sourceType)` returning Map of `chunkIndex -> { contentHash }`
- [x] 2.4 Update `EmbeddingProcessor.process()` to load active chunk states and diff chunks by exact match of `contentHash`
- [x] 2.5 Update `EmbeddingProcessor.process()` to use `CHUNKING_PRESETS[sourceType]` for generating chunks
- [x] 2.6 Update `EmbeddingProcessor.process()` to transactional replacement flow: embed `changed/new` -> transaction (upsert `changed/new`, deactivate `stale`)
- [x] 2.6 Update `searchSimilar` SQL to use explicit `source_type = 'diary_log'` guard, and ensure it SELECTs `content_hash` and `chunk_index`
- [x] 2.7 Update `searchSimilar` method signature to include `userId` and use it in the SQL query parameter
- [x] 2.8 Update BullMQ queuing configuration to use `removeOnComplete: true`

## 3. Dedicated Retrieval Orchestration (`RagModule`)

- [x] 3.1 Create `src/modules/rag/rag.module.ts` importing `AiModule`, `FarmModule` (for `DiaryRepository`, `FarmPlotModel`), and `KnowledgeModule` (for `KnowledgeRepository`)
- [x] 3.2 Create `src/modules/rag/application/rag.service.ts`
- [x] 3.3 Implement `RagService.retrieveContext()` with fail-open logic catching ONLY infrastructure errors
- [x] 3.4 Implement chunk hydration: fetch full `DiaryLog` or `KnowledgeSource`, run `ChunkingService.chunkText()` using `CHUNKING_PRESETS`, and pick `chunk_index`
- [x] 3.5 Implement Defense-in-Depth for `diary_log`: Validate ownership (`DiaryLog.diary_id -> Diary.plot_id -> FarmPlot.user_id === userId`)
- [x] 3.6 Implement Redis caching for knowledge chunks keyed by `rag:knowledge:${sha256(hits.map(h => h.source_id + ':' + h.chunk_index + ':' + h.content_hash).sort().join(','))}`
- [x] 3.7 Implement `assembleContext()` ensuring citations exactly match the truncated context output

## 4. Source Lifecycle & Integration

- [x] 4.1 Update `DiaryService`: Enqueue embedding on `createLog()`/`updateLog()` with `jobId: embed:diary_log:{id}:{contentHash}`
- [x] 4.2 Update `DiaryService`: Call `EmbeddingRepository.deactivateBySourceId()` on `removeLog()` (or soft delete)
- [x] 4.3 Update `KnowledgeRepository` (or manager service): Enqueue embedding on create/update with `jobId: embed:knowledge_source:{id}:{contentHash}`
- [x] 4.4 Update `KnowledgeRepository` (or manager service): Call `EmbeddingRepository.deactivateBySourceId()` on delete/unpublish
- [x] 4.5 Create `RebuildEmbeddingsScript` (or endpoint) to fetch all active logs/sources and enqueue them into `embedding_queue`
- [x] 4.6 (Conditional) If `ChatModule` exists, refactor it to import `RagModule` (for `RAGService`) alongside `AiModule` (for `LLMService`, `PromptService`)

## 5. Testing

- [x] 5.1 Unit tests: `chunking.service.spec.ts` with new `maxChunks` and `minLength` rules
- [x] 5.2 Unit tests: `EmbeddingProcessor` atomic diff replacement (unchanged chunks are not re-embedded or deactivated)
- [x] 5.3 Unit tests: `RagService` chunk hydration logic, fail-open logic, SHA-256 cache key
- [x] 5.4 Integration tests: Verify Postgres user isolation + Mongo defense-in-depth ownership checks
- [x] 5.5 Compilation test: Verify no circular dependencies exist between `AiModule`, `FarmModule`, and `RagModule`
