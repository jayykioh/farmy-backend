## ADDED Requirements

### Requirement: Generic Text Chunking
The system SHALL provide a `ChunkingService` capable of splitting large strings into smaller text chunks based on configurable window and step sizes.

#### Scenario: Chunking a long document
- **WHEN** a document string exceeding the window size is provided with a specified overlap (step size)
- **THEN** the system returns an array of string chunks, ensuring no chunk exceeds the window size and adjacent chunks overlap by the specified step size

### Requirement: Generic Embedding Pipeline Queue
The system SHALL provide a background queue mechanism to accept generic embedding jobs containing a source ID, source type, and raw text.

#### Scenario: Emitting an embedding job
- **WHEN** any domain module (e.g., DiaryModule) submits an embedding job to the queue
- **THEN** the queue accepts the payload and schedules a worker to process it asynchronously without blocking the caller

### Requirement: Vectorization and Indexing
The system SHALL process embedding jobs by chunking the text, calling the configured `IEmbeddingProvider` to generate vectors, and storing the results in the `pgvector` database.

#### Scenario: Successful vectorization
- **WHEN** the background worker processes an embedding job
- **THEN** it generates vectors for all text chunks and persists them in the `embeddings` table with the corresponding `source_id` and `source_type`
