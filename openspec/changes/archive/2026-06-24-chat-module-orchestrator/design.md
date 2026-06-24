## Context

The FarmDiaries AI system currently has independent modules for RAG, LLM, User, and Pet. We are introducing the `ChatModule` to orchestrate an end-to-end chat experience. The legacy `ai_chat_memories` uses a flat structure that does not map well to discrete chat sessions, conflicting with the canonical specs.

## Goals / Non-Goals

**Goals:**
- Implement `ChatModule` strictly as an orchestrator.
- Define `ChatSession` and `ChatMessage` collections in MongoDB with strict indexes.
- Implement locked streaming payload contract at `POST /api/v1/chat/stream`.
- Wire `RagService`, `PetModule`, and `AiModule` robustly.
- Implement strict security (user ownership, context-derived user ids).
- Implement idempotent message handling using `client_message_id` and strict state machine retry rules.
- Implement safe pre-stream vs mid-stream error handling, with atomic persistence flow.
- Expose session and message history GET endpoints with proper sorting and pagination.

**Non-Goals:**
- We will NOT migrate or drop `ai_chat_memories` data (just deprecate).
- We will NOT implement synchronous fallback endpoints or feedback endpoints.
- We will NOT change the core logic of `RagService` or `LLMService` to support deep abort signals if not already supported.

## Decisions

1. **Persistence Schema (Two Collections & Statuses):**
   - **Decision**: Schemas `ChatSession` and `ChatMessage`. `ChatMessage` will have `status: 'pending' | 'completed' | 'failed'`, a `client_message_id`, and a `reply_to_message_id`.
   - **Rationale**: Saving the user message as `pending` before hitting the LLM prevents orphaned context or corrupt generation. `reply_to_message_id` links the AI response to the user's prompt cleanly.

2. **Strict SSE Payload Contract & Custom HTTP Response:**
   - **Decision**: Use `@Post('stream')` and manually set HTTP headers for SSE. 
   - **Payload**: JSON data ending in `\n\n`. Valid events: `meta` (max once) -> `token`* -> `done` (mutually exclusive with `error`).
   - **Rationale**: Binds the frontend and backend to a highly predictable parsing loop without ambiguity.

3. **Pre-stream vs Mid-stream Error Handling:**
   - **Decision**: Pre-stream errors (validation, auth, ownership) occur *before* headers are flushed and return standard JSON HTTP errors (e.g. 400, 403). Mid-stream errors (LLM crash) occur *after* headers are flushed and must emit an `event: error` then close the stream.
   - **Rationale**: A stream header lock prevents HTTP status rewrites; emitting `error` is the only way to signal failure to the client during a stream.

4. **Idempotency State Machine:**
   - **Decision**: `ChatMessage` uses a unique partial index on `{ user_id: 1, client_message_id: 1 }`. If a duplicate is submitted:
     - If existing message is `pending`: return `409 MESSAGE_IN_PROGRESS`.
     - If existing message is `completed`: return `409 MESSAGE_ALREADY_COMPLETED`.
     - If existing message is `failed`: atomically update to `pending` and allow generation retry.
   - **Rationale**: Eliminates race conditions for double submits and ensures we never duplicate generation or user messages. Also, a partial unique index on `{ reply_to_message_id: 1 }` for assistant role ensures exactly one response per user prompt.

5. **Atomic Turn Completion:**
   - **Decision**: Successfully finishing a stream implies: (1) Persist assistant message as `completed`, (2) Update user message `pending` → `completed`, (3) Update `ChatSession.last_message_at`. ONLY after these succeed do we emit the `done` event.
   - **Rationale**: Ensures the client never receives a `done` signal if the DB transaction/batch failed, maintaining strong consistency.

6. **Strict Bounded History Algorithm:**
   - **Decision**: Use environment constants `CHAT_HISTORY_MAX_MESSAGES=20` and `CHAT_HISTORY_MAX_CHARS=12000`. 
   - **Algorithm**: Query the newest `completed` messages -> Limit to budget -> Keep user-assistant turns intact (do not split pairs) -> Truncate older pairs if char limit exceeded -> Reverse to ascending chronological order -> Feed to prompt.

7. **Pet Failure Fallback:**
   - **Decision**: If `PetModule` fails or returns no state, gracefully fallback to `pet_mood = neutral` and `streak_count = 0` rather than crashing the chat.

## Risks / Trade-offs

- **Risk: Disconnect while LLM processing** → The stream is dropped, but the LLM provider keeps generating.
  - **Mitigation**: Mark user message as `failed`. Stop writing to the stream. Do not save any completed assistant response. We accept that the LLM might burn some quota, but data corruption is prevented.

## Migration Plan

1. Create `ChatSession` and `ChatMessage` with necessary indexes.
2. Freeze `ai_chat_memories` (stop writes, mark deprecated).
3. Deploy new endpoints.
