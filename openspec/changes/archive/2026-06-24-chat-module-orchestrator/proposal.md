## Why

The current AI architecture contains `AiModule`, `RagModule`, `AuthModule`, and `PetModule`, but lacks a central `ChatModule` to orchestrate the RAG retrieval, prompt building, LLM generation, and persistence flow. A central orchestrator is needed to stitch these independent modules together, handle streaming to the client safely, and properly store chat sessions without bounding issues.

## What Changes

- Implement `ChatModule`, `ChatController`, and `ChatService`.
- Establish a proper persistence model using two distinct collections: `ChatSession` and `ChatMessage` to replace the legacy `ai_chat_memories` structure.
- Wire up the full request flow: Auth -> Session -> RagService -> PromptService -> LLMService.
- Implement a custom HTTP streaming endpoint `POST /api/v1/chat/stream` returning strictly typed `text/event-stream` payloads (`meta`, `token`, `done`, `error`).
- Fetch `streak_count` and `pet_mood` from `PetModule` on each chat request, with safe fallbacks if the Pet service fails.
- Stop writing to the legacy `ai_chat_memories` collection entirely (keep as-is for now, mark deprecated).
- **REMOVAL**: The synchronous `POST /api/v1/chat/message` and `POST /api/v1/chat/feedback` endpoints are explicitly dropped from this MVP to focus entirely on the core streaming contract.

## Capabilities

### New Capabilities
- `chat-orchestration`: Centralized orchestration of user chat inputs, integrating RAG context, Pet Mascot states, LLM streaming generation, explicitly bounded history loading, strict ownership validation, unique idempotency keys, and robust 3-state error persistence.

### Modified Capabilities

## Impact

- **Code/Modules**: Introduces `src/modules/chat/`. 
- **APIs**: Exposes `/api/v1/chat/stream`, `/api/v1/chat/sessions`, and `/api/v1/chat/sessions/:session_id/messages` to the frontend.
- **Dependencies**: Tighter coupling of `AiModule`, `RagModule`, `PetModule`, and `MongooseModule` within the `ChatModule`.
- **Database**: Schema creation for `chat_sessions` and `chat_messages` with strict indexes for ordering and idempotency. Legacy `ai_chat_memories` will be deprecated but untouched.
