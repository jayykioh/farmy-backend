## Why

The codebase already has shared embedding infrastructure, pgvector indexing, and MongoDB-backed content sources, but it lacks a dedicated retrieval layer that turns those pieces into a coherent RAG flow. We need a bounded `RAGModule` now so chat and future AI features can reuse one retrieval contract instead of each caller re-implementing pgvector search and MongoDB fan-out.

## What Changes

- Add a dedicated RAG capability that performs query embedding, pgvector similarity search, and source-document hydration from MongoDB.
- Reuse the existing shared AI infrastructure in `src/modules/ai` for embedding generation and vector storage instead of introducing a second embedding path.
- Keep pgvector as a derived search index only; all business content remains in MongoDB via existing domain repositories.
- Standardize the retrieval result shape so AI consumers receive ranked context plus source metadata/citations.
- Preserve the current module boundaries: AI infra stays shared, knowledge and farm data remain the source systems, and retrieval becomes a separate orchestration layer.

## Capabilities

### New Capabilities
- `rag-module`: query-to-context retrieval that embeds prompts, searches pgvector, fetches full documents from MongoDB, and returns ranked context for AI consumers.

### Modified Capabilities

## Impact

- **Code:** Introduces a new RAG-focused module layer and supporting services that depend on `src/modules/ai`, `src/modules/knowledge`, and farm diary repositories.
- **APIs:** AI entrypoints that need contextual retrieval will consume the new RAG contract rather than calling pgvector or MongoDB directly.
- **Dependencies:** Continues using NestJS, TypeORM, Mongoose, BullMQ, Redis, PostgreSQL/pgvector, and the existing Gemini embedding provider.
- **Systems:** Keeps MongoDB as source of truth and pgvector as a rebuildable search index, matching the current OpenSpec architecture docs.
