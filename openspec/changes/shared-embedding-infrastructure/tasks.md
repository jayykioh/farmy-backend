## 1. Core Services & Interfaces

- [x] 1.1 Create `src/modules/ai/domain/embedding.types.ts` defining `IEmbeddingProvider` interface and `EmbedDocumentPayload` type
- [x] 1.2 Extract `ChunkingService` into `src/modules/ai/application/services/chunking.service.ts`
- [x] 1.3 Write unit tests for `ChunkingService` verifying window sizes and overlaps
- [x] 1.4 Refactor `LLMService` to implement `IEmbeddingProvider`

## 2. Infrastructure Setup

- [x] 2.1 Create PostgreSQL migration to enable `pgvector` extension and create `embeddings` table with HNSW index
- [x] 2.2 Configure BullMQ queue named `embedding_queue` in the module registration
- [x] 2.3 Implement `pgvector` TypeORM repository or query builder for insertions

## 3. Worker Implementation

- [x] 3.1 Create `EmbeddingProcessor` BullMQ consumer class
- [x] 3.2 Implement job processing logic: chunk text via `ChunkingService` -> generate vectors via `IEmbeddingProvider` -> save to DB
- [x] 3.3 Add exponential backoff configuration for handling API rate limits
- [x] 3.4 Update `EmbeddingModule` to provide/export the queue and register the processor
