## Context

The initial architectural concept for the `EmbeddingModule` tightly coupled it to the Chat pipeline and specific data sources (Diary Entries, Knowledge Chunks). It directly invoked the `LLMModule` to interact with Gemini's embedding models. This design limited scalability, made unit testing difficult without mocking the LLM layer, and restricted the ease of integrating new data sources or substituting LLM providers. We are refactoring this to be a generic, shared AI infrastructure.

## Goals / Non-Goals

**Goals:**
- Decouple text chunking logic into a reusable `ChunkingService`.
- Abstract the embedding provider through an `IEmbeddingProvider` interface.
- Implement a generic BullMQ queue that accepts embedding jobs from any module.
- Enable any data source (Diary, PlantScan, Knowledge) to push payloads `(sourceId, sourceType, text)` into the embedding pipeline.
- Implement `pgvector` indexing using TypeORM.

**Non-Goals:**
- Modifying the RAGModule or ChatModule's retrieval logic (this is strictly about the ingestion pipeline).
- Generating actual data for the system to process; this only sets up the infrastructure.

## Decisions

**1. Extracting ChunkingService**
*Rationale:* Chunking is a pure string manipulation task with no AI or database dependencies. Extracting it ensures 100% testability and allows other modules (like a future Summarization module) to use it. 
*Alternative Considered:* Keeping it within `EmbeddingModule`. Rejected because it violates Single Responsibility Principle and complicates testing.

**2. IEmbeddingProvider Interface**
*Rationale:* Follows Dependency Inversion Principle. The `EmbeddingModule` depends on the interface, not the concrete `LLMModule`. This allows seamless substitution (e.g., swapping Gemini for OpenAI or a local Ollama model) without changing `EmbeddingModule` code.
*Alternative Considered:* Direct injection of `LLMModule`. Rejected to prevent vendor lock-in and tight coupling.

**3. Generic Embedding Queue via BullMQ**
*Rationale:* The embedding process must be asynchronous to avoid blocking primary business operations. A generic queue payload `({sourceId, sourceType, text})` allows any module to submit data for vectorization.
*Alternative Considered:* `EmbeddingModule` polling specific MongoDB collections. Rejected because it would require `EmbeddingModule` to know about every domain entity, violating separation of concerns.

## Risks / Trade-offs

- [Risk] Gemini API rate limits (100 RPM for `text-embedding-004`). → *Mitigation*: Configure the BullMQ worker with exponential backoff and retry mechanisms to handle HTTP 429 Too Many Requests errors gracefully.
- [Risk] Orphaned vectors in `pgvector` if a source document is deleted in MongoDB. → *Mitigation*: Ensure domain modules (e.g., `DiaryModule`) also emit "delete" jobs to the embedding queue when a document is removed.
