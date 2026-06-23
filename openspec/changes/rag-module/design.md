## Context

The repository already contains the shared AI pieces needed for RAG: `AiModule` provides the embedding provider, embedding queue, and pgvector persistence; `KnowledgeModule` stores technical documents in MongoDB; and the farm/diary domain stores user-generated agricultural context in MongoDB as well. What is missing is a dedicated retrieval layer that turns those parts into one stable contract for AI consumers.

The design must preserve the current architectural rule that MongoDB is the source of truth and pgvector is only a rebuildable search index. It also must fit the existing NestJS module layout and avoid introducing a second retrieval path that duplicates search or hydration logic.

## Goals / Non-Goals

**Goals:**
- Provide one reusable RAG retrieval boundary for AI consumers.
- Use the existing embedding provider and pgvector index instead of adding a new vector stack.
- Fetch full source content from MongoDB after vector search so pgvector never becomes a content store.
- Return ranked context plus source metadata in a stable shape that can be consumed by chat and future AI workflows.
- Keep the retrieval layer testable with mocked repositories and a mocked embedding provider.

**Non-Goals:**
- Reworking the shared embedding pipeline itself.
- Moving business content out of MongoDB.
- Adding a new public API surface unless a consumer actually needs one.
- Introducing semantic reranking, caching, or a second vector database in this change.

## Decisions

**1. Create a dedicated RAG module instead of embedding retrieval into `AiModule` or the chat consumer.**  
Rationale: retrieval is an orchestration concern that depends on embedding, vector search, and domain repositories. Separating it keeps `AiModule` focused on shared AI infrastructure and keeps consumers from duplicating pgvector logic.  
Alternatives considered:  
- Put retrieval inside `AiModule`. Rejected because it mixes shared infrastructure with consumer-specific orchestration.  
- Put retrieval directly in the chat flow. Rejected because any future AI consumer would need to re-implement the same search and hydration path.

**2. Search pgvector for IDs and hydrate full documents from MongoDB.**  
Rationale: this matches the existing source-of-truth rule and the current OpenSpec architecture. The vector index stays small, rebuildable, and content-agnostic.  
Alternatives considered:  
- Store full document text in pgvector. Rejected because it duplicates business data and creates sync risk.  
- Query MongoDB directly for semantic search. Rejected because MongoDB is not the chosen vector index in this codebase.

**3. Return a normalized retrieval result with `contextText`, `citations`, and score metadata.**  
Rationale: AI consumers need a stable contract, not raw repository rows. A normalized result makes prompt assembly and testing deterministic.  
Alternatives considered:  
- Return raw repository records. Rejected because each caller would need to sort, hydrate, and format the result differently.  
- Return only a concatenated string. Rejected because the UI and logging layers lose traceability and source attribution.

**4. Keep retrieval synchronous on the request path.**  
Rationale: the current chat flow needs context before generation, so the RAG step must complete before the LLM call. Caching can be added later if needed, but it should not change the contract now.  
Alternatives considered:  
- Push retrieval into a background queue. Rejected because it would not fit prompt-time context assembly.  
- Precompute all context per user. Rejected because it is expensive, brittle, and harder to keep fresh.

**5. Support diary and knowledge sources through the same source-type contract.**  
Rationale: the existing embedding spec already models multiple source types, and the current repositories already expose both domains. Using one source contract keeps the retrieval path extensible without special-casing each domain.  
Alternatives considered:  
- Build separate retrieval services per source. Rejected because it fragments the retrieval policy and increases maintenance.

## Risks / Trade-offs

- [Risk] Retrieval quality depends on embedding quality and source chunking. → Mitigation: keep the shared embedding pipeline centralized and test retrieval with representative diary and knowledge fixtures.
- [Risk] Hydration can fail when pgvector returns IDs that no longer exist in MongoDB. → Mitigation: treat missing documents as soft misses and continue assembling context from remaining hits.
- [Risk] Adding another module increases NestJS wiring complexity. → Mitigation: keep the public surface small: one service, one repository-facing contract, and minimal exports.
- [Risk] Long prompts can exceed model context limits. → Mitigation: enforce a hard context budget and truncate low-value hits first.

## Migration Plan

1. Add the `RAGModule` and its service/repository interfaces without changing the embedding pipeline.
2. Wire the module to `AiModule`, `KnowledgeModule`, and diary repositories through NestJS dependency injection.
3. Update the AI consumer path to call the new retrieval service instead of inlining pgvector or MongoDB access.
4. Validate retrieval behavior with unit tests against mocked pgvector hits and MongoDB hydration.
5. Roll back by removing the consumer integration and leaving the shared embedding infrastructure intact.

## Open Questions

- Should the initial RAG scope cover diary entries, knowledge documents, or both on day one?
- Should retrieval results be cached per query hash, or should freshness remain the default?
- Should the module expose only a service contract, or also a controller for debugging and admin inspection?
