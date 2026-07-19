/**
 * prompt.types.ts
 * Domain types for PromptService.
 * Pure data — no framework imports.
 */

// ---------------------------------------------------------------------------
// Shared primitive types
// ---------------------------------------------------------------------------

/** Trạng thái cảm xúc của thú ảo (pet). */
export type PetMoodInput =
  | 'happy'
  | 'excited'
  | 'neutral'
  | 'sad'
  | 'worried'
  | 'sleepy'
  | 'hungry';

/**
 * Loại cây trồng. Nhận string mở (e.g. "Lúa", "Bưởi") để linh hoạt;
 * có thể chuyển sang enum khi cần strict validation sau này.
 */
export type CropType = string;

// ---------------------------------------------------------------------------
// ChatMessage
// ---------------------------------------------------------------------------

/** Một lượt hội thoại trong session MongoDB. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// DiaryEntry (minimal shape cần thiết cho PromptService)
// ---------------------------------------------------------------------------

/** Minimal shape của diary entry — chỉ các trường cần cho prompt building. */
export interface DiaryEntry {
  notes?: string | null;
  /** ISO date string hoặc Date */
  created_at: string | Date;
  crop_type?: string;
}

// ---------------------------------------------------------------------------
// Builder Inputs
// ---------------------------------------------------------------------------

export interface BuildChatPromptInput {
  userName: string;
  streakCount: number;
  /** Trạng thái thú ảo — server-side từ MongoDB, TRUSTED. */
  petMood: PetMoodInput;
  /** Từ RAGService.context_text — UNTRUSTED, sẽ được sanitize. */
  ragContext: string;
  /** Từ MongoDB session.messages — UNTRUSTED, sẽ được sanitize. */
  chatHistory: ChatMessage[];
  /** Từ client — UNTRUSTED, sẽ được sanitize và truncate. */
  userMessage: string;
  /** Danh sách nhắc nhở của user. */
  reminders?: any[];
}

export interface BuildVisionPromptInput {
  /** e.g. "Lúa", "Bưởi" — semi-trusted (enum-validated ở controller). */
  cropType: CropType;
  /** Optional extra context từ caller — UNTRUSTED nếu có. */
  imageContext?: string;
}

export interface BuildWeeklyInsightPromptInput {
  /** 7 ngày nhật ký — UNTRUSTED content. */
  diaries: DiaryEntry[];
  /** Từ RAGService — UNTRUSTED. */
  ragContext: string;
  userName?: string;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface BuiltPromptMetadata {
  /** Template identifier, e.g. 'chat_v1' | 'vision_v1' | 'insight_v1' */
  template: string;
  /** Tổng số ký tự của assembled prompt (để log, không cần tính lại). */
  promptChars: number;
  /** Số ký tự RAG context sau khi truncate. */
  contextChars: number;
  /** Số ký tự user message sau khi truncate. */
  userMessageChars: number;
  /** Số turns history đã inject (chỉ dùng cho chat). */
  historyTurns?: number;
}

/** Kết quả trả về từ mọi builder method của PromptService. */
export interface BuiltPrompt {
  /** Full assembled prompt string — truyền thẳng vào LLMService.complete(). */
  prompt: string;
  /** Version string — truyền vào LLMService để log & tracking. */
  promptVersion: string;
  metadata: BuiltPromptMetadata;
}
