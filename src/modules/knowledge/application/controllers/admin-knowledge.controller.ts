import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { KnowledgeService } from '../services/knowledge.service';
import { KnowledgeValidationService } from '../services/knowledge-validation.service';
import { CreateKnowledgeDto } from '../dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from '../dto/update-knowledge.dto';
import { BatchEmbedKnowledgeDto } from '../dto/batch-embed-knowledge.dto';
import { ConfirmKnowledgeDto } from '../dto/confirm-knowledge.dto';

/**
 * AdminKnowledgeController
 *
 * All routes protected by JwtAuthGuard (global) + RolesGuard + @Roles('admin').
 * Base path: /api/v1/admin/knowledge
 *
 * Document lifecycle (v2):
 *   POST /                    → tạo bài (unvalidated)
 *   POST /:id/validate        → Gemini đánh giá → validated | rejected
 *   POST /:id/confirm         → Admin confirm | reject thủ công
 *   POST /batch-embed         → embed tất cả bài đã confirmed
 */
@Roles('admin')
@Controller('admin/knowledge')
export class AdminKnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly validationService: KnowledgeValidationService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  // POST /admin/knowledge
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateKnowledgeDto) {
    const doc = await this.knowledgeService.create(dto);
    return { success: true, data: doc };
  }

  // GET /admin/knowledge?category=&limit=&skip=&validation_status=
  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('validation_status') validationStatus?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const docs = await this.knowledgeService.findAll({
      category,
      validationStatus: validationStatus as any,
      limit: limit ? parseInt(limit, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
    });
    return { success: true, data: docs };
  }

  // GET /admin/knowledge/:id
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const doc = await this.knowledgeService.findOne(id);
    return { success: true, data: doc };
  }

  // PATCH /admin/knowledge/:id
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateKnowledgeDto) {
    const doc = await this.knowledgeService.update(id, dto);
    return { success: true, data: doc };
  }

  // DELETE /admin/knowledge/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.knowledgeService.remove(id);
  }

  // ─── AI Validation Pipeline (v2) ──────────────────────────────────────────

  /**
   * POST /admin/knowledge/:id/validate
   * Trigger Gemini AI review cho bài viết.
   * - score < 40  → auto rejected
   * - score >= 40 → validated (chờ Admin confirm)
   */
  @Post(':id/validate')
  @HttpCode(HttpStatus.ACCEPTED)
  async validate(@Param('id') id: string) {
    const doc = await this.validationService.validate(id);
    const report = doc.validation_report;

    return {
      success: true,
      message:
        doc.validation_status === 'rejected'
          ? `Bài viết bị từ chối (score: ${report?.score ?? 0}/100). Lý do: ${report?.rejection_reason}`
          : `Đánh giá hoàn tất (score: ${report?.score ?? 0}/100). ${
              (report?.warnings?.length ?? 0) > 0
                ? `Có ${report!.warnings.length} cảnh báo cần xem xét.`
                : 'Không có cảnh báo.'
            } Vui lòng xác nhận để tiến hành embed.`,
      data: doc,
    };
  }

  /**
   * POST /admin/knowledge/:id/confirm
   * Admin xác nhận hoặc từ chối sau khi đọc báo cáo validation.
   * Body: { action: 'confirm' | 'reject', note?: string }
   */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') id: string, @Body() dto: ConfirmKnowledgeDto) {
    const doc = await this.validationService.confirm(id, dto.action, dto.note);
    return {
      success: true,
      message:
        dto.action === 'confirm'
          ? 'Bài viết đã được xác nhận. Có thể chạy batch-embed để đưa vào knowledge base.'
          : 'Bài viết đã bị từ chối.',
      data: doc,
    };
  }

  // ─── Batch Embed ───────────────────────────────────────────────────────────

  /**
   * POST /admin/knowledge/batch-embed
   * Chỉ embed bài có validation_status = 'confirmed'.
   * Body không bắt buộc — bỏ trống để embed tất cả confirmed.
   */
  @Post('batch-embed')
  @HttpCode(HttpStatus.ACCEPTED)
  async batchEmbed(@Body() dto?: BatchEmbedKnowledgeDto) {
    const result = await this.knowledgeService.batchEmbed(dto);
    return {
      success: true,
      message:
        result.queued === 0 && result.skipped_unconfirmed === 0
          ? 'Không có bài nào cần embed.'
          : `${result.queued} bài đã đưa vào hàng đợi embedding.` +
            (result.skipped_unconfirmed > 0
              ? ` ${result.skipped_unconfirmed} bài bị bỏ qua (chưa confirmed).`
              : ''),
      data: result,
    };
  }
}
