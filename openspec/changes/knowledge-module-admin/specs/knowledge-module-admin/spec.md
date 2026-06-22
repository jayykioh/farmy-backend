## ADDED Requirements

### Requirement: Admin CRUD for Knowledge Documents
The system SHALL provide a set of REST API endpoints secured for users with the `admin` role to create, read, update, and delete knowledge base documents stored in MongoDB.

#### Scenario: Admin creates a knowledge document
- **WHEN** an authenticated user with `admin` role submits a valid payload containing `title`, `content`, and `category`
- **THEN** the system persists the document in the MongoDB `knowledge_sources` collection and automatically enqueues a background job to generate its embeddings

---

### Requirement: Asynchronous Chunking and Embedding Ingestion
The system SHALL process newly created or updated knowledge documents asynchronously by splitting the text into chunks (size 500 characters, step 150 characters), vectorizing them using Gemini `text-embedding-004`, and persisting the vectors to Supabase Postgres.

#### Scenario: Background worker processes a knowledge document
- **WHEN** a job is picked up from `embed_queue` for a specific document
- **THEN** the system deactivates existing vectors for that document, chunks the new content, generates 768-dimensional vectors, and upserts them to the `embeddings` table

---

### Requirement: Admin-Triggered Batch Embedding
The system SHALL expose an admin-only endpoint to trigger embedding generation for all or a list of specific knowledge documents.

#### Scenario: Admin triggers batch embedding with force option
- **WHEN** an admin requests batch embedding for specific IDs with `force: true`
- **THEN** the system deactivates existing database vectors for those documents, and queues embedding jobs for all of them
