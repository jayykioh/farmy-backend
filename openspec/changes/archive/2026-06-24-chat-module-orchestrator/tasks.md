## 1. Module and Persistence Setup

- [x] 1.1 Create `src/modules/chat/` directory structure (controller, service, repositories).
- [x] 1.2 Define `ChatSession` schema with index `{ user_id: 1, last_message_at: -1 }`.
- [x] 1.3 Define `ChatMessage` schema with index `{ session_id: 1, created_at: 1 }` and a unique partial index `{ user_id: 1, client_message_id: 1 }`.
- [x] 1.4 Add `status: 'pending' | 'completed' | 'failed'` and `reply_to_message_id` to `ChatMessage`.
- [x] 1.5 Add a unique partial index on `reply_to_message_id` for assistant messages.
- [x] 1.6 Add `MongooseModule.forFeature` for `ChatSession` and `ChatMessage` in `chat.module.ts`.
- [x] 1.7 Deprecate legacy `ai_chat_memories` (stop writes, no migration logic needed for MVP).

## 2. Dependencies Integration

- [x] 2.1 Import `AiModule`, `RagModule`, `PetModule`, and `MongooseModule` into `ChatModule`.
- [x] 2.2 Expose PetState fetching method in `PetModule` (with `pet_mood = neutral`, `streak_count = 0` fallback).
- [x] 2.3 Verify `RagModule` returns citations matching exactly: `{ source_id, source_type, chunk_index, score }`.

## 3. ChatService Core Implementation

- [x] 3.1 Implement `StreamChatDto` containing `message`, `session_id?`, `client_message_id`. Ensure validation pipes are active.
- [x] 3.2 Implement `ChatService.getOrCreateSession(userId, sessionId?)`. If creating, truncate the first message to 60 chars for `title`.
- [x] 3.3 Implement `ChatService.loadBoundedHistory(sessionId, userId)` to get max 20 latest completed messages, ensure whole turns are kept intact, truncate up to 12000 chars, then sort ASC.
- [x] 3.4 Implement idempotency state machine: check existing `client_message_id`. Reject with 409 if `pending` or `completed`. Atomically update `failed` -> `pending` and retry if `failed`.
- [x] 3.5 Implement `ChatService.completeTurn()` as an atomic operation (or ordered batch): Persist assistant message (`completed`) -> update user message (`completed`) -> update `last_message_at`. Emit `done` ONLY if all succeed.
- [x] 3.6 Implement safe failure handling: Mid-stream errors update user message to `failed`. Do not save assistant message or update `last_message_at`.

## 4. API Endpoint and SSE Protocol

- [x] 4.1 Create `ChatController` with `POST /api/v1/chat/stream`. Enforce JWT Auth Guard and get `userId` from context.
- [x] 4.2 Validate pre-stream errors (Auth/Ownership validation) to return standard JSON HTTP errors.
- [x] 4.3 Manually set HTTP headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- [x] 4.4 Implement mid-stream events loop emitting exactly typed schemas: `meta`, `token`, `done`, `error`. All payloads are JSON ending with `\n\n`.
- [x] 4.5 Ensure `done` contains `assistant_message_id` and the `citations` array.

## 5. Security, History Endpoints, and Logging

- [x] 5.1 Enforce session ownership checks on all endpoints.
- [x] 5.2 Implement `GET /api/v1/chat/sessions?page=1&limit=20` (sort by `last_message_at` DESC, only authenticated user).
- [x] 5.3 Implement `GET /api/v1/chat/sessions/:session_id/messages?page=1&limit=30` (sort by `created_at` ASC, exclude raw prompt/RAG context).
- [x] 5.4 Enforce production logging rules: NO raw user messages, assembled prompts, RAG contexts, or full outputs.

## 6. Testing

- [x] 6.1 Unit: SSE sequence emits `meta` -> `token`* -> `done`.
- [x] 6.2 Unit: Mid-stream failure emits `error`, never `done`.
- [x] 6.3 Unit: `no_match` or `degraded` from RAG still calls LLM.
- [x] 6.4 Unit: Pet failure uses neutral/0 fallback.
- [x] 6.5 Unit: `failed` and `pending` messages are excluded from history.
- [x] 6.6 Unit: Bounded history preserves chronological turns without splitting user-assistant pairs.
- [x] 6.7 Integration: User A cannot access User B session.
- [x] 6.8 Integration: Concurrent duplicate `client_message_id` creates one user message.
- [x] 6.9 Integration: Failed retry transitions `failed` -> `pending` and processes.
- [x] 6.10 Integration: One assistant response per user message.
- [x] 6.11 Integration: `done` emitted ONLY after persistence succeeds.
- [x] 6.12 E2E: POST streaming event formatting and headers are exact.
- [x] 6.13 E2E: Sessions/messages pagination and ownership.
- [x] 6.14 Compilation: No circular dependencies.
