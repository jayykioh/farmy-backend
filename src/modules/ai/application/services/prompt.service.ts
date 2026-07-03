import { Injectable } from '@nestjs/common';
import { PROMPT_LIMITS, PROMPT_VERSIONS } from '../../domain/prompt.constants';
import {
  CHAT_SYSTEM_PROMPT_V1,
  INSIGHT_SYSTEM_PROMPT_V1,
  VISION_SYSTEM_PROMPT_V1,
} from '../../domain/prompt.templates';
import {
  BuildChatPromptInput,
  BuildVisionPromptInput,
  BuildWeeklyInsightPromptInput,
  BuiltPrompt,
  ChatMessage,
  DiaryEntry,
} from '../../domain/prompt.types';

/**
 * PromptService
 *
 * Pure builder — không có DB calls, không có external API calls.
 * Nhận data đã chuẩn bị, sanitize, truncate, lắp vào template, trả BuiltPrompt.
 *
 * Tính DETERMINISTIC: với cùng một input, output PHẢI là chuỗi giống nhau.
 * Không dùng Date.now(), Math.random(), hay bất kỳ side-effect nào bên trong builder.
 */
@Injectable()
export class PromptService {
  // ---------------------------------------------------------------------------
  // Public builder methods
  // ---------------------------------------------------------------------------

  buildChatPrompt(input: BuildChatPromptInput): BuiltPrompt {
    const safeMsg = this.sanitize(input.userMessage);
    const safeCtx = this.sanitizeContext(input.ragContext);
    const history = this.buildHistory(input.chatHistory);

    const truncatedMsg = this.truncate(safeMsg, PROMPT_LIMITS.maxUserMsgChars);
    const truncatedCtx = this.truncateRight(safeCtx, PROMPT_LIMITS.maxContextChars);

    const ragBlock =
      truncatedCtx.length > 0 ? truncatedCtx : '(Không có dữ liệu tham khảo)';
    const historyBlock =
      history.length > 0 ? history : '(Chưa có lịch sử hội thoại)';

    const historyTurns = Math.min(
      input.chatHistory.length,
      PROMPT_LIMITS.historyTurns,
    );

    const prompt = CHAT_SYSTEM_PROMPT_V1.replace('{user_name}', input.userName)
      .replace('{streak_count}', String(input.streakCount))
      .replace('{pet_mood}', input.petMood)
      .replace('{rag_context}', ragBlock)
      .replace('{chat_history}', historyBlock)
      .replace('{user_message}', truncatedMsg);

    return {
      prompt,
      promptVersion: PROMPT_VERSIONS.chat,
      metadata: {
        template: 'chat_v1',
        promptChars: prompt.length,
        contextChars: truncatedCtx.length,
        userMessageChars: truncatedMsg.length,
        historyTurns,
      },
    };
  }

  buildVisionPrompt(input: BuildVisionPromptInput): BuiltPrompt {
    const cropType = input.cropType.trim() || 'Không xác định';

    const prompt = VISION_SYSTEM_PROMPT_V1.replace('{crop_type}', cropType);

    return {
      prompt,
      promptVersion: PROMPT_VERSIONS.vision,
      metadata: {
        template: 'vision_v1',
        promptChars: prompt.length,
        contextChars: 0,
        userMessageChars: 0,
      },
    };
  }

