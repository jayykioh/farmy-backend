## 1. Module Foundation

- [ ] 1.1 Create the `RAGModule` skeleton and export a single retrieval service contract
- [ ] 1.2 Define the RAG domain types for query options, ranked hits, citations, and normalized context output
- [ ] 1.3 Wire the module to depend on `AiModule`, `KnowledgeModule`, and the farm diary repositories through NestJS DI

## 2. Retrieval Pipeline

- [ ] 2.1 Implement query embedding with the shared `IEmbeddingProvider`
- [ ] 2.2 Implement pgvector similarity search against active embeddings only
- [ ] 2.3 Implement MongoDB hydration for `diary_entry` and `knowledge_chunk` source types
- [ ] 2.4 Implement ordered context assembly, citation generation, and context-budget truncation
- [ ] 2.5 Skip inactive hits and missing MongoDB documents without failing the retrieval request

## 3. Consumer Integration

- [ ] 3.1 Update the AI consumer path to call the new RAG retrieval service instead of inlining search logic
- [ ] 3.2 Ensure the returned retrieval payload is compatible with downstream prompt assembly
- [ ] 3.3 Keep pgvector, MongoDB repositories, and shared AI infra isolated behind the new module boundary

## 4. Verification

- [ ] 4.1 Add unit tests for query embedding, hit filtering, hydration, and truncation behavior
- [ ] 4.2 Add integration tests covering diary and knowledge retrieval, missing-source tolerance, and active-only search
- [ ] 4.3 Verify the implementation preserves the MongoDB-primary and pgvector-index-only architecture contract
