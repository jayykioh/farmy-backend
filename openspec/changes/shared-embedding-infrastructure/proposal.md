## Why

The current architecture envisions the EmbeddingModule as tightly coupled to the Chat pipeline, directly calling the Gemini LLM service and handling specific data sources like Diary Entries and Knowledge Chunks. This monolithic approach hinders reusability, testing, and future provider substitutions. We need to decouple the chunking logic into a reusable service, abstract the embedding provider via an interface, and treat the embedding pipeline as a generic shared AI infrastructure that any module can push data into.

## What Changes

- Extract a pure `ChunkingService` that handles string manipulation and text chunking independent of the embedding logic.
- Introduce an `IEmbeddingProvider` interface to decouple the `EmbeddingModule` from `LLMModule`, enabling easy switching between Gemini, OpenAI, or local models.
- Refactor `EmbeddingModule` to expose a generic background queue (BullMQ) that accepts any `(sourceId, sourceType, text)` payload, rather than polling specific MongoDB collections.
- Setup `pgvector` indexing in the PostgreSQL database using TypeORM raw queries.

## Capabilities

### New Capabilities
- `shared-embedding`: A generic infrastructure component capable of chunking and vectorizing arbitrary text payloads and indexing them in pgvector via a background queue.

### Modified Capabilities
- (None)

## Impact

- **Code:** `src/modules/ai/` will be reorganized to include `ChunkingService` and `IEmbeddingProvider`.
- **Dependencies:** BullMQ and Redis are required for queueing embedding jobs asynchronously. `pgvector` and TypeORM are required for the database layer.
- **Systems:** The Chat pipeline, Diary processing, and Knowledge base ingestion will all be updated to push messages to this new generic embedding queue.