  buildWeeklyInsightPrompt(input: BuildWeeklyInsightPromptInput): BuiltPrompt {
    const diarySummary = this.formatDiaries(input.diaries);
    const safeCtx = this.sanitizeContext(input.ragContext);
    const truncatedCtx = this.truncateRight(safeCtx, PROMPT_LIMITS.maxContextChars);

    const ragBlock =
      truncatedCtx.length > 0
        ? truncatedCtx
        : '(Không có tài liệu kỹ thuật tham khảo)';

    const prompt = INSIGHT_SYSTEM_PROMPT_V1.replace(
      '{diary_summary}',
      diarySummary,
    ).replace('{rag_context}', ragBlock);

    return {
      prompt,
      promptVersion: PROMPT_VERSIONS.insight,
      metadata: {
        template: 'insight_v1',
        promptChars: prompt.length,
        contextChars: truncatedCtx.length,
        userMessageChars: 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * truncate() — cắt chuỗi từ bên trái đến maxChars.
   * Pure function: deterministic, no side effects.
   */
  private truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return text.slice(text.length - maxChars);
  }

  /**
   * truncateRight() — cắt chuỗi từ bên phải để giữ phần đầu.
   * Dùng cho RAG context vì kết quả relevant nhất nằm ở đầu.
   */
  private truncateRight(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars);
  }

  private redactPII(input: string): string {
    const phoneRegex = /\b\d{9,11}\b/g;
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const idRegex = /\b\d{12}\b/g; // 12-digit VN CCCD
    return input
      .replace(phoneRegex, '[SỐ ĐIỆN THOẠI ĐÃ ĐƯỢC ẨN BỞI AI SAFETY]')
      .replace(emailRegex, '[EMAIL ĐÃ ĐƯỢC ẨN BỞI AI SAFETY]')
      .replace(idRegex, '[SỐ ĐỊNH DANH ĐÃ ĐƯỢC ẨN BỞI AI SAFETY]');
  }

  /**
   * sanitize() — áp dụng lên user messages.
   * Block các pattern injection phổ biến bằng regex.
   * Sau đó KHÔNG truncate ở đây — để buildChatPrompt() xử lý truncate tách biệt.
   */
  private sanitize(input: string): string {
    const redacted = this.redactPII(input);
    return redacted
      .replace(/\[SYSTEM\]/gi, '[SYS-BLOCKED]')
      .replace(/\[INST\]/gi, '[INST-BLOCKED]')
      .replace(/<\|.*?\|>/g, '')
      .replace(/ignore previous instructions/gi, '[BLOCKED]')
      .replace(/forget your instructions/gi, '[BLOCKED]')
      .replace(/you are now/gi, '[BLOCKED]')
      .replace(/act as/gi, '[BLOCKED]');
  }

  /**
   * sanitizeContext() — áp dụng lên RAG context và diary content.
   * Giống sanitize() nhưng tách riêng để dễ test và extend độc lập.
   */
  private sanitizeContext(context: string): string {
    const redacted = this.redactPII(context);
    return redacted
      .replace(/\[SYSTEM\]/gi, '[SYS-BLOCKED]')
      .replace(/\[INST\]/gi, '[INST-BLOCKED]')
      .replace(/<\|.*?\|>/g, '')
      .replace(/ignore previous instructions/gi, '[BLOCKED]')
      .replace(/forget your instructions/gi, '[BLOCKED]')
      .replace(/you are now/gi, '[BLOCKED]')
      .replace(/act as/gi, '[BLOCKED]');
  }

  /**
   * buildHistory() — lấy N turns cuối, sanitize từng message, nối thành string.
   * Truncate từ bên trái nếu vượt maxHistoryChars (giữ lại lịch sử gần nhất).
   */
  private buildHistory(messages: ChatMessage[]): string {
    const recent = messages.slice(-PROMPT_LIMITS.historyTurns);
    const raw = recent
      .map(
        (m) =>
          `${m.role === 'user' ? 'Nông dân' : 'AI'}: ${this.sanitize(m.content)}`,
      )
      .join('\n');
    return this.truncate(raw, PROMPT_LIMITS.maxHistoryChars);
  }

  /**
   * formatDiaries() — chuyển mảng DiaryEntry thành chuỗi summary cho InsightPrompt.
   * Áp dụng sanitizeContext() trên từng notes để phòng injection từ diary user-written.
   */
  private formatDiaries(diaries: DiaryEntry[]): string {
    if (diaries.length === 0) {
      return '(Không có nhật ký trong tuần này)';
    }

    return diaries
      .map((d) => {
        const dateObj =
          d.created_at instanceof Date
            ? d.created_at
            : new Date(d.created_at);
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const year = dateObj.getUTCFullYear();
        const date = `${day}/${month}/${year}`;
        const notes = this.sanitizeContext(d.notes?.trim() ?? '');
        const cropInfo = d.crop_type ? ` [${d.crop_type}]` : '';
        return `[Nhật ký ${date}${cropInfo}] ${notes || '(Không có ghi chú)'}`;
      })
      .join('\n');
  }
}
