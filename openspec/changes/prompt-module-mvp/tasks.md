# Task Breakdown — PromptService MVP

**Change:** prompt-module-mvp  
**Branch:** feat/PromptModule-System-Prompt-Builder-Versioning  
**Status:** 🟡 Awaiting Approval

---

## Phase 1: Domain Layer (No dependencies)

- [x] **TASK-01** — Tạo `src/modules/ai/domain/prompt.types.ts`
  - `BuiltPrompt` type
  - `PetMoodInput` type ('happy' | 'excited' | 'neutral' | 'sad' | 'worried' | 'sleepy' | 'hungry')
  - `CropType` type
  - `BuildChatPromptInput` interface
  - `BuildVisionPromptInput` interface
  - `BuildWeeklyInsightPromptInput` interface
  - `ChatMessage` type

- [x] **TASK-02** — Tạo `src/modules/ai/domain/prompt.constants.ts`
  - `PROMPT_LIMITS` const object (historyTurns, maxHistoryChars, maxContextChars, maxUserMsgChars)
  - `PROMPT_VERSIONS` const object (chat, vision, insight)

- [x] **TASK-03** — Tạo `src/modules/ai/domain/prompt.templates.ts`
  - `CHAT_SYSTEM_PROMPT_V1` template string với defensive DATA ONLY wrappers
  - `VISION_SYSTEM_PROMPT_V1` template string (JSON output, PHI warning, non-plant handling)
  - `INSIGHT_SYSTEM_PROMPT_V1` template string

## Phase 2: Service Layer

- [x] **TASK-04** — Tạo `src/modules/ai/application/services/prompt.service.ts`
  - `buildChatPrompt(input: BuildChatPromptInput): BuiltPrompt`
  - `buildVisionPrompt(input: BuildVisionPromptInput): BuiltPrompt`
  - `buildWeeklyInsightPrompt(input: BuildWeeklyInsightPromptInput): BuiltPrompt`
  - Private `sanitize(input: string): string` — injection defense
  - Private `sanitizeContext(context: string): string` — RAG/diary defense
  - Private `truncate(text: string, maxChars: number): string` — string truncation helper
  - Private `buildHistory(messages: ChatMessage[]): string` — truncation + sanitize
  - Private `formatDiaries(diaries: DiaryEntry[]): string` — insight helper

## Phase 3: Module Registration

- [x] **TASK-05** — Sửa `src/modules/ai/ai.module.ts`
  - Thêm `PromptService` vào `providers`
  - Thêm `PromptService` vào `exports`

## Phase 4: Testing

- [x] **TASK-06** — Tạo `src/modules/ai/application/services/prompt.service.spec.ts`
  - Yêu cầu bắt buộc: Output prompt MUST be strictly deterministic based on input
  - Explicit test coverage checklist: Đảm bảo 100% statements, branches, functions, lines
  - TC-PROMPT-01 → TC-PROMPT-16: buildChatPrompt() tests
  - TC-PROMPT-17 → TC-PROMPT-23: buildVisionPrompt() tests
  - TC-PROMPT-24 → TC-PROMPT-29: buildWeeklyInsightPrompt() tests

## Phase 5: Verification

- [x] **TASK-07** — Chạy unit tests: `npm run test -- prompt.service`
- [x] **TASK-08** — Chạy build: `npm run build` — verify không lỗi TypeScript
- [x] **TASK-09** — Manual smoke test (xem proposal.md §7.3)

---

## Dependencies

- TASK-04 depends on TASK-01, TASK-02, TASK-03
- TASK-05 depends on TASK-04
- TASK-06 depends on TASK-04
- TASK-07, TASK-08 depends on TASK-05, TASK-06
