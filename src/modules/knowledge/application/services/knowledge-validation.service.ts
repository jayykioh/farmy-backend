import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  KnowledgeSourceDocument,
  ValidationReport,
} from '../../infrastructure/persistence/knowledge-source.schema';
import { LLMService } from '../../../ai/application/services/llm.service';
import { buildValidationPrompt } from '../../domain/knowledge-validation.prompt';

@Injectable()
export class KnowledgeValidationService {
  private readonly logger = new Logger(KnowledgeValidationService.name);

  constructor(
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly model: Model<KnowledgeSourceDocument>,
    private readonly llmService: LLMService,
  ) {}

  // ─── Trigger AI Validation ────────────────────────────────────────────────

  /**
   * Gọi Gemini để đánh giá bài viết.
   * - score < 40  → tự động rejected
   * - score >= 40 → validated (có thể có cảnh báo), chờ Admin confirm
   */
  async validate(id: string): Promise<KnowledgeSourceDocument> {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException(`KnowledgeSource "${id}" not found`);

    // Không cho validate lại nếu đang trong quá trình hoặc đã confirmed
    if (doc.validation_status === 'validating') {
      throw new BadRequestException(
        'Bài viết đang trong quá trình validation. Vui lòng chờ.',
      );
    }
    if (doc.validation_status === 'confirmed') {
      throw new BadRequestException(
        'Bài viết đã được Admin confirmed. Không cần validate lại trừ khi nội dung thay đổi.',
      );
    }

    // Set trạng thái validating
    await this.model.findByIdAndUpdate(id, { validation_status: 'validating' });
    this.logger.log({ action: 'knowledge.validate.start', id });

    try {
      // Gọi Gemini để đánh giá nội dung
      const prompt = buildValidationPrompt(doc.content, doc.category);
      const result = await this.llmService.complete({
        prompt,
        promptVersion: 'knowledge-validation-v1',
        maxTokens: 600,
        temperature: 0.1, // low temp → deterministic JSON output
      });

      // Parse JSON từ response Gemini
      const parsed = this.parseGeminiResponse(result.text);

      // Quyết định status dựa trên score
      const newStatus = parsed.score < 40 ? 'rejected' : 'validated';
      const detectedLang =
        parsed.language_detected === 'en'
          ? 'en'
          : parsed.language_detected === 'vi'
            ? 'vi'
            : 'unknown';

      const report: ValidationReport = {
        ...parsed,
        checked_at: new Date(),
      };

      const updated = await this.model.findByIdAndUpdate(
        id,
        {
          validation_status: newStatus,
          language: detectedLang,
          validation_report: report,
          admin_note: null, // reset note cũ nếu validate lại
        },
        { new: true },
      );

      this.logger.log({
        action: 'knowledge.validate.done',
        id,
        score: parsed.score,
        status: newStatus,
      });

      return updated!;
    } catch (error) {
      const err = error as Error;
      // Nếu Gemini lỗi → reset về unvalidated để có thể thử lại
      await this.model.findByIdAndUpdate(id, {
        validation_status: 'unvalidated',
      });
      this.logger.error({
        action: 'knowledge.validate.error',
        id,
        error: err.message,
      });
      throw new BadRequestException(
        `Validation thất bại: ${err.message}. Vui lòng thử lại.`,
      );
    }
  }

  // ─── Admin Confirm / Reject ────────────────────────────────────────────────

  /**
   * Admin xác nhận hoặc từ chối bài viết sau khi đọc báo cáo validation.
   * Chỉ được gọi khi validation_status là 'validated' hoặc 'rejected'.
   */
  async confirm(
    id: string,
    action: 'confirm' | 'reject',
    note?: string,
  ): Promise<KnowledgeSourceDocument> {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException(`KnowledgeSource "${id}" not found`);

    // Chỉ cho phép confirm/reject khi đã qua AI validation
    const allowedStatuses = ['validated', 'rejected'];
    if (!allowedStatuses.includes(doc.validation_status)) {
      throw new BadRequestException(
        `Không thể xác nhận bài ở trạng thái "${doc.validation_status}". ` +
          `Cần chạy validate trước (POST /admin/knowledge/${id}/validate).`,
      );
    }

    const newStatus = action === 'confirm' ? 'confirmed' : 'rejected';

    const updated = await this.model.findByIdAndUpdate(
      id,
      {
        validation_status: newStatus,
        admin_note: note ?? null,
        // Nếu confirm → reset embed_status về pending để có thể embed
        ...(action === 'confirm' ? { embed_status: 'pending' } : {}),
      },
      { new: true },
    );

    this.logger.log({
      action: `knowledge.${action}`,
      id,
      note: note ?? null,
    });

    return updated!;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private parseGeminiResponse(
    text: string,
  ): Omit<ValidationReport, 'checked_at'> {
    // Trích xuất JSON từ response (Gemini có thể trả về text thừa)
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(
        `Gemini trả về không đúng JSON format. Raw: ${text.slice(0, 200)}`,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Không thể parse JSON từ Gemini: ${match[0].slice(0, 200)}`,
      );
    }

    // Validate các field bắt buộc
    const required = [
      'score',
      'is_agriculture_related',
      'language_detected',
      'category_match',
      'warnings',
    ];
    for (const key of required) {
      if (parsed[key] === undefined) {
        throw new Error(`Gemini thiếu field "${key}" trong response JSON`);
      }
    }

    return {
      score: Math.max(0, Math.min(100, Number(parsed.score))),
      is_agriculture_related: Boolean(parsed.is_agriculture_related),
      language_detected: String(parsed.language_detected),
      category_match: Boolean(parsed.category_match),
      warnings: Array.isArray(parsed.warnings)
        ? (parsed.warnings as string[]).filter((w) => typeof w === 'string')
        : [],
      rejection_reason:
        typeof parsed.rejection_reason === 'string'
          ? parsed.rejection_reason
          : null,
    };
  }
}
