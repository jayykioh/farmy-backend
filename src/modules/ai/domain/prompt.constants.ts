/**
 * prompt.constants.ts
 * Compile-time constants for PromptService: size limits and version strings.
 * All values are `as const` — never mutate at runtime.
 */

/**
 * Giới hạn kích thước áp dụng trong quá trình build prompt.
 *
 * - historyTurns:    Số turn hội thoại tối đa được inject (tính theo message, không phải token).
 * - maxHistoryChars: Ceiling ký tự cho toàn bộ history block (cắt từ bên trái → giữ lịch sử mới nhất).
 * - maxContextChars: Ceiling ký tự cho RAG context block (đồng bộ với RAGService.assembleContext()).
 * - maxUserMsgChars: Ceiling ký tự cho user message (bảo vệ context window, không cắt response).
 */
export const PROMPT_LIMITS = {
  historyTurns: 6,
  maxHistoryChars: 4000,
  maxContextChars: 6000,
  maxUserMsgChars: 2000,
} as const;

/**
 * Version strings — inject vào BuiltPrompt.promptVersion để LLMService có thể log.
 * Mỗi lần sửa template text trong prompt.templates.ts PHẢI bump version tương ứng.
 */
export const PROMPT_VERSIONS = {
  chat: 'chat_v1.0',
  vision: 'vision_v2.0',
  insight: 'insight_v1.0',
} as const;
