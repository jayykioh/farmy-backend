## ADDED Requirements

### Requirement: Query-to-Vector Retrieval
The system SHALL embed the incoming user query with the shared embedding provider and use the resulting vector to search pgvector for the most relevant indexed sources.

#### Scenario: Retrieve ranked sources for a question
- **WHEN** a user submits a query and matching indexed content exists
- **THEN** the system generates a query embedding, searches pgvector, and returns ranked hits containing `source_id`, `source_type`, `score`, and metadata

### Requirement: MongoDB Source Hydration
The system SHALL hydrate full source documents from MongoDB after pgvector search and SHALL NOT treat pgvector as the source of truth for document content.

#### Scenario: Hydrate diary and knowledge content
- **WHEN** pgvector returns a mix of `diary_entry` and `knowledge_chunk` source IDs
- **THEN** the system fetches the full diary and knowledge documents from their MongoDB repositories and preserves the ranked order when assembling context

### Requirement: Active-Only Retrieval
The system SHALL ignore inactive embeddings during retrieval and SHALL skip missing MongoDB documents without failing the full request.

#### Scenario: Ignore stale search results
- **WHEN** pgvector returns an embedding marked inactive or a source ID that no longer exists in MongoDB
- **THEN** the system excludes the inactive hit or missing document and continues processing the remaining matches

### Requirement: Normalized Context Output
The system SHALL return a normalized retrieval result containing the assembled context text and citations for downstream AI consumers, bounded by a configured context budget.

#### Scenario: Context budget is exceeded
- **WHEN** the hydrated content exceeds the maximum allowed context size
- **THEN** the system truncates lower-ranked content first and still returns a valid retrieval payload with citations for the retained sources
