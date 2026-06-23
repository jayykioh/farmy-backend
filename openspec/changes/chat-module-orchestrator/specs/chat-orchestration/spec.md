## ADDED Requirements

### Requirement: Strict Custom POST Streaming Contract
The ChatModule SHALL orchestrate chat message handling by emitting a custom `text/event-stream` format over a POST request `/api/v1/chat/stream`.

#### Scenario: Input DTO Validation
- **WHEN** the client submits a JSON payload to the stream endpoint
- **THEN** it MUST match `StreamChatDto` (`message: string`, `client_message_id: string`, optional `session_id: ObjectId`). The `user_id` MUST be extracted from the authenticated request context, never from the body.

#### Scenario: Pre-stream vs Mid-stream errors
- **WHEN** validation or ownership checks fail before the stream starts
- **THEN** the system MUST return a standard JSON HTTP 4xx/5xx response
- **WHEN** the generation fails after the SSE headers have been flushed
- **THEN** the system MUST emit an `error` event and close the stream.

### Requirement: Exact SSE Event Sequence
The SSE stream SHALL adhere to a strictly typed JSON sequence: `meta` (max once) -> `token`* -> `done` OR `error` (mutually exclusive).

#### Scenario: Emitting the locked event schema
- **WHEN** events are yielded to the client
- **THEN** they MUST match the exact shape:
  - `meta`: `{ session_id, user_message_id, retrieval_status }`
  - `token`: `{ delta }`
  - `done`: `{ assistant_message_id, citations: Citation[] }`
  - `error`: `{ code, message, retryable }`
  *(Citations MUST use the exact RagModule Citation contract)*

### Requirement: Message Status and Atomic Completion
The system SHALL track message status (`pending`, `completed`, `failed`) and link assistant responses to user messages via `reply_to_message_id`.

#### Scenario: Atomic completion logic
- **WHEN** LLM generation successfully finishes
- **THEN** the system MUST perform an atomic/ordered sequence:
  1. Persist assistant message as `completed`
  2. Update user message from `pending` to `completed`
  3. Update `ChatSession.last_message_at`
  4. Emit the `done` event ONLY IF the persistence operations succeeded.

### Requirement: Idempotency State Machine
The system SHALL prevent duplicate generation via `client_message_id` and strict state rules.

#### Scenario: Handling duplicate submissions
- **WHEN** a request arrives with a `client_message_id` that already exists for that user
- **THEN** the system MUST:
  - Reject with `409` if the existing message is `pending` or `completed`
  - Atomically update from `failed` to `pending` and process the generation retry if it was `failed`.

### Requirement: ChatSession Lifecycle
The `ChatSession` SHALL manage its metadata efficiently to support sorting and context bounding.

#### Scenario: Session updates
- **WHEN** a new session is created
- **THEN** its `title` MUST be derived from the first user message (e.g. truncated to 60 characters).
- **WHEN** a message fails
- **THEN** `last_message_at` MUST NOT be updated.

### Requirement: Bounded History Turn Preservation
The system SHALL limit prompt context size without splitting conversational pairs.

#### Scenario: Loading history for prompt
- **WHEN** building the LLM context
- **THEN** the system MUST load the latest completed messages up to `CHAT_HISTORY_MAX_MESSAGES`, ensuring user-assistant pairs are not split. If truncating by `CHAT_HISTORY_MAX_CHARS`, older whole pairs MUST be dropped. Finally, messages MUST be sorted ascending chronologically.

### Requirement: Context and Mascot Injection
The system SHALL fetch RAG and Pet context, handling failures gracefully.

#### Scenario: PetState failure fallback
- **WHEN** the `PetModule` throws an error or returns nothing
- **THEN** the system MUST fallback to `pet_mood = neutral` and `streak_count = 0` and continue generation.

### Requirement: Security, History GET Endpoints, and Logging
The system SHALL provide paginated, ownership-checked endpoints for retrieving chat history, and enforce strict logging rules.

#### Scenario: Fetching sessions and messages
- **WHEN** an authenticated user calls `GET /api/v1/chat/sessions` or `GET /api/v1/chat/sessions/:session_id/messages`
- **THEN** the system MUST only return data belonging to that user. Sessions MUST be sorted by `last_message_at` DESC. Messages MUST be sorted by `created_at` ASC.
- **THEN** the response MUST return normal message content but NEVER return raw prompts, RAG context, system instructions, or hidden metadata.

#### Scenario: Production Logging
- **WHEN** a chat session is running in production
- **THEN** the system MUST NOT log raw user messages, assembled prompts, RAG contexts, or full assistant outputs. It MAY log IDs, latencies, statuses, and token usage.
